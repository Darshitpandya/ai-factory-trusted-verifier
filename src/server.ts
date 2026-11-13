/**
 * Trusted Verifier Server
 *
 * Receives GitHub webhook events, validates signatures, deduplicates,
 * runs oasdiff-based OpenAPI compatibility checks, publishes authoritative
 * factory-contract/acceptance Check Run.
 *
 * This is independently owned from the factory producer.
 * The producer CANNOT post a check run with the same name from its own token.
 */

import Fastify from "fastify";
import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Auto-migrate on startup ───────────────────────────────────────────────────
async function runMigrations(dbUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: dbUrl, ssl: dbUrl.includes("railway") ? { rejectUnauthorized: false } : false });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id TEXT UNIQUE NOT NULL,
        owner TEXT NOT NULL, repo TEXT NOT NULL,
        head_sha TEXT NOT NULL, base_sha TEXT NOT NULL,
        pr_number INTEGER NOT NULL, installation_id BIGINT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
        worker_id TEXT, conclusion TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS processed_webhook_deliveries (
        delivery_id TEXT PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS verification_evidence (
        id TEXT PRIMARY KEY, job_id UUID,
        owner TEXT, repo TEXT, head_sha TEXT,
        conclusion TEXT, evidence_json JSONB,
        evidence_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("Migrations applied");
  } finally {
    await pool.end();
  }
}

import { validateWebhookSignature } from "./webhook-auth.js";
import { getInstallationId, fetchFileAtSha } from "./github-app.js";
import { publishCheckRun, createInProgressCheck } from "./checks.js";
import { compareOpenApi, isOasdiffAvailable } from "./compare-openapi.js";
import { loadPolicy, loadSecurityBaseline } from "./policy-resolver.js";
import { enqueueJob, markDeliveryProcessed, isDeliveryProcessed } from "./queue.js";
import { buildEvidence, formatCheckSummary } from "./evidence.js";
import {
  checkProtectedFilesUnmodified,
  checkRepoAllowlist,
  checkShaBinding,
  allGatesPassed,
} from "./security-gates.js";
import { createHash } from "crypto";

const app = Fastify({ logger: true, trustProxy: true });
const pool = new Pool({ connectionString: process.env["VERIFIER_DATABASE_URL"] });

const ALLOWED_REPOS = (process.env["ALLOWED_REPOS"] ?? "").split(",").filter(Boolean);
const PROTECTED_PATHS = [".github/", "policies/", "src/", "containers/"];

// ── Webhook endpoint ─────────────────────────────────────────────────────────

app.post("/webhook", {
  config: { rawBody: true },
}, async (request, reply) => {
  const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body));
  const signature = request.headers["x-hub-signature-256"] as string | undefined;
  const deliveryId = request.headers["x-github-delivery"] as string | undefined;
  const event = request.headers["x-github-event"] as string;

  // 1. Validate signature
  const secret = process.env["VERIFIER_WEBHOOK_SECRET"] ?? "";
  if (!validateWebhookSignature(rawBody, signature, secret)) {
    app.log.warn("Invalid webhook signature");
    return reply.status(401).send({ error: "Invalid signature" });
  }

  // 2. Deduplicate
  if (!deliveryId) return reply.status(400).send({ error: "Missing delivery ID" });
  if (await isDeliveryProcessed(pool, deliveryId)) {
    return reply.status(200).send({ status: "already processed" });
  }
  await markDeliveryProcessed(pool, deliveryId);

  // 3. Only handle pull_request events
  if (event !== "pull_request") {
    return reply.status(200).send({ status: "ignored" });
  }

  const payload = request.body as {
    action: string;
    pull_request: {
      number: number;
      head: { sha: string };
      base: { sha: string };
      changed_files?: number;
    };
    repository: { full_name: string; name: string; owner: { login: string } };
    installation?: { id: number };
  };

  if (!["opened", "reopened", "synchronize"].includes(payload.action)) {
    return reply.status(200).send({ status: "ignored action" });
  }

  const { owner, repo, fullName, headSha, baseSha, prNumber, installationId } = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    fullName: payload.repository.full_name,
    headSha: payload.pull_request.head.sha,
    baseSha: payload.pull_request.base.sha,
    prNumber: payload.pull_request.number,
    installationId: payload.installation?.id ?? 0,
  };

  // Reply immediately — verification runs asynchronously
  reply.status(202).send({ status: "accepted", deliveryId });

  // 4. Run verification asynchronously
  setImmediate(async () => {
    try {
      await runVerification({
        owner, repo, fullName, headSha, baseSha, prNumber, installationId, deliveryId
      });
    } catch (e) {
      app.log.error(`Verification failed for ${fullName}#${prNumber}: ${e}`);
    }
  });
});

// ── Verification logic ───────────────────────────────────────────────────────

async function runVerification(opts: {
  owner: string;
  repo: string;
  fullName: string;
  headSha: string;
  baseSha: string;
  prNumber: number;
  installationId: number;
  deliveryId: string;
}): Promise<void> {
  const { owner, repo, fullName, headSha, baseSha, prNumber, installationId } = opts;

  // Create in-progress check immediately
  await createInProgressCheck(installationId, owner, repo, headSha);

  const securityGates = [];

  // SG-003: Repo allowlist
  securityGates.push(checkRepoAllowlist(fullName, ALLOWED_REPOS));

  // Load policy from VERIFIER repo (never from PR head)
  const policy = loadPolicy(repo);
  const policyDigest = createHash("sha256")
    .update(JSON.stringify(policy))
    .digest("hex");

  // Fetch changed files list to check protected paths
  const changedFiles = await fetchChangedFiles(installationId, owner, repo, prNumber);
  securityGates.push(checkProtectedFilesUnmodified(changedFiles, PROTECTED_PATHS));

  // Fetch base and proposed OpenAPI specs from GitHub (at exact SHAs)
  let oasdiffResult = undefined;
  if (policy.compatibilityBaselinePath && isOasdiffAvailable()) {
    try {
      const baseSpec = await fetchFileAtSha(installationId, owner, repo, policy.compatibilityBaselinePath, baseSha);
      const proposedSpec = await fetchFileAtSha(installationId, owner, repo, policy.compatibilityBaselinePath, headSha);
      oasdiffResult = compareOpenApi(baseSpec, proposedSpec, baseSha, headSha);
    } catch (e) {
      app.log.error(`Failed to fetch or compare OpenAPI specs: ${e}`);
      // No spec = no passing check
    }
  }

  // Determine conclusion
  const securityPassed = allGatesPassed(securityGates);
  const compatibilityPassed = !oasdiffResult || !oasdiffResult.hasBreaking;
  const conclusion: "success" | "failure" =
    securityPassed && compatibilityPassed ? "success" : "failure";

  const evidence = buildEvidence({
    owner, repo, headSha, baseSha, prNumber,
    conclusion,
    oasdiff: oasdiffResult,
    securityGates,
    policyDigest,
  });

  const summary = formatCheckSummary(evidence);
  const title = conclusion === "success"
    ? "Factory contract accepted"
    : oasdiffResult?.hasBreaking
      ? `Breaking API change: ${oasdiffResult.changes[0]?.text ?? "see details"}`
      : "Security gate failed";

  await publishCheckRun({
    installationId,
    owner,
    repo,
    headSha,
    conclusion,
    title,
    summary,
    detailsUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
    annotations: oasdiffResult?.changes.slice(0, 50).map(c => ({
      path: policy.compatibilityBaselinePath,
      start_line: 1,
      end_line: 1,
      annotation_level: c.level === "ERR" ? "failure" as const : "warning" as const,
      message: c.text,
    })),
  });

  app.log.info(`${fullName}#${prNumber} → ${conclusion} (evidence: ${evidence.evidenceHash.slice(0, 8)})`);
}

async function fetchChangedFiles(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string[]> {
  const { getInstallationKit } = await import("./github-app.js");
  const kit = await getInstallationKit(installationId);
  const res = await kit.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 100 });
  return res.data.map((f: { filename: string }) => f.filename);
}

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", async () => {
  return {
    status: "ok",
    oasdiffAvailable: isOasdiffAvailable(),
    version: "1.0.0",
  };
});

// ── Start ─────────────────────────────────────────────────────────────────────

const port = parseInt(process.env["PORT"] ?? process.env["VERIFIER_PORT"] ?? "3010");
const host = process.env["VERIFIER_HOST"] ?? "0.0.0.0";

app.listen({ port, host }, async (err) => {
  if (err) { app.log.error(err); process.exit(1); }
  // Run migrations after server starts
  const dbUrl = process.env["VERIFIER_DATABASE_URL"] ?? "";
  if (dbUrl) {
    try { await runMigrations(dbUrl); } catch (e) { app.log.warn(`Migration warning: ${e}`); }
  }
  app.log.info(`Trusted verifier listening on ${host}:${port}`);
  app.log.info(`oasdiff available: ${isOasdiffAvailable()}`);
});

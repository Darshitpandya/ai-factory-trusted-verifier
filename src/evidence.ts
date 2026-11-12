import { createHash } from "crypto";
import type { OasdiffResult } from "./compare-openapi.js";
import type { SecurityGateResult } from "./security-gates.js";

export interface VerificationEvidence {
  id: string;
  owner: string;
  repo: string;
  headSha: string;
  baseSha: string;
  prNumber: number;
  verifiedAt: string;
  conclusion: "success" | "failure";
  oasdiff?: OasdiffResult;
  securityGates: SecurityGateResult[];
  policyDigest: string;
  evidenceHash: string;  // SHA-256 of this entire evidence record (excluding itself)
}

export function buildEvidence(opts: {
  owner: string;
  repo: string;
  headSha: string;
  baseSha: string;
  prNumber: number;
  conclusion: "success" | "failure";
  oasdiff?: OasdiffResult;
  securityGates: SecurityGateResult[];
  policyDigest: string;
}): VerificationEvidence {
  const id = createHash("sha256")
    .update(`${opts.owner}/${opts.repo}:${opts.headSha}:${Date.now()}`)
    .digest("hex")
    .slice(0, 16);

  const evidence: Omit<VerificationEvidence, "evidenceHash"> = {
    id,
    ...opts,
    verifiedAt: new Date().toISOString(),
  };

  const evidenceHash = createHash("sha256")
    .update(JSON.stringify(evidence))
    .digest("hex");

  return { ...evidence, evidenceHash };
}

export function formatCheckSummary(evidence: VerificationEvidence): string {
  const lines: string[] = [
    `**Factory Contract Acceptance — ${evidence.conclusion === "success" ? "✅ PASSED" : "❌ REJECTED"}**`,
    "",
    `Commit: \`${evidence.headSha.slice(0, 8)}\` | PR #${evidence.prNumber}`,
    `Verified at: ${evidence.verifiedAt}`,
    `Evidence hash: \`${evidence.evidenceHash.slice(0, 16)}\``,
    "",
  ];

  if (evidence.oasdiff) {
    if (evidence.oasdiff.hasBreaking) {
      lines.push(`**API Compatibility: ❌ BREAKING CHANGES DETECTED**`);
      lines.push(`oasdiff ${evidence.oasdiff.oasdiffVersion}`);
      for (const change of evidence.oasdiff.changes.slice(0, 10)) {
        lines.push(`- [${change.level}] ${change.text}`);
      }
      if (evidence.oasdiff.changes.length > 10) {
        lines.push(`  ... and ${evidence.oasdiff.changes.length - 10} more`);
      }
    } else {
      lines.push(`**API Compatibility: ✅ No breaking changes** (oasdiff ${evidence.oasdiff.oasdiffVersion})`);
    }
    lines.push("");
  }

  const failedGates = evidence.securityGates.filter((g) => !g.passed);
  if (failedGates.length > 0) {
    lines.push("**Security Gates: ❌ FAILED**");
    for (const g of failedGates) lines.push(`- [${g.gateId}] ${g.message}`);
  } else {
    lines.push("**Security Gates: ✅ All passed**");
  }

  return lines.join("\n");
}

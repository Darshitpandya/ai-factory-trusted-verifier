import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";

let _app: App | null = null;
const _installationOctokit = new Map<number, Octokit>();

export function getVerifierApp(): App {
  if (_app) return _app;
  const appId = process.env["VERIFIER_APP_ID"];
  const keyPath = process.env["VERIFIER_APP_PRIVATE_KEY_PATH"];
  // Support Railway-style inline key content (no file system mounting)
  const keyContent = process.env["VERIFIER_APP_PRIVATE_KEY_CONTENT"];
  if (!appId || (!keyPath && !keyContent)) {
    throw new Error("VERIFIER_APP_ID and either VERIFIER_APP_PRIVATE_KEY_PATH or VERIFIER_APP_PRIVATE_KEY_CONTENT required");
  }
  let privateKey: string;
  if (keyContent) {
    // Railway: key provided inline as env var, replace literal \n with newlines
    privateKey = keyContent.replace(/\\n/g, "\n");
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("fs") as typeof import("fs");
    privateKey = readFileSync(keyPath!, "utf-8");
  }
  _app = new App({
    appId,
    privateKey,
    webhooks: { secret: process.env["VERIFIER_WEBHOOK_SECRET"] ?? "" },
  });
  return _app;
}

export async function getInstallationKit(installationId: number): Promise<Octokit> {
  if (_installationOctokit.has(installationId)) {
    return _installationOctokit.get(installationId)!;
  }
  const app = getVerifierApp();
  const kit = (await app.getInstallationOctokit(installationId)) as unknown as Octokit;
  _installationOctokit.set(installationId, kit);
  return kit;
}

export async function getInstallationId(owner: string, repo: string): Promise<number> {
  const app = getVerifierApp();
  const { data } = await app.octokit.request("GET /repos/{owner}/{repo}/installation", { owner, repo });
  return data.id;
}

/** Fetch file content from GitHub using the verifier App token (read-only) */
export async function fetchFileAtSha(
  installationId: number,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string> {
  const kit = await getInstallationKit(installationId);
  const res = await kit.repos.getContent({ owner, repo, path, ref });
  if (Array.isArray(res.data) || res.data.type !== "file") {
    throw new Error(`${path} is not a file at ${ref}`);
  }
  return Buffer.from(res.data.content, "base64").toString("utf-8");
}

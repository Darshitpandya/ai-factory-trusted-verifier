import { getInstallationKit } from "./github-app.js";

export interface CheckRunOptions {
  installationId: number;
  owner: string;
  repo: string;
  headSha: string;
  conclusion: "success" | "failure";
  title: string;
  summary: string;
  detailsUrl?: string;
  annotations?: Array<{
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: "failure" | "warning" | "notice";
    message: string;
  }>;
}

export const CHECK_NAME = "factory-contract/acceptance";

export async function publishCheckRun(opts: CheckRunOptions): Promise<{ checkRunId: number }> {
  const kit = await getInstallationKit(opts.installationId);

  // Use kit.request() directly — installation Octokit from @octokit/app
  // doesn't include REST namespace plugins, only the base request method
  const res = await kit.request("POST /repos/{owner}/{repo}/check-runs", {
    owner: opts.owner,
    repo: opts.repo,
    name: CHECK_NAME,
    head_sha: opts.headSha,
    status: "completed",
    conclusion: opts.conclusion,
    completed_at: new Date().toISOString(),
    details_url: opts.detailsUrl,
    output: {
      title: opts.title,
      summary: opts.summary,
      annotations: opts.annotations ?? [],
    },
  });

  return { checkRunId: (res.data as { id: number }).id };
}

export async function createInProgressCheck(
  installationId: number,
  owner: string,
  repo: string,
  headSha: string
): Promise<number> {
  const kit = await getInstallationKit(installationId);
  const res = await kit.request("POST /repos/{owner}/{repo}/check-runs", {
    owner,
    repo,
    name: CHECK_NAME,
    head_sha: headSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
    output: {
      title: "Factory Contract Acceptance",
      summary: "Checking API compatibility and policy compliance...",
    },
  });
  return (res.data as { id: number }).id;
}

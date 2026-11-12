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

// The check name is fixed — it must match the GitHub branch protection required check name.
export const CHECK_NAME = "factory-contract/acceptance";

export async function publishCheckRun(opts: CheckRunOptions): Promise<{ checkRunId: number }> {
  const kit = await getInstallationKit(opts.installationId);

  const res = await kit.checks.create({
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

  return { checkRunId: res.data.id };
}

export async function createInProgressCheck(
  installationId: number,
  owner: string,
  repo: string,
  headSha: string
): Promise<number> {
  const kit = await getInstallationKit(installationId);
  const res = await kit.checks.create({
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
  return res.data.id;
}

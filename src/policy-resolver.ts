import { readFileSync, existsSync } from "fs";
import path from "path";
import yaml from "js-yaml";

export interface RepoPolicy {
  compatibilityBaselinePath: string;
  proposedSpecPath: string;
  tenantIsolationRequired: boolean;
  piiPolicies: string[];
}

/**
 * Load repository-specific policy from the VERIFIER'S OWN repository.
 * Policy is NEVER loaded from the PR head — always from the protected verifier repo.
 */
export function loadPolicy(repoName: string): RepoPolicy {
  const policyPath = path.join("policies", `${repoName}.yaml`);

  if (!existsSync(policyPath)) {
    // Fall back to security baseline
    const baseline = path.join("policies", "security-baseline.yaml");
    if (existsSync(baseline)) {
      const content = yaml.load(readFileSync(baseline, "utf-8")) as RepoPolicy;
      return content;
    }
    throw new Error(`No policy found for repo: ${repoName}`);
  }

  const content = yaml.load(readFileSync(policyPath, "utf-8")) as RepoPolicy;
  return content;
}

/**
 * Load the security baseline policy (applies to all repos).
 */
export function loadSecurityBaseline(): {
  requiredChecks: string[];
  forbiddenPatterns: string[];
  mandatoryAnnotations: string[];
} {
  const baseline = yaml.load(
    readFileSync("policies/security-baseline.yaml", "utf-8")
  ) as ReturnType<typeof loadSecurityBaseline>;
  return baseline;
}

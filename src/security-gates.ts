/**
 * security-gates.ts — deterministic security checks run by the verifier.
 * These checks are INDEPENDENT of the producer — they execute in the verifier process
 * using the VERIFIER's own credentials and policy files, never the PR contents.
 */

export interface SecurityGateResult {
  gateId: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning";
}

/**
 * Check that the PR does not modify protected verifier/policy files.
 * Producer must not be able to change the acceptance logic in the same PR.
 */
export function checkProtectedFilesUnmodified(
  changedFiles: string[],
  protectedPaths: string[]
): SecurityGateResult {
  const violations = changedFiles.filter((f) =>
    protectedPaths.some((p) => f.startsWith(p))
  );

  return {
    gateId: "SG-001",
    passed: violations.length === 0,
    message:
      violations.length === 0
        ? "No protected files modified"
        : `Protected files modified: ${violations.join(", ")} — policy cannot be weakened in a producer PR`,
    severity: "error",
  };
}

/**
 * Check that the head SHA matches what GitHub reports (prevents SHA spoofing).
 */
export function checkShaBinding(
  reportedSha: string,
  githubApiSha: string
): SecurityGateResult {
  return {
    gateId: "SG-002",
    passed: reportedSha === githubApiSha,
    message:
      reportedSha === githubApiSha
        ? `SHA binding verified: ${reportedSha.slice(0, 8)}`
        : `SHA mismatch: webhook=${reportedSha.slice(0, 8)}, API=${githubApiSha.slice(0, 8)}`,
    severity: "error",
  };
}

/**
 * Check that the PR is against an allowed repository.
 */
export function checkRepoAllowlist(
  repoFullName: string,
  allowedRepos: string[]
): SecurityGateResult {
  const allowed = allowedRepos.includes(repoFullName);
  return {
    gateId: "SG-003",
    passed: allowed,
    message: allowed
      ? `Repository ${repoFullName} is in allowlist`
      : `Repository ${repoFullName} is NOT in verifier allowlist`,
    severity: "error",
  };
}

export function allGatesPassed(gates: SecurityGateResult[]): boolean {
  return gates.filter((g) => g.severity === "error").every((g) => g.passed);
}

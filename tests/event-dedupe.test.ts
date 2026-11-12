import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { checkRepoAllowlist, checkShaBinding, checkProtectedFilesUnmodified, allGatesPassed } from "../src/security-gates.js";

describe("security gates", () => {
  it("allows a repo in the allowlist", () => {
    const result = checkRepoAllowlist(
      "myorg/factory-reference-billing-api",
      ["myorg/factory-reference-billing-api", "myorg/factory-reference-notification-api"]
    );
    expect(result.passed).toBe(true);
  });

  it("blocks a repo not in the allowlist", () => {
    const result = checkRepoAllowlist(
      "attacker/evil-repo",
      ["myorg/factory-reference-billing-api"]
    );
    expect(result.passed).toBe(false);
    expect(result.severity).toBe("error");
  });

  it("validates matching SHAs", () => {
    const sha = "abc123def456abc123def456abc123def456abc1";
    const result = checkShaBinding(sha, sha);
    expect(result.passed).toBe(true);
  });

  it("rejects mismatched SHAs", () => {
    const result = checkShaBinding(
      "abc123def456abc123def456abc123def456abc1",
      "fff123def456abc123def456abc123def456fff1"
    );
    expect(result.passed).toBe(false);
  });

  it("blocks modification of protected paths", () => {
    const result = checkProtectedFilesUnmodified(
      [".github/workflows/verify.yml", "src/routes/invoices.ts"],
      [".github/", "policies/", "src/server.ts"]
    );
    expect(result.passed).toBe(false);
  });

  it("allows modification of non-protected paths", () => {
    const result = checkProtectedFilesUnmodified(
      ["src/routes/invoices.ts", "test/invoices.test.ts"],
      [".github/", "policies/", "containers/"]
    );
    expect(result.passed).toBe(true);
  });

  it("allGatesPassed fails if any error gate failed", () => {
    const gates = [
      { gateId: "SG-001", passed: true, message: "ok", severity: "error" as const },
      { gateId: "SG-002", passed: false, message: "fail", severity: "error" as const },
      { gateId: "SG-003", passed: false, message: "warn", severity: "warning" as const },
    ];
    expect(allGatesPassed(gates)).toBe(false);
  });

  it("allGatesPassed passes even with warning failures", () => {
    const gates = [
      { gateId: "SG-001", passed: true, message: "ok", severity: "error" as const },
      { gateId: "SG-002", passed: false, message: "warn only", severity: "warning" as const },
    ];
    expect(allGatesPassed(gates)).toBe(true);
  });
});

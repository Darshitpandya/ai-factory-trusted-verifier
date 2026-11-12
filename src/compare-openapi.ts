import { execFileSync, execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

export interface BreakingChange {
  id: string;
  text: string;
  level: "ERR" | "WARN";
  operation?: string;
  path?: string;
}

export interface OasdiffResult {
  hasBreaking: boolean;
  changes: BreakingChange[];
  oasdiffVersion: string;
  baseRef: string;
  headRef: string;
}

/**
 * Run oasdiff against two OpenAPI specifications (as strings, not file paths).
 * This is the core enforcement function — it uses a pinned binary and
 * never executes user-supplied commands.
 */
export function compareOpenApi(
  baseContent: string,
  proposedContent: string,
  baseRef: string,
  headRef: string
): OasdiffResult {
  const oasdiff = process.env["OASDIFF_BINARY"] ?? "oasdiff";

  // Write to temp files — bounded paths, no user-controlled content in paths
  const tmpDir = mkdtempSync(path.join(tmpdir(), "verifier-oasdiff-"));
  const basePath = path.join(tmpDir, "base.yaml");
  const proposedPath = path.join(tmpDir, "proposed.yaml");

  try {
    writeFileSync(basePath, baseContent);
    writeFileSync(proposedPath, proposedContent);

    // Get oasdiff version for evidence
    let oasdiffVersion = "unknown";
    try {
      oasdiffVersion = execFileSync(oasdiff, ["version"], { encoding: "utf-8" }).trim();
    } catch {}

    // Run breaking change detection — fixed arguments, no user input
    let output: string;
    let hasBreaking = false;
    const changes: BreakingChange[] = [];

    try {
      output = execFileSync(
        oasdiff,
        ["breaking", basePath, proposedPath, "--format", "json"],
        { encoding: "utf-8", timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
      );
      const parsed = JSON.parse(output) as BreakingChange[];
      changes.push(...parsed);
      hasBreaking = parsed.length > 0;
    } catch (e: unknown) {
      const err = e as { stdout?: string; status?: number };
      // oasdiff exits 1 when breaking changes found
      if (err.status === 1 && err.stdout) {
        try {
          const parsed = JSON.parse(err.stdout) as BreakingChange[];
          changes.push(...parsed);
          hasBreaking = parsed.length > 0;
        } catch {
          // oasdiff binary not found or other error
          throw new Error(`oasdiff execution failed: ${e}`);
        }
      } else if (err.status !== 0) {
        throw new Error(`oasdiff execution failed with status ${err.status}: ${e}`);
      }
    }

    return { hasBreaking, changes, oasdiffVersion, baseRef, headRef };
  } finally {
    // Always clean up temp files
    try {
      unlinkSync(basePath);
      unlinkSync(proposedPath);
    } catch {}
  }
}

/**
 * Check if oasdiff binary is available at the configured path.
 */
export function isOasdiffAvailable(): boolean {
  const binary = process.env["OASDIFF_BINARY"] ?? "oasdiff";
  try {
    execFileSync(binary, ["version"], { encoding: "utf-8", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

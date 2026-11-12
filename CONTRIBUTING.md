# Contributing to AI Factory Trusted Verifier

This is the security-critical component of the AI Software Factory Contract. The bar for changes here is higher than for the factory repo.

## Ownership

Changes to these paths require approval from the **security/verification team** (see CODEOWNERS), not just any maintainer:

- `src/` — the verification logic itself
- `policies/` — the protected acceptance policies
- `containers/verifier.Dockerfile` — the pinned oasdiff binary and runtime environment
- `.github/` — workflow and security configuration

A PR that weakens any acceptance check, removes a security gate, or makes the verifier trust input from a PR head will not be merged.

## Running tests before opening a PR

```bash
pnpm typecheck
pnpm test
```

All six webhook-signature tests and all eight security-gate tests must pass. The oasdiff integration tests are skipped if the binary is not installed locally — that is expected and acceptable.

## Adding a new consumer repo

1. Add `policies/your-repo-name.yaml`:
   ```yaml
   compatibilityBaselinePath: path/to/openapi-or-schema.yaml
   proposedSpecPath: path/to/openapi-or-schema.yaml
   tenantIsolationRequired: true|false
   piiPolicies: []
   ```
2. Add a negative test: a fixture that should produce a failing check, and confirm `compareOpenApi` or `checkProtectedFilesUnmodified` correctly returns `hasBreaking: true` or `passed: false`
3. Update `ALLOWED_REPOS` in your deployment `.env`
4. Document any new policy fields in the policy file with inline comments

## Reporting security issues

Do not open a public issue. Use GitHub Security Advisories or see [SECURITY.md](SECURITY.md).

## What not to contribute

- A second LLM-based reviewer as a replacement for the oasdiff check — an LLM cannot provide deterministic, non-spoofable acceptance
- Any change that reads policy from the PR head instead of the verifier's own branch
- Any change that allows the producer App to post a `factory-contract/acceptance` check

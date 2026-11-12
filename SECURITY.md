# Security Policy — AI Factory Trusted Verifier

## Reporting a vulnerability

**Do not open a public issue.**

Report privately via GitHub Security Advisories or contact the maintainer directly (see GitHub profile).

Include: description, reproduction steps, potential impact, and any suggested fix.

Response: acknowledgement within 72 hours, status update within 7 days.

## Critical security properties

This service is the acceptance authority for the AI Software Factory Contract. If any of the following properties are violated, the independent acceptance claim no longer holds.

| Property | Implementation |
|---|---|
| Signature validation | HMAC-SHA256 over raw body; `timingSafeEqual`; rejects missing or non-sha256 prefix |
| Delivery deduplication | `X-GitHub-Delivery` stored in PostgreSQL; duplicate deliveries silently ignored |
| Policy source isolation | `loadPolicy()` reads from this repo's filesystem only — never from request data or PR head |
| SHA binding | `checkShaBinding()` compares webhook SHA against fresh GitHub API response |
| Allowlist enforcement | `checkRepoAllowlist()` rejects any repo not in `ALLOWED_REPOS` |
| Protected path guard | `checkProtectedFilesUnmodified()` blocks PRs touching `src/`, `.github/`, `policies/`, `containers/` |
| No user command execution | `oasdiff` is called with fixed CLI arguments and fixed file paths; no user-supplied content reaches a shell |
| Credential isolation | App private key read from filesystem path in `VERIFIER_APP_PRIVATE_KEY_PATH`; never from env value |

## Deployment security requirements

- Run as a non-root user (the Dockerfile adds and uses a `verifier` user)
- Mount the App private key via Docker secrets, not environment variables
- Use HTTPS with valid TLS in front of the webhook endpoint
- Restrict network access: the verifier only needs outbound access to `api.github.com`
- Keep PostgreSQL credentials separate from the factory coordinator's database
- Rotate `VERIFIER_WEBHOOK_SECRET` if it is ever logged or exposed

## oasdiff binary

The `oasdiff` version is pinned in `containers/verifier.Dockerfile`. Do not update it without:
1. Reviewing the oasdiff changelog for behavioral changes
2. Running the full test suite with the new binary
3. Updating the ARG value in the Dockerfile and committing to a new tagged image

A silent behavioral change in the binary could cause previously-breaking changes to pass undetected.

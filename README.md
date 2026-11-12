# AI Factory Trusted Verifier

**Independently owned** — this repository is separated from the factory producer on purpose. The producer cannot modify the acceptance policy or impersonate this GitHub App's check results.

## Related Repositories

| Repository | Role |
|---|---|
| [ai-software-factory-contract](https://github.com/Darshitpandya/ai-software-factory-contract) | Factory engine (producer — cannot control this verifier) |
| **This repo** | Trusted verifier — posts `factory-contract/acceptance` check |
| [factory-reference-billing-api](https://github.com/Darshitpandya/factory-reference-billing-api) | Billing API (verified by this service) |
| [factory-reference-notification-api](https://github.com/Darshitpandya/factory-reference-notification-api) | Notification API (verified by this service) |

## What It Does

Receives `pull_request` webhooks from GitHub, runs `oasdiff breaking` against the **base SHA** (never the PR-modified baseline), and posts a `factory-contract/acceptance` check run via a **dedicated GitHub App**.

Branch protection on the consumer repos requires this exact check from this exact App — the factory producer cannot satisfy it with its own token.

## Security Architecture

- Webhook HMAC-SHA256 signature validated before any processing
- `X-GitHub-Delivery` deduplication prevents replay attacks
- Policy files loaded from **this repo's** protected branch, not from the PR head
- `oasdiff` binary pinned in Dockerfile — no user-supplied commands executed
- Protected paths (`.github/`, `policies/`, `src/`) blocked from modification in consumer PRs

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test    # 17 tests: webhook signature, security gates, oasdiff (skipped if binary absent)
```

## Deployment

```bash
cp .env.example .env   # VERIFIER_APP_ID, VERIFIER_WEBHOOK_SECRET, ALLOWED_REPOS
docker compose -f deploy/docker-compose.yaml up -d
```

Register the webhook at `https://your-verifier.example.com/webhook` in the GitHub App settings.

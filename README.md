# AI Factory Trusted Verifier

**Independently owned acceptance authority for the AI Software Factory Contract.**

This service receives GitHub `pull_request` webhooks, runs `oasdiff breaking` against the protected API baseline, applies security gates, and posts a `factory-contract/acceptance` GitHub check via a **dedicated GitHub App** that the factory producer cannot impersonate.

[Architecture](#how-it-works) · [Deploy locally](#quick-start) · [Policies](#policies) · [Trust model](#trust-model) · [Contributing](CONTRIBUTING.md)

---

## Why it is a separate repository

A verifier that lives in the same repository as the factory producer does not provide independent acceptance. The factory producer could:
- Modify the acceptance logic in the same PR that changes the code
- Change policy files to weaken compatibility requirements
- Use its own GitHub App token to post a passing check under the same name

This repository is **separately owned**. The factory producer has no write access here. Branch protection on the consumer repos requires `factory-contract/acceptance` specifically from this App's identity — no other token can satisfy it.

---

## How it works

```
GitHub pull_request event
        │
        ▼
  POST /webhook
  ├─ validate X-Hub-Signature-256
  ├─ deduplicate X-GitHub-Delivery
  └─ return 202 immediately
        │
        ▼ (async)
  Resolve installation ID
  Fetch changed files
  Check protected-path violations (SG-001)
  Verify SHA binding (SG-002)
  Check repo allowlist (SG-003)
        │
        ▼
  Load policy from THIS repo's protected branch
  (never from the PR head)
        │
        ▼
  Fetch base OpenAPI/schema  ← base SHA from GitHub API
  Fetch proposed OpenAPI/schema  ← head SHA from GitHub API
        │
        ▼
  oasdiff breaking <base> <proposed> --format json
  (pinned binary in Dockerfile — no user commands executed)
        │
        ▼
  Publish GitHub Check Run
  name: factory-contract/acceptance
  conclusion: success | failure
  annotations: breaking change details
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 22, pnpm ≥ 9, Docker
- A GitHub App created separately from the factory producer App
- PostgreSQL instance

### 1. Clone and install

```bash
git clone https://github.com/Darshitpandya/ai-factory-trusted-verifier.git
cd ai-factory-trusted-verifier
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

```
VERIFIER_APP_ID=your-verifier-app-id
VERIFIER_APP_PRIVATE_KEY_PATH=/run/secrets/verifier_app_key
VERIFIER_WEBHOOK_SECRET=your-webhook-secret
VERIFIER_DATABASE_URL=postgresql://verifier:verifier@localhost:5433/verifier
ALLOWED_REPOS=OWNER/factory-reference-billing-api,OWNER/factory-reference-notification-api
OASDIFF_BINARY=/usr/local/bin/oasdiff
```

### 3. Run with Docker Compose

```bash
docker compose -f deploy/docker-compose.yaml up -d
```

The verifier listens on port 3002. Register `https://your-host:3002/webhook` as the webhook URL in the GitHub App settings.

### 4. Verify it is running

```bash
curl http://localhost:3002/health
# {"status":"ok","oasdiffAvailable":true,"version":"1.0.0"}
```

If `oasdiffAvailable` is `false`, the oasdiff binary is not in the container. Check the Dockerfile and rebuild.

---

## GitHub App setup

Create a **new GitHub App** (do not reuse the factory producer App):

| Setting | Value |
|---|---|
| Webhook URL | `https://your-host:3002/webhook` |
| Webhook secret | A random 32+ character secret → `VERIFIER_WEBHOOK_SECRET` |
| Contents | Read-only |
| Checks | Read & write |
| Pull requests | Read-only |
| Metadata | Read-only |

Subscribe to: `Pull request`, `Check suite`

After creating:
1. Generate a private key → save to a secrets path → set `VERIFIER_APP_PRIVATE_KEY_PATH`
2. Install the App on the billing and notification repos
3. Update the repos' branch protection: add `factory-contract/acceptance` as a required check and **restrict its source to this App** (not to GitHub Actions, not to the producer App)

---

## Policies

Policies live in `policies/` in **this repository**. They are loaded from the verifier's own protected branch at verification time — a PR in a consumer repo cannot change these.

| File | Applies to | Key setting |
|---|---|---|
| `policies/billing-api.yaml` | `factory-reference-billing-api` | `compatibilityBaselinePath: openapi/openapi.yaml` |
| `policies/notification-api.yaml` | `factory-reference-notification-api` | `compatibilityBaselinePath: contracts/events/notification-requested.schema.json` |
| `policies/security-baseline.yaml` | All repos | Required checks, forbidden patterns |

To add a new consumer repo:
1. Add a policy file: `policies/your-repo-name.yaml`
2. Add the repo full name to `ALLOWED_REPOS`
3. Install the verifier App on the repo and configure branch protection

---

## Trust model

The following properties must hold for the independent acceptance claim to be valid:

| Property | How it is enforced |
|---|---|
| Webhook origin authenticity | HMAC-SHA256 over raw body; constant-time comparison |
| No replay attacks | `X-GitHub-Delivery` persisted in PostgreSQL; duplicates ignored |
| Policy cannot be tampered by PR | Policy loaded from verifier's own branch, never from PR head |
| SHA binding — the right commit is being checked | head SHA verified against GitHub API, not trusted from webhook payload |
| Protected paths cannot be weakened | `SG-001` blocks PRs that modify `.github/`, `policies/`, `src/`, `containers/` in consumer repos |
| Producer cannot post a passing check | `factory-contract/acceptance` check requires this App's identity; producer App identity rejected by branch ruleset |
| oasdiff binary not user-controlled | Pinned version in Dockerfile; file paths are fixed; no user-supplied shell commands run |

---

## Tests

```bash
pnpm test
```

| Test | What it proves |
|---|---|
| `webhook-signature.test.ts` | Valid signatures accepted; invalid, missing, tampered rejected |
| `event-dedupe.test.ts` | Security gates: allowlist, SHA binding, protected-path check; `allGatesPassed` logic |
| `breaking-api.test.ts` | oasdiff detects required-param addition (skipped if binary absent) |

---

## Commands

```bash
pnpm typecheck
pnpm test
pnpm start              # start the webhook server (requires .env)
docker compose -f deploy/docker-compose.yaml up -d   # production mode
docker compose -f deploy/docker-compose.yaml logs -f verifier
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes to `src/`, `policies/`, or `containers/` require a review from the security/verification team.

---

## License

MIT — see [LICENSE](LICENSE).

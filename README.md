# AI Factory Trusted Verifier

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![CI](https://github.com/Darshitpandya/ai-factory-trusted-verifier/actions/workflows/verify.yml/badge.svg)](https://github.com/Darshitpandya/ai-factory-trusted-verifier/actions/workflows/verify.yml)
[![GitHub Stars](https://img.shields.io/github/stars/Darshitpandya/ai-factory-trusted-verifier?style=flat-square&logo=github)](https://github.com/Darshitpandya/ai-factory-trusted-verifier/stargazers)
[![oasdiff](https://img.shields.io/badge/oasdiff-v1.35.0%20pinned-0096FF?style=flat-square)](containers/verifier.Dockerfile)
[![check](https://img.shields.io/badge/check-factory--contract%2Facceptance-brightgreen?style=flat-square&logo=github)](https://github.com/Darshitpandya/ai-factory-trusted-verifier)
[![Separately Owned](https://img.shields.io/badge/ownership-independent%20from%20producer-red?style=flat-square)](SECURITY.md)

**Independently owned acceptance authority for the AI Software Factory Contract.**

**Live:** `https://web-production-fff93264.up.railway.app/health` → `{"status":"ok","oasdiffAvailable":true}`

Receives GitHub `pull_request` webhooks, runs `oasdiff breaking` against the protected API baseline, applies security gates, and posts `factory-contract/acceptance` via a **dedicated GitHub App** that the factory producer cannot impersonate.

[How it works](#how-it-works) · [Quick start](#quick-start) · [Policies](#policies) · [Trust model](#trust-model) · [Contributing](CONTRIBUTING.md)

---

## Why it is a separate repository

<img src="https://raw.githubusercontent.com/Darshitpandya/ai-software-factory-contract/main/docs/diagrams/s14-three-authorities-light.png#gh-light-mode-only" alt="Control, execution and acceptance are separate authorities" width="840">
<img src="https://raw.githubusercontent.com/Darshitpandya/ai-software-factory-contract/main/docs/diagrams/s14-three-authorities-dark.png#gh-dark-mode-only" alt="Control, execution and acceptance are separate authorities" width="840">

<img src="https://raw.githubusercontent.com/Darshitpandya/ai-software-factory-contract/main/docs/diagrams/s36-trust-boundary-light.png#gh-light-mode-only" alt="Trust boundary: the producer cannot own its acceptance" width="840">
<img src="https://raw.githubusercontent.com/Darshitpandya/ai-software-factory-contract/main/docs/diagrams/s36-trust-boundary-dark.png#gh-dark-mode-only" alt="Trust boundary: the producer cannot own its acceptance" width="840">

A verifier in the same repository as the producer is not independent. The producer could modify acceptance logic, weaken policies, or post a passing check with its own App token. This repository is separately owned. Branch protection on consumer repos requires `factory-contract/acceptance` **from this App's identity** — no other token can satisfy it.

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

<img src="https://raw.githubusercontent.com/Darshitpandya/ai-software-factory-contract/main/docs/diagrams/s34-investigation-trace-light.png#gh-light-mode-only" alt="Investigation trace: start at acceptance boundary, trace backward" width="840">
<img src="https://raw.githubusercontent.com/Darshitpandya/ai-software-factory-contract/main/docs/diagrams/s34-investigation-trace-dark.png#gh-dark-mode-only" alt="Investigation trace: start at acceptance boundary, trace backward" width="840">

The rejection is traced through contract artifacts, not a transcript. Start at the acceptance boundary and work backward: pull request → check → violation → diff → factory version + run record.

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

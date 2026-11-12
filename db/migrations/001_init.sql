-- Trusted verifier state — separate database from factory coordinator
BEGIN;

CREATE TABLE IF NOT EXISTS verification_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     TEXT UNIQUE NOT NULL,
    owner           TEXT NOT NULL,
    repo            TEXT NOT NULL,
    head_sha        TEXT NOT NULL,
    base_sha        TEXT NOT NULL,
    pr_number       INTEGER NOT NULL,
    installation_id BIGINT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
    worker_id       TEXT,
    conclusion      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vj_status ON verification_jobs(status) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS processed_webhook_deliveries (
    delivery_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_evidence (
    id              TEXT PRIMARY KEY,
    job_id          UUID REFERENCES verification_jobs(id),
    owner           TEXT NOT NULL,
    repo            TEXT NOT NULL,
    head_sha        TEXT NOT NULL,
    conclusion      TEXT NOT NULL,
    evidence_json   JSONB NOT NULL,
    evidence_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;

import type { Pool } from "pg";

export interface VerificationJob {
  id: string;
  deliveryId: string;
  owner: string;
  repo: string;
  headSha: string;
  baseSha: string;
  prNumber: number;
  installationId: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  createdAt: Date;
}

export async function enqueueJob(
  pool: Pool,
  job: Omit<VerificationJob, "id" | "status" | "createdAt">
): Promise<string> {
  const res = await pool.query(
    `INSERT INTO verification_jobs
       (delivery_id, owner, repo, head_sha, base_sha, pr_number, installation_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')
     ON CONFLICT (delivery_id) DO NOTHING
     RETURNING id`,
    [job.deliveryId, job.owner, job.repo, job.headSha, job.baseSha, job.prNumber, job.installationId]
  );
  return res.rows[0]?.id as string ?? "duplicate";
}

export async function claimJob(pool: Pool, workerId: string): Promise<VerificationJob | null> {
  const res = await pool.query(
    `UPDATE verification_jobs
     SET status = 'RUNNING', worker_id = $1, started_at = NOW()
     WHERE id = (
       SELECT id FROM verification_jobs
       WHERE status = 'PENDING'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [workerId]
  );
  return (res.rows[0] ?? null) as VerificationJob | null;
}

export async function completeJob(
  pool: Pool,
  jobId: string,
  status: "COMPLETED" | "FAILED",
  conclusion: string
): Promise<void> {
  await pool.query(
    "UPDATE verification_jobs SET status=$1, conclusion=$2, completed_at=NOW() WHERE id=$3",
    [status, conclusion, jobId]
  );
}

export async function isDeliveryProcessed(pool: Pool, deliveryId: string): Promise<boolean> {
  const res = await pool.query(
    "SELECT 1 FROM processed_webhook_deliveries WHERE delivery_id=$1",
    [deliveryId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function markDeliveryProcessed(pool: Pool, deliveryId: string): Promise<void> {
  await pool.query(
    "INSERT INTO processed_webhook_deliveries (delivery_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [deliveryId]
  );
}

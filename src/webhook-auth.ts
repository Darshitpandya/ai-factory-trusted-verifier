import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validate GitHub webhook signature.
 * Uses timing-safe comparison to prevent timing attacks.
 * Rejects if signature header is missing or body is empty.
 */
export function validateWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  if (!signature.startsWith("sha256=")) return false;
  if (rawBody.length === 0) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const actual = signature.slice("sha256=".length);

  // Both must be the same length for timingSafeEqual
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(actual, "hex")
  );
}

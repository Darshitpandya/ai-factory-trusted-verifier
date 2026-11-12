import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { validateWebhookSignature } from "../src/webhook-auth.js";

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${sig}`;
}

describe("validateWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const body = Buffer.from('{"action":"opened"}');
    const sig = sign(body.toString());
    expect(validateWebhookSignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects when signature is missing", () => {
    const body = Buffer.from("test");
    expect(validateWebhookSignature(body, undefined, SECRET)).toBe(false);
  });

  it("rejects when signature prefix is wrong", () => {
    const body = Buffer.from("test");
    const sig = `sha1=${createHmac("sha1", SECRET).update("test").digest("hex")}`;
    expect(validateWebhookSignature(body, sig, SECRET)).toBe(false);
  });

  it("rejects when signature is computed with wrong secret", () => {
    const body = Buffer.from("test");
    const sig = sign(body.toString(), "wrong-secret");
    expect(validateWebhookSignature(body, sig, SECRET)).toBe(false);
  });

  it("rejects empty body", () => {
    const body = Buffer.from("");
    const sig = sign("");
    expect(validateWebhookSignature(body, sig, SECRET)).toBe(false);
  });

  it("rejects replayed/tampered body", () => {
    const body = Buffer.from('{"action":"opened"}');
    const sig = sign('{"action":"merged"}'); // signed different content
    expect(validateWebhookSignature(body, sig, SECRET)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { compareOpenApi } from "../src/compare-openapi.js";
import { isOasdiffAvailable } from "../src/compare-openapi.js";

const BASE_SPEC = `
openapi: "3.0.3"
info:
  title: Billing API
  version: "1.0.0"
paths:
  /v1/invoices:
    get:
      summary: List invoices
      parameters: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
`;

// COMPATIBLE change: adds a new optional endpoint
const COMPATIBLE_SPEC = `
openapi: "3.0.3"
info:
  title: Billing API
  version: "1.0.0"
paths:
  /v1/invoices:
    get:
      summary: List invoices
      parameters: []
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
  /v1/invoices/export:
    get:
      summary: Export invoices as CSV
      parameters: []
      responses:
        "200":
          description: CSV file
`;

// BREAKING change: adds a required parameter to an existing endpoint
const BREAKING_SPEC = `
openapi: "3.0.3"
info:
  title: Billing API
  version: "1.0.0"
paths:
  /v1/invoices:
    get:
      summary: List invoices
      parameters:
        - name: tenant_id
          in: query
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
`;

describe("compareOpenApi", () => {
  const skipIfNoOasdiff = isOasdiffAvailable() ? it : it.skip;

  skipIfNoOasdiff("detects no breaking changes for a compatible addition", () => {
    const result = compareOpenApi(BASE_SPEC, COMPATIBLE_SPEC, "base-sha", "head-sha");
    expect(result.hasBreaking).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  skipIfNoOasdiff("detects breaking change when required parameter is added to existing endpoint", () => {
    const result = compareOpenApi(BASE_SPEC, BREAKING_SPEC, "base-sha", "head-sha");
    expect(result.hasBreaking).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
    // The specific breaking change is a new required query parameter
    const breakingTexts = result.changes.map(c => c.text.toLowerCase());
    expect(breakingTexts.some(t => t.includes("required") || t.includes("parameter"))).toBe(true);
  });
});

describe("isOasdiffAvailable", () => {
  it("returns a boolean without throwing", () => {
    const result = isOasdiffAvailable();
    expect(typeof result).toBe("boolean");
  });
});

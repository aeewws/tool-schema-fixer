import { describe, expect, it } from "vitest";
import { normalizeDocument } from "../src/fixer.js";
import type { JsonObject } from "../src/types.js";

describe("normalizeDocument", () => {
  it("normalizes a plain schema for OpenAI", () => {
    const input: JsonObject = {
      type: "object",
      properties: {
        name: {
          type: ["string", "null"],
          example: "Ada"
        },
        tags: {
          nullable: true,
          type: "array",
          items: {
            type: "string"
          }
        }
      }
    };

    const result = normalizeDocument(input, "openai", "fix");
    expect(result.changed).toBe(true);
    expect(result.report.summary.total).toBeGreaterThan(0);
    expect(result.document).toEqual({
      type: "object",
      properties: {
        name: {
          type: "string"
        },
        tags: {
          type: "array",
          items: {
            type: "string"
          }
        }
      },
      additionalProperties: false,
      required: ["name", "tags"]
    });
  });

  it("normalizes an Anthropic tool wrapper without forcing required", () => {
    const input: JsonObject = {
      name: "lookup",
      input_schema: {
        type: "object",
        properties: {
          include_meta: {
            nullable: true,
            type: "boolean"
          }
        }
      }
    };

    const result = normalizeDocument(input, "anthropic", "fix");
    const fixed = result.document as JsonObject;
    const schema = fixed.input_schema as JsonObject;
    const property = (schema.properties as JsonObject).include_meta as JsonObject;

    expect(property.type).toEqual(["boolean", "null"]);
    expect(schema.required).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
  });

  it("normalizes an OpenAI function wrapper even when type=function is omitted", () => {
    const input: JsonObject = {
      function: {
        name: "lookup",
        parameters: {
          type: "object",
          properties: {
            city: {
              type: ["string", "null"]
            }
          }
        }
      }
    };

    const result = normalizeDocument(input, "openai", "fix");
    const fixed = result.document as JsonObject;
    const schema = (fixed.function as JsonObject).parameters as JsonObject;
    const property = (schema.properties as JsonObject).city as JsonObject;

    expect(property.type).toBe("string");
    expect(schema.required).toEqual(["city"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("normalizes null unions into Gemini nullable form", () => {
    const input: JsonObject = {
      parameters: {
        type: "object",
        properties: {
          city: {
            anyOf: [{ type: "string" }, { type: "null" }]
          }
        }
      }
    };

    const result = normalizeDocument(input, "gemini", "fix");
    const fixed = result.document as JsonObject;
    const schema = fixed.parameters as JsonObject;
    const property = (schema.properties as JsonObject).city as JsonObject;

    expect(property.type).toBe("string");
    expect(property.nullable).toBe(true);
    expect(schema.additionalProperties).toBe(false);
  });

  it("normalizes an MCP inputSchema wrapper", () => {
    const input: JsonObject = {
      name: "lookup",
      inputSchema: {
        type: "object",
        properties: {
          city: {
            type: ["string", "null"]
          }
        }
      }
    };

    const result = normalizeDocument(input, "gemini", "fix");
    const fixed = result.document as JsonObject;
    const schema = fixed.inputSchema as JsonObject;
    const property = (schema.properties as JsonObject).city as JsonObject;

    expect(property.type).toBe("string");
    expect(property.nullable).toBe(true);
    expect(result.report.schemaPath).toBe("/inputSchema");
  });

  it("does not drop nullability for enum nullable unions", () => {
    const input: JsonObject = {
      parameters: {
        type: "object",
        properties: {
          city: {
            anyOf: [{ enum: ["a", "b"] }, { type: "null" }]
          }
        }
      }
    };

    const result = normalizeDocument(input, "gemini", "fix");
    const fixed = result.document as JsonObject;
    const schema = fixed.parameters as JsonObject;
    const property = (schema.properties as JsonObject).city as JsonObject;

    expect(property.anyOf).toEqual([{ enum: ["a", "b"] }, { type: "null" }]);
    expect(property.nullable).toBeUndefined();
    expect(result.report.findings.some((finding) => finding.code === "anyOf-nullable-unresolved")).toBe(true);
  });

  it("does not rewrite non-null unions into unsupported anyOf for Gemini", () => {
    const input: JsonObject = {
      parameters: {
        type: "object",
        properties: {
          value: {
            type: ["string", "number"]
          }
        }
      }
    };

    const result = normalizeDocument(input, "gemini", "fix");
    const fixed = result.document as JsonObject;
    const schema = fixed.parameters as JsonObject;
    const property = (schema.properties as JsonObject).value as JsonObject;

    expect(property.type).toEqual(["string", "number"]);
    expect(property.anyOf).toBeUndefined();
    expect(result.report.findings.some((finding) => finding.code === "type-array-unresolved")).toBe(true);
  });

  it("reports unsupported OpenAI keywords during lint", () => {
    const input: JsonObject = {
      type: "object",
      properties: {
        query: {
          allOf: [{ type: "string" }]
        }
      }
    };

    const result = normalizeDocument(input, "openai", "lint");
    expect(result.changed).toBe(false);
    expect(result.report.summary.errors).toBe(1);
    expect(result.document).toEqual(input);
  });
});

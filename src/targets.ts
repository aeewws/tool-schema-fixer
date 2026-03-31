import type { Target, TargetProfile } from "./types.js";

export const DEFAULT_TARGET: Target = "openai";

export const TARGET_PROFILES: Record<Target, TargetProfile> = {
  anthropic: {
    closeObjects: true,
    reportOnlyKeywords: [],
    requireAllObjectProperties: false,
    stripKeywords: ["$id", "$schema", "id"]
  },
  gemini: {
    closeObjects: true,
    reportOnlyKeywords: [
      "allOf",
      "anyOf",
      "const",
      "contains",
      "dependentRequired",
      "dependentSchemas",
      "else",
      "if",
      "maxContains",
      "minContains",
      "not",
      "oneOf",
      "patternProperties",
      "prefixItems",
      "propertyNames",
      "then",
      "unevaluatedProperties"
    ],
    requireAllObjectProperties: false,
    stripKeywords: ["$id", "$schema", "deprecated", "example", "examples", "id", "readOnly", "writeOnly"]
  },
  openai: {
    closeObjects: true,
    reportOnlyKeywords: [
      "allOf",
      "anyOf",
      "const",
      "contains",
      "dependentRequired",
      "dependentSchemas",
      "else",
      "if",
      "maxContains",
      "minContains",
      "not",
      "oneOf",
      "patternProperties",
      "prefixItems",
      "propertyNames",
      "then",
      "unevaluatedProperties"
    ],
    requireAllObjectProperties: true,
    stripKeywords: ["$id", "$schema", "deprecated", "example", "examples", "id", "nullable", "readOnly", "writeOnly"]
  }
};

export const UNSUPPORTED_KEYWORDS_BY_TARGET: Record<Target, ReadonlySet<string>> = {
  anthropic: new Set(["$id", "$schema", "id"]),
  gemini: new Set([
    "$id",
    "$schema",
    "allOf",
    "anyOf",
    "const",
    "contains",
    "dependentRequired",
    "dependentSchemas",
    "deprecated",
    "else",
    "example",
    "examples",
    "id",
    "if",
    "maxContains",
    "minContains",
    "not",
    "nullable",
    "oneOf",
    "patternProperties",
    "prefixItems",
    "propertyNames",
    "readOnly",
    "then",
    "unevaluatedProperties",
    "writeOnly"
  ]),
  openai: new Set([
    "$id",
    "$schema",
    "allOf",
    "anyOf",
    "const",
    "contains",
    "dependentRequired",
    "dependentSchemas",
    "deprecated",
    "else",
    "example",
    "examples",
    "id",
    "if",
    "maxContains",
    "minContains",
    "not",
    "nullable",
    "oneOf",
    "patternProperties",
    "prefixItems",
    "propertyNames",
    "readOnly",
    "then",
    "unevaluatedProperties",
    "writeOnly"
  ])
};

export function isTarget(value: string): value is Target {
  return value === "openai" || value === "anthropic" || value === "gemini";
}

import { cloneJson, isJsonObject, replaceObject, toJsonPointer, uniqueStrings } from "./json.js";
import { locateSchemaDocument } from "./locate-schema.js";
import { createReport, finalizeReport, pushFinding } from "./report.js";
import { TARGET_PROFILES } from "./targets.js";
import type {
  JsonObject,
  JsonValue,
  Mode,
  NormalizeReport,
  NormalizeResult,
  Target
} from "./types.js";

interface VisitContext {
  isRoot: boolean;
  mode: Mode;
  path: Array<string | number>;
  target: Target;
}

const SIMPLE_TYPE_SET = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null"
]);

export function normalizeDocument(document: JsonValue, target: Target, mode: Mode): NormalizeResult {
  const clone = cloneJson(document);
  const located = locateSchemaDocument(clone);
  const report = createReport(mode, target, located.wrapper, toJsonPointer(located.path));

  if (!isJsonObject(located.schema)) {
    pushFinding(report, {
      code: "schema-not-object",
      level: "error",
      message: "Expected the selected schema root to be a JSON object.",
      path: toJsonPointer(located.path)
    });

    return {
      changed: false,
      document: clone,
      report: finalizeReport(report)
    };
  }

  visitSchema(located.schema, report, {
    isRoot: true,
    mode,
    path: located.path,
    target
  });

  finalizeReport(report);

  return {
    changed: report.summary.applied > 0,
    document: clone,
    report
  };
}

function visitSchema(schema: JsonObject, report: NormalizeReport, context: VisitContext): void {
  normalizeNullable(schema, report, context);
  normalizeTypeArray(schema, report, context);
  normalizeAnyOfNullableUnion(schema, report, context, "anyOf");
  normalizeAnyOfNullableUnion(schema, report, context, "oneOf");

  const profile = TARGET_PROFILES[context.target];
  stripKeywords(schema, report, context, profile.stripKeywords);
  reportUnsupportedKeywords(schema, report, context, profile.reportOnlyKeywords);

  if (context.target === "gemini" && Array.isArray(schema.enum) && schema.enum.some((item) => typeof item !== "string")) {
    pushFinding(report, {
      code: "gemini-enum-non-string",
      level: "warning",
      message: "Gemini's schema subset is clearest for string enums; non-string enum members may be rejected.",
      path: toJsonPointer([...context.path, "enum"])
    });
  }

  if (context.target === "openai" && context.isRoot && !isObjectSchema(schema)) {
    const repaired = repairOpenAiRoot(schema);
    if (repaired) {
      if (context.mode === "fix") {
        replaceObject(schema, repaired);
      }

      pushFinding(report, {
        applied: context.mode === "fix",
        code: "openai-root-object",
        level: "warning",
        message: "Collapsed the root schema into an object branch for better OpenAI compatibility.",
        path: toJsonPointer(context.path)
      });
    } else {
      pushFinding(report, {
        code: "openai-root-object",
        level: "error",
        message: "OpenAI-compatible root schemas should be objects and should not rely on a root union.",
        path: toJsonPointer(context.path)
      });
    }
  }

  visitChildren(schema, report, context);
  normalizeObjectControls(schema, report, context);
}

function normalizeNullable(schema: JsonObject, report: NormalizeReport, context: VisitContext): void {
  if (schema.nullable !== true) {
    return;
  }

  const typeValue = schema.type;
  if (typeof typeValue !== "string" || typeValue === "null") {
    pushFinding(report, {
      code: "nullable-unresolved",
      level: "warning",
      message: "Found nullable=true on a schema that could not be normalized automatically.",
      path: toJsonPointer([...context.path, "nullable"])
    });
    return;
  }

  if (context.target === "gemini") {
    return;
  }

  if (context.mode === "fix") {
    delete schema.nullable;
    if (context.target === "anthropic") {
      schema.type = [typeValue, "null"];
    }
  }

  pushFinding(report, {
    applied: context.mode === "fix",
    code: "nullable-normalized",
    level: context.target === "openai" ? "warning" : "info",
    message:
      context.target === "openai"
        ? "Dropped nullable=true to keep a single concrete type for OpenAI-targeted output."
        : "Converted nullable=true into a JSON Schema type union.",
    path: toJsonPointer(context.path)
  });
}

function normalizeTypeArray(schema: JsonObject, report: NormalizeReport, context: VisitContext): void {
  if (!Array.isArray(schema.type) || !schema.type.every((value) => typeof value === "string")) {
    return;
  }

  const typeArray = schema.type as string[];
  const uniqueTypeArray = uniqueStrings(typeArray);
  const nonNullTypes = uniqueTypeArray.filter((value) => value !== "null");
  const hasNull = uniqueTypeArray.includes("null");

  if (hasNull && nonNullTypes.length === 1) {
    const baseType = nonNullTypes[0];
    if (baseType === undefined) {
      return;
    }

    if (context.mode === "fix") {
      if (context.target === "anthropic") {
        schema.type = [baseType, "null"];
      } else if (context.target === "gemini") {
        schema.type = baseType;
        schema.nullable = true;
      } else {
        schema.type = baseType;
      }
    }

    pushFinding(report, {
      applied: context.mode === "fix",
      code: "type-array-nullable",
      level: context.target === "openai" ? "warning" : "info",
      message:
        context.target === "openai"
          ? "Collapsed a nullable type array down to one concrete type for OpenAI."
          : "Normalized a nullable type array into the target's preferred representation.",
      path: toJsonPointer([...context.path, "type"])
    });
    return;
  }

  if (context.target === "anthropic") {
    return;
  }

  if (context.mode === "fix") {
    if (context.target === "openai" && context.isRoot) {
      const chosenRootType = nonNullTypes.includes("object") ? "object" : nonNullTypes[0] ?? uniqueTypeArray[0];
      if (chosenRootType === undefined) {
        return;
      }

      schema.type = chosenRootType;
    } else {
      pushFinding(report, {
        code: "type-array-unresolved",
        level: "warning",
        message: "Found a multi-type schema that cannot be normalized safely for this target without introducing unsupported keywords.",
        path: toJsonPointer([...context.path, "type"])
      });
      return;
    }
  }

  pushFinding(report, {
    applied: context.mode === "fix",
    code: "type-array-union",
    level: "warning",
    message:
      context.target === "openai" && context.isRoot
        ? "OpenAI-targeted root schemas do not handle type arrays well; the fixer kept only one root type."
        : "Found a multi-type schema that needs manual review for this target.",
    path: toJsonPointer([...context.path, "type"])
  });
}

function normalizeAnyOfNullableUnion(
  schema: JsonObject,
  report: NormalizeReport,
  context: VisitContext,
  keyword: "anyOf" | "oneOf"
): void {
  const union = schema[keyword];
  if (!Array.isArray(union) || union.length !== 2 || !union.every(isJsonObject)) {
    return;
  }

  const nullIndex = union.findIndex((entry) => entry.type === "null");
  if (nullIndex === -1) {
    return;
  }

  const baseBranch = union[nullIndex === 0 ? 1 : 0];
  const outer = cloneJson(schema);
  delete outer[keyword];

  const merged: JsonObject = {
    ...baseBranch,
    ...outer
  };
  const concreteType = merged.type;

  if (typeof concreteType !== "string" || concreteType === "null") {
    pushFinding(report, {
      code: `${keyword}-nullable-unresolved`,
      level: "warning",
      message: `Found ${keyword} with a null branch that could not be normalized without changing semantics.`,
      path: toJsonPointer(context.path)
    });
    return;
  }

  if (context.mode === "fix") {
    if (context.target === "anthropic") {
      merged.type = [concreteType, "null"];
    } else if (context.target === "gemini") {
      merged.nullable = true;
    }

    replaceObject(schema, merged);
  }

  pushFinding(report, {
    applied: context.mode === "fix",
    code: `${keyword}-nullable`,
    level: context.target === "openai" ? "warning" : "info",
    message:
      context.target === "openai"
        ? `Collapsed ${keyword} with a null branch into a single branch for OpenAI compatibility.`
        : `Normalized ${keyword} with a null branch into the target's preferred nullability form.`,
    path: toJsonPointer(context.path)
  });
}

function stripKeywords(schema: JsonObject, report: NormalizeReport, context: VisitContext, keywords: string[]): void {
  for (const keyword of keywords) {
    if (!(keyword in schema)) {
      continue;
    }

    if (context.mode === "fix") {
      delete schema[keyword];
    }

    pushFinding(report, {
      applied: context.mode === "fix",
      code: "keyword-stripped",
      level: "info",
      message: `Removed ${keyword} because it is often unnecessary or problematic across provider-specific schema subsets.`,
      path: toJsonPointer([...context.path, keyword])
    });
  }
}

function reportUnsupportedKeywords(
  schema: JsonObject,
  report: NormalizeReport,
  context: VisitContext,
  keywords: string[]
): void {
  for (const keyword of keywords) {
    if (keyword in schema) {
      pushFinding(report, {
        code: "keyword-needs-review",
        level: "error",
        message: `${keyword} remains in the schema; the first release reports this conservatively instead of rewriting it automatically.`,
        path: toJsonPointer([...context.path, keyword])
      });
    }
  }
}

function visitChildren(schema: JsonObject, report: NormalizeReport, context: VisitContext): void {
  if (isJsonObject(schema.properties)) {
    for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
      if (isJsonObject(propertySchema)) {
        visitSchema(propertySchema, report, {
          ...context,
          isRoot: false,
          path: [...context.path, "properties", propertyName]
        });
      }
    }
  }

  if (isJsonObject(schema.items)) {
    visitSchema(schema.items, report, {
      ...context,
      isRoot: false,
      path: [...context.path, "items"]
    });
  }

  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((entry, index) => {
      if (isJsonObject(entry)) {
        visitSchema(entry, report, {
          ...context,
          isRoot: false,
          path: [...context.path, "anyOf", index]
        });
      }
    });
  }

  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((entry, index) => {
      if (isJsonObject(entry)) {
        visitSchema(entry, report, {
          ...context,
          isRoot: false,
          path: [...context.path, "oneOf", index]
        });
      }
    });
  }

  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((entry, index) => {
      if (isJsonObject(entry)) {
        visitSchema(entry, report, {
          ...context,
          isRoot: false,
          path: [...context.path, "allOf", index]
        });
      }
    });
  }

  for (const keyword of ["not", "if", "then", "else", "additionalProperties"] as const) {
    const nested = schema[keyword];
    if (isJsonObject(nested)) {
      visitSchema(nested, report, {
        ...context,
        isRoot: false,
        path: [...context.path, keyword]
      });
    }
  }

  for (const keyword of ["$defs", "definitions"] as const) {
    const nested = schema[keyword];
    if (!isJsonObject(nested)) {
      continue;
    }

    for (const [childKey, childSchema] of Object.entries(nested)) {
      if (isJsonObject(childSchema)) {
        visitSchema(childSchema, report, {
          ...context,
          isRoot: false,
          path: [...context.path, keyword, childKey]
        });
      }
    }
  }
}

function normalizeObjectControls(schema: JsonObject, report: NormalizeReport, context: VisitContext): void {
  const profile = TARGET_PROFILES[context.target];
  const properties = isJsonObject(schema.properties) ? schema.properties : undefined;

  if (!properties || !profile.closeObjects) {
    if (context.target === "gemini" && isObjectSchema(schema) && !properties) {
      pushFinding(report, {
        code: "gemini-open-object",
        level: "warning",
        message: "Open-ended object schemas can be brittle in Gemini function declarations; consider explicit properties.",
        path: toJsonPointer(context.path)
      });
    }
    return;
  }

  const propertyNames = Object.keys(properties);
  if (propertyNames.length === 0) {
    return;
  }

  if (!("additionalProperties" in schema) || schema.additionalProperties === true) {
    if (context.mode === "fix") {
      schema.additionalProperties = false;
    }

    pushFinding(report, {
      applied: context.mode === "fix",
      code: "close-object",
      level: "warning",
      message: "Closed an object schema with additionalProperties=false to make the parameter surface more deterministic.",
      path: toJsonPointer(context.path)
    });
  }

  if (!profile.requireAllObjectProperties) {
    return;
  }

  const current = Array.isArray(schema.required) ? schema.required.filter((value) => typeof value === "string") : [];
  if (propertyNames.length === current.length && propertyNames.every((value, index) => current[index] === value)) {
    return;
  }

  if (context.mode === "fix") {
    schema.required = propertyNames;
  }

  pushFinding(report, {
    applied: context.mode === "fix",
    code: "require-all-properties",
    level: "warning",
    message: "Filled required with every declared property for better OpenAI compatibility.",
    path: toJsonPointer([...context.path, "required"])
  });
}

function repairOpenAiRoot(schema: JsonObject): JsonObject | null {
  if (schema.type === "object") {
    return schema;
  }

  if (Array.isArray(schema.anyOf)) {
    const objectBranch = schema.anyOf.find((entry) => isJsonObject(entry) && isObjectSchema(entry));
    return isJsonObject(objectBranch) ? cloneJson(objectBranch) : null;
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((value): value is string => typeof value === "string");
    if (types.includes("object")) {
      const repaired = cloneJson(schema);
      repaired.type = "object";
      return repaired;
    }
  }

  return null;
}

function isObjectSchema(schema: JsonObject): boolean {
  return schema.type === "object" || isJsonObject(schema.properties);
}

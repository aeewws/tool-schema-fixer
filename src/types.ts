export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export const TARGETS = ["openai", "anthropic", "gemini"] as const;

export type Target = (typeof TARGETS)[number];
export type Mode = "fix" | "lint";
export type FindingLevel = "error" | "info" | "warning";
export type Severity = FindingLevel;
export type SchemaWrapperKind = "anthropic-tool" | "openai-function" | "plain-schema" | "tool-parameters";

export interface NormalizeFinding {
  applied?: boolean;
  code: string;
  level: FindingLevel;
  message: string;
  path: string;
}

export interface NormalizeSummary {
  applied: number;
  errors: number;
  infos: number;
  total: number;
  warnings: number;
}

export interface NormalizeReport {
  findings: NormalizeFinding[];
  mode: Mode;
  schemaPath: string;
  summary: NormalizeSummary;
  target: Target;
  wrapper: SchemaWrapperKind;
}

export interface NormalizeResult {
  changed: boolean;
  document: JsonValue;
  report: NormalizeReport;
}

export interface Issue {
  code: string;
  fixable: boolean;
  lossy: boolean;
  message: string;
  path: string;
  severity: Severity;
}

export interface Report {
  changed: boolean;
  compatible: boolean;
  fixableCount: number;
  issueCount: number;
  issues: Issue[];
  lossyCount: number;
  mode: Mode;
  target: Target;
  wrapperPath: string;
}

export interface NormalizationResult {
  document: JsonValue;
  report: Report;
}

export interface TargetProfile {
  closeObjects: boolean;
  reportOnlyKeywords: string[];
  requireAllObjectProperties: boolean;
  stripKeywords: string[];
}

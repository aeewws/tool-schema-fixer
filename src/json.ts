import type { JsonObject, JsonValue } from "./types.js";

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return structuredClone(value);
}

export function toJsonPointer(path: Array<string | number>): string {
  if (path.length === 0) {
    return "/";
  }

  return `/${path
    .map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/")}`;
}

export function replaceObject(target: JsonObject, next: JsonObject): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }

  for (const [key, value] of Object.entries(next)) {
    target[key] = value;
  }
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}


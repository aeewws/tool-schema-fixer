import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { JsonValue } from "./types.js";

export async function readJsonDocument(filePath: string): Promise<JsonValue> {
  const absolutePath = resolve(filePath);
  const raw = await readFile(absolutePath, "utf8");
  return JSON.parse(raw) as JsonValue;
}

export async function writeJsonDocument(filePath: string, document: JsonValue): Promise<void> {
  const absolutePath = resolve(filePath);
  await writeFile(absolutePath, formatJson(document), "utf8");
}

export function formatJson(document: JsonValue): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}


import { resolve } from "node:path";

import { normalizeDocument } from "./fixer.js";
import { formatJson, readJsonDocument, writeJsonDocument } from "./io.js";
import { formatTextReport } from "./report.js";
import type { Target } from "./types.js";

export interface CliRuntime {
  stderr(message: string): void;
  stdout(message: string): void;
}

export async function executeCli(argv: string[], runtime: CliRuntime): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    runtime.stdout(`${usage()}\n`);
    return 0;
  }

  if (command === "--version" || command === "-v") {
    runtime.stdout("0.1.0\n");
    return 0;
  }

  if (command !== "lint" && command !== "fix") {
    runtime.stderr(`Unknown command: ${command}\n\n${usage()}\n`);
    return 2;
  }

  const parsed = parseOptions(rest);
  if (parsed.error) {
    runtime.stderr(`${parsed.error}\n\n${usage()}\n`);
    return 2;
  }

  if (!parsed.filePath) {
    runtime.stderr(`Missing schema file path.\n\n${usage()}\n`);
    return 2;
  }

  const target = parsed.target ?? "openai";
  if (command === "fix" && parsed.target === undefined) {
    runtime.stderr(`fix requires --target openai|anthropic|gemini.\n\n${usage()}\n`);
    return 2;
  }

  try {
    const document = await readJsonDocument(parsed.filePath);
    const result = normalizeDocument(document, target, command);
    const reportText =
      parsed.reportFormat === "json"
        ? `${JSON.stringify(result.report, null, 2)}\n`
        : `${formatTextReport(result.report)}\n`;

    if (command === "lint") {
      runtime.stdout(reportText);
      return result.report.summary.total > 0 ? 1 : 0;
    }

    if (parsed.outPath) {
      await writeJsonDocument(parsed.outPath, result.document);
      runtime.stdout(`Wrote fixed schema to ${resolve(parsed.outPath)}\n`);
    } else {
      runtime.stdout(formatJson(result.document));
    }

    runtime.stderr(reportText);
    return result.report.summary.errors > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runtime.stderr(`Failed to process schema: ${message}\n`);
    return 1;
  }
}

function parseOptions(argv: string[]): {
  error?: string;
  filePath: string | undefined;
  outPath: string | undefined;
  reportFormat: "text" | "json";
  target: Target | undefined;
} {
  let filePath: string | undefined;
  let outPath: string | undefined;
  let target: Target | undefined;
  let reportFormat: "text" | "json" = "text";

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--target") {
      const next = argv[index + 1];
      if (next !== "openai" && next !== "anthropic" && next !== "gemini") {
        return {
          error: "Expected --target openai|anthropic|gemini.",
          filePath,
          outPath,
          reportFormat,
          target
        };
      }

      target = next;
      index += 1;
      continue;
    }

    if (token === "--out") {
      const next = argv[index + 1];
      if (!next) {
        return {
          error: "Expected a file path after --out.",
          filePath,
          outPath,
          reportFormat,
          target
        };
      }

      outPath = next;
      index += 1;
      continue;
    }

    if (token === "--report-format" || token === "--report") {
      const next = argv[index + 1];
      if (next !== "text" && next !== "json") {
        return {
          error: token === "--report" ? "Expected --report text|json." : "Expected --report-format text|json.",
          filePath,
          outPath,
          reportFormat,
          target
        };
      }

      reportFormat = next;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      return { error: `Unknown option: ${token}`, filePath, outPath, reportFormat, target };
    }

    if (!filePath) {
      filePath = token;
      continue;
    }

    return { error: `Unexpected argument: ${token}`, filePath, outPath, reportFormat, target };
  }

  return { filePath, outPath, target, reportFormat };
}

function usage(): string {
  return [
    "tool-schema-fixer <command> <schema.json> [options]",
    "",
    "Commands:",
    "  lint <file>                      Report compatibility findings. Defaults to --target openai.",
    "  fix <file> --target <target>     Print or write a normalized schema for the target provider.",
    "",
    "Options:",
    "  --target openai|anthropic|gemini",
    "  --out <file>",
    "  --report text|json",
    "  --report-format text|json"
  ].join("\n");
}

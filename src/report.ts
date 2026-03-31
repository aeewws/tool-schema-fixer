import type { Mode, NormalizeFinding, NormalizeReport, Report, SchemaWrapperKind, Target } from "./types.js";

export function createReport(mode: Mode, target: Target, wrapper: SchemaWrapperKind, schemaPath: string): NormalizeReport {
  return {
    findings: [],
    mode,
    schemaPath,
    summary: {
      applied: 0,
      errors: 0,
      infos: 0,
      total: 0,
      warnings: 0
    },
    target,
    wrapper
  };
}

export function pushFinding(report: NormalizeReport, finding: NormalizeFinding): void {
  report.findings.push(finding);
}

export function finalizeReport(report: NormalizeReport): NormalizeReport {
  const summary = {
    applied: 0,
    errors: 0,
    infos: 0,
    total: report.findings.length,
    warnings: 0
  };

  for (const finding of report.findings) {
    if (finding.applied) {
      summary.applied += 1;
    }

    if (finding.level === "error") {
      summary.errors += 1;
      continue;
    }

    if (finding.level === "warning") {
      summary.warnings += 1;
      continue;
    }

    summary.infos += 1;
  }

  report.summary = summary;
  return report;
}

export function formatTextReport(report: NormalizeReport): string {
  const lines = [
    `mode: ${report.mode}`,
    `target: ${report.target}`,
    `wrapper: ${report.wrapper}`,
    `schema-path: ${report.schemaPath}`,
    `findings: ${report.summary.total}`,
    `errors: ${report.summary.errors}`,
    `warnings: ${report.summary.warnings}`,
    `applied: ${report.summary.applied}`
  ];

  if (report.findings.length === 0) {
    lines.push("details: no compatibility issues detected");
    return lines.join("\n");
  }

  lines.push("details:");

  for (const finding of report.findings) {
    const appliedText = finding.applied ? " (applied)" : "";
    lines.push(`- [${finding.level}] ${finding.code} ${finding.path}: ${finding.message}${appliedText}`);
  }

  return lines.join("\n");
}

export function formatReport(report: NormalizeReport | Report, format: "json" | "text" = "text"): string {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }

  if (isNormalizeReport(report)) {
    return formatTextReport(report);
  }

  return formatCompatibilityReport(report);
}

function formatCompatibilityReport(report: Report): string {
  const lines = [
    `mode: ${report.mode}`,
    `target: ${report.target}`,
    `schema-path: ${report.wrapperPath}`,
    `compatible: ${report.compatible ? "yes" : "no"}`,
    `changes: ${report.changed ? "yes" : "no"}`,
    `issues: ${report.issueCount}`,
    `fixable: ${report.fixableCount}`,
    `lossy: ${report.lossyCount}`
  ];

  if (report.issues.length === 0) {
    lines.push("details: no compatibility issues detected");
    return lines.join("\n");
  }

  lines.push("details:");
  for (const issue of report.issues) {
    lines.push(`- [${issue.severity}] ${issue.code} ${issue.path}: ${issue.message}`);
  }

  return lines.join("\n");
}

function isNormalizeReport(report: NormalizeReport | Report): report is NormalizeReport {
  return "findings" in report && "summary" in report && "wrapper" in report;
}

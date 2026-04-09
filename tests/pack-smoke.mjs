import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function quoteForCmd(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '\\"')}"`;
}

async function run(command, args, options = {}) {
  const execOptions = {
    cwd: process.cwd(),
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
    ...options
  };

  if (process.platform === "win32") {
    const shellCommand = [command, ...args].map(quoteForCmd).join(" ");
    return execFileAsync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", shellCommand], execOptions);
  }

  return execFileAsync(command, args, execOptions);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "tool-schema-fixer-pack-"));
let tarballPath;

try {
  const { stdout: packStdout } = await run(npmCommand, ["pack", "--json"]);
  const packResult = JSON.parse(packStdout);
  const tarballName = Array.isArray(packResult) ? packResult[0]?.filename : undefined;
  assert(typeof tarballName === "string" && tarballName.length > 0);

  tarballPath = path.resolve(tarballName);
  await writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "pack-smoke", private: true }), "utf8");
  await run(npmCommand, ["install", "--no-package-lock", tarballPath], { cwd: tempDir });

  const binPath = path.join(
    tempDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tool-schema-fixer.cmd" : "tool-schema-fixer"
  );
  const { stdout } = await run(binPath, ["--help"], { cwd: tempDir });
  assert(stdout.includes("tool-schema-fixer <command> <schema.json> [options]"));
} finally {
  await rm(tempDir, { recursive: true, force: true });
  if (tarballPath) {
    await unlink(tarballPath).catch(() => {});
  }
}

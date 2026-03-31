import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { executeCli } from "../src/cli.js";

describe("executeCli", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories.map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      })
    );
    directories.length = 0;
  });

  it("writes fixed output when --out is provided", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tool-schema-fixer-"));
    directories.push(directory);
    const inputPath = join(directory, "schema.json");
    const outputPath = join(directory, "fixed.json");

    await writeFile(
      inputPath,
      JSON.stringify({
        type: "object",
        properties: {
          amount: {
            type: ["number", "null"]
          }
        }
      }),
      "utf8"
    );

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await executeCli(
      ["fix", inputPath, "--target", "gemini", "--out", outputPath],
      {
        stdout(message) {
          stdout.push(message);
        },
        stderr(message) {
          stderr.push(message);
        }
      }
    );

    const written = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Wrote fixed schema");
    expect(stderr.join("")).toContain("target: gemini");
    expect(written.properties).toBeTruthy();
  });

  it("returns a non-zero exit code for lint findings", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tool-schema-fixer-"));
    directories.push(directory);
    const inputPath = join(directory, "schema.json");

    await writeFile(
      inputPath,
      JSON.stringify({
        type: "object",
        properties: {
          query: {
            allOf: [{ type: "string" }]
          }
        }
      }),
      "utf8"
    );

    const stdout: string[] = [];
    const exitCode = await executeCli(["lint", inputPath], {
      stdout(message) {
        stdout.push(message);
      },
      stderr() {}
    });

    expect(exitCode).toBe(1);
    expect(stdout.join("")).toContain("keyword-needs-review");
  });
});

#!/usr/bin/env node

import { executeCli } from "./cli.js";

const exitCode = await executeCli(process.argv.slice(2), {
  stdout(message) {
    process.stdout.write(message);
  },
  stderr(message) {
    process.stderr.write(message);
  }
});

process.exitCode = exitCode;

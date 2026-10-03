#!/usr/bin/env node
import { buildPlugin } from "../dist/node/build.js";

if (process.argv[2] !== "build" || process.argv.length !== 3) {
  console.error("Usage: asmblyr-plugin build");
  process.exitCode = 1;
} else {
  try {
    await buildPlugin(process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

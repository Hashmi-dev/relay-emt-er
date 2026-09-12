import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync(".sites-runtime/tests", { recursive: true });
await build({ entryPoints: ["tests/workflow.test.ts"], outfile: ".sites-runtime/tests/workflow.test.mjs", bundle: true, platform: "node", format: "esm", target: "node22" });
const result = spawnSync(process.execPath, ["--test", ".sites-runtime/tests/workflow.test.mjs"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;

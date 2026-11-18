/*
 * Runs the Python reference loader against the shared vectors, isolated (-I). Skips with a
 * notice when no Python 3 interpreter is installed, so the gate still works without one.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./collect.ts";

const probe = spawnSync("python", ["-I", "-c", "import sys; sys.exit(sys.version_info < (3, 10))"]);
if (probe.error !== undefined || probe.status !== 0) {
  process.stderr.write("python-vectors: no Python 3.10+ on PATH; skipped.\n");
  process.exit(0);
}
// -I: ignore the environment and user site; -B: leave no bytecode in the repository.
const script = join(ROOT, "python", "run_vectors.py");
const run = spawnSync("python", ["-I", "-B", script, join(ROOT, "dist")], { stdio: "inherit" });
process.exit(run.status ?? 1);

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { absolute, generatedFiles } from "./generated.ts";

for (const [relative, content] of generatedFiles()) {
  const path = absolute(relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

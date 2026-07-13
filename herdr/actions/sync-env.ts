import { spawnSync } from "node:child_process";
import { resolveContextCwd, jadeBin } from "../lib/context.ts";

const result = spawnSync(jadeBin(), ["env", "sync"], {
  cwd: resolveContextCwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);

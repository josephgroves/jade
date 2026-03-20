import { describe, test, expect } from "bun:test";
import { join } from "path";
import { mkdtemp, rm, readFile, mkdir } from "fs/promises";
import { $ } from "bun";

/**
 * Spawning the compiled binary and running `skills install` creates `.cursor/`; some
 * sandboxes EPERM that in child processes. Run explicitly:
 *   `bun run test:embed`
 */
const runCompileEmbed = process.env.JADE_VERIFY_COMPILE_EMBED === "1";

/**
 * Ensures `bun build --compile` inlines text imports from `skills/` so the binary
 * does not need a sibling `skills/` directory at runtime.
 */
describe.skipIf(!runCompileEmbed)("skills embed (compile)", () => {
  test(
    "compiled jade binary can run skills install without repo skills/ on disk",
    async () => {
      const tmp = await mkdtemp(join(process.cwd(), "jade-compile-verify-"));
      const bin = join(tmp, "jade-bin");
      const out = join(tmp, "project");
      await mkdir(out, { recursive: true });
      try {
        await $`bun build --compile ./index.ts --outfile ${bin}`.cwd(process.cwd());
        await $`${bin} skills install --project ${out}`;
        const md = await readFile(join(out, ".cursor", "skills", "jade-workspace", "SKILL.md"), "utf8");
        expect(md).toContain("name: jade-workspace");
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    },
    60_000
  );
});

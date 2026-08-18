import { describe, test, expect } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { makeSkillsInstallCommand } from "../skills.ts";
import { createMockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { expectsExit } from "../../test/helpers.ts";

describe("jade skills install", () => {
  test("defaults to project scope, auto-detecting cursor+claude when neither dir exists", async () => {
    const { fs } = createMockFileSystemBackend();
    const cmd = makeSkillsInstallCommand(fs);
    await cmd.run!({ args: { project: "/proj" } } as any);

    expect(await fs.pathExists(join("/proj", ".cursor", "skills", "jade-workspace", "SKILL.md"))).toBe(true);
    expect(await fs.pathExists(join("/proj", ".claude", "skills", "jade-workspace", "SKILL.md"))).toBe(true);
  });

  test("--target claude installs only into .claude/skills", async () => {
    const { fs } = createMockFileSystemBackend();
    const cmd = makeSkillsInstallCommand(fs);
    await cmd.run!({ args: { project: "/proj", target: "claude" } } as any);

    expect(await fs.pathExists(join("/proj", ".claude", "skills", "jade-workspace", "SKILL.md"))).toBe(true);
    expect(await fs.pathExists(join("/proj", ".cursor", "skills", "jade-workspace", "SKILL.md"))).toBe(false);
  });

  test("--scope user installs under the home directory instead of a project root", async () => {
    const { fs } = createMockFileSystemBackend();
    const cmd = makeSkillsInstallCommand(fs);
    await cmd.run!({ args: { scope: "user", target: "claude" } } as any);

    expect(await fs.pathExists(join(homedir(), ".claude", "skills", "jade-workspace", "SKILL.md"))).toBe(true);
  });

  test("rejects combining --project with --scope user", async () => {
    const { fs } = createMockFileSystemBackend();
    const cmd = makeSkillsInstallCommand(fs);
    await expectsExit(() => cmd.run!({ args: { project: "/proj", scope: "user" } } as any));
  });

  test("rejects an invalid --scope value", async () => {
    const { fs } = createMockFileSystemBackend();
    const cmd = makeSkillsInstallCommand(fs);
    await expectsExit(() => cmd.run!({ args: { scope: "bogus" } } as any));
  });

  test("rejects an invalid --target value", async () => {
    const { fs } = createMockFileSystemBackend();
    const cmd = makeSkillsInstallCommand(fs);
    await expectsExit(() => cmd.run!({ args: { project: "/proj", target: "bogus" } } as any));
  });
});

import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import statusCommand from "../status.ts";
import {
  createTempDir,
  createLocalGitRepo,
  createTestWorkspace,
} from "../../test/helpers.ts";
import addRepoCommand from "../add.ts";
import { addCommand as worktreeAddCommand } from "../worktree.ts";

describe("status command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("outputs workspace path, groups, and apps", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => {
      logs.push(args.join(" "));
    };

    await statusCommand.run!({
      args: { workspace: workspacePath },
    } as any);

    console.log = origLog;

    expect(logs.some((l) => l.includes("Workspace:"))).toBe(true);
    expect(logs.some((l) => l.includes("Worktree Groups"))).toBe(true);
    expect(logs.some((l) => l.includes("Apps"))).toBe(true);
  });

  test("works with multiple apps and worktree groups", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo1 = join(tempDir.path, "app1");
    const sourceRepo2 = join(tempDir.path, "app2");
    await createLocalGitRepo(sourceRepo1);
    await createLocalGitRepo(sourceRepo2);

    await addRepoCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo1,
        name: "app1",
        workspace: workspacePath,
      },
    } as any);
    await addRepoCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo2,
        name: "app2",
        workspace: workspacePath,
      },
    } as any);
    await worktreeAddCommand.run!({
      args: { name: "feat-auth", workspace: workspacePath },
    } as any);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => {
      logs.push(args.join(" "));
    };

    await statusCommand.run!({
      args: { workspace: workspacePath },
    } as any);

    console.log = origLog;

    const output = logs.join("\n");
    expect(output).toContain("app1");
    expect(output).toContain("app2");
    expect(output).toContain("main");
    expect(output).toContain("feat-auth");
  });
});

import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { stat } from "fs/promises";
import {
  makeWorktreeAddCommand,
  makeWorktreeListCommand,
  makeWorktreeRemoveCommand,
} from "../worktree.ts";
import { makeAddCommand } from "../add.ts";
import {
  createTempDir,
  withCapturedConsole,
  expectsExit,
} from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";

describe("worktree add command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("creates new worktree group with worktrees for all apps", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await worktreeAddCmd.run!({
      args: { name: "feat-auth", workspace: workspacePath },
    } as any);

    await stat(join(workspacePath, "feat-auth", "app"));
  });
});

describe("worktree list command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("outputs groups and branches", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const listCmd = makeWorktreeListCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    const logs = await withCapturedConsole(() =>
      listCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("main") || l.includes("Worktree groups"))).toBe(true);
  });
});

describe("worktree remove command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("removes worktree group", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const worktreeAddCmd = makeWorktreeAddCommand(git);
    const worktreeRemoveCmd = makeWorktreeRemoveCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await worktreeAddCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    await worktreeRemoveCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    await expect(stat(join(workspacePath, "feat-x"))).rejects.toThrow();
  });

  test("prevents removal of main", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const worktreeRemoveCmd = makeWorktreeRemoveCommand(git);

    await expectsExit(() =>
      worktreeRemoveCmd.run!({ args: { name: "main", workspace: workspacePath } } as any)
    );
  });
});

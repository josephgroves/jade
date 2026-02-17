import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { stat } from "fs/promises";
import { addCommand, listCommand, removeCommand } from "../worktree.ts";
import {
  createTempDir,
  createLocalGitRepo,
  createTestWorkspace,
  withCapturedConsole,
  expectsExit,
} from "../../test/helpers.ts";
import addRepoCommand from "../add.ts";

describe("worktree add command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("creates new worktree group with worktrees for all apps", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "app");
    await createLocalGitRepo(sourceRepo);

    await addRepoCommand.run!({
      args: { repoNameOrUrl: sourceRepo, name: "app", workspace: workspacePath },
    } as any);

    await addCommand.run!({
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
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "app");
    await createLocalGitRepo(sourceRepo);

    await addRepoCommand.run!({
      args: { repoNameOrUrl: sourceRepo, name: "app", workspace: workspacePath },
    } as any);

    const logs = await withCapturedConsole(() =>
      listCommand.run!({ args: { workspace: workspacePath } } as any)
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
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "app");
    await createLocalGitRepo(sourceRepo);

    await addRepoCommand.run!({
      args: { repoNameOrUrl: sourceRepo, name: "app", workspace: workspacePath },
    } as any);

    await addCommand.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    await removeCommand.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    await expect(stat(join(workspacePath, "feat-x"))).rejects.toThrow();
  });

  test("prevents removal of main", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);

    await expectsExit(() =>
      removeCommand.run!({ args: { name: "main", workspace: workspacePath } } as any)
    );
  });
});

import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { stat } from "fs/promises";
import {
  makeWorkspaceAddCommand,
  makeWorkspaceListCommand,
  makeWorkspaceRemoveCommand,
  type SelectAppsFn,
} from "../workspace.ts";
import { makeAddCommand } from "../add.ts";
import {
  createTempDir,
  withCapturedConsole,
  expectsExit,
} from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";

/** Stub that auto-selects all provided apps — mirrors `-a` behavior for tests. */
const selectAll: SelectAppsFn = async (apps) => apps;

/** Stub factory that selects only the given named app. */
const selectOnly = (appName: string): SelectAppsFn => async (_apps) => [appName];

/** Stub that simulates the user cancelling the prompt. */
const selectNone: SelectAppsFn = async (_apps) => Symbol("cancel");

describe("workspace add command", () => {
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
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-auth", workspace: workspacePath },
    } as any);

    await stat(join(workspacePath, "workspace", "feat-auth", "app"));
  });

  test("-a flag adds all apps without prompting", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    // selectNone would exit if called — proves -a never invokes the prompt
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectNone);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-all", workspace: workspacePath, all: true },
    } as any);

    await stat(join(workspacePath, "workspace", "feat-all", "app"));
  });

  test("prompt selection creates only selected apps", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectOnly("alpha"));

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-partial", workspace: workspacePath },
    } as any);

    // alpha is selected explicitly, beta is not
    await stat(join(workspacePath, "workspace", "feat-partial", "alpha"));
    await expect(stat(join(workspacePath, "workspace", "feat-partial", "beta"))).rejects.toThrow();
  });

  test("existing group shows prompt for repos not yet added", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);

    // First run: create the group with only alpha
    const workspaceAddFirst = makeWorkspaceAddCommand(git, selectOnly("alpha"));
    await workspaceAddFirst.run!({
      args: { name: "feat-inc", workspace: workspacePath },
    } as any);

    await stat(join(workspacePath, "workspace", "feat-inc", "alpha"));
    await expect(stat(join(workspacePath, "workspace", "feat-inc", "beta"))).rejects.toThrow();

    // Second run: directory exists — should offer only beta and add it
    const workspaceAddSecond = makeWorkspaceAddCommand(git, selectAll);
    await workspaceAddSecond.run!({
      args: { name: "feat-inc", workspace: workspacePath },
    } as any);

    await stat(join(workspacePath, "workspace", "feat-inc", "beta"));
  });

  test("existing group with all apps already added exits", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-full", workspace: workspacePath },
    } as any);

    // All apps already present — should exit
    await expectsExit(() =>
      workspaceAddCmd.run!({
        args: { name: "feat-full", workspace: workspacePath },
      } as any)
    );
  });

  test("cancelled selection exits without creating workspace", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectNone);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await expectsExit(() =>
      workspaceAddCmd.run!({
        args: { name: "feat-cancel", workspace: workspacePath },
      } as any)
    );

    // workspace directory should have been cleaned up
    await expect(stat(join(workspacePath, "workspace", "feat-cancel"))).rejects.toThrow();
  });
});

describe("workspace list command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("outputs workspaces and branches", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const listCmd = makeWorkspaceListCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    const logs = await withCapturedConsole(() =>
      listCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("main") || l.includes("Workspaces"))).toBe(true);
  });

  test("--json outputs groups and per-app branches", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const listCmd = makeWorkspaceListCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    const logs = await withCapturedConsole(() =>
      listCmd.run!({ args: { workspace: workspacePath, json: true } } as any)
    );

    const parsed = JSON.parse(logs.join(""));
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].name).toBe("main");
    expect(parsed.groups[0].apps).toEqual([{ name: "app", branch: expect.any(String) }]);
  });
});

describe("workspace remove command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("removes workspace", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);
    const workspaceRemoveCmd = makeWorkspaceRemoveCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    await workspaceRemoveCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    await expect(stat(join(workspacePath, "workspace", "feat-x"))).rejects.toThrow();
  });

  test("prevents removal of main", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const workspaceRemoveCmd = makeWorkspaceRemoveCommand(git);

    await expectsExit(() =>
      workspaceRemoveCmd.run!({ args: { name: "main", workspace: workspacePath } } as any)
    );
  });
});

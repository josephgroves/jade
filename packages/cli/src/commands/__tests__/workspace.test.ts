import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
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
import { createMockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { createMockConfigBackend } from "../../test/mock-config-backend.ts";
import { makeInitCommand } from "../init.ts";

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
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-auth", workspace: workspacePath },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-auth", "app"))).toBe(true);
  });

  test("-a flag adds all apps without prompting", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    // selectNone would exit if called — proves -a never invokes the prompt
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectNone, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-all", workspace: workspacePath, all: true },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-all", "app"))).toBe(true);
  });

  test("prompt selection creates only selected apps", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectOnly("alpha"), fs);

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
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-partial", "alpha"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-partial", "beta"))).toBe(false);
  });

  test("existing group shows prompt for repos not yet added", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);

    // First run: create the group with only alpha
    const workspaceAddFirst = makeWorkspaceAddCommand(git, selectOnly("alpha"), fs);
    await workspaceAddFirst.run!({
      args: { name: "feat-inc", workspace: workspacePath },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-inc", "alpha"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-inc", "beta"))).toBe(false);

    // Second run: directory exists — should offer only beta and add it.
    // This is the case that most directly depends on the filesystem fake's
    // real-disk fallback: workspace.ts's own `fs.pathExists` check on the
    // group directory (created virtually, above) must agree with what the
    // *git* fake (a separate mock, doing real mkdir under the hood) did to
    // the alpha worktree in the first run.
    const workspaceAddSecond = makeWorkspaceAddCommand(git, selectAll, fs);
    await workspaceAddSecond.run!({
      args: { name: "feat-inc", workspace: workspacePath },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-inc", "beta"))).toBe(true);
  });

  test("existing group with all apps already added exits", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);

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
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectNone, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await expectsExit(() =>
      workspaceAddCmd.run!({
        args: { name: "feat-cancel", workspace: workspacePath },
      } as any)
    );

    // workspace directory should have been cleaned up
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-cancel"))).toBe(false);
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
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const listCmd = makeWorkspaceListCommand(git, fs);

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
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const listCmd = makeWorkspaceListCommand(git, fs);

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
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);
    const workspaceRemoveCmd = makeWorkspaceRemoveCommand(git, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    await workspaceRemoveCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-x"))).toBe(false);
  });

  test("prevents removal of main", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const workspaceRemoveCmd = makeWorkspaceRemoveCommand(git, fs);

    await expectsExit(() =>
      workspaceRemoveCmd.run!({ args: { name: "main", workspace: workspacePath } } as any)
    );
  });
});

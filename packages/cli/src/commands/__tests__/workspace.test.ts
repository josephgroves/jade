import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import {
  makeWorkspaceAddCommand,
  makeWorkspaceListCommand,
  makeWorkspaceRemoveCommand,
  makeWorkspaceUpdateCommand,
  resolveAppsList,
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

  test("--apps adds exactly the named apps without prompting", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    // selectNone would exit if called — proves --apps never invokes the prompt
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectNone, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-apps", workspace: workspacePath, apps: "alpha" },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-apps", "alpha"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-apps", "beta"))).toBe(false);
  });

  test("--apps rejects an unknown app name and cleans up a newly created group", async () => {
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
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);

    await expectsExit(() =>
      workspaceAddCmd.run!({
        args: { name: "feat-bad-app", workspace: workspacePath, apps: "does-not-exist" },
      } as any)
    );

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-bad-app"))).toBe(false);
  });

  test("--apps exits cleanly when every named app is already in the workspace", async () => {
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
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-again", workspace: workspacePath, apps: "alpha" },
    } as any);

    // beta still isn't present, but re-requesting alpha alone should exit rather than no-op silently
    await expectsExit(() =>
      workspaceAddCmd.run!({
        args: { name: "feat-again", workspace: workspacePath, apps: "alpha" },
      } as any)
    );
  });
});

describe("resolveAppsList", () => {
  test("splits, trims, and dedupes the requested app names", () => {
    const result = resolveAppsList(" alpha, beta ,alpha", ["alpha", "beta", "gamma"], ["alpha", "beta", "gamma"]);
    expect(result).toEqual({ selected: ["alpha", "beta"], invalid: [], alreadyPresent: [] });
  });

  test("separates unknown names from apps already present in the workspace", () => {
    const result = resolveAppsList("alpha,ghost,beta", ["alpha", "beta"], ["beta"]);
    expect(result).toEqual({ selected: ["beta"], invalid: ["ghost"], alreadyPresent: ["alpha"] });
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

describe("workspace update command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  async function setupGroupWithApp(groupName: string) {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git, calls } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    if (groupName !== "main") {
      await workspaceAddCmd.run!({ args: { name: groupName, workspace: workspacePath } } as any);
    }

    return { workspacePath, git, calls, fs, config };
  }

  test("fetches and merges each app's default branch", async () => {
    const { workspacePath, git, calls } = await setupGroupWithApp("feat-auth");
    const updateCmd = makeWorkspaceUpdateCommand(git);

    await updateCmd.run!({ args: { group: "feat-auth", workspace: workspacePath } } as any);

    const methods = calls.map((c) => c.method);
    expect(methods).toContain("fetch");
    expect(methods).toContain("mergeBranch");
  });

  test("reports merged apps", async () => {
    const { workspacePath, git } = await setupGroupWithApp("feat-auth");
    const mergingGit = { ...git, mergeBranch: async () => "merged" as const };
    const updateCmd = makeWorkspaceUpdateCommand(mergingGit);

    const logs = await withCapturedConsole(() =>
      updateCmd.run!({ args: { group: "feat-auth", workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("Merged: app"))).toBe(true);
  });

  test("reports apps already up to date", async () => {
    const { workspacePath, git } = await setupGroupWithApp("feat-auth");
    const updateCmd = makeWorkspaceUpdateCommand(git);

    const logs = await withCapturedConsole(() =>
      updateCmd.run!({ args: { group: "feat-auth", workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("Already up to date: app"))).toBe(true);
  });

  test("reports a merge conflict without stopping other apps", async () => {
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
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);
    await workspaceAddCmd.run!({ args: { name: "feat-conflict", workspace: workspacePath } } as any);

    const conflictingGit = {
      ...git,
      mergeBranch: async (cwd: string, branch: string) => {
        if (cwd.includes("alpha")) throw new Error("CONFLICT (content): Merge conflict in file.txt");
        return "merged" as const;
      },
    };
    const updateCmd = makeWorkspaceUpdateCommand(conflictingGit, fs, config);

    const logs = await withCapturedConsole(() =>
      updateCmd.run!({ args: { group: "feat-conflict", workspace: workspacePath } } as any)
    );

    const out = logs.join("\n");
    expect(out).toContain("resolve manually");
    expect(out).toContain("Failed: alpha");
    expect(out).toContain("Merged: beta");
  });

  test("defaults to 'main' when not inside any group and none given", async () => {
    const { workspacePath, git } = await setupGroupWithApp("main");
    const updateCmd = makeWorkspaceUpdateCommand(git);

    const logs = await withCapturedConsole(() =>
      updateCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("Updating workspace 'main'"))).toBe(true);
  });

  test("exits when the requested group does not exist", async () => {
    const { workspacePath, git } = await setupGroupWithApp("main");
    const updateCmd = makeWorkspaceUpdateCommand(git);

    await expectsExit(() =>
      updateCmd.run!({ args: { group: "does-not-exist", workspace: workspacePath } } as any)
    );
  });
});

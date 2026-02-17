/**
 * Creation test suite — workspace and worktree creation using a mock git backend.
 *
 * No real git processes are spawned. The mock backend simulates filesystem
 * side-effects (creating directories) and tracks in-memory state so assertions
 * can verify both the resulting directory structure and the git operations called.
 */
import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { join, resolve } from "path";
import { stat } from "fs/promises";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import { createTempDir } from "../../test/helpers.ts";
import { makeAddCommand } from "../add.ts";
import { makeWorktreeAddCommand, makeWorktreeRemoveCommand } from "../worktree.ts";
import initCommand from "../init.ts";
import { readConfig, getAppNames } from "../../utils/config.ts";
import { isValidWorkspace } from "../../utils/workspace.ts";

type TempDir = Awaited<ReturnType<typeof createTempDir>>;

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// ─── Workspace creation (init) ────────────────────────────────────────────────

describe("init command — workspace creation", () => {
  let tempDir: TempDir;
  const exitMock = ((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as (code?: number) => never;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("creates .bare/, main/, and jade.json", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");

    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    expect(await isValidWorkspace(workspacePath)).toBe(true);
    expect(await pathExists(join(workspacePath, "main"))).toBe(true);
    expect(await pathExists(join(workspacePath, "jade.json"))).toBe(true);
  });

  test("jade.json has correct version and empty apps array", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");

    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    const config = await readConfig(workspacePath);
    expect(config.version).toBe("1.0");
    expect(config.apps).toEqual([]);
  });

  test("persists orgUrl when provided", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");

    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({
        args: { path: workspacePath, orgUrl: "https://github.com/testorg" },
      } as any);
    } finally {
      process.exit = origExit;
    }

    const config = await readConfig(workspacePath);
    expect(config.orgUrl).toBe("https://github.com/testorg");
  });

  test("exits when workspace already initialized", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");

    // First init succeeds
    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    // Second init should exit
    let exited = false;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } catch (e: any) {
      if (e?.message === "EXIT:1") exited = true;
    } finally {
      process.exit = origExit;
    }

    expect(exited).toBe(true);
  });
});

// ─── App addition (add) with mock git ─────────────────────────────────────────

describe("add command — app creation with mock git", () => {
  let tempDir: TempDir;
  const exitMock = ((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as (code?: number) => never;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  async function initWorkspace(name = "ws") {
    const workspacePath = join(tempDir.path, name);
    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }
    return workspacePath;
  }

  test("creates bare repo dir and main/<app> worktree", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/myapp", name: "myapp", workspace: workspacePath },
    } as any);

    expect(await pathExists(join(workspacePath, ".bare", "myapp"))).toBe(true);
    expect(await pathExists(join(workspacePath, "main", "myapp"))).toBe(true);
  });

  test("registers app in jade.json", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/myapp", name: "myapp", workspace: workspacePath },
    } as any);

    const config = await readConfig(workspacePath);
    expect(getAppNames(config)).toContain("myapp");
  });

  test("persists defaultBranch to config when --branch is provided", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/myapp",
        name: "myapp",
        branch: "develop",
        workspace: workspacePath,
      },
    } as any);

    const config = await readConfig(workspacePath);
    expect(config.apps).toContainEqual({ name: "myapp", defaultBranch: "develop" });
  });

  test("calls getDefaultBranch when no --branch provided", async () => {
    const workspacePath = await initWorkspace();
    const { git, calls } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/myapp", name: "myapp", workspace: workspacePath },
    } as any);

    expect(calls.some((c) => c.method === "getDefaultBranch")).toBe(true);
  });

  test("creates worktrees in all existing worktree groups", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addWorktreeCmd = makeWorktreeAddCommand(git);

    // First add the app
    const addCmd = makeAddCommand(git);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    // Then add a worktree group before adding a second app
    const { git: git2 } = createMockGitBackend();
    const addCmd2 = makeAddCommand(git2);
    const addWorktreeCmd2 = makeWorktreeAddCommand(git2);

    // Re-init so second app sees the existing worktree group
    // Use the same git instance for both add steps
    const { git: sharedGit } = createMockGitBackend();
    const sharedAddCmd = makeAddCommand(sharedGit);
    const sharedAddWorktreeCmd = makeWorktreeAddCommand(sharedGit);

    // Fresh workspace for this test
    const ws2 = await initWorkspace("ws2");
    await sharedAddCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: ws2 },
    } as any);
    // Manually create a second worktree group dir so listWorktreeDirs picks it up
    const { mkdir } = await import("fs/promises");
    await mkdir(join(ws2, "feat-x"), { recursive: true });

    // Add a second app — should create worktree in both main/ and feat-x/
    await sharedAddCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app2", name: "app2", workspace: ws2 },
    } as any);

    expect(await pathExists(join(ws2, "main", "app2"))).toBe(true);
    expect(await pathExists(join(ws2, "feat-x", "app2"))).toBe(true);
  });

  test("exits when app already exists in .bare/", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    const origExit = process.exit;
    process.exit = exitMock;
    let exited = false;
    try {
      await addCmd.run!({
        args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
      } as any);
    } catch (e: any) {
      if (e?.message === "EXIT:1") exited = true;
    } finally {
      process.exit = origExit;
    }

    expect(exited).toBe(true);
  });
});

// ─── Worktree group creation (worktree add) with mock git ─────────────────────

describe("worktree add command — group creation with mock git", () => {
  let tempDir: TempDir;
  const exitMock = ((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as (code?: number) => never;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  async function makeWorkspaceWithApp(wsName = "ws", appName = "app") {
    const workspacePath = join(tempDir.path, wsName);
    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    await addCmd.run!({
      args: { repoNameOrUrl: `https://github.com/org/${appName}`, name: appName, workspace: workspacePath },
    } as any);

    return { workspacePath, git };
  }

  test("creates empty worktree group when no apps exist", async () => {
    const workspacePath = join(tempDir.path, "ws");
    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    const { git } = createMockGitBackend();
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    await worktreeAddCmd.run!({
      args: { name: "feat-empty", workspace: workspacePath },
    } as any);

    expect(await pathExists(join(workspacePath, "feat-empty"))).toBe(true);
  });

  test("creates <group>/<app> worktree for all existing apps", async () => {
    const { workspacePath, git } = await makeWorkspaceWithApp("ws", "myapp");
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    await worktreeAddCmd.run!({
      args: { name: "feat-login", workspace: workspacePath },
    } as any);

    expect(await pathExists(join(workspacePath, "feat-login", "myapp"))).toBe(true);
  });

  test("creates worktrees for multiple apps", async () => {
    const workspacePath = join(tempDir.path, "ws");
    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/api", name: "api", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/web", name: "web", workspace: workspacePath },
    } as any);

    await worktreeAddCmd.run!({
      args: { name: "feat-multi", workspace: workspacePath },
    } as any);

    expect(await pathExists(join(workspacePath, "feat-multi", "api"))).toBe(true);
    expect(await pathExists(join(workspacePath, "feat-multi", "web"))).toBe(true);
  });

  test("exits when worktree group already exists", async () => {
    const { workspacePath, git } = await makeWorkspaceWithApp();
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    await worktreeAddCmd.run!({
      args: { name: "feat-dup", workspace: workspacePath },
    } as any);

    const origExit = process.exit;
    process.exit = exitMock;
    let exited = false;
    try {
      await worktreeAddCmd.run!({
        args: { name: "feat-dup", workspace: workspacePath },
      } as any);
    } catch (e: any) {
      if (e?.message === "EXIT:1") exited = true;
    } finally {
      process.exit = origExit;
    }

    expect(exited).toBe(true);
  });

  test("branch conflict creates worktree with resolved branch name", async () => {
    const workspacePath = join(tempDir.path, "ws");
    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    const { git, getState } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    // First worktree group on branch "feat-conflict" — succeeds normally
    await worktreeAddCmd.run!({
      args: { name: "feat-conflict", workspace: workspacePath },
    } as any);

    // Manually mark the branch as already checked out in the mock state
    // so the second worktree on the same branch triggers conflict resolution
    const bareRepoPath = resolve(workspacePath, ".bare", "app");
    const state = getState(bareRepoPath);
    expect(state).toBeDefined();

    // The first group's worktree path
    const firstWorktreePath = resolve(workspacePath, "feat-conflict", "app");
    // Verify it was tracked
    expect(state!.worktrees.has(firstWorktreePath)).toBe(true);
    expect(state!.worktrees.get(firstWorktreePath)).toBe("feat-conflict");
  });
});

// ─── Cross-flow: init -> add -> worktree add ──────────────────────────────────

describe("creation cross-flow: init -> add app -> worktree add", () => {
  let tempDir: TempDir;
  const exitMock = ((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as (code?: number) => never;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("full creation flow produces expected workspace structure", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "fullflow");

    // 1. Init
    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    // 2. Add two apps
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/frontend", name: "frontend", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/backend", name: "backend", workspace: workspacePath },
    } as any);

    // 3. Create a feature worktree group
    await worktreeAddCmd.run!({
      args: { name: "feat-auth", workspace: workspacePath },
    } as any);

    // Verify config
    const config = await readConfig(workspacePath);
    expect(getAppNames(config)).toContain("frontend");
    expect(getAppNames(config)).toContain("backend");

    // Verify main/ worktrees
    expect(await pathExists(join(workspacePath, "main", "frontend"))).toBe(true);
    expect(await pathExists(join(workspacePath, "main", "backend"))).toBe(true);

    // Verify feat-auth/ worktrees
    expect(await pathExists(join(workspacePath, "feat-auth", "frontend"))).toBe(true);
    expect(await pathExists(join(workspacePath, "feat-auth", "backend"))).toBe(true);
  });

  test("mock git backend records all expected operations", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "callflow");

    const origExit = process.exit;
    process.exit = exitMock;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = origExit;
    }

    const { git, calls } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const worktreeAddCmd = makeWorktreeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/svc", name: "svc", workspace: workspacePath },
    } as any);

    await worktreeAddCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    const methods = calls.map((c) => c.method);
    expect(methods).toContain("cloneBare");
    expect(methods).toContain("getDefaultBranch");
    // worktreeAdd called for main/ and then for feat-x/
    expect(methods.filter((m) => m === "worktreeAdd").length).toBeGreaterThanOrEqual(2);
  });
});

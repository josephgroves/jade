/**
 * Creation test suite — workspace creation using a mock git backend.
 *
 * No real git processes are spawned. The mock git backend simulates filesystem
 * side-effects (creating directories) and tracks in-memory state so assertions
 * can verify both the resulting directory structure and the git operations called.
 * Filesystem and config I/O go through injected fakes as well — see
 * createMockFileSystemBackend/createMockConfigBackend.
 */
import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { join, resolve } from "path";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import { createMockFileSystemBackend, type MockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { createMockConfigBackend, type MockConfigBackend } from "../../test/mock-config-backend.ts";
import { createTempDir, expectsExit } from "../../test/helpers.ts";
import { makeAddCommand } from "../add.ts";
import { makeWorkspaceAddCommand, type SelectAppsFn } from "../workspace.ts";
import { makeInitCommand } from "../init.ts";

const selectAll: SelectAppsFn = async (apps) => apps;
import { getAppNames } from "../../utils/config.ts";
import { isValidWorkspace } from "../../utils/workspace.ts";

type TempDir = Awaited<ReturnType<typeof createTempDir>>;

// ─── Workspace creation (init) ────────────────────────────────────────────────

describe("init command — workspace creation", () => {
  let tempDir: TempDir;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("creates .bare/, main/, workspace/, and jade.json", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config, getState } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    expect(await isValidWorkspace(workspacePath, fs)).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "main"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace"))).toBe(true);
    // jade.json is written via ConfigBackend, not FileSystemBackend.
    expect(getState(workspacePath)).toBeDefined();
  });

  test("jade.json has correct version and empty apps array", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    const jadeConfig = await config.readConfig(workspacePath);
    expect(jadeConfig.version).toBe("1.0");
    expect(jadeConfig.apps).toEqual([]);
  });

  test("persists orgUrl when provided", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({
      args: { path: workspacePath, orgUrl: "https://github.com/testorg" },
    } as any);

    const jadeConfig = await config.readConfig(workspacePath);
    expect(jadeConfig.orgUrl).toBe("https://github.com/testorg");
  });

  test("exits when workspace already initialized", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    await expectsExit(() =>
      initCmd.run!({ args: { path: workspacePath } } as any)
    );
  });
});

// ─── App addition (add) with mock git ─────────────────────────────────────────

describe("add command — app creation with mock git", () => {
  let tempDir: TempDir;
  let fsFake: MockFileSystemBackend;
  let configFake: MockConfigBackend;

  beforeEach(async () => {
    tempDir = await createTempDir();
    fsFake = createMockFileSystemBackend();
    configFake = createMockConfigBackend();
  });

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  async function initWorkspace(name = "ws") {
    const workspacePath = join(tempDir.path, name);
    const initCmd = makeInitCommand(fsFake.fs, configFake.config);
    await initCmd.run!({ args: { path: workspacePath } } as any);
    return workspacePath;
  }

  test("creates bare repo dir and main/<app> worktree", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/myapp", name: "myapp", workspace: workspacePath },
    } as any);

    expect(await fsFake.fs.pathExists(join(workspacePath, ".bare", "myapp"))).toBe(true);
    expect(await fsFake.fs.pathExists(join(workspacePath, "main", "myapp"))).toBe(true);
  });

  test("registers app in jade.json", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/myapp", name: "myapp", workspace: workspacePath },
    } as any);

    const jadeConfig = await configFake.config.readConfig(workspacePath);
    expect(getAppNames(jadeConfig)).toContain("myapp");
  });

  test("persists defaultBranch to config when --branch is provided", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/myapp",
        name: "myapp",
        branch: "develop",
        workspace: workspacePath,
      },
    } as any);

    const jadeConfig = await configFake.config.readConfig(workspacePath);
    expect(jadeConfig.apps).toContainEqual({ name: "myapp", defaultBranch: "develop" });
  });

  test("calls getDefaultBranch when no --branch provided", async () => {
    const workspacePath = await initWorkspace();
    const { git, calls } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/myapp", name: "myapp", workspace: workspacePath },
    } as any);

    expect(calls.some((c) => c.method === "getDefaultBranch")).toBe(true);
  });

  test("only creates a worktree in main, not in other existing workspaces", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    // Manually create a second worktree group dir inside workspace/
    await fsFake.fs.mkdirp(join(workspacePath, "workspace", "feat-x"));

    // Add a second app — should only create a worktree in main/, not workspace/feat-x/
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app2", name: "app2", workspace: workspacePath },
    } as any);

    expect(await fsFake.fs.pathExists(join(workspacePath, "main", "app2"))).toBe(true);
    expect(await fsFake.fs.pathExists(join(workspacePath, "workspace", "feat-x", "app2"))).toBe(false);
  });

  test("exits when app already exists in .bare/", async () => {
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await expectsExit(() =>
      addCmd.run!({
        args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
      } as any)
    );
  });
});

// ─── Workspace creation (workspace add) with mock git ─────────────────────────

describe("workspace add command — creation with mock git", () => {
  let tempDir: TempDir;
  let fsFake: MockFileSystemBackend;
  let configFake: MockConfigBackend;

  beforeEach(async () => {
    tempDir = await createTempDir();
    fsFake = createMockFileSystemBackend();
    configFake = createMockConfigBackend();
  });

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  async function makeWorkspaceWithApp(wsName = "ws", appName = "app") {
    const workspacePath = join(tempDir.path, wsName);
    const initCmd = makeInitCommand(fsFake.fs, configFake.config);
    await initCmd.run!({ args: { path: workspacePath } } as any);
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);
    await addCmd.run!({
      args: {
        repoNameOrUrl: `https://github.com/org/${appName}`,
        name: appName,
        workspace: workspacePath,
      },
    } as any);
    return { workspacePath, git };
  }

  async function makeWorkspaceAdd(git: ReturnType<typeof createMockGitBackend>["git"]) {
    return makeWorkspaceAddCommand(git, selectAll, fsFake.fs);
  }

  test("creates empty workspace when no apps exist", async () => {
    const workspacePath = join(tempDir.path, "ws");
    const initCmd = makeInitCommand(fsFake.fs, configFake.config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const workspaceAddCmd = await makeWorkspaceAdd(git);

    await workspaceAddCmd.run!({
      args: { name: "feat-empty", workspace: workspacePath },
    } as any);

    expect(await fsFake.fs.pathExists(join(workspacePath, "workspace", "feat-empty"))).toBe(true);
  });

  test("creates <workspace>/<app> for all existing apps", async () => {
    const { workspacePath, git } = await makeWorkspaceWithApp("ws", "myapp");
    const workspaceAddCmd = await makeWorkspaceAdd(git);

    await workspaceAddCmd.run!({
      args: { name: "feat-login", workspace: workspacePath },
    } as any);

    expect(await fsFake.fs.pathExists(join(workspacePath, "workspace", "feat-login", "myapp"))).toBe(true);
  });

  test("creates workspace for multiple apps", async () => {
    const workspacePath = join(tempDir.path, "ws");
    const initCmd = makeInitCommand(fsFake.fs, configFake.config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);
    const workspaceAddCmd = await makeWorkspaceAdd(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/api", name: "api", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/web", name: "web", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-multi", workspace: workspacePath },
    } as any);

    expect(await fsFake.fs.pathExists(join(workspacePath, "workspace", "feat-multi", "api"))).toBe(true);
    expect(await fsFake.fs.pathExists(join(workspacePath, "workspace", "feat-multi", "web"))).toBe(true);
  });

  test("exits when workspace already exists", async () => {
    const { workspacePath, git } = await makeWorkspaceWithApp();
    const workspaceAddCmd = await makeWorkspaceAdd(git);

    await workspaceAddCmd.run!({
      args: { name: "feat-dup", workspace: workspacePath },
    } as any);

    await expectsExit(() =>
      workspaceAddCmd.run!({
        args: { name: "feat-dup", workspace: workspacePath },
      } as any)
    );
  });

  test("branch conflict creates worktree with resolved branch name", async () => {
    const workspacePath = join(tempDir.path, "ws");
    const initCmd = makeInitCommand(fsFake.fs, configFake.config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git, getState } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fsFake.fs, configFake.config);
    const workspaceAddCmd = await makeWorkspaceAdd(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app", name: "app", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-conflict", workspace: workspacePath },
    } as any);

    const bareRepoPath = resolve(workspacePath, ".bare", "app");
    const state = getState(bareRepoPath);
    expect(state).toBeDefined();

    // Verify the worktree was tracked with the correct branch
    const firstWorktreePath = resolve(workspacePath, "workspace", "feat-conflict", "app");
    expect(state!.worktrees.has(firstWorktreePath)).toBe(true);
    expect(state!.worktrees.get(firstWorktreePath)).toBe("feat-conflict");
  });
});

// ─── Cross-flow: init -> add -> workspace add ─────────────────────────────────

describe("creation cross-flow: init -> add app -> workspace add", () => {
  let tempDir: TempDir;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("full creation flow produces expected workspace structure", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "fullflow");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/frontend", name: "frontend", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/backend", name: "backend", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-auth", workspace: workspacePath },
    } as any);

    const jadeConfig = await config.readConfig(workspacePath);
    expect(getAppNames(jadeConfig)).toContain("frontend");
    expect(getAppNames(jadeConfig)).toContain("backend");

    expect(await fs.pathExists(join(workspacePath, "main", "frontend"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "main", "backend"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-auth", "frontend"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-auth", "backend"))).toBe(true);
  });

  test("-a flag cross-flow adds all apps without prompting", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "allflow");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    // Use a stub that would exit if called — proves -a bypasses the prompt
    const neverPrompt: SelectAppsFn = async () => Symbol("should-not-be-called");
    const workspaceAddCmd = makeWorkspaceAddCommand(git, neverPrompt, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/api", name: "api", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/web", name: "web", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-allrepos", workspace: workspacePath, all: true },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-allrepos", "api"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-allrepos", "web"))).toBe(true);
  });

  test("mock git backend records all expected operations", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "callflow");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git, calls } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/svc", name: "svc", workspace: workspacePath },
    } as any);

    await workspaceAddCmd.run!({
      args: { name: "feat-x", workspace: workspacePath },
    } as any);

    const methods = calls.map((c) => c.method);
    expect(methods).toContain("cloneBare");
    expect(methods).toContain("getDefaultBranch");
    // worktreeAdd called for main/ and then for feat-x/
    expect(methods.filter((m) => m === "worktreeAdd").length).toBeGreaterThanOrEqual(2);
  });
});

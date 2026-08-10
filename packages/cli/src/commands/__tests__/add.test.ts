import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { getAppNames } from "../../utils/config.ts";
import { listBareRepos } from "../../utils/workspace.ts";
import { makeAddCommand } from "../add.ts";
import { createTempDir } from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import { createMockFileSystemBackend, type MockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { createMockConfigBackend, type MockConfigBackend } from "../../test/mock-config-backend.ts";
import { makeInitCommand } from "../init.ts";

describe("add command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  async function initWorkspace(
    fs: MockFileSystemBackend["fs"],
    config: MockConfigBackend["config"],
    name = "ws"
  ) {
    const workspacePath = join(tempDir.path, name);
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);
    return workspacePath;
  }

  test("bare-clones repo into .bare and creates worktrees in main", async () => {
    tempDir = await createTempDir();
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const workspacePath = await initWorkspace(fs, config);
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/source",
        name: "source",
        workspace: workspacePath,
      },
    } as any);

    const bareRepos = await listBareRepos(workspacePath, fs);
    expect(bareRepos.length).toBeGreaterThanOrEqual(1);
    const jadeConfig = await config.readConfig(workspacePath);
    expect(jadeConfig.apps.length).toBeGreaterThanOrEqual(1);
  });

  test("registers app in jade.json", async () => {
    tempDir = await createTempDir();
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const workspacePath = await initWorkspace(fs, config);
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/myapp",
        name: "myapp",
        workspace: workspacePath,
      },
    } as any);

    const jadeConfig = await config.readConfig(workspacePath);
    expect(getAppNames(jadeConfig)).toContain("myapp");
  });

  test("persists defaultBranch to config when --branch is provided", async () => {
    tempDir = await createTempDir();
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const workspacePath = await initWorkspace(fs, config);
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/myapp",
        name: "myapp",
        branch: "master",
        workspace: workspacePath,
      },
    } as any);

    const jadeConfig = await config.readConfig(workspacePath);
    expect(jadeConfig.apps).toContainEqual({ name: "myapp", defaultBranch: "master" });
  });

  test("only creates a worktree in main, not in other existing groups", async () => {
    tempDir = await createTempDir();
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const workspacePath = await initWorkspace(fs, config);
    await config.writeConfig(workspacePath, {
      version: "1.0",
      apps: [],
      orgUrl: "https://github.com/org",
    });
    await fs.mkdirp(join(workspacePath, "workspace", "feat-auth"));

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/app",
        name: "app",
        workspace: workspacePath,
      },
    } as any);

    expect(await fs.pathExists(join(workspacePath, "main", "app"))).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "workspace", "feat-auth", "app"))).toBe(false);
  });
});

import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { getAppNames } from "../../utils/config.ts";
import { listBareRepos } from "../../utils/workspace.ts";
import { makeAddCommand, isRepoUrl, buildOrgRepoUrl, deriveAppName } from "../add.ts";
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

describe("isRepoUrl", () => {
  test("treats scheme, scp-style SSH and local paths as URLs", () => {
    expect(isRepoUrl("https://github.com/org/app")).toBe(true);
    expect(isRepoUrl("ssh://git@github.com/org/app")).toBe(true);
    expect(isRepoUrl("git@github.com:org/app.git")).toBe(true);
    expect(isRepoUrl("/abs/path/app")).toBe(true);
    expect(isRepoUrl("./rel/app")).toBe(true);
    expect(isRepoUrl("../rel/app")).toBe(true);
  });

  test("treats a bare repo name as a name to resolve against orgUrl", () => {
    expect(isRepoUrl("app")).toBe(false);
    expect(isRepoUrl("my-app")).toBe(false);
  });
});

describe("buildOrgRepoUrl", () => {
  test("appends .git for scp-style SSH orgUrl", () => {
    expect(buildOrgRepoUrl("git@github.com:org", "app")).toBe("git@github.com:org/app.git");
  });

  test("leaves scheme URLs without a .git suffix", () => {
    expect(buildOrgRepoUrl("https://github.com/org", "app")).toBe("https://github.com/org/app");
    expect(buildOrgRepoUrl("ssh://git@github.com/org", "app")).toBe(
      "ssh://git@github.com/org/app"
    );
  });

  test("tolerates a trailing slash on orgUrl", () => {
    expect(buildOrgRepoUrl("https://github.com/org/", "app")).toBe("https://github.com/org/app");
    expect(buildOrgRepoUrl("git@github.com:org/", "app")).toBe("git@github.com:org/app.git");
  });
});

describe("deriveAppName", () => {
  test("strips the .git suffix that SSH URLs carry", () => {
    expect(deriveAppName("git@github.com:org/app.git")).toBe("app");
    expect(deriveAppName("https://github.com/org/app.git")).toBe("app");
    expect(deriveAppName("ssh://git@github.com/org/app.git")).toBe("app");
  });

  test("derives the name when there is no .git suffix", () => {
    expect(deriveAppName("https://github.com/org/app")).toBe("app");
    expect(deriveAppName("git@github.com:org/app")).toBe("app");
  });

  test("tolerates a trailing slash", () => {
    expect(deriveAppName("https://github.com/org/app/")).toBe("app");
  });

  test("handles scp-style SSH with no path segment", () => {
    expect(deriveAppName("git@gitserver:app.git")).toBe("app");
  });

  test("derives the name from local paths", () => {
    expect(deriveAppName("/abs/path/app.git")).toBe("app");
    expect(deriveAppName("../local/app")).toBe("app");
  });
});

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { join } from "path";
import { mkdir } from "fs/promises";
import { readConfig, getAppNames } from "../../utils/config.ts";
import { listBareRepos } from "../../utils/workspace.ts";
import { makeAddCommand } from "../add.ts";
import { createTempDir } from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";

describe("add command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  async function initWorkspace(name = "ws") {
    const workspacePath = join(tempDir.path, name);
    await initCommand.run!({ args: { path: workspacePath } } as any);
    return workspacePath;
  }

  test("bare-clones repo into .bare and creates worktrees in main", async () => {
    tempDir = await createTempDir();
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/source",
        name: "source",
        workspace: workspacePath,
      },
    } as any);

    const bareRepos = await listBareRepos(workspacePath);
    expect(bareRepos.length).toBeGreaterThanOrEqual(1);
    const config = await readConfig(workspacePath);
    expect(config.apps.length).toBeGreaterThanOrEqual(1);
  });

  test("registers app in jade.json", async () => {
    tempDir = await createTempDir();
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/myapp",
        name: "myapp",
        workspace: workspacePath,
      },
    } as any);

    const config = await readConfig(workspacePath);
    expect(getAppNames(config)).toContain("myapp");
  });

  test("persists defaultBranch to config when --branch is provided", async () => {
    tempDir = await createTempDir();
    const workspacePath = await initWorkspace();
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/myapp",
        name: "myapp",
        branch: "master",
        workspace: workspacePath,
      },
    } as any);

    const config = await readConfig(workspacePath);
    expect(config.apps).toContainEqual({ name: "myapp", defaultBranch: "master" });
  });

  test("creates worktrees in all existing groups", async () => {
    tempDir = await createTempDir();
    const workspacePath = await initWorkspace();
    await Bun.write(
      join(workspacePath, "jade.json"),
      JSON.stringify({
        version: "1.0",
        apps: [],
        orgUrl: "https://github.com/org",
      }) + "\n"
    );
    await mkdir(join(workspacePath, "workspace", "feat-auth"), { recursive: true });

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: {
        repoNameOrUrl: "https://github.com/org/app",
        name: "app",
        workspace: workspacePath,
      },
    } as any);

    const { stat } = await import("fs/promises");
    await stat(join(workspacePath, "main", "app"));
    await stat(join(workspacePath, "workspace", "feat-auth", "app"));
  });
});

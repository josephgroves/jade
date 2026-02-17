import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { readConfig, getAppNames } from "../../utils/config.ts";
import { listBareRepos } from "../../utils/workspace.ts";
import addCommand from "../add.ts";
import {
  createTempDir,
  createLocalGitRepo,
  createTestWorkspace,
} from "../../test/helpers.ts";

describe("add command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("bare-clones repo into .bare and creates worktrees in main", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);

    await addCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
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
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "myapp");
    await createLocalGitRepo(sourceRepo);

    await addCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
        name: "myapp",
        workspace: workspacePath,
      },
    } as any);

    const config = await readConfig(workspacePath);
    expect(getAppNames(config)).toContain("myapp");
  });

  test("persists defaultBranch to config when --branch is provided", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "myapp");
    await createLocalGitRepo(sourceRepo);

    await addCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
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
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    await Bun.write(
      join(workspacePath, "jade.json"),
      JSON.stringify({
        version: "1.0",
        apps: [],
        orgUrl: "https://github.com/org",
      }) + "\n"
    );
    const { mkdir } = await import("fs/promises");
    await mkdir(join(workspacePath, "feat-auth"), { recursive: true });

    const sourceRepo = join(tempDir.path, "app");
    await createLocalGitRepo(sourceRepo);

    await addCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
        name: "app",
        workspace: workspacePath,
      },
    } as any);

    const { stat } = await import("fs/promises");
    await stat(join(workspacePath, "main", "app"));
    await stat(join(workspacePath, "feat-auth", "app"));
  });
});

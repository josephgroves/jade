import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { readConfig, getAppNames } from "../../utils/config.ts";
import { listBareRepos } from "../../utils/workspace.ts";
import removeCommand from "../remove.ts";
import {
  createTempDir,
  createLocalGitRepo,
  createTestWorkspace,
} from "../../test/helpers.ts";
import addCommand from "../add.ts";

describe("remove command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;
  const exitMock = ((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as (code?: number) => never;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("removes worktrees, bare repo, and app from jade.json", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "toremove");
    await createLocalGitRepo(sourceRepo);

    await addCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
        name: "toremove",
        workspace: workspacePath,
      },
    } as any);

    await removeCommand.run!({
      args: { name: "toremove", workspace: workspacePath },
    } as any);

    const bareRepos = await listBareRepos(workspacePath);
    expect(bareRepos).not.toContain("toremove");
    const config = await readConfig(workspacePath);
    expect(getAppNames(config)).not.toContain("toremove");
  });

  test("errors when app does not exist", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);

    const originalExit = process.exit;
    process.exit = exitMock;

    let exited = false;
    try {
      await removeCommand.run!({
        args: { name: "nonexistent", workspace: workspacePath },
      } as any);
    } catch (e: any) {
      if (e?.message === "EXIT:1") exited = true;
    } finally {
      process.exit = originalExit;
    }
    expect(exited).toBe(true);
  });
});

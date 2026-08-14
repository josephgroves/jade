import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { getAppNames } from "../../utils/config.ts";
import { listBareRepos } from "../../utils/workspace.ts";
import { makeRemoveCommand } from "../remove.ts";
import { makeAddCommand } from "../add.ts";
import { createTempDir, expectsExit } from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import { createMockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { createMockConfigBackend } from "../../test/mock-config-backend.ts";
import { makeInitCommand } from "../init.ts";

describe("remove command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("removes worktrees, bare repo, and app from jade.json", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    const removeCmd = makeRemoveCommand(git, fs, config);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/toremove", name: "toremove", workspace: workspacePath },
    } as any);

    await removeCmd.run!({
      args: { name: "toremove", workspace: workspacePath },
    } as any);

    const bareRepos = await listBareRepos(workspacePath, fs);
    expect(bareRepos).not.toContain("toremove");
    const jadeConfig = await config.readConfig(workspacePath);
    expect(getAppNames(jadeConfig)).not.toContain("toremove");
  });

  test("errors when app does not exist", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const removeCmd = makeRemoveCommand(git, fs, config);

    await expectsExit(() =>
      removeCmd.run!({ args: { name: "nonexistent", workspace: workspacePath } } as any)
    );
  });
});

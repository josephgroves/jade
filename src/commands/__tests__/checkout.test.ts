import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { $ } from "bun";
import { gitCurrentBranch } from "../../utils/git.ts";
import checkoutCommand from "../checkout.ts";
import {
  createTempDir,
  createLocalGitRepo,
  createTestWorkspace,
} from "../../test/helpers.ts";
import addRepoCommand from "../add.ts";

describe("checkout command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;
  let originalCwd: string;

  afterEach(async () => {
    if (originalCwd) process.chdir(originalCwd);
    if (tempDir) await tempDir.cleanup();
  });

  test("checks out existing branch", async () => {
    tempDir = await createTempDir();
    originalCwd = process.cwd();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "app");
    await createLocalGitRepo(sourceRepo);

    await addRepoCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
        name: "app",
        workspace: workspacePath,
      },
    } as any);

    // Create feat-b in the bare repo without a worktree so it can be freely checked out
    const bareRepoPath = join(workspacePath, ".bare", "app");
    await $`git branch feat-b`.cwd(bareRepoPath);

    process.chdir(join(workspacePath, "main", "app"));

    await checkoutCommand.run!({
      args: { branch: "feat-b", workspace: workspacePath },
    } as any);

    const branch = await gitCurrentBranch(join(workspacePath, "main", "app"));
    expect(branch).toBe("feat-b");
  });

  test("creates and checks out new branch with -c", async () => {
    tempDir = await createTempDir();
    originalCwd = process.cwd();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "app");
    await createLocalGitRepo(sourceRepo);

    await addRepoCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
        name: "app",
        workspace: workspacePath,
      },
    } as any);

    process.chdir(join(workspacePath, "main", "app"));

    await checkoutCommand.run!({
      args: { branch: "feat-new", create: true, workspace: workspacePath },
    } as any);

    const branch = await gitCurrentBranch(join(workspacePath, "main", "app"));
    expect(branch).toBe("feat-new");
  });

  test("scopes to single app when --app provided", async () => {
    tempDir = await createTempDir();
    originalCwd = process.cwd();
    const workspacePath = join(tempDir.path, "ws");
    await createTestWorkspace(workspacePath);
    const sourceRepo = join(tempDir.path, "app");
    await createLocalGitRepo(sourceRepo);

    await addRepoCommand.run!({
      args: {
        repoNameOrUrl: sourceRepo,
        name: "app",
        workspace: workspacePath,
      },
    } as any);

    // Create feat-x in the bare repo without a worktree so it can be freely checked out
    const bareRepoPath = join(workspacePath, ".bare", "app");
    await $`git branch feat-x`.cwd(bareRepoPath);

    process.chdir(join(workspacePath, "main"));

    await checkoutCommand.run!({
      args: { branch: "feat-x", app: "app", workspace: workspacePath },
    } as any);

    const branch = await gitCurrentBranch(join(workspacePath, "main", "app"));
    expect(branch).toBe("feat-x");
  });
});

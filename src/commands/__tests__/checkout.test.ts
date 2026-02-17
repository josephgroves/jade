import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { realpath } from "fs/promises";
import { makeCheckoutCommand } from "../checkout.ts";
import { makeAddCommand } from "../add.ts";
import { createTempDir } from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";

describe("checkout command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;
  let originalCwd: string;

  afterEach(async () => {
    if (originalCwd) process.chdir(originalCwd);
    if (tempDir) await tempDir.cleanup();
  });

  async function setupWorkspaceWithApp(appName = "app") {
    // Resolve symlinks (macOS /var -> /private/var) so paths match process.cwd()
    const realTmpPath = await realpath(tempDir.path);
    const workspacePath = join(realTmpPath, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);
    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: {
        repoNameOrUrl: `https://github.com/org/${appName}`,
        name: appName,
        workspace: workspacePath,
      },
    } as any);

    return { workspacePath, git };
  }

  test("checks out existing branch", async () => {
    tempDir = await createTempDir();
    originalCwd = process.cwd();
    const { workspacePath, git } = await setupWorkspaceWithApp();

    process.chdir(join(workspacePath, "main", "app"));

    const checkoutCmd = makeCheckoutCommand(git);
    await checkoutCmd.run!({
      args: { branch: "feat-b", workspace: workspacePath },
    } as any);

    const branch = await git.currentBranch(join(workspacePath, "main", "app"));
    expect(branch).toBe("feat-b");
  });

  test("creates and checks out new branch with -c", async () => {
    tempDir = await createTempDir();
    originalCwd = process.cwd();
    const { workspacePath, git } = await setupWorkspaceWithApp();

    process.chdir(join(workspacePath, "main", "app"));

    const checkoutCmd = makeCheckoutCommand(git);
    await checkoutCmd.run!({
      args: { branch: "feat-new", create: true, workspace: workspacePath },
    } as any);

    const branch = await git.currentBranch(join(workspacePath, "main", "app"));
    expect(branch).toBe("feat-new");
  });

  test("scopes to single app when --app provided", async () => {
    tempDir = await createTempDir();
    originalCwd = process.cwd();
    const { workspacePath, git } = await setupWorkspaceWithApp();

    process.chdir(join(workspacePath, "main"));

    const checkoutCmd = makeCheckoutCommand(git);
    await checkoutCmd.run!({
      args: { branch: "feat-x", app: "app", workspace: workspacePath },
    } as any);

    const branch = await git.currentBranch(join(workspacePath, "main", "app"));
    expect(branch).toBe("feat-x");
  });
});

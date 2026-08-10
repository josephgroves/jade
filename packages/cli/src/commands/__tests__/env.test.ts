import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { makeEnvSyncCommand } from "../env.ts";
import { makeWorkspaceAddCommand, type SelectAppsFn } from "../workspace.ts";
import { makeAddCommand } from "../add.ts";
import { makeInitCommand } from "../init.ts";
import {
  createTempDir,
  withCapturedConsole,
  expectsExit,
} from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import { createMockFileSystemBackend, type MockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { createMockConfigBackend, type MockConfigBackend } from "../../test/mock-config-backend.ts";

const selectAll: SelectAppsFn = async (apps) => apps;

async function setupWorkspaceWithEnv(
  workspacePath: string,
  fs: MockFileSystemBackend["fs"],
  config: MockConfigBackend["config"],
  apps: { name: string; envContent: string }[]
) {
  const initCmd = makeInitCommand(fs, config);
  await initCmd.run!({ args: { path: workspacePath } } as any);

  const { git } = createMockGitBackend();
  const addCmd = makeAddCommand(git, fs, config);

  for (const app of apps) {
    await addCmd.run!({
      args: {
        repoNameOrUrl: `https://github.com/org/${app.name}`,
        name: app.name,
        workspace: workspacePath,
      },
    } as any);

    const envDir = join(workspacePath, ".env", app.name);
    await fs.writeFile(join(envDir, ".env"), app.envContent);
  }

  return { git };
}

describe("env sync command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("copies env files to main worktree", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { fs, getFileContent } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    await setupWorkspaceWithEnv(ws, fs, config, [
      { name: "api", envContent: "API_KEY=secret\n" },
    ]);

    const syncCmd = makeEnvSyncCommand(fs);
    await syncCmd.run!({ args: { workspace: ws } } as any);

    expect(getFileContent(join(ws, "main", "api", ".env"))).toBe("API_KEY=secret\n");
  });

  test("copies env files to all worktree groups", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { fs, getFileContent } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const { git } = await setupWorkspaceWithEnv(ws, fs, config, [
      { name: "api", envContent: "DB=postgres\n" },
    ]);

    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);
    await workspaceAddCmd.run!({ args: { name: "feat-x", workspace: ws } } as any);

    const syncCmd = makeEnvSyncCommand(fs);
    await syncCmd.run!({ args: { workspace: ws } } as any);

    expect(getFileContent(join(ws, "main", "api", ".env"))).toBe("DB=postgres\n");
    expect(getFileContent(join(ws, "workspace", "feat-x", "api", ".env"))).toBe("DB=postgres\n");
  });

  test("skips apps with no source env file", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: ws } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/api", name: "api", workspace: ws },
    } as any);

    // Create .env/ dir but no .env/api/.env
    await fs.mkdirp(join(ws, ".env"));

    const syncCmd = makeEnvSyncCommand(fs);
    const logs = await withCapturedConsole(() =>
      syncCmd.run!({ args: { workspace: ws } } as any)
    );

    expect(logs.some((l) => l.includes("No source .env for"))).toBe(true);
  });

  test("exits when no .env directory exists", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: ws } } as any);

    const syncCmd = makeEnvSyncCommand(fs);
    await expectsExit(() =>
      syncCmd.run!({ args: { workspace: ws } } as any)
    );
  });

  test("workspace add auto-copies env files", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { fs, getFileContent } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const { git } = await setupWorkspaceWithEnv(ws, fs, config, [
      { name: "api", envContent: "SECRET=xyz\n" },
    ]);

    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);
    await workspaceAddCmd.run!({ args: { name: "feat-env", workspace: ws } } as any);

    expect(getFileContent(join(ws, "workspace", "feat-env", "api", ".env"))).toBe("SECRET=xyz\n");
  });

  test("workspace add works when no .env directory exists", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: ws } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/api", name: "api", workspace: ws },
    } as any);

    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll, fs);
    await workspaceAddCmd.run!({ args: { name: "feat-no-env", workspace: ws } } as any);

    expect(await fs.pathExists(join(ws, "workspace", "feat-no-env", "api", ".env"))).toBe(false);
  });

  test("handles multiple apps", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { fs, getFileContent } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    await setupWorkspaceWithEnv(ws, fs, config, [
      { name: "api", envContent: "A=1\n" },
      { name: "web", envContent: "B=2\n" },
    ]);

    const syncCmd = makeEnvSyncCommand(fs);
    await syncCmd.run!({ args: { workspace: ws } } as any);

    expect(getFileContent(join(ws, "main", "api", ".env"))).toBe("A=1\n");
    expect(getFileContent(join(ws, "main", "web", ".env"))).toBe("B=2\n");
  });
});

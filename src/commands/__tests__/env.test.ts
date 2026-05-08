import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { mkdir } from "fs/promises";
import { makeEnvSyncCommand } from "../env.ts";
import { makeWorkspaceAddCommand, type SelectAppsFn } from "../workspace.ts";
import { makeAddCommand } from "../add.ts";
import initCommand from "../init.ts";
import {
  createTempDir,
  withCapturedConsole,
  expectsExit,
} from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";

const selectAll: SelectAppsFn = async (apps) => apps;

async function setupWorkspaceWithEnv(
  workspacePath: string,
  apps: { name: string; envContent: string }[]
) {
  await initCommand.run!({ args: { path: workspacePath } } as any);

  const { git } = createMockGitBackend();
  const addCmd = makeAddCommand(git);

  for (const app of apps) {
    await addCmd.run!({
      args: {
        repoNameOrUrl: `https://github.com/org/${app.name}`,
        name: app.name,
        workspace: workspacePath,
      },
    } as any);

    const envDir = join(workspacePath, ".env", app.name);
    await mkdir(envDir, { recursive: true });
    await Bun.write(join(envDir, ".env"), app.envContent);
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
    await setupWorkspaceWithEnv(ws, [
      { name: "api", envContent: "API_KEY=secret\n" },
    ]);

    const syncCmd = makeEnvSyncCommand();
    await syncCmd.run!({ args: { workspace: ws } } as any);

    expect(await Bun.file(join(ws, "main", "api", ".env")).text()).toBe("API_KEY=secret\n");
  });

  test("copies env files to all worktree groups", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { git } = await setupWorkspaceWithEnv(ws, [
      { name: "api", envContent: "DB=postgres\n" },
    ]);

    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);
    await workspaceAddCmd.run!({ args: { name: "feat-x", workspace: ws } } as any);

    const syncCmd = makeEnvSyncCommand();
    await syncCmd.run!({ args: { workspace: ws } } as any);

    expect(await Bun.file(join(ws, "main", "api", ".env")).text()).toBe("DB=postgres\n");
    expect(await Bun.file(join(ws, "workspace", "feat-x", "api", ".env")).text()).toBe("DB=postgres\n");
  });

  test("skips apps with no source env file", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: ws } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/api", name: "api", workspace: ws },
    } as any);

    // Create .env/ dir but no .env/api/.env
    await mkdir(join(ws, ".env"), { recursive: true });

    const syncCmd = makeEnvSyncCommand();
    const logs = await withCapturedConsole(() =>
      syncCmd.run!({ args: { workspace: ws } } as any)
    );

    expect(logs.some((l) => l.includes("No source .env for"))).toBe(true);
  });

  test("exits when no .env directory exists", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: ws } } as any);

    const syncCmd = makeEnvSyncCommand();
    await expectsExit(() =>
      syncCmd.run!({ args: { workspace: ws } } as any)
    );
  });

  test("workspace add auto-copies env files", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    const { git } = await setupWorkspaceWithEnv(ws, [
      { name: "api", envContent: "SECRET=xyz\n" },
    ]);

    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);
    await workspaceAddCmd.run!({ args: { name: "feat-env", workspace: ws } } as any);

    expect(await Bun.file(join(ws, "workspace", "feat-env", "api", ".env")).text()).toBe("SECRET=xyz\n");
  });

  test("workspace add works when no .env directory exists", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: ws } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/api", name: "api", workspace: ws },
    } as any);

    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);
    await workspaceAddCmd.run!({ args: { name: "feat-no-env", workspace: ws } } as any);

    const envFile = Bun.file(join(ws, "workspace", "feat-no-env", "api", ".env"));
    expect(await envFile.exists()).toBe(false);
  });

  test("handles multiple apps", async () => {
    tempDir = await createTempDir();
    const ws = join(tempDir.path, "ws");
    await setupWorkspaceWithEnv(ws, [
      { name: "api", envContent: "A=1\n" },
      { name: "web", envContent: "B=2\n" },
    ]);

    const syncCmd = makeEnvSyncCommand();
    await syncCmd.run!({ args: { workspace: ws } } as any);

    expect(await Bun.file(join(ws, "main", "api", ".env")).text()).toBe("A=1\n");
    expect(await Bun.file(join(ws, "main", "web", ".env")).text()).toBe("B=2\n");
  });
});

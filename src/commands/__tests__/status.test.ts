import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { makeStatusCommand } from "../status.ts";
import { makeAddCommand } from "../add.ts";
import { makeWorkspaceAddCommand, type SelectAppsFn } from "../workspace.ts";

const selectAll: SelectAppsFn = async (apps) => apps;
import {
  createTempDir,
  withCapturedConsole,
} from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";

describe("status command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("outputs workspace path, groups, and apps", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const statusCmd = makeStatusCommand(git);

    const logs = await withCapturedConsole(() =>
      statusCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("Workspace:"))).toBe(true);
    expect(logs.some((l) => l.includes("Workspaces"))).toBe(true);
    expect(logs.some((l) => l.includes("Apps"))).toBe(true);
  });

  test("works with multiple apps and workspaces", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);
    const statusCmd = makeStatusCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app1", name: "app1", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app2", name: "app2", workspace: workspacePath },
    } as any);
    await workspaceAddCmd.run!({
      args: { name: "feat-auth", workspace: workspacePath },
    } as any);

    const logs = await withCapturedConsole(() =>
      statusCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    const output = logs.join("\n");
    expect(output).toContain("app1");
    expect(output).toContain("app2");
    expect(output).toContain("main");
    expect(output).toContain("feat-auth");
  });
});

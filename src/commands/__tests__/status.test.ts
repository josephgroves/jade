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
import pkg from "../../../package.json" with { type: "json" };

describe("status command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("prints version, root, and workspaces", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const statusCmd = makeStatusCommand();

    const logs = await withCapturedConsole(() =>
      statusCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    const out = logs.join("\n");
    expect(out).toContain(`version: ${pkg.version}`);
    expect(out).toContain(`root: ${workspacePath}`);
    expect(out).toContain("workspaces:");
    expect(out).toContain("- main");
    expect(out).not.toContain("org:");
  });

  test("prints org when configured", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({
      args: { path: workspacePath, orgUrl: "https://github.com/acme" },
    } as any);

    const statusCmd = makeStatusCommand();
    const logs = await withCapturedConsole(() =>
      statusCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(logs.join("\n")).toContain("org: https://github.com/acme");
  });

  test("lists multiple workspace groups", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const workspaceAddCmd = makeWorkspaceAddCommand(git, selectAll);
    const statusCmd = makeStatusCommand();

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

    const out = logs.join("\n");
    expect(out).toContain("- main");
    expect(out).toContain("- feat-auth");
  });

  test("--json prints machine-readable status", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({
      args: { path: workspacePath, orgUrl: "https://github.com/acme" },
    } as any);

    const statusCmd = makeStatusCommand();
    const logs = await withCapturedConsole(() =>
      statusCmd.run!({ args: { workspace: workspacePath, json: true } } as any)
    );

    const parsed = JSON.parse(logs.join(""));
    expect(parsed).toEqual({
      version: pkg.version,
      root: workspacePath,
      orgUrl: "https://github.com/acme",
      groups: ["main"],
    });
  });
});

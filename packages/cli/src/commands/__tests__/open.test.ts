import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { makeOpenCommand, type HerdrRunner } from "../open.ts";
import { makeAddCommand } from "../add.ts";
import { createTempDir, withCapturedConsole, expectsExit } from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import { createMockFileSystemBackend, type MockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { createMockConfigBackend, type MockConfigBackend } from "../../test/mock-config-backend.ts";
import { makeInitCommand } from "../init.ts";

/**
 * Fake herdr runner. Records every invocation and returns canned JSON for the
 * read commands open.ts parses. `existingLabels` seeds `workspace list` so the
 * focus-existing path can be exercised.
 */
function captureHerdr(existingLabels: string[] = []): { runHerdr: HerdrRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runHerdr: HerdrRunner = async (args) => {
    calls.push(args);
    if (args[0] === "workspace" && args[1] === "list") {
      return JSON.stringify({
        result: {
          workspaces: existingLabels.map((label, i) => ({ label, workspace_id: `w${i}` })),
        },
      });
    }
    if (args[0] === "workspace" && args[1] === "create") {
      return JSON.stringify({
        result: { workspace: { workspace_id: "wNEW" }, tab: { tab_id: "wNEW:t1" } },
      });
    }
    return "";
  };
  return { runHerdr, calls };
}

describe("open command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;
  const origHerdrEnv = process.env.HERDR_ENV;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
    if (origHerdrEnv === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = origHerdrEnv;
  });

  async function setupWorkspaceWithApps(): Promise<{
    workspacePath: string;
    fs: MockFileSystemBackend["fs"];
    config: MockConfigBackend["config"];
  }> {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);
    await initCmd.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git, fs, config);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app1", name: "app1", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app2", name: "app2", workspace: workspacePath },
    } as any);

    return { workspacePath, fs, config };
  }

  test("creates a dedicated workspace with a renamed root tab plus one tab per app", async () => {
    const { workspacePath, fs, config } = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";

    const { runHerdr, calls } = captureHerdr();
    const openCmd = makeOpenCommand(runHerdr, fs, config);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    const mainPath = join(workspacePath, "main");
    // Looks up existing workspaces, finds none, creates a new labeled workspace.
    expect(calls[0]).toEqual(["workspace", "list"]);
    expect(calls[1]).toEqual([
      "workspace", "create", "--cwd", mainPath, "--label", "main", "--focus",
    ]);
    // Renames the workspace's initial tab to the group name.
    expect(calls[2]).toEqual(["tab", "rename", "wNEW:t1", "main"]);
    // One tab per app, scoped to the new workspace, without stealing focus.
    expect(calls[3]).toEqual([
      "tab", "create", "--workspace", "wNEW", "--cwd", join(mainPath, "app1"), "--label", "app1", "--no-focus",
    ]);
    expect(calls[4]).toEqual([
      "tab", "create", "--workspace", "wNEW", "--cwd", join(mainPath, "app2"), "--label", "app2", "--no-focus",
    ]);
    expect(calls).toHaveLength(5);
  });

  test("focuses the existing workspace instead of recreating it", async () => {
    const { workspacePath, fs, config } = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";

    // A herdr workspace labeled "main" already exists (id w0 from captureHerdr).
    const { runHerdr, calls } = captureHerdr(["main"]);
    const openCmd = makeOpenCommand(runHerdr, fs, config);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(calls[0]).toEqual(["workspace", "list"]);
    expect(calls[1]).toEqual(["workspace", "focus", "w0"]);
    expect(calls).toHaveLength(2);
    // No workspace create / tab create when focusing an existing one.
    expect(calls.some((c) => c[0] === "workspace" && c[1] === "create")).toBe(false);
  });

  test("exits without touching herdr when HERDR_ENV is not set", async () => {
    const { workspacePath, fs, config } = await setupWorkspaceWithApps();
    delete process.env.HERDR_ENV;

    const { runHerdr, calls } = captureHerdr();
    const openCmd = makeOpenCommand(runHerdr, fs, config);

    await expectsExit(() => openCmd.run!({ args: { workspace: workspacePath } } as any));
    expect(calls).toHaveLength(0);
  });

  test("exits when the requested group does not exist", async () => {
    const { workspacePath, fs, config } = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";

    const { runHerdr, calls } = captureHerdr();
    const openCmd = makeOpenCommand(runHerdr, fs, config);

    await expectsExit(() =>
      openCmd.run!({ args: { group: "does-not-exist", workspace: workspacePath } } as any)
    );
    expect(calls).toHaveLength(0);
  });
});

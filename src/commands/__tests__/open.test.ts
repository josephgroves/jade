import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { makeOpenCommand, type HerdrRunner, type TmuxRunner, type TmuxAttacher } from "../open.ts";
import { makeAddCommand } from "../add.ts";
import { createTempDir, withCapturedConsole, expectsExit } from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";

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

/** Herdr runner that fails the test if invoked — used by tmux-path tests. */
const unusedHerdr: HerdrRunner = async () => {
  throw new Error("herdr should not be called on the tmux path");
};

/**
 * Fake tmux runner. Records every invocation; `has-session` reports
 * `sessionExists` via exit code (tmux's actual signal for "not found"),
 * everything else reports success.
 */
function captureTmux(sessionExists = false): { runTmux: TmuxRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runTmux: TmuxRunner = async (args) => {
    calls.push(args);
    if (args[0] === "has-session") {
      return { stdout: "", stderr: "", exitCode: sessionExists ? 0 : 1 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  return { runTmux, calls };
}

/** tmux runner that fails the test if invoked — used by herdr-path tests. */
const unusedTmux: TmuxRunner = async () => {
  throw new Error("tmux should not be called on the herdr path");
};

/**
 * Fake tmux attacher. Records the session name it was asked to attach to and
 * resolves with `exitCode` (simulating the user detaching).
 */
function captureAttach(exitCode = 0): { attachTmux: TmuxAttacher; calls: string[] } {
  const calls: string[] = [];
  const attachTmux: TmuxAttacher = async (target) => {
    calls.push(target);
    return exitCode;
  };
  return { attachTmux, calls };
}

/** Attacher that fails the test if invoked — used when a client is already attached. */
const unusedAttach: TmuxAttacher = async () => {
  throw new Error("attachTmux should not be called when a tmux client is already attached");
};

describe("open command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;
  const origHerdrEnv = process.env.HERDR_ENV;
  const origTmuxEnv = process.env.TMUX;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
    if (origHerdrEnv === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = origHerdrEnv;
    if (origTmuxEnv === undefined) delete process.env.TMUX;
    else process.env.TMUX = origTmuxEnv;
  });

  async function setupWorkspaceWithApps(): Promise<string> {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app1", name: "app1", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/app2", name: "app2", workspace: workspacePath },
    } as any);

    return workspacePath;
  }

  test("creates a dedicated workspace with a renamed root tab plus one tab per app", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";
    delete process.env.TMUX;

    const { runHerdr, calls } = captureHerdr();
    const openCmd = makeOpenCommand(runHerdr, unusedTmux, unusedAttach);

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
    const workspacePath = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";
    delete process.env.TMUX;

    // A herdr workspace labeled "main" already exists (id w0 from captureHerdr).
    const { runHerdr, calls } = captureHerdr(["main"]);
    const openCmd = makeOpenCommand(runHerdr, unusedTmux, unusedAttach);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(calls[0]).toEqual(["workspace", "list"]);
    expect(calls[1]).toEqual(["workspace", "focus", "w0"]);
    expect(calls).toHaveLength(2);
    // No workspace create / tab create when focusing an existing one.
    expect(calls.some((c) => c[0] === "workspace" && c[1] === "create")).toBe(false);
  });

  test("exits when the requested group does not exist", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";
    delete process.env.TMUX;

    const { runHerdr, calls } = captureHerdr();
    const openCmd = makeOpenCommand(runHerdr, unusedTmux, unusedAttach);

    await expectsExit(() =>
      openCmd.run!({ args: { group: "does-not-exist", workspace: workspacePath } } as any)
    );
    expect(calls).toHaveLength(0);
  });

  test("creates a tmux session with a root window plus one window per app, already attached", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    delete process.env.HERDR_ENV;
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";

    const { runTmux, calls } = captureTmux(false);
    const openCmd = makeOpenCommand(unusedHerdr, runTmux, unusedAttach);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    const mainPath = join(workspacePath, "main");
    expect(calls[0]).toEqual(["has-session", "-t", "main"]);
    expect(calls[1]).toEqual(["new-session", "-d", "-s", "main", "-n", "main", "-c", mainPath]);
    expect(calls[2]).toEqual(["new-window", "-t", "main:", "-n", "app1", "-c", join(mainPath, "app1")]);
    expect(calls[3]).toEqual(["new-window", "-t", "main:", "-n", "app2", "-c", join(mainPath, "app2")]);
    expect(calls[4]).toEqual(["select-window", "-t", "main:main"]);
    // Already inside a tmux client — a quick switch-client, no interactive attach.
    expect(calls[5]).toEqual(["switch-client", "-t", "main"]);
    expect(calls).toHaveLength(6);
  });

  test("switches to the existing tmux session instead of recreating it, already attached", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    delete process.env.HERDR_ENV;
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";

    const { runTmux, calls } = captureTmux(true);
    const openCmd = makeOpenCommand(unusedHerdr, runTmux, unusedAttach);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(calls[0]).toEqual(["has-session", "-t", "main"]);
    expect(calls[1]).toEqual(["switch-client", "-t", "main"]);
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c[0] === "new-session")).toBe(false);
  });

  test("falls back to an interactive tmux attach from a plain terminal (no herdr, no tmux client)", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    delete process.env.HERDR_ENV;
    delete process.env.TMUX;

    const { runTmux, calls } = captureTmux(false);
    const { attachTmux, calls: attachCalls } = captureAttach(0);
    const openCmd = makeOpenCommand(unusedHerdr, runTmux, attachTmux);

    await expectsExit(() => openCmd.run!({ args: { workspace: workspacePath } } as any), 0);

    const mainPath = join(workspacePath, "main");
    expect(calls[0]).toEqual(["has-session", "-t", "main"]);
    expect(calls[1]).toEqual(["new-session", "-d", "-s", "main", "-n", "main", "-c", mainPath]);
    expect(calls[2]).toEqual(["new-window", "-t", "main:", "-n", "app1", "-c", join(mainPath, "app1")]);
    expect(calls[3]).toEqual(["new-window", "-t", "main:", "-n", "app2", "-c", join(mainPath, "app2")]);
    expect(calls[4]).toEqual(["select-window", "-t", "main:main"]);
    // No client attached yet — hands off to an interactive attach instead of switch-client.
    expect(calls.some((c) => c[0] === "switch-client")).toBe(false);
    expect(calls).toHaveLength(5);
    expect(attachCalls).toEqual(["main"]);
  });

  test("attaches straight to an existing session from a plain terminal", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    delete process.env.HERDR_ENV;
    delete process.env.TMUX;

    const { runTmux, calls } = captureTmux(true);
    const { attachTmux, calls: attachCalls } = captureAttach(0);
    const openCmd = makeOpenCommand(unusedHerdr, runTmux, attachTmux);

    await expectsExit(() => openCmd.run!({ args: { workspace: workspacePath } } as any), 0);

    expect(calls).toEqual([["has-session", "-t", "main"]]);
    expect(attachCalls).toEqual(["main"]);
  });

  test("--tmux forces the tmux backend from inside herdr, creating the session without attaching", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";
    delete process.env.TMUX;

    const { runTmux, calls } = captureTmux(false);
    const openCmd = makeOpenCommand(unusedHerdr, runTmux, unusedAttach);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath, tmux: true } } as any)
    );

    const mainPath = join(workspacePath, "main");
    expect(calls[0]).toEqual(["has-session", "-t", "main"]);
    expect(calls[1]).toEqual(["new-session", "-d", "-s", "main", "-n", "main", "-c", mainPath]);
    expect(calls[2]).toEqual(["new-window", "-t", "main:", "-n", "app1", "-c", join(mainPath, "app1")]);
    expect(calls[3]).toEqual(["new-window", "-t", "main:", "-n", "app2", "-c", join(mainPath, "app2")]);
    expect(calls[4]).toEqual(["select-window", "-t", "main:main"]);
    // No switch-client (no client attached) and no attach (never leave herdr's own pane).
    expect(calls.some((c) => c[0] === "switch-client")).toBe(false);
    expect(calls).toHaveLength(5);
  });

  test("--tmux from inside herdr with an existing session just leaves it running", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";
    delete process.env.TMUX;

    const { runTmux, calls } = captureTmux(true);
    const openCmd = makeOpenCommand(unusedHerdr, runTmux, unusedAttach);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath, tmux: true } } as any)
    );

    expect(calls).toEqual([["has-session", "-t", "main"]]);
  });

  test("--tmux with an attached tmux client still switches, even inside herdr", async () => {
    const workspacePath = await setupWorkspaceWithApps();
    process.env.HERDR_ENV = "1";
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";

    const { runTmux, calls } = captureTmux(true);
    const openCmd = makeOpenCommand(unusedHerdr, runTmux, unusedAttach);

    await withCapturedConsole(() =>
      openCmd.run!({ args: { workspace: workspacePath, tmux: true } } as any)
    );

    expect(calls).toEqual([
      ["has-session", "-t", "main"],
      ["switch-client", "-t", "main"],
    ]);
  });
});

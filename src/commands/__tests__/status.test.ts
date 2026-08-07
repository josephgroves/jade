import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { mkdir } from "fs/promises";
import { makeStatusCommand, resolveStatusTarget } from "../status.ts";
import { makeAddCommand } from "../add.ts";
import { makeWorkspaceAddCommand, type SelectAppsFn } from "../workspace.ts";

const selectAll: SelectAppsFn = async (apps) => apps;
import {
  createTempDir,
  withCapturedConsole,
  expectsExit,
} from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";
import pkg from "../../../package.json" with { type: "json" };
import type { HerdrRunner } from "../../utils/herdr.ts";

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
      view: "root",
      version: pkg.version,
      root: workspacePath,
      orgUrl: "https://github.com/acme",
      groups: ["main"],
    });
  });

  test("--root forces the root summary", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const statusCmd = makeStatusCommand();
    const logs = await withCapturedConsole(() =>
      statusCmd.run!({ args: { workspace: workspacePath, root: true, json: true } } as any)
    );

    expect(JSON.parse(logs.join("")).view).toBe("root");
  });
});

describe("resolveStatusTarget", () => {
  const root = "/ws";

  test("an explicit name selects that workspace", () => {
    expect(
      resolveStatusTarget({ workspaceRoot: root, explicitName: "feat-x", forceRoot: false, cwd: root })
    ).toEqual({ view: "workspace", name: "feat-x" });
  });

  test("an explicit name beats --root", () => {
    expect(
      resolveStatusTarget({ workspaceRoot: root, explicitName: "feat-x", forceRoot: true, cwd: root })
    ).toEqual({ view: "workspace", name: "feat-x" });
  });

  test("--root beats the current directory's workspace", () => {
    expect(
      resolveStatusTarget({ workspaceRoot: root, forceRoot: true, cwd: "/ws/workspace/feat-x/app1" })
    ).toEqual({ view: "root" });
  });

  test("a cwd inside a named workspace selects it", () => {
    expect(
      resolveStatusTarget({ workspaceRoot: root, forceRoot: false, cwd: "/ws/workspace/feat-x/app1" })
    ).toEqual({ view: "workspace", name: "feat-x" });
  });

  test("a cwd inside main selects main", () => {
    expect(
      resolveStatusTarget({ workspaceRoot: root, forceRoot: false, cwd: "/ws/main/app1" })
    ).toEqual({ view: "workspace", name: "main" });
  });

  test("the workspace root itself falls back to the root view", () => {
    expect(resolveStatusTarget({ workspaceRoot: root, forceRoot: false, cwd: root })).toEqual({
      view: "root",
    });
  });

  test("a cwd outside the workspace falls back to the root view", () => {
    expect(
      resolveStatusTarget({ workspaceRoot: root, forceRoot: false, cwd: "/somewhere/else" })
    ).toEqual({ view: "root" });
  });
});

describe("status command — workspace view", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;
  const origHerdrEnv = process.env.HERDR_ENV;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
    if (origHerdrEnv === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = origHerdrEnv;
  });

  /**
   * Build a workspace with `apps` added, plus a group containing `groupApps`
   * (all apps when omitted). Returns the shared mock backend so tests can seed
   * per-worktree git state the status command will then read back.
   */
  async function setup(opts: {
    apps?: string[];
    group?: string;
    groupApps?: string[];
    orgUrl?: string;
  }) {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({
      args: { path: workspacePath, orgUrl: opts.orgUrl },
    } as any);

    const mock = createMockGitBackend();
    const addCmd = makeAddCommand(mock.git);

    for (const app of opts.apps ?? []) {
      await addCmd.run!({
        args: {
          repoNameOrUrl: `https://github.com/org/${app}`,
          name: app,
          workspace: workspacePath,
        },
      } as any);
    }

    if (opts.group) {
      const pick: SelectAppsFn = async (apps) =>
        opts.groupApps ? apps.filter((a) => opts.groupApps!.includes(a)) : apps;
      await makeWorkspaceAddCommand(mock.git, pick).run!({
        args: { name: opts.group, workspace: workspacePath },
      } as any);
    }

    return {
      workspacePath,
      mock,
      barePath: (app: string) => join(workspacePath, ".bare", app),
      appPath: (app: string) => join(workspacePath, "workspace", opts.group!, app),
    };
  }

  function runStatus(
    workspacePath: string,
    name: string,
    mock: ReturnType<typeof createMockGitBackend>,
    extra: Record<string, unknown> = {},
    runHerdr?: HerdrRunner
  ) {
    const cmd = makeStatusCommand(mock.git, runHerdr ?? (async () => "{}"));
    return withCapturedConsole(() =>
      cmd.run!({ args: { name, workspace: workspacePath, ...extra } } as any)
    );
  }

  test("reports the workspace name and its installed apps with branches", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1", "app2"], group: "feat-x" });

    const logs = await runStatus(workspacePath, "feat-x", mock);
    const out = logs.join("\n");

    expect(out).toContain("workspace: feat-x");
    expect(out).toContain("app1");
    expect(out).toContain("app2");
    expect(out).toContain("feat-x");
  });

  test("stays terse: no version, root, path, herdr or attention block", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

    const logs = await runStatus(workspacePath, "feat-x", mock);
    const out = logs.join("\n");

    expect(out).not.toContain("version:");
    expect(out).not.toContain("root:");
    expect(out).not.toContain("path:");
    expect(out).not.toContain("herdr:");
    expect(out).not.toContain("attention:");
    // workspace line + one app line
    expect(logs).toHaveLength(2);
  });

  test("reports (none) for a workspace with no apps checked out", async () => {
    const { workspacePath, mock } = await setup({ group: "feat-x" });

    const out = (await runStatus(workspacePath, "feat-x", mock)).join("\n");
    expect(out).toContain("workspace: feat-x");
    expect(out).toContain("(none)");
  });

  test("flags branch drift and offers a checkout fix", async () => {
    const { workspacePath, mock, barePath, appPath } = await setup({
      apps: ["app1"],
      group: "feat-x",
    });

    // Simulate gitWorktreeAdd's uniquified-branch fallback.
    mock.getState(barePath("app1"))!.worktrees.set(appPath("app1"), "feat-x-a1b2c3d");

    // The terse view shows the actual branch and marks it; the fix hint is JSON-only.
    const out = (await runStatus(workspacePath, "feat-x", mock)).join("\n");
    expect(out).toContain("feat-x-a1b2c3d");
    expect(out).toContain("[drift]");

    const json = JSON.parse(
      (await runStatus(workspacePath, "feat-x", mock, { json: true })).join("")
    );
    expect(json.apps[0].drift).toBe(true);
    expect(json.attention).toContainEqual(
      expect.objectContaining({
        app: "app1",
        kind: "branch-drift",
        fix: expect.stringContaining("jade checkout feat-x --app app1"),
      })
    );
  });

  test("reports a detached HEAD as detached rather than drift", async () => {
    const { workspacePath, mock, barePath, appPath } = await setup({
      apps: ["app1"],
      group: "feat-x",
    });

    mock.getState(barePath("app1"))!.worktrees.set(appPath("app1"), "HEAD");

    const json = JSON.parse(
      (await runStatus(workspacePath, "feat-x", mock, { json: true })).join("")
    );
    expect(json.apps[0].detached).toBe(true);
    expect(json.apps[0].drift).toBe(false);
    expect(json.attention).toContainEqual(
      expect.objectContaining({ app: "app1", kind: "detached-head" })
    );
  });

  test("reports a dirty working tree in --json only", async () => {
    const { workspacePath, mock, barePath, appPath } = await setup({
      apps: ["app1"],
      group: "feat-x",
    });

    mock
      .getState(barePath("app1"))!
      .statuses.set(appPath("app1"), { staged: 2, unstaged: 3, untracked: 1 });

    const out = (await runStatus(workspacePath, "feat-x", mock)).join("\n");
    expect(out).not.toContain("staged");
    expect(out).not.toContain("untracked");

    const json = JSON.parse(
      (await runStatus(workspacePath, "feat-x", mock, { json: true })).join("")
    );
    expect(json.apps[0].tree).toEqual({ staged: 2, unstaged: 3, untracked: 1, clean: false });
  });

  test("skips the git status call when rendering text", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

    mock.calls.length = 0;
    await runStatus(workspacePath, "feat-x", mock);
    expect(mock.calls.map((c) => c.method)).toContain("currentBranch");
    expect(mock.calls.map((c) => c.method)).not.toContain("status");

    mock.calls.length = 0;
    await runStatus(workspacePath, "feat-x", mock, { json: true });
    expect(mock.calls.map((c) => c.method)).toContain("status");
  });

  test("omits an app with no worktree from text but keeps it in --json", async () => {
    const { workspacePath, mock } = await setup({
      apps: ["app1", "app2"],
      group: "feat-x",
      groupApps: ["app1"],
    });

    const out = (await runStatus(workspacePath, "feat-x", mock)).join("\n");
    expect(out).toContain("app1");
    expect(out).not.toContain("app2");
    expect(out).not.toContain("missing");

    const json = JSON.parse(
      (await runStatus(workspacePath, "feat-x", mock, { json: true })).join("")
    );
    const app2 = json.apps.find((a: { name: string }) => a.name === "app2");
    expect(app2.present).toBe(false);
    expect(app2.tree).toBeNull();
    expect(json.attention).toContainEqual(
      expect.objectContaining({ app: "app2", kind: "missing-worktree" })
    );
  });

  test("flags a missing .env in --json only", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

    // Written after the group exists, so `workspace add` didn't copy it in.
    await mkdir(join(workspacePath, ".env", "app1"), { recursive: true });
    await Bun.write(join(workspacePath, ".env", "app1", ".env"), "KEY=value\n");

    const out = (await runStatus(workspacePath, "feat-x", mock)).join("\n");
    expect(out).not.toContain(".env");

    const json = JSON.parse(
      (await runStatus(workspacePath, "feat-x", mock, { json: true })).join("")
    );
    expect(json.apps[0].env).toEqual({ present: false, sourceAvailable: true });
    expect(json.attention).toContainEqual(
      expect.objectContaining({ app: "app1", kind: "missing-env", fix: "jade env sync" })
    );
  });

  test("does not flag a missing .env when there is no source to sync from", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

    const json = JSON.parse(
      (await runStatus(workspacePath, "feat-x", mock, { json: true })).join("")
    );
    expect(json.apps[0].env).toEqual({ present: false, sourceAvailable: false });
    expect(json.attention).toEqual([]);
  });

  test("reports the main group", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1"] });

    const json = JSON.parse(
      (await runStatus(workspacePath, "main", mock, { json: true })).join("")
    );
    expect(json.workspace).toBe("main");
    expect(json.isMain).toBe(true);
    expect(json.apps[0].present).toBe(true);
  });

  test("exits 1 for an unknown workspace", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

    await expectsExit(() =>
      makeStatusCommand(mock.git, async () => "{}").run!({
        args: { name: "nope", workspace: workspacePath },
      } as any)
    );
  });

  test("survives an app whose git state cannot be read", async () => {
    const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

    const failing = {
      ...mock.git,
      currentBranch: async () => {
        throw new Error("boom");
      },
    };
    const cmd = makeStatusCommand(failing, async () => "{}");
    const out = (
      await withCapturedConsole(() =>
        cmd.run!({ args: { name: "feat-x", workspace: workspacePath } } as any)
      )
    ).join("\n");

    expect(out).toContain("workspace: feat-x");
    expect(out).toContain("(error)");
  });

  describe("herdr state", () => {
    const listOutput = JSON.stringify({
      result: { workspaces: [{ label: "feat-x", workspace_id: "ws_1", focused: true }] },
    });

    test("is absent from --json outside a herdr session", async () => {
      delete process.env.HERDR_ENV;
      const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

      const json = JSON.parse(
        (
          await runStatus(workspacePath, "feat-x", mock, { json: true }, async () => listOutput)
        ).join("")
      );
      expect(json.herdr).toBeUndefined();
    });

    test("reports open and focused in --json inside a herdr session", async () => {
      process.env.HERDR_ENV = "1";
      const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

      const json = JSON.parse(
        (
          await runStatus(workspacePath, "feat-x", mock, { json: true }, async () => listOutput)
        ).join("")
      );
      expect(json.herdr).toEqual({ open: true, focused: true, workspaceId: "ws_1" });
    });

    test("reports not open when herdr has no workspace for the group", async () => {
      process.env.HERDR_ENV = "1";
      const { workspacePath, mock } = await setup({ apps: ["app1"], group: "other" });

      const json = JSON.parse(
        (
          await runStatus(workspacePath, "other", mock, { json: true }, async () => listOutput)
        ).join("")
      );
      expect(json.herdr).toEqual({ open: false, focused: false, workspaceId: null });
    });

    test("--json still renders when herdr is unreachable", async () => {
      process.env.HERDR_ENV = "1";
      const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

      const json = JSON.parse(
        (
          await runStatus(workspacePath, "feat-x", mock, { json: true }, async () => {
            throw new Error("herdr not running");
          })
        ).join("")
      );
      expect(json.workspace).toBe("feat-x");
      expect(json.herdr).toBeUndefined();
    });

    test("the text view never spawns herdr", async () => {
      process.env.HERDR_ENV = "1";
      const { workspacePath, mock } = await setup({ apps: ["app1"], group: "feat-x" });

      let spawned = false;
      const out = (
        await runStatus(workspacePath, "feat-x", mock, {}, async () => {
          spawned = true;
          return listOutput;
        })
      ).join("\n");

      expect(spawned).toBe(false);
      expect(out).toContain("workspace: feat-x");
    });
  });
});

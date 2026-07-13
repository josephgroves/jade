import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { makeUpdateCommand } from "../update.ts";
import { makeAddCommand } from "../add.ts";
import { createTempDir, withCapturedConsole, expectsExit } from "../../test/helpers.ts";
import { createMockGitBackend } from "../../test/mock-git-backend.ts";
import initCommand from "../init.ts";

describe("update command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("pulls all apps in main workspace", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git, calls } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const updateCmd = makeUpdateCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);

    calls.length = 0;

    await updateCmd.run!({ args: { workspace: workspacePath } } as any);

    // pullFF now does `git pull --prune origin <branch>`, which fetches as
    // part of the pull — no separate fetch step is issued.
    const pullCalls = calls.filter((c) => c.method === "pullFF");

    expect(pullCalls.length).toBe(2);
  });

  test("exits when no apps exist", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const updateCmd = makeUpdateCommand(git);

    await expectsExit(() =>
      updateCmd.run!({ args: { workspace: workspacePath } } as any)
    );
  });

  test("quiet mode shows compact summary", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const updateCmd = makeUpdateCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);

    const logs = await withCapturedConsole(() =>
      updateCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("1 updated"))).toBe(true);
    expect(logs.some((l) => l.includes("Updating main workspace"))).toBe(false);
  });

  test("verbose mode shows per-app details", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git } = createMockGitBackend();
    const addCmd = makeAddCommand(git);
    const updateCmd = makeUpdateCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);

    const logs = await withCapturedConsole(() =>
      updateCmd.run!({ args: { workspace: workspacePath, verbose: true } } as any)
    );

    expect(logs.some((l) => l.includes("Updating main workspace"))).toBe(true);
    expect(logs.some((l) => l.includes("Done"))).toBe(true);
  });

  test("reports failed apps without stopping", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "ws");
    await initCommand.run!({ args: { path: workspacePath } } as any);

    const { git, calls } = createMockGitBackend();
    const addCmd = makeAddCommand(git);

    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/alpha", name: "alpha", workspace: workspacePath },
    } as any);
    await addCmd.run!({
      args: { repoNameOrUrl: "https://github.com/org/beta", name: "beta", workspace: workspacePath },
    } as any);

    const failingGit = {
      ...git,
      pullFF: async (cwd: string) => {
        if (cwd.includes("alpha")) throw new Error("dirty worktree");
        calls.push({ method: "pullFF", args: [cwd] });
      },
    };

    const updateCmd = makeUpdateCommand(failingGit);

    const logs = await withCapturedConsole(() =>
      updateCmd.run!({ args: { workspace: workspacePath } } as any)
    );

    expect(logs.some((l) => l.includes("1 updated"))).toBe(true);
    expect(logs.some((l) => l.includes("1 failed"))).toBe(true);
    expect(logs.some((l) => l.includes("dirty worktree"))).toBe(true);
  });
});

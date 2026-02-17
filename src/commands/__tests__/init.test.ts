import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { mkdir, stat } from "fs/promises";
import { join } from "path";
import { readConfig } from "../../utils/config.ts";
import { isValidWorkspace } from "../../utils/workspace.ts";
import initCommand from "../init.ts";
import { createTempDir } from "../../test/helpers.ts";

describe("init command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;
  let exitMock: (code?: number) => never;

  beforeEach(() => {
    exitMock = ((code?: number) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as (code?: number) => never;
  });

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("creates workspace directory structure", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    const originalExit = process.exit;
    process.exit = exitMock;

    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = originalExit;
    }

    expect(await isValidWorkspace(workspacePath)).toBe(true);
    await stat(join(workspacePath, "main"));
    await stat(join(workspacePath, "jade.json"));
  });

  test("jade.json contains correct version and empty apps array", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    const originalExit = process.exit;
    process.exit = exitMock;

    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } finally {
      process.exit = originalExit;
    }

    const config = await readConfig(workspacePath);
    expect(config.version).toBe("1.0");
    expect(config.apps).toEqual([]);
  });

  test("stores orgUrl when provided", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    const originalExit = process.exit;
    process.exit = exitMock;

    try {
      await initCommand.run!({
        args: { path: workspacePath, orgUrl: "https://github.com/myorg" },
      } as any);
    } finally {
      process.exit = originalExit;
    }

    const config = await readConfig(workspacePath);
    expect(config.orgUrl).toBe("https://github.com/myorg");
  });

  test("errors when workspace already exists", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    await mkdir(workspacePath, { recursive: true });
    await mkdir(join(workspacePath, ".bare"), { recursive: true });

    const originalExit = process.exit;
    process.exit = exitMock;

    let exited = false;
    try {
      await initCommand.run!({ args: { path: workspacePath } } as any);
    } catch (e: any) {
      if (e?.message === "EXIT:1") exited = true;
    } finally {
      process.exit = originalExit;
    }

    expect(exited).toBe(true);
  });
});

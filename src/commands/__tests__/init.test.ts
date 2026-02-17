import { describe, test, expect, afterEach } from "bun:test";
import { mkdir, stat } from "fs/promises";
import { join } from "path";
import { readConfig } from "../../utils/config.ts";
import { isValidWorkspace } from "../../utils/workspace.ts";
import initCommand from "../init.ts";
import { createTempDir, expectsExit } from "../../test/helpers.ts";

describe("init command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("creates workspace directory structure", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");

    await initCommand.run!({ args: { path: workspacePath } } as any);

    expect(await isValidWorkspace(workspacePath)).toBe(true);
    await stat(join(workspacePath, "main"));
    await stat(join(workspacePath, "jade.json"));
  });

  test("jade.json contains correct version and empty apps array", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");

    await initCommand.run!({ args: { path: workspacePath } } as any);

    const config = await readConfig(workspacePath);
    expect(config.version).toBe("1.0");
    expect(config.apps).toEqual([]);
  });

  test("stores orgUrl when provided", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");

    await initCommand.run!({
      args: { path: workspacePath, orgUrl: "https://github.com/myorg" },
    } as any);

    const config = await readConfig(workspacePath);
    expect(config.orgUrl).toBe("https://github.com/myorg");
  });

  test("errors when workspace already exists", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    await mkdir(workspacePath, { recursive: true });
    await mkdir(join(workspacePath, ".bare"), { recursive: true });

    await expectsExit(() =>
      initCommand.run!({ args: { path: workspacePath } } as any)
    );
  });
});

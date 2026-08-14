import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { isValidWorkspace } from "../../utils/workspace.ts";
import { makeInitCommand } from "../init.ts";
import { createTempDir, expectsExit } from "../../test/helpers.ts";
import { createMockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";
import { createMockConfigBackend } from "../../test/mock-config-backend.ts";

describe("init command", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("creates workspace directory structure", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    const { fs } = createMockFileSystemBackend();
    const { config, getState } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    expect(await isValidWorkspace(workspacePath, fs)).toBe(true);
    expect(await fs.pathExists(join(workspacePath, "main"))).toBe(true);
    // jade.json is written via ConfigBackend, not FileSystemBackend — verify
    // through the config fake's state rather than fs.pathExists.
    expect(getState(workspacePath)).toBeDefined();
  });

  test("jade.json contains correct version and empty apps array", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({ args: { path: workspacePath } } as any);

    const jadeConfig = await config.readConfig(workspacePath);
    expect(jadeConfig.version).toBe("1.0");
    expect(jadeConfig.apps).toEqual([]);
  });

  test("stores orgUrl when provided", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await initCmd.run!({
      args: { path: workspacePath, orgUrl: "https://github.com/myorg" },
    } as any);

    const jadeConfig = await config.readConfig(workspacePath);
    expect(jadeConfig.orgUrl).toBe("https://github.com/myorg");
  });

  test("errors when workspace already exists", async () => {
    tempDir = await createTempDir();
    const workspacePath = join(tempDir.path, "workspace");
    const { fs } = createMockFileSystemBackend();
    const { config } = createMockConfigBackend();
    const initCmd = makeInitCommand(fs, config);

    await fs.mkdirp(join(workspacePath, ".bare"));

    await expectsExit(() =>
      initCmd.run!({ args: { path: workspacePath } } as any)
    );
  });
});

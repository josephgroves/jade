import { describe, test, expect, afterEach } from "bun:test";
import {
  readConfig,
  writeConfig,
  addAppToConfig,
  removeAppFromConfig,
  getAppName,
  getAppNames,
  getAppDefaultBranch,
} from "../config.ts";
import { realConfigBackend } from "../config-backend.ts";
import { createTempDir } from "../../test/helpers.ts";

describe("config", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("readConfig returns defaults when no jade.json exists", async () => {
    tempDir = await createTempDir();
    const config = await readConfig(tempDir.path);
    expect(config).toEqual({ version: "1.0", apps: [] });
  });

  test("readConfig parses existing jade.json and merges with defaults", async () => {
    tempDir = await createTempDir();
    await Bun.write(
      `${tempDir.path}/jade.json`,
      JSON.stringify({ apps: ["frontend"], orgUrl: "https://github.com/org" })
    );
    const config = await readConfig(tempDir.path);
    expect(config).toEqual({
      version: "1.0",
      apps: ["frontend"],
      orgUrl: "https://github.com/org",
    });
  });

  test("writeConfig creates jade.json correctly", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, { version: "1.0", apps: ["backend"] });
    const config = await readConfig(tempDir.path);
    expect(config).toEqual({ version: "1.0", apps: ["backend"] });
  });

  test("writeConfig updates existing config", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, { apps: ["a"] });
    await writeConfig(tempDir.path, { apps: ["a", "b"] });
    const config = await readConfig(tempDir.path);
    expect(config.apps).toEqual(["a", "b"]);
  });

  test("addAppToConfig appends an app", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, { apps: [] });
    await addAppToConfig(realConfigBackend, tempDir.path, "frontend");
    await addAppToConfig(realConfigBackend, tempDir.path, "backend");
    const config = await readConfig(tempDir.path);
    expect(config.apps).toEqual(["frontend", "backend"]);
  });

  test("addAppToConfig is idempotent (no duplicates)", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, { apps: ["frontend"] });
    await addAppToConfig(realConfigBackend, tempDir.path, "frontend");
    const config = await readConfig(tempDir.path);
    expect(config.apps).toEqual(["frontend"]);
  });

  test("removeAppFromConfig removes an app", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, { apps: ["frontend", "backend"] });
    await removeAppFromConfig(realConfigBackend, tempDir.path, "frontend");
    const config = await readConfig(tempDir.path);
    expect(config.apps).toEqual(["backend"]);
  });

  test("removeAppFromConfig no-ops when app missing", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, { apps: ["frontend"] });
    await removeAppFromConfig(realConfigBackend, tempDir.path, "nonexistent");
    const config = await readConfig(tempDir.path);
    expect(config.apps).toEqual(["frontend"]);
  });

  test("readConfig parses mixed apps (string and object)", async () => {
    tempDir = await createTempDir();
    await Bun.write(
      `${tempDir.path}/jade.json`,
      JSON.stringify({
        apps: ["cms", { name: "media-frontend", defaultBranch: "master" }],
      })
    );
    const config = await readConfig(tempDir.path);
    expect(config.apps).toHaveLength(2);
    expect(getAppNames(config)).toEqual(["cms", "media-frontend"]);
    expect(getAppDefaultBranch(config, "cms")).toBeUndefined();
    expect(getAppDefaultBranch(config, "media-frontend")).toBe("master");
  });

  test("getAppName extracts name from string or object", () => {
    expect(getAppName("frontend")).toBe("frontend");
    expect(getAppName({ name: "backend", defaultBranch: "main" })).toBe("backend");
  });

  test("addAppToConfig with defaultBranch stores as object", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, { apps: [] });
    await addAppToConfig(realConfigBackend, tempDir.path, "legacy-repo", "master");
    const config = await readConfig(tempDir.path);
    expect(config.apps).toEqual([{ name: "legacy-repo", defaultBranch: "master" }]);
  });

  test("removeAppFromConfig works with object entries", async () => {
    tempDir = await createTempDir();
    await writeConfig(tempDir.path, {
      apps: ["a", { name: "b", defaultBranch: "main" }],
    });
    await removeAppFromConfig(realConfigBackend, tempDir.path, "b");
    const config = await readConfig(tempDir.path);
    expect(getAppNames(config)).toEqual(["a"]);
  });
});

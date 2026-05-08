import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { mkdir } from "fs/promises";
import {
  getEnvDirPath,
  getAppEnvSourcePath,
  copyEnvToWorktree,
  syncEnvToGroup,
} from "../env.ts";
import { createTempDir } from "../../test/helpers.ts";

describe("getEnvDirPath", () => {
  test("returns .env at workspace root", () => {
    expect(getEnvDirPath("/ws")).toBe(join("/ws", ".env"));
  });
});

describe("getAppEnvSourcePath", () => {
  test("returns .env/<app>/.env", () => {
    expect(getAppEnvSourcePath("/ws", "api")).toBe(join("/ws", ".env", "api", ".env"));
  });
});

describe("copyEnvToWorktree", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("copies env file when source exists", async () => {
    tempDir = await createTempDir();
    const ws = tempDir.path;
    const envDir = join(ws, ".env", "app");
    const worktree = join(ws, "main", "app");
    await mkdir(envDir, { recursive: true });
    await mkdir(worktree, { recursive: true });
    await Bun.write(join(envDir, ".env"), "API_KEY=secret\n");

    const copied = await copyEnvToWorktree(ws, "app", worktree);

    expect(copied).toBe(true);
    expect(await Bun.file(join(worktree, ".env")).text()).toBe("API_KEY=secret\n");
  });

  test("returns false when source env does not exist", async () => {
    tempDir = await createTempDir();
    const ws = tempDir.path;
    const worktree = join(ws, "main", "app");
    await mkdir(worktree, { recursive: true });

    const copied = await copyEnvToWorktree(ws, "app", worktree);

    expect(copied).toBe(false);
  });

  test("overwrites existing env in worktree", async () => {
    tempDir = await createTempDir();
    const ws = tempDir.path;
    const envDir = join(ws, ".env", "app");
    const worktree = join(ws, "main", "app");
    await mkdir(envDir, { recursive: true });
    await mkdir(worktree, { recursive: true });
    await Bun.write(join(worktree, ".env"), "OLD=value\n");
    await Bun.write(join(envDir, ".env"), "NEW=value\n");

    await copyEnvToWorktree(ws, "app", worktree);

    expect(await Bun.file(join(worktree, ".env")).text()).toBe("NEW=value\n");
  });
});

describe("syncEnvToGroup", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("copies env to all apps in a group", async () => {
    tempDir = await createTempDir();
    const ws = tempDir.path;

    await mkdir(join(ws, ".env", "alpha"), { recursive: true });
    await mkdir(join(ws, ".env", "beta"), { recursive: true });
    await Bun.write(join(ws, ".env", "alpha", ".env"), "A=1\n");
    await Bun.write(join(ws, ".env", "beta", ".env"), "B=2\n");
    await mkdir(join(ws, "main", "alpha"), { recursive: true });
    await mkdir(join(ws, "main", "beta"), { recursive: true });

    const result = await syncEnvToGroup(ws, "main", ["alpha", "beta"]);

    expect(result.copied).toEqual(["main/alpha", "main/beta"]);
    expect(result.skipped).toEqual([]);
    expect(await Bun.file(join(ws, "main", "alpha", ".env")).text()).toBe("A=1\n");
    expect(await Bun.file(join(ws, "main", "beta", ".env")).text()).toBe("B=2\n");
  });

  test("skips apps with no source env", async () => {
    tempDir = await createTempDir();
    const ws = tempDir.path;

    await mkdir(join(ws, ".env", "alpha"), { recursive: true });
    await Bun.write(join(ws, ".env", "alpha", ".env"), "A=1\n");
    await mkdir(join(ws, "main", "alpha"), { recursive: true });
    await mkdir(join(ws, "main", "beta"), { recursive: true });

    const result = await syncEnvToGroup(ws, "main", ["alpha", "beta"]);

    expect(result.copied).toEqual(["main/alpha"]);
    expect(result.skipped).toEqual(["beta"]);
  });

  test("skips apps whose worktree does not exist in the group", async () => {
    tempDir = await createTempDir();
    const ws = tempDir.path;

    await mkdir(join(ws, ".env", "alpha"), { recursive: true });
    await Bun.write(join(ws, ".env", "alpha", ".env"), "A=1\n");

    const result = await syncEnvToGroup(ws, "main", ["alpha"]);

    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  test("handles named workspace groups", async () => {
    tempDir = await createTempDir();
    const ws = tempDir.path;

    await mkdir(join(ws, ".env", "app"), { recursive: true });
    await Bun.write(join(ws, ".env", "app", ".env"), "X=42\n");
    await mkdir(join(ws, "workspace", "feat", "app"), { recursive: true });

    const result = await syncEnvToGroup(ws, "feat", ["app"]);

    expect(result.copied).toEqual(["feat/app"]);
    expect(await Bun.file(join(ws, "workspace", "feat", "app", ".env")).text()).toBe("X=42\n");
  });
});

import { describe, test, expect, afterEach } from "bun:test";
import { mkdir } from "fs/promises";
import { join } from "path";
import {
  findWorkspaceRoot,
  isValidWorkspace,
  getBarePath,
  getMainWorktreePath,
  getConfigPath,
  listBareRepos,
  listWorktreeDirs,
} from "../workspace.ts";
import { createTempDir } from "../../test/helpers.ts";

describe("workspace", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("findWorkspaceRoot finds .bare walking up from nested dir", async () => {
    tempDir = await createTempDir();
    await mkdir(join(tempDir.path, ".bare"), { recursive: true });
    await mkdir(join(tempDir.path, "nested", "deep"), { recursive: true });
    const root = await findWorkspaceRoot(join(tempDir.path, "nested", "deep"));
    expect(root).toBe(tempDir.path);
  });

  test("findWorkspaceRoot returns null when no workspace exists", async () => {
    tempDir = await createTempDir();
    await mkdir(join(tempDir.path, "empty"), { recursive: true });
    const root = await findWorkspaceRoot(join(tempDir.path, "empty"));
    expect(root).toBeNull();
  });

  test("isValidWorkspace returns true when .bare exists", async () => {
    tempDir = await createTempDir();
    await mkdir(join(tempDir.path, ".bare"), { recursive: true });
    const valid = await isValidWorkspace(tempDir.path);
    expect(valid).toBe(true);
  });

  test("isValidWorkspace returns false when .bare missing", async () => {
    tempDir = await createTempDir();
    const valid = await isValidWorkspace(tempDir.path);
    expect(valid).toBe(false);
  });

  test("getBarePath returns expected path", () => {
    const root = "/workspace";
    expect(getBarePath(root)).toEndWith(".bare");
    expect(getBarePath(root)).toContain("workspace");
  });

  test("getMainWorktreePath returns expected path", () => {
    const root = "/workspace";
    expect(getMainWorktreePath(root)).toEndWith("main");
    expect(getMainWorktreePath(root)).toContain("workspace");
  });

  test("getConfigPath returns expected path", () => {
    const root = "/workspace";
    expect(getConfigPath(root)).toEndWith("jade.json");
    expect(getConfigPath(root)).toContain("workspace");
  });

  test("listBareRepos lists only directories in .bare/", async () => {
    tempDir = await createTempDir();
    const barePath = join(tempDir.path, ".bare");
    await mkdir(join(barePath, "app1"), { recursive: true });
    await mkdir(join(barePath, "app2"), { recursive: true });
    await Bun.write(join(barePath, "file.txt"), "ignored");
    const repos = await listBareRepos(tempDir.path);
    expect(repos).toContain("app1");
    expect(repos).toContain("app2");
    expect(repos).not.toContain("file.txt");
  });

  test("listBareRepos returns empty when .bare missing", async () => {
    tempDir = await createTempDir();
    const repos = await listBareRepos(tempDir.path);
    expect(repos).toEqual([]);
  });

  test("listWorktreeDirs lists directories excluding dotfiles and .bare", async () => {
    tempDir = await createTempDir();
    await mkdir(join(tempDir.path, "main"), { recursive: true });
    await mkdir(join(tempDir.path, "feat-auth"), { recursive: true });
    await mkdir(join(tempDir.path, ".bare"), { recursive: true });
    await mkdir(join(tempDir.path, ".hidden"), { recursive: true });
    const dirs = await listWorktreeDirs(tempDir.path);
    expect(dirs).toContain("main");
    expect(dirs).toContain("feat-auth");
    expect(dirs).not.toContain(".bare");
    expect(dirs).not.toContain(".hidden");
  });

  test("listWorktreeDirs returns empty when workspace missing", async () => {
    tempDir = await createTempDir();
    const dirs = await listWorktreeDirs(join(tempDir.path, "nonexistent"));
    expect(dirs).toEqual([]);
  });
});

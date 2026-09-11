import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { mkdir, writeFile as nodeWriteFile } from "fs/promises";
import { createMockFileSystemBackend } from "../mock-filesystem-backend.ts";
import { createTempDir } from "../helpers.ts";

describe("createMockFileSystemBackend", () => {
  describe("purely virtual operations", () => {
    test("pathExists is false for an untouched path", async () => {
      const { fs } = createMockFileSystemBackend();
      expect(await fs.pathExists("/never/touched")).toBe(false);
    });

    test("mkdirp makes the path and its ancestors exist virtually", async () => {
      const { fs } = createMockFileSystemBackend();
      await fs.mkdirp("/a/b/c");
      expect(await fs.pathExists("/a/b/c")).toBe(true);
      expect(await fs.pathExists("/a/b")).toBe(true);
      expect(await fs.pathExists("/a")).toBe(true);
    });

    test("writeFile creates the file and its parent directories", async () => {
      const { fs, getFileContent } = createMockFileSystemBackend();
      await fs.writeFile("/a/b/file.txt", "hello");
      expect(await fs.pathExists("/a/b/file.txt")).toBe(true);
      expect(await fs.pathExists("/a/b")).toBe(true);
      expect(getFileContent("/a/b/file.txt")).toBe("hello");
    });

    test("copyFile copies virtual content written by this fake", async () => {
      const { fs, getFileContent } = createMockFileSystemBackend();
      await fs.writeFile("/src/file.txt", "content");
      await fs.copyFile("/src/file.txt", "/dest/file.txt");
      expect(getFileContent("/dest/file.txt")).toBe("content");
    });

    test("copyFile throws if the source doesn't exist virtually or really", async () => {
      const { fs } = createMockFileSystemBackend();
      await expect(fs.copyFile("/nope/source.txt", "/dest/file.txt")).rejects.toThrow();
    });

    test("remove tombstones the path and all virtual descendants", async () => {
      const { fs } = createMockFileSystemBackend();
      await fs.mkdirp("/a/b");
      await fs.writeFile("/a/b/file.txt", "content");
      await fs.remove("/a");
      expect(await fs.pathExists("/a")).toBe(false);
      expect(await fs.pathExists("/a/b")).toBe(false);
      expect(await fs.pathExists("/a/b/file.txt")).toBe(false);
    });

    test("a later create clears a stale tombstone for the exact path", async () => {
      const { fs } = createMockFileSystemBackend();
      await fs.mkdirp("/a");
      await fs.remove("/a");
      expect(await fs.pathExists("/a")).toBe(false);
      await fs.mkdirp("/a");
      expect(await fs.pathExists("/a")).toBe(true);
    });

    test("listDirectories lists only immediate virtual children", async () => {
      const { fs } = createMockFileSystemBackend();
      await fs.mkdirp("/root/dir-a");
      await fs.mkdirp("/root/dir-b/nested");
      await fs.writeFile("/root/file.txt", "x");
      expect(await fs.listDirectories("/root")).toEqual(["dir-a", "dir-b"]);
    });

    test("listDirectories skips virtual dotfile directories", async () => {
      const { fs } = createMockFileSystemBackend();
      await fs.mkdirp("/root/visible");
      await fs.mkdirp("/root/.hidden");
      expect(await fs.listDirectories("/root")).toEqual(["visible"]);
    });

    test("listDirectories excludes removed children", async () => {
      const { fs } = createMockFileSystemBackend();
      await fs.mkdirp("/root/dir-a");
      await fs.mkdirp("/root/dir-b");
      await fs.remove("/root/dir-b");
      expect(await fs.listDirectories("/root")).toEqual(["dir-a"]);
    });
  });

  describe("real-disk fallback (reconciling with side effects from other fakes)", () => {
    let tempDir: Awaited<ReturnType<typeof createTempDir>>;

    afterEach(async () => {
      if (tempDir) await tempDir.cleanup();
    });

    test("pathExists sees a real directory the fake never created", async () => {
      tempDir = await createTempDir();
      const realDir = join(tempDir.path, "created-by-something-else");
      await mkdir(realDir, { recursive: true });

      const { fs } = createMockFileSystemBackend();
      expect(await fs.pathExists(realDir)).toBe(true);
    });

    test("listDirectories includes real children alongside virtual ones", async () => {
      tempDir = await createTempDir();
      await mkdir(join(tempDir.path, "real-dir"), { recursive: true });

      const { fs } = createMockFileSystemBackend();
      await fs.mkdirp(join(tempDir.path, "virtual-dir"));

      expect(await fs.listDirectories(tempDir.path)).toEqual(["real-dir", "virtual-dir"]);
    });

    test("remove tombstones a path even though a real directory exists there", async () => {
      tempDir = await createTempDir();
      const realDir = join(tempDir.path, "real-dir");
      await mkdir(realDir, { recursive: true });

      const { fs } = createMockFileSystemBackend();
      expect(await fs.pathExists(realDir)).toBe(true);
      await fs.remove(realDir);
      expect(await fs.pathExists(realDir)).toBe(false);
    });

    test("copyFile falls back to reading a real source file not created by the fake", async () => {
      tempDir = await createTempDir();
      const realSource = join(tempDir.path, "real-source.txt");
      await nodeWriteFile(realSource, "real content", "utf8");

      const { fs, getFileContent } = createMockFileSystemBackend();
      await fs.copyFile(realSource, join(tempDir.path, "dest.txt"));
      expect(getFileContent(join(tempDir.path, "dest.txt"))).toBe("real content");
    });
  });

  test("calls records every method invocation", async () => {
    const { fs, calls } = createMockFileSystemBackend();
    await fs.mkdirp("/a");
    await fs.pathExists("/a");
    expect(calls).toEqual([
      { method: "mkdirp", args: ["/a"] },
      { method: "pathExists", args: ["/a"] },
    ]);
  });
});

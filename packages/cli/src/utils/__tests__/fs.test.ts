import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { readFile } from "fs/promises";
import { fsExists, fsMkdirp, fsRemove, fsCopyFile, fsWriteFile, fsListDirectories } from "../fs.ts";
import { createTempDir } from "../../test/helpers.ts";

describe("fs", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  describe("fsExists", () => {
    test("returns false for a path that doesn't exist", async () => {
      tempDir = await createTempDir();
      expect(await fsExists(join(tempDir.path, "nope"))).toBe(false);
    });

    test("returns true for a file and a directory", async () => {
      tempDir = await createTempDir();
      await fsMkdirp(join(tempDir.path, "adir"));
      await fsWriteFile(join(tempDir.path, "afile.txt"), "hi");
      expect(await fsExists(join(tempDir.path, "adir"))).toBe(true);
      expect(await fsExists(join(tempDir.path, "afile.txt"))).toBe(true);
    });
  });

  describe("fsMkdirp", () => {
    test("creates nested directories that don't exist yet", async () => {
      tempDir = await createTempDir();
      const nested = join(tempDir.path, "a", "b", "c");
      await fsMkdirp(nested);
      expect(await fsExists(nested)).toBe(true);
    });

    test("is a no-op if the directory already exists", async () => {
      tempDir = await createTempDir();
      await fsMkdirp(tempDir.path);
      await fsMkdirp(tempDir.path);
      expect(await fsExists(tempDir.path)).toBe(true);
    });
  });

  describe("fsRemove", () => {
    test("removes a directory and everything under it", async () => {
      tempDir = await createTempDir();
      const nested = join(tempDir.path, "a", "b");
      await fsMkdirp(nested);
      await fsWriteFile(join(nested, "file.txt"), "content");
      await fsRemove(join(tempDir.path, "a"));
      expect(await fsExists(join(tempDir.path, "a"))).toBe(false);
    });

    test("is a no-op (does not throw) if the path doesn't exist", async () => {
      tempDir = await createTempDir();
      await fsRemove(join(tempDir.path, "nonexistent"));
    });
  });

  describe("fsCopyFile", () => {
    test("copies file contents to the destination", async () => {
      tempDir = await createTempDir();
      const source = join(tempDir.path, "source.txt");
      const dest = join(tempDir.path, "dest.txt");
      await fsWriteFile(source, "hello world");
      await fsCopyFile(source, dest);
      expect(await readFile(dest, "utf8")).toBe("hello world");
    });

    test("throws if the source doesn't exist", async () => {
      tempDir = await createTempDir();
      await expect(
        fsCopyFile(join(tempDir.path, "missing.txt"), join(tempDir.path, "dest.txt"))
      ).rejects.toThrow();
    });
  });

  describe("fsWriteFile", () => {
    test("creates parent directories that don't exist yet", async () => {
      tempDir = await createTempDir();
      const target = join(tempDir.path, "nested", "dir", "file.txt");
      await fsWriteFile(target, "content");
      expect(await readFile(target, "utf8")).toBe("content");
    });

    test("overwrites an existing file", async () => {
      tempDir = await createTempDir();
      const target = join(tempDir.path, "file.txt");
      await fsWriteFile(target, "first");
      await fsWriteFile(target, "second");
      expect(await readFile(target, "utf8")).toBe("second");
    });
  });

  describe("fsListDirectories", () => {
    test("returns [] for a path that doesn't exist", async () => {
      tempDir = await createTempDir();
      expect(await fsListDirectories(join(tempDir.path, "nope"))).toEqual([]);
    });

    test("lists only immediate subdirectories, not files", async () => {
      tempDir = await createTempDir();
      await fsMkdirp(join(tempDir.path, "dir-a"));
      await fsMkdirp(join(tempDir.path, "dir-b"));
      await fsWriteFile(join(tempDir.path, "file.txt"), "content");
      const dirs = await fsListDirectories(tempDir.path);
      expect(dirs.sort()).toEqual(["dir-a", "dir-b"]);
    });

    test("does not recurse into nested subdirectories", async () => {
      tempDir = await createTempDir();
      await fsMkdirp(join(tempDir.path, "dir-a", "nested"));
      const dirs = await fsListDirectories(tempDir.path);
      expect(dirs).toEqual(["dir-a"]);
    });

    test("skips dotfile entries", async () => {
      tempDir = await createTempDir();
      await fsMkdirp(join(tempDir.path, "visible"));
      await fsMkdirp(join(tempDir.path, ".hidden"));
      const dirs = await fsListDirectories(tempDir.path);
      expect(dirs).toEqual(["visible"]);
    });
  });
});

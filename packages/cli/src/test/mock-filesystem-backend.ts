import { dirname, resolve, basename, sep } from "path";
import { readFile } from "fs/promises";
import type { FileSystemBackend } from "../utils/fs-backend.ts";
import { fsExists, fsListDirectories, fsRemove } from "../utils/fs.ts";

type VirtualEntry = { type: "dir" } | { type: "file"; content: string };

/**
 * Mock FileSystemBackend that simulates filesystem effects with in-memory state
 * instead of touching real disk, but falls back to the real filesystem for
 * `pathExists`/`listDirectories` when a path was never touched through this fake.
 *
 * This hybrid behavior is intentional: GitBackend's own test fake
 * (createMockGitBackend) still does *real* mkdir/rm under the hood (e.g.
 * worktreeAdd creates a real worktree directory), so a purely virtual
 * filesystem would make commands that check `fs.pathExists` on a
 * git-fake-created path incorrectly see it as missing. mkdirp/writeFile/
 * copyFile are genuinely disk-free; pathExists/listDirectories reconcile
 * virtual state with whatever real side effects other fakes left behind.
 *
 * Usage in tests:
 *
 *   const { fs } = createMockFileSystemBackend();
 *   const cmd = makeAddCommand(git, fs, config);
 *   await cmd.run!({ args: { ... } } as any);
 *   expect(await fs.pathExists("/path/to/thing")).toBe(true);
 */
export interface MockFileSystemBackend {
  fs: FileSystemBackend;
  /** Read back the virtual content written via writeFile/copyFile (undefined if not virtual) */
  getFileContent(path: string): string | undefined;
  /** Calls recorded on the backend (for assertion purposes) */
  calls: { method: string; args: unknown[] }[];
}

function ancestorChain(path: string): string[] {
  const normalized = resolve(path);
  const root = resolve("/");
  const chain: string[] = [];
  let current = normalized;
  while (true) {
    chain.push(current);
    if (current === root) break;
    current = dirname(current);
  }
  return chain;
}

export function createMockFileSystemBackend(): MockFileSystemBackend {
  const entries = new Map<string, VirtualEntry>();
  const removed = new Set<string>();
  const calls: { method: string; args: unknown[] }[] = [];

  function record(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  function materializeDir(path: string) {
    for (const ancestor of ancestorChain(path)) {
      entries.set(ancestor, { type: "dir" });
      removed.delete(ancestor);
    }
  }

  function setFile(path: string, content: string) {
    const normalized = resolve(path);
    materializeDir(dirname(normalized));
    entries.set(normalized, { type: "file", content });
    removed.delete(normalized);
  }

  const fs: FileSystemBackend = {
    /**
     * Purely virtual: materializes the path and every ancestor as a directory.
     */
    async mkdirp(path: string): Promise<void> {
      record("mkdirp", path);
      materializeDir(path);
    },

    /**
     * Checks the virtual tombstone/entry map first, then falls back to the
     * real filesystem — reconciles with real side effects from other fakes
     * (e.g. GitBackend's worktreeAdd/cloneBare, which create real directories).
     */
    async pathExists(path: string): Promise<boolean> {
      record("pathExists", path);
      const normalized = resolve(path);
      if (removed.has(normalized)) return false;
      if (entries.has(normalized)) return true;
      return await fsExists(path);
    },

    /**
     * Tombstones the path and every virtual descendant, and best-effort
     * removes the real path too (force:true, so it's safe even if nothing
     * real exists there) — cleans up real directories other fakes created
     * under this path rather than just hiding them.
     */
    async remove(path: string): Promise<void> {
      record("remove", path);
      const normalized = resolve(path);
      removed.add(normalized);
      const prefix = normalized + sep;
      for (const key of Array.from(entries.keys())) {
        if (key === normalized || key.startsWith(prefix)) {
          entries.delete(key);
        }
      }
      await fsRemove(path);
    },

    /**
     * Reads content from the virtual entry if this fake created the source;
     * otherwise falls back to reading the real file (covers sources seeded
     * outside the fake, e.g. by test setup that still touches real disk).
     */
    async copyFile(source: string, dest: string): Promise<void> {
      record("copyFile", source, dest);
      const normalizedSource = resolve(source);
      const virtualSource = removed.has(normalizedSource) ? undefined : entries.get(normalizedSource);

      let content: string;
      if (virtualSource?.type === "file") {
        content = virtualSource.content;
      } else if (!removed.has(normalizedSource) && (await fsExists(source))) {
        content = await readFile(source, "utf8");
      } else {
        throw new Error(`ENOENT: no such file or directory, copyfile '${source}' -> '${dest}'`);
      }

      setFile(dest, content);
    },

    /**
     * Purely virtual write; always creates parent directories, matching the
     * real fsWriteFile's guarantee.
     */
    async writeFile(path: string, contents: string): Promise<void> {
      record("writeFile", path, contents);
      setFile(path, contents);
    },

    /**
     * Union of virtual directory children and real directory children
     * (via fsListDirectories), minus anything tombstoned. Dotfiles are
     * skipped on both sides, matching fsListDirectories' real behavior.
     */
    async listDirectories(path: string): Promise<string[]> {
      record("listDirectories", path);
      const normalized = resolve(path);
      const names = new Set<string>();

      if (removed.has(normalized)) return [];

      for (const [entryPath, entry] of entries) {
        if (entry.type !== "dir") continue;
        if (entryPath === normalized) continue;
        if (removed.has(entryPath)) continue;
        if (dirname(entryPath) !== normalized) continue;
        const name = basename(entryPath);
        if (name.startsWith(".")) continue;
        names.add(name);
      }

      if (await fsExists(path)) {
        for (const name of await fsListDirectories(path)) {
          if (!removed.has(resolve(path, name))) {
            names.add(name);
          }
        }
      }

      return Array.from(names).sort();
    },
  };

  return {
    fs,
    getFileContent(path) {
      const normalized = resolve(path);
      if (removed.has(normalized)) return undefined;
      const entry = entries.get(normalized);
      return entry?.type === "file" ? entry.content : undefined;
    },
    calls,
  };
}

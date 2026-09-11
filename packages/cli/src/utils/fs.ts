import { stat, copyFile as nodeCopyFile, mkdir, rm as nodeRm, writeFile as nodeWriteFile } from "fs/promises";
import { dirname, resolve } from "path";

/**
 * Check if a path exists (file or directory)
 */
export async function fsExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a directory and any missing parent directories (mkdir -p)
 */
export async function fsMkdirp(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Remove a path and everything under it (rm -rf)
 */
export async function fsRemove(path: string): Promise<void> {
  await nodeRm(path, { recursive: true, force: true });
}

/**
 * Copy a file from source to dest
 */
export async function fsCopyFile(source: string, dest: string): Promise<void> {
  await nodeCopyFile(source, dest);
}

/**
 * Write text contents to a file, creating parent directories as needed
 */
export async function fsWriteFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await nodeWriteFile(path, contents, "utf8");
}

/**
 * List the immediate subdirectory names of a path (non-recursive).
 * Dotfile entries are skipped. Returns [] if the path doesn't exist.
 */
export async function fsListDirectories(path: string): Promise<string[]> {
  if (!(await fsExists(path))) return [];

  try {
    const glob = new Bun.Glob("*");
    const entries = Array.from(glob.scanSync({ cwd: path, onlyFiles: false }));

    const directories: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;

      try {
        const stats = await stat(resolve(path, entry));
        if (stats.isDirectory()) {
          directories.push(entry);
        }
      } catch {
        // Ignore entries that can't be stat'd
      }
    }
    return directories;
  } catch {
    return [];
  }
}

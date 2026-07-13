import { resolve, dirname, relative, sep } from "path";
import { stat } from "fs/promises";

/**
 * Check if a path exists (file or directory)
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the workspace root by walking up from cwd looking for .bare directory
 */
export async function findWorkspaceRoot(startPath: string = process.cwd()): Promise<string | null> {
  let current = resolve(startPath);
  const root = resolve("/");

  while (current !== root) {
    const barePath = resolve(current, ".bare");
    if (await pathExists(barePath)) {
      return current;
    }
    current = dirname(current);
  }

  return null;
}

/**
 * Validate that a path is a valid workspace (has .bare directory)
 */
export async function isValidWorkspace(path: string): Promise<boolean> {
  return await pathExists(resolve(path, ".bare"));
}

/**
 * Get the path to the .bare directory
 */
export function getBarePath(workspaceRoot: string): string {
  return resolve(workspaceRoot, ".bare");
}

/**
 * Get the path to the main worktree
 */
export function getMainWorktreePath(workspaceRoot: string): string {
  return resolve(workspaceRoot, "main");
}

/**
 * Get the path to the workspace/ directory that contains non-main worktree groups
 */
export function getWorktreeContainerPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, "workspace");
}

/**
 * Get the full path for a named worktree group.
 * "main" lives at the workspace root; all others live under workspace/.
 */
export function getWorktreeGroupPath(workspaceRoot: string, groupName: string): string {
  if (groupName === "main") return resolve(workspaceRoot, "main");
  return resolve(workspaceRoot, "workspace", groupName);
}

/**
 * Determine which worktree group a path lives in, relative to the workspace root.
 * "main" lives at <root>/main; all other groups live at <root>/workspace/<name>.
 * Returns null when the path is outside any group (e.g. the workspace root itself,
 * the .bare directory, or a path outside the workspace).
 */
export function getCurrentGroup(workspaceRoot: string, path: string): string | null {
  const rel = relative(workspaceRoot, resolve(path));
  if (rel === "" || rel.startsWith("..")) return null;

  const parts = rel.split(sep);
  if (parts[0] === "main") return "main";
  if (parts[0] === "workspace" && parts[1]) return parts[1];
  return null;
}

/**
 * Get the path to the config file
 */
export function getConfigPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, "jade.json");
}

/**
 * List all bare repositories in the .bare directory
 */
export async function listBareRepos(workspaceRoot: string): Promise<string[]> {
  const barePath = getBarePath(workspaceRoot);
  
  if (!await pathExists(barePath)) {
    return [];
  }

  try {
    const glob = new Bun.Glob("*");
    const entries = Array.from(glob.scanSync({ cwd: barePath, onlyFiles: false }));
    
    // Filter to only directories
    const directories: string[] = [];
    for (const entry of entries) {
      const fullPath = resolve(barePath, entry);
      try {
        const stats = await stat(fullPath);
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

/**
 * List all worktree group names in the workspace.
 * "main" is included first if it exists at the workspace root.
 * All other groups are discovered inside the workspace/ subdirectory.
 */
export async function listWorktreeDirs(workspaceRoot: string): Promise<string[]> {
  if (!await pathExists(workspaceRoot)) {
    return [];
  }

  const directories: string[] = [];

  if (await pathExists(resolve(workspaceRoot, "main"))) {
    directories.push("main");
  }

  const containerPath = getWorktreeContainerPath(workspaceRoot);
  if (!await pathExists(containerPath)) {
    return directories;
  }

  try {
    const glob = new Bun.Glob("*");
    const entries = Array.from(glob.scanSync({ cwd: containerPath, onlyFiles: false }));

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;

      const fullPath = resolve(containerPath, entry);
      try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
          directories.push(entry);
        }
      } catch {
        // Ignore entries that can't be stat'd
      }
    }
  } catch {
    // workspace/ doesn't exist or can't be read — no non-main groups
  }

  return directories;
}

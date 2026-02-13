import { resolve, dirname } from "path";
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
 * List all worktree directories in the workspace root
 * Excludes .bare, jade.json, and dotfiles
 */
export async function listWorktreeDirs(workspaceRoot: string): Promise<string[]> {
  if (!await pathExists(workspaceRoot)) {
    return [];
  }

  try {
    const glob = new Bun.Glob("*");
    const entries = Array.from(glob.scanSync({ cwd: workspaceRoot, onlyFiles: false }));
    
    // Filter to only directories, excluding dotfiles and .bare
    const directories: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === ".bare") continue;
      
      const fullPath = resolve(workspaceRoot, entry);
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

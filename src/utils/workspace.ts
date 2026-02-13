import { existsSync } from "fs";
import { resolve, dirname } from "path";

/**
 * Find the workspace root by walking up from cwd looking for .bare directory
 */
export function findWorkspaceRoot(startPath: string = process.cwd()): string | null {
  let current = resolve(startPath);
  const root = resolve("/");

  while (current !== root) {
    const barePath = resolve(current, ".bare");
    if (existsSync(barePath)) {
      return current;
    }
    current = dirname(current);
  }

  return null;
}

/**
 * Validate that a path is a valid workspace (has .bare directory)
 */
export function isValidWorkspace(path: string): boolean {
  return existsSync(resolve(path, ".bare"));
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

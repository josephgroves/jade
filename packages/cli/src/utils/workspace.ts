import { resolve, dirname, relative, sep } from "path";
import { type FileSystemBackend, realFileSystemBackend } from "./fs-backend.ts";

/**
 * Find the workspace root by walking up from cwd looking for .bare directory
 */
export async function findWorkspaceRoot(
  startPath: string = process.cwd(),
  fs: FileSystemBackend = realFileSystemBackend
): Promise<string | null> {
  let current = resolve(startPath);
  const root = resolve("/");

  while (current !== root) {
    const barePath = resolve(current, ".bare");
    if (await fs.pathExists(barePath)) {
      return current;
    }
    current = dirname(current);
  }

  return null;
}

/**
 * Validate that a path is a valid workspace (has .bare directory)
 */
export async function isValidWorkspace(
  path: string,
  fs: FileSystemBackend = realFileSystemBackend
): Promise<boolean> {
  return await fs.pathExists(resolve(path, ".bare"));
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
export async function listBareRepos(
  workspaceRoot: string,
  fs: FileSystemBackend = realFileSystemBackend
): Promise<string[]> {
  const barePath = getBarePath(workspaceRoot);

  if (!await fs.pathExists(barePath)) {
    return [];
  }

  return await fs.listDirectories(barePath);
}

/**
 * List all worktree group names in the workspace.
 * "main" is included first if it exists at the workspace root.
 * All other groups are discovered inside the workspace/ subdirectory.
 */
export async function listWorktreeDirs(
  workspaceRoot: string,
  fs: FileSystemBackend = realFileSystemBackend
): Promise<string[]> {
  if (!await fs.pathExists(workspaceRoot)) {
    return [];
  }

  const directories: string[] = [];

  if (await fs.pathExists(resolve(workspaceRoot, "main"))) {
    directories.push("main");
  }

  const containerPath = getWorktreeContainerPath(workspaceRoot);
  if (!await fs.pathExists(containerPath)) {
    return directories;
  }

  directories.push(...(await fs.listDirectories(containerPath)));

  return directories;
}

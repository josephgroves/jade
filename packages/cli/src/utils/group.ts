import { resolve } from "path";
import { getWorktreeGroupPath, listBareRepos } from "./workspace.ts";
import { getAppNames, readConfig } from "./config.ts";
import { type FileSystemBackend, realFileSystemBackend } from "./fs-backend.ts";

/**
 * Lives in its own module rather than workspace.ts: config.ts already imports
 * workspace.ts, so resolving a group (which needs jade.json for app ordering)
 * from there would introduce a circular import.
 */

export interface ResolvedApp {
  name: string;
  /** Absolute path the app's worktree would live at, whether or not it exists */
  path: string;
  /** Whether a worktree for this app actually exists in this group */
  present: boolean;
}

export interface ResolvedGroup {
  name: string;
  path: string;
  isMain: boolean;
  /** Whether the group directory itself exists */
  exists: boolean;
  apps: ResolvedApp[];
}

/**
 * Resolve a worktree group into its path plus the apps jade manages for it,
 * flagging which ones are actually checked out here.
 *
 * Apps are ordered by jade.json (the order they were added) so output stays
 * stable and matches the tab order `jade open` uses; any bare repo missing from
 * the config is appended alphabetically. Apps jade knows about but that have no
 * worktree in this group are still returned, with present: false — that gap is
 * exactly what callers want to report.
 */
export async function resolveGroup(
  workspaceRoot: string,
  groupName: string,
  fs: FileSystemBackend = realFileSystemBackend
): Promise<ResolvedGroup> {
  const groupPath = getWorktreeGroupPath(workspaceRoot, groupName);

  const configOrder = getAppNames(await readConfig(workspaceRoot));
  const bareRepos = await listBareRepos(workspaceRoot, fs);

  const ordered: string[] = [];
  for (const name of [...configOrder, ...bareRepos.slice().sort()]) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  const apps = await Promise.all(
    ordered.map(async (name) => {
      const appPath = resolve(groupPath, name);
      return { name, path: appPath, present: await fs.pathExists(appPath) };
    })
  );

  return {
    name: groupName,
    path: groupPath,
    isMain: groupName === "main",
    exists: await fs.pathExists(groupPath),
    apps,
  };
}

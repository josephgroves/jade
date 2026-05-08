import { resolve } from "path";
import { copyFile, stat } from "fs/promises";
import { getWorktreeGroupPath } from "./workspace.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function getEnvDirPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, ".env");
}

export function getAppEnvSourcePath(workspaceRoot: string, appName: string): string {
  return resolve(workspaceRoot, ".env", appName, ".env");
}

export async function copyEnvToWorktree(
  workspaceRoot: string,
  appName: string,
  worktreePath: string
): Promise<boolean> {
  const sourcePath = getAppEnvSourcePath(workspaceRoot, appName);
  if (!await pathExists(sourcePath)) return false;

  const destPath = resolve(worktreePath, ".env");
  await copyFile(sourcePath, destPath);
  return true;
}

export interface SyncResult {
  copied: string[];
  skipped: string[];
}

export async function syncEnvToGroup(
  workspaceRoot: string,
  groupName: string,
  appNames: readonly string[]
): Promise<SyncResult> {
  const groupPath = getWorktreeGroupPath(workspaceRoot, groupName);
  const copied: string[] = [];
  const skipped: string[] = [];

  for (const appName of appNames) {
    const worktreePath = resolve(groupPath, appName);
    if (!await pathExists(worktreePath)) continue;

    const didCopy = await copyEnvToWorktree(workspaceRoot, appName, worktreePath);
    if (didCopy) {
      copied.push(`${groupName}/${appName}`);
    } else {
      skipped.push(appName);
    }
  }

  return { copied, skipped };
}

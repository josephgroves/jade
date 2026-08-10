import { defineCommand } from "citty";
import { resolve } from "path";
import { intro, outro, cancel, log, spinner, multiselect, isCancel } from "@clack/prompts";
import { findWorkspaceRoot, getBarePath, getWorktreeGroupPath, listBareRepos, listWorktreeDirs } from "../utils/workspace.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";
import { copyEnvToWorktree } from "../utils/env.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";

export type SelectAppsFn = (apps: string[]) => Promise<string[] | symbol>;

const defaultSelectApps: SelectAppsFn = (apps) =>
  multiselect({
    message: "Select apps to add to this workspace",
    options: apps.map((a) => ({ value: a, label: a })),
    required: true,
  }) as Promise<string[] | symbol>;

async function resolveSelectedApps(
  bareRepos: string[],
  all: boolean,
  selectApps: SelectAppsFn
): Promise<string[] | null> {
  if (all) return bareRepos;
  const result = await selectApps(bareRepos);
  if (isCancel(result) || !Array.isArray(result) || result.length === 0) return null;
  return result;
}

export function makeWorkspaceAddCommand(
  git: GitBackend = realGitBackend,
  selectApps: SelectAppsFn = defaultSelectApps,
  fs: FileSystemBackend = realFileSystemBackend
) {
  return defineCommand({
    meta: {
      name: "add",
      description: "Create a new workspace",
    },
    args: {
      name: {
        type: "positional",
        description: "Workspace name (also used as branch name for apps)",
        required: true,
      },
      all: {
        type: "boolean",
        alias: "a",
        description: "Add all apps to the workspace without prompting",
        default: false,
      },
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path",
      },
    },
    async run({ args }) {
      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot(process.cwd(), fs);

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const name = args.name as string;
      const all = args.all as boolean;
      const worktreeDirPath = getWorktreeGroupPath(workspaceRoot, name);
      const existing = await fs.pathExists(worktreeDirPath);

      intro(existing ? `Adding apps to workspace '${name}'` : `Creating workspace`);

      try {
        await fs.mkdirp(worktreeDirPath);

        const bareRepos = await listBareRepos(workspaceRoot, fs);
        const barePath = getBarePath(workspaceRoot);

        const presentApps = existing
          ? await Promise.all(bareRepos.map(async (app) => ({ app, exists: await fs.pathExists(resolve(worktreeDirPath, app)) })))
              .then((results) => results.filter((r) => r.exists).map((r) => r.app))
          : [];

        const candidateApps = bareRepos.filter((app) => !presentApps.includes(app));

        if (bareRepos.length === 0) {
          log.success(`Created empty workspace directory workspace/${name}`);
          log.warn(`No apps found. Add apps with 'jade add <repo-url>'`);
          outro(`Done`);
          return;
        }

        if (existing && candidateApps.length === 0) {
          cancel(`All apps are already in workspace '${name}'`);
          process.exit(1);
        }

        const selectedApps = await resolveSelectedApps(candidateApps, all, selectApps);

        if (!selectedApps) {
          if (!existing) await fs.remove(worktreeDirPath);
          cancel(`No apps selected. Aborting.`);
          process.exit(1);
        }

        const created: string[] = [];
        const skipped: string[] = [];
        const s = spinner();
        s.start(`Setting up apps for '${name}'`);

        for (const appName of selectedApps) {
          const bareRepoPath = resolve(barePath, appName);
          const appWorktreePath = resolve(worktreeDirPath, appName);

          try {
            const actualBranch = await git.worktreeAdd(bareRepoPath, appWorktreePath, name);
            created.push(actualBranch !== name ? `${appName} (${actualBranch})` : appName);
            s.message(`Added ${appName}`);
          } catch (error) {
            log.warn(`Could not add ${appName}: ${error}`);
            skipped.push(appName);
          }
        }

        s.stop(`Apps added`);

        const envCopied: string[] = [];
        for (const appName of selectedApps) {
          const appWorktreePath = resolve(worktreeDirPath, appName);
          if (await copyEnvToWorktree(workspaceRoot, appName, appWorktreePath, fs)) {
            envCopied.push(appName);
          }
        }

        if (created.length > 0) {
          log.success(`Created in workspace/${name}/: ${created.join(", ")}`);
        }
        if (envCopied.length > 0) {
          log.success(`Copied .env for: ${envCopied.join(", ")}`);
        }
        if (skipped.length > 0) {
          log.warn(`Skipped: ${skipped.join(", ")}`);
        }

        outro(`Workspace '${name}' ready! Next: cd workspace/${name}`);
      } catch (error) {
        cancel(`Failed to create workspace: ${error}`);
        process.exit(1);
      }
    },
  });
}

export const addCommand = makeWorkspaceAddCommand();

export function makeWorkspaceListCommand(
  git: GitBackend = realGitBackend,
  fs: FileSystemBackend = realFileSystemBackend
) {
  return defineCommand({
    meta: {
      name: "list",
      description: "List all workspaces",
    },
    args: {
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path",
      },
      json: {
        type: "boolean",
        description: "Print machine-readable JSON instead of plain text",
        default: false,
      },
    },
    async run({ args }) {
      const asJson = args.json as boolean;
      if (!asJson) intro(`Workspaces`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot(process.cwd(), fs);

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      try {
        const worktreeDirs = await listWorktreeDirs(workspaceRoot, fs);
        const bareRepos = await listBareRepos(workspaceRoot, fs);

        if (worktreeDirs.length === 0) {
          if (asJson) {
            console.log(JSON.stringify({ groups: [] }));
          } else {
            outro(`No workspaces found.`);
          }
          return;
        }

        const groups: { name: string; apps: { name: string; branch: string }[] }[] = [];

        for (const dirName of worktreeDirs) {
          const lines: string[] = [];
          const apps: { name: string; branch: string }[] = [];
          for (const appName of bareRepos) {
            const appPath = resolve(getWorktreeGroupPath(workspaceRoot, dirName), appName);
            if (await fs.pathExists(appPath)) {
              try {
                const branch = await git.currentBranch(appPath);
                lines.push(`${appName.padEnd(30)} (${branch})`);
                apps.push({ name: appName, branch });
              } catch {
                lines.push(`${appName.padEnd(30)} (error reading branch)`);
                apps.push({ name: appName, branch: "" });
              }
            }
          }
          groups.push({ name: dirName, apps });

          if (!asJson) {
            if (lines.length > 0) {
              log.message(`${dirName}/\n${lines.map((l) => `  ${l}`).join("\n")}`);
            } else {
              log.message(`${dirName}/ (empty)`);
            }
          }
        }

        if (asJson) {
          console.log(JSON.stringify({ groups }));
        } else {
          outro(`Done`);
        }
      } catch (error) {
        cancel(`Failed to list workspaces: ${error}`);
        process.exit(1);
      }
    },
  });
}

export const listCommand = makeWorkspaceListCommand();

export function makeWorkspaceRemoveCommand(
  git: GitBackend = realGitBackend,
  fs: FileSystemBackend = realFileSystemBackend
) {
  return defineCommand({
    meta: {
      name: "remove",
      description: "Remove a workspace",
    },
    args: {
      name: {
        type: "positional",
        description: "Workspace name to remove",
        required: true,
      },
      deleteBranches: {
        type: "boolean",
        alias: "d",
        description: "Delete branches with the same name in all apps",
        default: false,
      },
      force: {
        type: "boolean",
        alias: "f",
        description: "Force delete branches (use with --delete-branches)",
        default: false,
      },
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path",
      },
    },
    async run({ args }) {
      intro(`Removing workspace`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot(process.cwd(), fs);

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const name = args.name as string;
      const deleteBranches = args.deleteBranches as boolean;
      const force = args.force as boolean;

      if (name === "main") {
        cancel(`Cannot remove the main workspace`);
        process.exit(1);
      }

      const worktreeDirPath = getWorktreeGroupPath(workspaceRoot, name);

      if (!await fs.pathExists(worktreeDirPath)) {
        cancel(`Workspace '${name}' not found`);
        process.exit(1);
      }

      try {
        const bareRepos = await listBareRepos(workspaceRoot, fs);
        const barePath = getBarePath(workspaceRoot);
        const s = spinner();
        s.start(`Removing workspace '${name}'`);

        for (const appName of bareRepos) {
          const bareRepoPath = resolve(barePath, appName);
          const appWorktreePath = resolve(worktreeDirPath, appName);

          if (await fs.pathExists(appWorktreePath)) {
            try {
              await git.worktreeRemove(bareRepoPath, appWorktreePath);
              s.message(`Removed ${appName}`);
            } catch (error) {
              log.warn(`Could not remove ${appName}: ${error}`);
            }
          }
        }

        await fs.remove(worktreeDirPath);
        s.stop(`Removed directory workspace/${name}/`);

        if (deleteBranches) {
          const branchSpinner = spinner();
          branchSpinner.start(`Deleting branch '${name}' in all apps`);
          const deleted: string[] = [];
          const skipped: string[] = [];

          for (const appName of bareRepos) {
            const mainAppPath = resolve(workspaceRoot, "main", appName);
            if (await fs.pathExists(mainAppPath)) {
              try {
                await git.deleteBranch(mainAppPath, name, force);
                deleted.push(appName);
              } catch {
                skipped.push(appName);
              }
            }
          }

          branchSpinner.stop(`Branch deletion complete`);

          if (deleted.length > 0) {
            log.success(`Deleted branch '${name}' in: ${deleted.join(", ")}`);
          }
          if (skipped.length > 0) {
            log.warn(
              `Skipped (unmerged changes): ${skipped.join(", ")}` +
              (!force ? `\n  Use -f to force delete` : "")
            );
          }
        }

        outro(`Workspace '${name}' removed!`);
      } catch (error) {
        cancel(`Failed to remove workspace: ${error}`);
        process.exit(1);
      }
    },
  });
}

export const removeCommand = makeWorkspaceRemoveCommand();

const workspaceCommand = defineCommand({
  meta: {
    name: "workspace",
    description: "Manage workspaces",
  },
  subCommands: {
    add: addCommand,
    list: listCommand,
    remove: removeCommand,
  },
});

export default workspaceCommand;

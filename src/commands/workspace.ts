import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { $ } from "bun";
import { intro, outro, cancel, log, spinner, multiselect, isCancel } from "@clack/prompts";
import { findWorkspaceRoot, getBarePath, getWorktreeGroupPath, listBareRepos, listWorktreeDirs } from "../utils/workspace.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export type SelectAppsFn = (apps: string[]) => Promise<string[] | symbol>;

const defaultSelectApps: SelectAppsFn = (apps) =>
  multiselect({
    message: "Select apps to add to this worktree group",
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

export function makeWorktreeAddCommand(git: GitBackend = realGitBackend, selectApps: SelectAppsFn = defaultSelectApps) {
  return defineCommand({
    meta: {
      name: "add",
      description: "Create a new worktree group",
    },
    args: {
      name: {
        type: "positional",
        description: "Worktree name (also used as branch name for apps)",
        required: true,
      },
      all: {
        type: "boolean",
        alias: "a",
        description: "Add all apps to the worktree group without prompting",
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
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const name = args.name as string;
      const all = args.all as boolean;
      const worktreeDirPath = getWorktreeGroupPath(workspaceRoot, name);
      const existing = await pathExists(worktreeDirPath);

      intro(existing ? `Adding apps to worktree group '${name}'` : `Creating worktree group`);

      try {
        await $`mkdir -p ${worktreeDirPath}`;

        const bareRepos = await listBareRepos(workspaceRoot);
        const barePath = getBarePath(workspaceRoot);

        const presentApps = existing
          ? await Promise.all(bareRepos.map(async (app) => ({ app, exists: await pathExists(resolve(worktreeDirPath, app)) })))
              .then((results) => results.filter((r) => r.exists).map((r) => r.app))
          : [];

        const candidateApps = bareRepos.filter((app) => !presentApps.includes(app));

        if (bareRepos.length === 0) {
          log.success(`Created empty worktree directory workspace/${name}`);
          log.warn(`No apps found. Add apps with 'jade add <repo-url>'`);
          outro(`Done`);
          return;
        }

        if (existing && candidateApps.length === 0) {
          cancel(`All apps are already in worktree group '${name}'`);
          process.exit(1);
        }

        const selectedApps = await resolveSelectedApps(candidateApps, all, selectApps);

        if (!selectedApps) {
          if (!existing) await $`rm -rf ${worktreeDirPath}`;
          cancel(`No apps selected. Aborting.`);
          process.exit(1);
        }

        const created: string[] = [];
        const skipped: string[] = [];
        const s = spinner();
        s.start(`Creating worktrees for '${name}'`);

        for (const appName of selectedApps) {
          const bareRepoPath = resolve(barePath, appName);
          const appWorktreePath = resolve(worktreeDirPath, appName);

          try {
            const actualBranch = await git.worktreeAdd(bareRepoPath, appWorktreePath, name);
            created.push(actualBranch !== name ? `${appName} (${actualBranch})` : appName);
            s.message(`Created worktree for ${appName}`);
          } catch (error) {
            log.warn(`Could not create worktree for ${appName}: ${error}`);
            skipped.push(appName);
          }
        }

        s.stop(`Worktrees created`);

        if (created.length > 0) {
          log.success(`Created in workspace/${name}/: ${created.join(", ")}`);
        }
        if (skipped.length > 0) {
          log.warn(`Skipped: ${skipped.join(", ")}`);
        }

        outro(`Worktree group '${name}' ready! Next: cd workspace/${name}`);
      } catch (error) {
        cancel(`Failed to create worktree: ${error}`);
        process.exit(1);
      }
    },
  });
}

export const addCommand = makeWorktreeAddCommand();

export function makeWorktreeListCommand(git: GitBackend = realGitBackend) {
  return defineCommand({
    meta: {
      name: "list",
      description: "List all worktree groups",
    },
    args: {
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path",
      },
    },
    async run({ args }) {
      intro(`Worktree Groups`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      try {
        const worktreeDirs = await listWorktreeDirs(workspaceRoot);
        const bareRepos = await listBareRepos(workspaceRoot);

        if (worktreeDirs.length === 0) {
          outro(`No worktree groups found.`);
          return;
        }

        for (const dirName of worktreeDirs) {
          const lines: string[] = [];
          for (const appName of bareRepos) {
            const appPath = resolve(getWorktreeGroupPath(workspaceRoot, dirName), appName);
            if (await pathExists(appPath)) {
              try {
                const branch = await git.currentBranch(appPath);
                lines.push(`${appName.padEnd(30)} (${branch})`);
              } catch {
                lines.push(`${appName.padEnd(30)} (error reading branch)`);
              }
            }
          }
          if (lines.length > 0) {
            log.message(`${dirName}/\n${lines.map((l) => `  ${l}`).join("\n")}`);
          } else {
            log.message(`${dirName}/ (empty)`);
          }
        }

        outro(`Done`);
      } catch (error) {
        cancel(`Failed to list worktrees: ${error}`);
        process.exit(1);
      }
    },
  });
}

export const listCommand = makeWorktreeListCommand();

export function makeWorktreeRemoveCommand(git: GitBackend = realGitBackend) {
  return defineCommand({
    meta: {
      name: "remove",
      description: "Remove a worktree group",
    },
    args: {
      name: {
        type: "positional",
        description: "Worktree name to remove",
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
      intro(`Removing worktree group`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const name = args.name as string;
      const deleteBranches = args.deleteBranches as boolean;
      const force = args.force as boolean;

      if (name === "main") {
        cancel(`Cannot remove the main worktree group`);
        process.exit(1);
      }

      const worktreeDirPath = getWorktreeGroupPath(workspaceRoot, name);

      if (!await pathExists(worktreeDirPath)) {
        cancel(`Worktree '${name}' not found`);
        process.exit(1);
      }

      try {
        const bareRepos = await listBareRepos(workspaceRoot);
        const barePath = getBarePath(workspaceRoot);
        const s = spinner();
        s.start(`Removing worktree group '${name}'`);

        for (const appName of bareRepos) {
          const bareRepoPath = resolve(barePath, appName);
          const appWorktreePath = resolve(worktreeDirPath, appName);

          if (await pathExists(appWorktreePath)) {
            try {
              await git.worktreeRemove(bareRepoPath, appWorktreePath);
              s.message(`Removed worktree for ${appName}`);
            } catch (error) {
              log.warn(`Could not remove worktree for ${appName}: ${error}`);
            }
          }
        }

        await $`rm -rf ${worktreeDirPath}`;
        s.stop(`Removed directory workspace/${name}/`);

        if (deleteBranches) {
          const branchSpinner = spinner();
          branchSpinner.start(`Deleting branch '${name}' in all apps`);
          const deleted: string[] = [];
          const skipped: string[] = [];

          for (const appName of bareRepos) {
            const mainAppPath = resolve(workspaceRoot, "main", appName);
            if (await pathExists(mainAppPath)) {
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

        outro(`Worktree group '${name}' removed!`);
      } catch (error) {
        cancel(`Failed to remove worktree: ${error}`);
        process.exit(1);
      }
    },
  });
}

export const removeCommand = makeWorktreeRemoveCommand();

const worktreeCommand = defineCommand({
  meta: {
    name: "worktree",
    description: "Manage worktree groups",
  },
  subCommands: {
    add: addCommand,
    list: listCommand,
    remove: removeCommand,
  },
});

export default worktreeCommand;

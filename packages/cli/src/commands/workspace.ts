import { defineCommand } from "citty";
import { resolve } from "path";
import { cancel, log, multiselect, isCancel } from "@clack/prompts";
import {
  findWorkspaceRoot,
  getBarePath,
  getCurrentGroup,
  getWorktreeGroupPath,
  listBareRepos,
  listWorktreeDirs,
} from "../utils/workspace.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";
import { copyEnvToWorktree } from "../utils/env.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";
import { getAppDefaultBranch } from "../utils/config.ts";
import { type ConfigBackend, realConfigBackend } from "../utils/config-backend.ts";
import { createGemProgress, jadeIntro, jadeOutro, jadeSpinner } from "../utils/theme.ts";

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

export type ResolvedAppsList = {
  /** Requested apps that exist among bareRepos and aren't already in the workspace */
  selected: string[];
  /** Requested names that don't match any configured app */
  invalid: string[];
  /** Requested apps that are valid but already present in the workspace */
  alreadyPresent: string[];
};

/** Parses a comma-separated `--apps` value against the known/candidate app lists. Pure and unit-testable. */
export function resolveAppsList(rawApps: string, bareRepos: string[], candidateApps: string[]): ResolvedAppsList {
  const requested = Array.from(new Set(rawApps.split(",").map((a) => a.trim()).filter(Boolean)));
  const invalid = requested.filter((a) => !bareRepos.includes(a));
  const valid = requested.filter((a) => bareRepos.includes(a));
  return {
    selected: valid.filter((a) => candidateApps.includes(a)),
    invalid,
    alreadyPresent: valid.filter((a) => !candidateApps.includes(a)),
  };
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
      apps: {
        type: "string",
        description: "Comma-separated app names to add (bypasses --all and the interactive prompt)",
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

      jadeIntro(existing ? `Adding apps to workspace '${name}'` : `Creating workspace`);

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
          jadeOutro(`Done`);
          return;
        }

        if (existing && candidateApps.length === 0) {
          cancel(`All apps are already in workspace '${name}'`);
          process.exit(1);
        }

        const appsArg = args.apps as string | undefined;
        let selectedApps: string[] | null;

        if (appsArg !== undefined) {
          const { selected, invalid, alreadyPresent } = resolveAppsList(appsArg, bareRepos, candidateApps);

          if (invalid.length > 0) {
            if (!existing) await fs.remove(worktreeDirPath);
            cancel(`Unknown app(s): ${invalid.join(", ")}. Available: ${bareRepos.join(", ")}`);
            process.exit(1);
          }
          if (alreadyPresent.length > 0) {
            log.warn(`Already in workspace '${name}', skipping: ${alreadyPresent.join(", ")}`);
          }

          selectedApps = selected.length > 0 ? selected : null;
        } else {
          selectedApps = await resolveSelectedApps(candidateApps, all, selectApps);
        }

        if (!selectedApps) {
          if (!existing) await fs.remove(worktreeDirPath);
          cancel(`No apps selected. Aborting.`);
          process.exit(1);
        }

        const created: string[] = [];
        const skipped: string[] = [];
        const progress = createGemProgress(selectedApps);

        for (const appName of selectedApps) {
          const bareRepoPath = resolve(barePath, appName);
          const appWorktreePath = resolve(worktreeDirPath, appName);

          progress.start(appName, "adding…");
          try {
            const actualBranch = await git.worktreeAdd(bareRepoPath, appWorktreePath, name);
            created.push(actualBranch !== name ? `${appName} (${actualBranch})` : appName);
            progress.finish(appName, "done", "added");
          } catch (error) {
            progress.finish(appName, "failed", "failed");
            log.warn(`Could not add ${appName}: ${error}`);
            skipped.push(appName);
          }
        }

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

        jadeOutro(`Workspace '${name}' ready! Next: cd workspace/${name}`);
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
      if (!asJson) jadeIntro(`Workspaces`);

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
            jadeOutro(`No workspaces found.`);
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
          jadeOutro(`Done`);
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
      jadeIntro(`Removing workspace`);

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
        const appsPresent = (
          await Promise.all(
            bareRepos.map(async (appName) => ({
              appName,
              exists: await fs.pathExists(resolve(worktreeDirPath, appName)),
            }))
          )
        )
          .filter((a) => a.exists)
          .map((a) => a.appName);

        const removeProgress = createGemProgress(appsPresent);
        for (const appName of appsPresent) {
          const bareRepoPath = resolve(barePath, appName);
          const appWorktreePath = resolve(worktreeDirPath, appName);

          removeProgress.start(appName, "removing…");
          try {
            await git.worktreeRemove(bareRepoPath, appWorktreePath);
            removeProgress.finish(appName, "done", "removed");
          } catch (error) {
            removeProgress.finish(appName, "failed", "failed");
            log.warn(`Could not remove ${appName}: ${error}`);
          }
        }

        await fs.remove(worktreeDirPath);
        log.success(`Removed directory workspace/${name}/`);

        if (deleteBranches) {
          const deleted: string[] = [];
          const skipped: string[] = [];

          const appsWithMain = (
            await Promise.all(
              bareRepos.map(async (appName) => ({
                appName,
                exists: await fs.pathExists(resolve(workspaceRoot, "main", appName)),
              }))
            )
          )
            .filter((a) => a.exists)
            .map((a) => a.appName);

          const branchProgress = createGemProgress(appsWithMain);
          for (const appName of appsWithMain) {
            const mainAppPath = resolve(workspaceRoot, "main", appName);
            branchProgress.start(appName, "deleting branch…");
            try {
              await git.deleteBranch(mainAppPath, name, force);
              deleted.push(appName);
              branchProgress.finish(appName, "done", "deleted");
            } catch {
              skipped.push(appName);
              branchProgress.finish(appName, "failed", "skipped");
            }
          }

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

        jadeOutro(`Workspace '${name}' removed!`);
      } catch (error) {
        cancel(`Failed to remove workspace: ${error}`);
        process.exit(1);
      }
    },
  });
}

export const removeCommand = makeWorkspaceRemoveCommand();

export function makeWorkspaceUpdateCommand(
  git: GitBackend = realGitBackend,
  fs: FileSystemBackend = realFileSystemBackend,
  config: ConfigBackend = realConfigBackend
) {
  return defineCommand({
    meta: {
      name: "update",
      description: "Merge each app's latest default-branch changes into a workspace group",
    },
    args: {
      group: {
        type: "positional",
        description: "Worktree group to update (defaults to current group, or 'main')",
        required: false,
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

      const groups = await listWorktreeDirs(workspaceRoot, fs);
      const group =
        (args.group as string | undefined) ||
        getCurrentGroup(workspaceRoot, process.cwd()) ||
        "main";

      if (!groups.includes(group)) {
        cancel(`Worktree group '${group}' not found. See 'jade workspace list'.`);
        process.exit(1);
      }

      const groupPath = getWorktreeGroupPath(workspaceRoot, group);
      const barePath = getBarePath(workspaceRoot);
      const bareRepos = await listBareRepos(workspaceRoot, fs);
      const jadeConfig = await config.readConfig(workspaceRoot);

      jadeIntro(`Updating workspace '${group}'`);

      const appsToUpdate = (
        await Promise.all(
          bareRepos.map(async (appName) => ({
            appName,
            exists: await fs.pathExists(resolve(groupPath, appName)),
          }))
        )
      )
        .filter((a) => a.exists)
        .map((a) => a.appName);

      const merged: string[] = [];
      const upToDate: string[] = [];
      const failed: { name: string; error: unknown }[] = [];
      const progress = createGemProgress(appsToUpdate);

      for (const appName of appsToUpdate) {
        const appWorktreePath = resolve(groupPath, appName);

        progress.start(appName, "updating…");
        try {
          const bareRepoPath = resolve(barePath, appName);
          const defaultBranch =
            getAppDefaultBranch(jadeConfig, appName) ??
            (await git.getDefaultBranch(bareRepoPath));

          await git.fetch(bareRepoPath);
          const result = await git.mergeBranch(appWorktreePath, defaultBranch);

          if (result === "up-to-date") {
            upToDate.push(appName);
            progress.finish(appName, "done", "already up to date");
          } else {
            merged.push(appName);
            progress.finish(appName, "done", `merged latest ${defaultBranch}`);
          }
        } catch (error) {
          progress.finish(appName, "failed", "failed");
          log.warn(`${appName}: merge failed — resolve manually in ${appWorktreePath}\n  ${error}`);
          failed.push({ name: appName, error });
        }
      }

      if (merged.length === 0 && upToDate.length === 0 && failed.length === 0) {
        log.warn(`No apps found in '${group}'.`);
      } else {
        if (merged.length > 0) log.success(`Merged: ${merged.join(", ")}`);
        if (upToDate.length > 0) log.info(`Already up to date: ${upToDate.join(", ")}`);
        if (failed.length > 0) log.warn(`Failed: ${failed.map((f) => f.name).join(", ")}`);
      }

      jadeOutro(`Done`);
    },
  });
}

export const updateCommand = makeWorkspaceUpdateCommand();

const workspaceCommand = defineCommand({
  meta: {
    name: "workspace",
    description: "Manage workspaces",
  },
  subCommands: {
    add: addCommand,
    list: listCommand,
    remove: removeCommand,
    update: updateCommand,
  },
});

export default workspaceCommand;

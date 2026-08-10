import { defineCommand } from "citty";
import { resolve } from "path";
import { intro, outro, cancel, log, spinner } from "@clack/prompts";
import { findWorkspaceRoot, getBarePath, listWorktreeDirs, listBareRepos } from "../utils/workspace.ts";
import { removeAppFromConfig } from "../utils/config.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";
import { type ConfigBackend, realConfigBackend } from "../utils/config-backend.ts";

export function makeRemoveCommand(
  git: GitBackend = realGitBackend,
  fs: FileSystemBackend = realFileSystemBackend,
  config: ConfigBackend = realConfigBackend
) {
  return defineCommand({
    meta: {
      name: "remove",
      description: "Remove a repository from the workspace",
    },
    args: {
      name: {
        type: "positional",
        description: "App name to remove",
        required: true,
      },
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path (defaults to current directory)",
      },
    },
    async run({ args }) {
      intro(`Removing repository from workspace`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot(process.cwd(), fs);

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const appName = args.name as string;
      const barePath = getBarePath(workspaceRoot);
      const bareRepoPath = resolve(barePath, appName);

      const bareRepos = await listBareRepos(workspaceRoot, fs);
      if (!bareRepos.includes(appName)) {
        const hint = bareRepos.length > 0
          ? `\nAvailable apps: ${bareRepos.join(", ")}`
          : "";
        cancel(`App '${appName}' not found in .bare/${hint}`);
        process.exit(1);
      }

      try {
        const s = spinner();
        s.start(`Removing ${appName}`);

        const worktrees = await git.worktreeList(bareRepoPath);
        for (const wt of worktrees) {
          try {
            await git.worktreeRemove(bareRepoPath, wt.path);
            s.message(`Cleaned up ${wt.path}`);
          } catch (error) {
            log.warn(`Could not clean up ${wt.path}: ${error}`);
          }
        }

        await git.removeBareRepo(bareRepoPath);
        s.stop(`Removed bare repository from .bare/${appName}`);

        await removeAppFromConfig(config, workspaceRoot, appName);
        log.success(`Updated jade.json config`);

        outro(`Successfully removed ${appName}!`);
      } catch (error) {
        cancel(`Failed to remove repository: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeRemoveCommand();

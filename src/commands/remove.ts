import { defineCommand } from "citty";
import { resolve } from "path";
import { findWorkspaceRoot, getBarePath, listWorktreeDirs, listBareRepos } from "../utils/workspace.ts";
import { removeAppFromConfig } from "../utils/config.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";

export function makeRemoveCommand(git: GitBackend = realGitBackend) {
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
      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        console.error("❌ Not in a jade workspace. Run 'jade init' first.");
        process.exit(1);
      }

      const appName = args.name as string;
      const barePath = getBarePath(workspaceRoot);
      const bareRepoPath = resolve(barePath, appName);

      const bareRepos = await listBareRepos(workspaceRoot);
      if (!bareRepos.includes(appName)) {
        console.error(`❌ App '${appName}' not found in .bare/`);
        if (bareRepos.length > 0) {
          console.log(`\nAvailable apps:`);
          for (const repo of bareRepos) {
            console.log(`  - ${repo}`);
          }
        }
        process.exit(1);
      }

      console.log(`🗑️  Removing ${appName}...`);

      try {
        const worktreeDirs = await listWorktreeDirs(workspaceRoot);

        const worktrees = await git.worktreeList(bareRepoPath);
        for (const wt of worktrees) {
          try {
            await git.worktreeRemove(bareRepoPath, wt.path);
            console.log(`✓ Removed worktree: ${wt.path}`);
          } catch (error) {
            console.warn(`⚠️  Could not remove worktree ${wt.path}: ${error}`);
          }
        }

        await git.removeBareRepo(bareRepoPath);
        console.log(`✓ Removed bare repository from .bare/${appName}`);

        await removeAppFromConfig(workspaceRoot, appName);
        console.log(`✓ Updated jade.json config`);

        console.log(`\n✨ Successfully removed ${appName}!`);
      } catch (error) {
        console.error(`❌ Failed to remove repository: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeRemoveCommand();

import { defineCommand } from "citty";
import { resolve } from "path";
import { gitWorktreeRemove, gitRemoveBareRepo, gitWorktreeList } from "../utils/git.ts";
import { findWorkspaceRoot, getBarePath, listWorktreeDirs, listBareRepos } from "../utils/workspace.ts";
import { removeAppFromConfig } from "../utils/config.ts";

export default defineCommand({
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
    // Find workspace root
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

    // Check if app exists
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
      // Get list of worktree directories
      const worktreeDirs = await listWorktreeDirs(workspaceRoot);

      // Remove worktrees from all directories
      const worktrees = await gitWorktreeList(bareRepoPath);
      for (const wt of worktrees) {
        try {
          await gitWorktreeRemove(bareRepoPath, wt.path);
          console.log(`✓ Removed worktree: ${wt.path}`);
        } catch (error) {
          console.warn(`⚠️  Could not remove worktree ${wt.path}: ${error}`);
        }
      }

      // Remove the bare repository
      await gitRemoveBareRepo(bareRepoPath);
      console.log(`✓ Removed bare repository from .bare/${appName}`);

      // Update config
      await removeAppFromConfig(workspaceRoot, appName);
      console.log(`✓ Updated jade.json config`);

      console.log(`\n✨ Successfully removed ${appName}!`);
    } catch (error) {
      console.error(`❌ Failed to remove repository: ${error}`);
      process.exit(1);
    }
  },
});

import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync } from "fs";
import { $ } from "bun";
import { gitAdd, gitCommit, gitSubmoduleList } from "../utils/git.ts";
import { findWorkspaceRoot, getMainWorktreePath } from "../utils/workspace.ts";
import { removeAppFromConfig } from "../utils/config.ts";

export default defineCommand({
  meta: {
    name: "remove",
    description: "Remove a submodule from the workspace",
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
      : findWorkspaceRoot();

    if (!workspaceRoot) {
      console.error("❌ Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    const mainPath = getMainWorktreePath(workspaceRoot);

    if (!existsSync(mainPath)) {
      console.error("❌ Main worktree not found. Workspace may be corrupted.");
      process.exit(1);
    }

    const appName = args.name as string;

    // Get list of submodules to find the actual path
    const submodules = await gitSubmoduleList(mainPath);
    
    // Try to find the submodule - check both direct name and apps/ prefix
    let submodulePath = submodules.find(
      (s) => s === appName || s === `apps/${appName}` || s.endsWith(`/${appName}`)
    );

    if (!submodulePath) {
      console.error(`❌ Submodule '${appName}' not found in .gitmodules`);
      console.log(`\nAvailable submodules:`);
      for (const sub of submodules) {
        console.log(`  - ${sub}`);
      }
      process.exit(1);
    }

    console.log(`🗑️  Removing ${submodulePath}...`);

    try {
      // Deinitialize the submodule
      await $`git submodule deinit -f ${submodulePath}`.cwd(mainPath);
      console.log(`✓ Deinitialized submodule`);

      // Remove from .git/modules (if it exists)
      try {
        await $`rm -rf .git/modules/${submodulePath}`.cwd(mainPath);
        console.log(`✓ Removed from .git/modules`);
      } catch {
        // Ignore if doesn't exist
        console.log(`✓ Cleaned .git/modules (if present)`);
      }

      // Remove the submodule entry from git index and working tree
      await $`git rm -f ${submodulePath}`.cwd(mainPath);
      console.log(`✓ Removed from git index and working tree`);

      // Commit the removal
      await gitCommit(mainPath, `chore: remove ${appName} submodule`);
      console.log(`✓ Committed submodule removal`);

      // Update config
      await removeAppFromConfig(workspaceRoot, appName);
      console.log(`✓ Updated jade.json config`);

      console.log(`\n✨ Successfully removed ${appName}!`);
      console.log(`\nNote: Existing worktrees still have this submodule.`);
      console.log(`New worktrees will not include it.`);
    } catch (error) {
      console.error(`❌ Failed to remove submodule: ${error}`);
      process.exit(1);
    }
  },
});

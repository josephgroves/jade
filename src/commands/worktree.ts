import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync, mkdirSync, rmSync } from "fs";
import {
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitCurrentBranch,
  gitDeleteBranch,
} from "../utils/git.ts";
import { findWorkspaceRoot, getBarePath, listBareRepos, listWorktreeDirs } from "../utils/workspace.ts";

const addCommand = defineCommand({
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
    workspace: {
      type: "string",
      alias: "w",
      description: "Workspace root path",
    },
  },
  async run({ args }) {
    const workspaceRoot = args.workspace
      ? resolve(args.workspace as string)
      : findWorkspaceRoot();

    if (!workspaceRoot) {
      console.error("❌ Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    const name = args.name as string;
    const worktreeDirPath = resolve(workspaceRoot, name);

    if (existsSync(worktreeDirPath)) {
      console.error(`❌ Worktree directory '${name}' already exists`);
      process.exit(1);
    }

    console.log(`🌿 Creating worktree group '${name}'`);

    try {
      // Create worktree directory
      mkdirSync(worktreeDirPath, { recursive: true });

      // Get all bare repos
      const bareRepos = listBareRepos(workspaceRoot);
      const barePath = getBarePath(workspaceRoot);

      if (bareRepos.length === 0) {
        console.log(`✓ Created empty worktree directory ./${name}`);
        console.log(`\n⚠️  No apps found. Add apps with 'jade add <repo-url>'`);
        return;
      }

      // Create worktrees for each app
      const created: string[] = [];
      const skipped: string[] = [];

      for (const appName of bareRepos) {
        const bareRepoPath = resolve(barePath, appName);
        const appWorktreePath = resolve(worktreeDirPath, appName);

        try {
          // Create or checkout branch with same name as worktree
          const actualBranch = await gitWorktreeAdd(bareRepoPath, appWorktreePath, name);
          if (actualBranch !== name) {
            created.push(`${appName} (${actualBranch})`);
          } else {
            created.push(appName);
          }
        } catch (error) {
          console.warn(`⚠️  Could not create worktree for ${appName}: ${error}`);
          skipped.push(appName);
        }
      }

      if (created.length > 0) {
        console.log(`✓ Created worktrees in ${name}/ for: ${created.join(", ")}`);
      }
      if (skipped.length > 0) {
        console.log(`⚠️  Skipped: ${skipped.join(", ")}`);
      }

      console.log(`\n✨ Worktree group '${name}' created successfully!`);
      console.log(`\nNext steps:`);
      console.log(`  cd ${name}`);
    } catch (error) {
      console.error(`❌ Failed to create worktree: ${error}`);
      process.exit(1);
    }
  },
});

const listCommand = defineCommand({
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
    const workspaceRoot = args.workspace
      ? resolve(args.workspace as string)
      : findWorkspaceRoot();

    if (!workspaceRoot) {
      console.error("❌ Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    try {
      const worktreeDirs = listWorktreeDirs(workspaceRoot);
      const bareRepos = listBareRepos(workspaceRoot);

      if (worktreeDirs.length === 0) {
        console.log("No worktree groups found.");
        return;
      }

      console.log("Worktree groups:\n");
      
      for (const dirName of worktreeDirs) {
        console.log(`  ${dirName}/`);
        
        // List apps in this worktree
        for (const appName of bareRepos) {
          const appPath = resolve(workspaceRoot, dirName, appName);
          if (existsSync(appPath)) {
            try {
              const branch = await gitCurrentBranch(appPath);
              console.log(`    - ${appName.padEnd(30)} (${branch})`);
            } catch {
              console.log(`    - ${appName.padEnd(30)} (error reading branch)`);
            }
          }
        }
        console.log();
      }
    } catch (error) {
      console.error(`❌ Failed to list worktrees: ${error}`);
      process.exit(1);
    }
  },
});

const removeCommand = defineCommand({
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
    const workspaceRoot = args.workspace
      ? resolve(args.workspace as string)
      : findWorkspaceRoot();

    if (!workspaceRoot) {
      console.error("❌ Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    const name = args.name as string;
    const deleteBranches = args.deleteBranches as boolean;
    const force = args.force as boolean;

    if (name === "main") {
      console.error("❌ Cannot remove the main worktree group");
      process.exit(1);
    }

    const worktreeDirPath = resolve(workspaceRoot, name);

    if (!existsSync(worktreeDirPath)) {
      console.error(`❌ Worktree '${name}' not found`);
      process.exit(1);
    }

    console.log(`🗑️  Removing worktree group '${name}'`);

    try {
      const bareRepos = listBareRepos(workspaceRoot);
      const barePath = getBarePath(workspaceRoot);

      // Remove worktrees from each app's bare repo
      for (const appName of bareRepos) {
        const bareRepoPath = resolve(barePath, appName);
        const appWorktreePath = resolve(worktreeDirPath, appName);

        if (existsSync(appWorktreePath)) {
          try {
            await gitWorktreeRemove(bareRepoPath, appWorktreePath);
            console.log(`✓ Removed worktree for ${appName}`);
          } catch (error) {
            console.warn(`⚠️  Could not remove worktree for ${appName}: ${error}`);
          }
        }
      }

      // Remove the directory
      rmSync(worktreeDirPath, { recursive: true, force: true });
      console.log(`✓ Removed directory ${name}/`);

      // Delete branches if requested
      if (deleteBranches) {
        const deleted: string[] = [];
        const skipped: string[] = [];

        for (const appName of bareRepos) {
          const mainAppPath = resolve(workspaceRoot, "main", appName);
          
          if (existsSync(mainAppPath)) {
            try {
              await gitDeleteBranch(mainAppPath, name, force);
              deleted.push(appName);
            } catch (error) {
              skipped.push(appName);
            }
          }
        }

        if (deleted.length > 0) {
          console.log(`✓ Deleted branch '${name}' in: ${deleted.join(", ")}`);
        }
        if (skipped.length > 0) {
          console.log(`⚠️  Skipped (branch not found or has unmerged changes): ${skipped.join(", ")}`);
          if (!force) {
            console.log(`   Use -f flag to force delete branches with unmerged changes`);
          }
        }
      }

      console.log(`\n✨ Worktree group '${name}' removed successfully!`);
    } catch (error) {
      console.error(`❌ Failed to remove worktree: ${error}`);
      process.exit(1);
    }
  },
});

export default defineCommand({
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

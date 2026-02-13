import { defineCommand } from "citty";
import { resolve } from "path";
import {
  gitWorktreeAdd,
  gitWorktreeList,
  gitWorktreeRemove,
  gitSubmoduleUpdate,
  gitSubmoduleCreateBranches,
  isBranchCheckedOut,
} from "../utils/git.ts";
import { findWorkspaceRoot } from "../utils/workspace.ts";

const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Create a new worktree",
  },
  args: {
    name: {
      type: "positional",
      description: "Worktree name (also used as branch name for submodules)",
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

    console.log(`🌿 Creating worktree '${name}'`);

    try {
      // Create worktree WITHOUT creating a new hub branch (stays on main)
      await gitWorktreeAdd(workspaceRoot, name);
      console.log(`✓ Created worktree at ./${name} (hub stays on main)`);

      // Initialize submodules
      const worktreePath = resolve(workspaceRoot, name);
      await gitSubmoduleUpdate(worktreePath);
      console.log(`✓ Initialized submodules`);

      // Create matching branches in all submodules using the worktree name
      const created = await gitSubmoduleCreateBranches(worktreePath, name);
      if (created.length > 0) {
        console.log(`✓ Created branch '${name}' in: ${created.join(", ")}`);
      }

      console.log(`\n✨ Worktree '${name}' created successfully!`);
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
    description: "List all worktrees",
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
      const worktrees = await gitWorktreeList(workspaceRoot);

      if (worktrees.length === 0) {
        console.log("No worktrees found.");
        return;
      }

      console.log("Worktrees:\n");
      for (const wt of worktrees) {
        const shortCommit = wt.commit.substring(0, 7);
        console.log(`  ${wt.branch.padEnd(30)} ${wt.path} (${shortCommit})`);
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
    description: "Remove a worktree",
  },
  args: {
    name: {
      type: "positional",
      description: "Worktree name to remove",
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

    if (name === "main") {
      console.error("❌ Cannot remove the main worktree");
      process.exit(1);
    }

    console.log(`🗑️  Removing worktree '${name}'`);

    try {
      await gitWorktreeRemove(workspaceRoot, name);
      console.log(`✓ Removed worktree '${name}'`);
    } catch (error) {
      console.error(`❌ Failed to remove worktree: ${error}`);
      process.exit(1);
    }
  },
});

export default defineCommand({
  meta: {
    name: "worktree",
    description: "Manage worktrees",
  },
  subCommands: {
    add: addCommand,
    list: listCommand,
    remove: removeCommand,
  },
});

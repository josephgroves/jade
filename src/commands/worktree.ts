import { defineCommand } from "citty";
import { resolve } from "path";
import consola from "consola";
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
      description: "Worktree name (directory name)",
      required: true,
    },
    branch: {
      type: "string",
      alias: "b",
      description: "Branch name (defaults to same as worktree name)",
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
      consola.error("Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    const name = args.name as string;
    const branch = (args.branch as string) || name;

    consola.start(`Creating worktree '${name}' on branch '${branch}'`);

    // Check if branch is already checked out
    if (await isBranchCheckedOut(workspaceRoot, branch)) {
      consola.error(`Branch '${branch}' is already checked out in another worktree`);
      process.exit(1);
    }

    try {
      // Create worktree
      await gitWorktreeAdd(workspaceRoot, name, branch);
      consola.success(`Created worktree at ./${name}`);

      // Initialize submodules
      const worktreePath = resolve(workspaceRoot, name);
      await gitSubmoduleUpdate(worktreePath);
      consola.success("Initialized submodules");

      // Create matching branches in all submodules
      const created = await gitSubmoduleCreateBranches(worktreePath, branch);
      if (created.length > 0) {
        consola.success(`Created branch '${branch}' in: ${created.join(", ")}`);
      }

      consola.box(`Worktree '${name}' created successfully!\n\nNext steps:\n  cd ${name}`);
    } catch (error) {
      consola.error(`Failed to create worktree: ${error}`);
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
      consola.error("Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    try {
      const worktrees = await gitWorktreeList(workspaceRoot);

      if (worktrees.length === 0) {
        consola.info("No worktrees found.");
        return;
      }

      consola.log("\nWorktrees:\n");
      for (const wt of worktrees) {
        const shortCommit = wt.commit.substring(0, 7);
        consola.log(`  ${wt.branch.padEnd(30)} ${wt.path} (${shortCommit})`);
      }
      consola.log("");
    } catch (error) {
      consola.error(`Failed to list worktrees: ${error}`);
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
      consola.error("Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    const name = args.name as string;

    if (name === "main") {
      consola.error("Cannot remove the main worktree");
      process.exit(1);
    }

    consola.start(`Removing worktree '${name}'`);

    try {
      await gitWorktreeRemove(workspaceRoot, name);
      consola.success(`Removed worktree '${name}'`);
    } catch (error) {
      consola.error(`Failed to remove worktree: ${error}`);
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

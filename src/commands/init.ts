import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import consola from "consola";
import { gitInitBare, writeGitPointer, gitWorktreeAdd } from "../utils/git.ts";
import { writeConfig } from "../utils/config.ts";
import { getBarePath, getMainWorktreePath } from "../utils/workspace.ts";

export default defineCommand({
  meta: {
    name: "init",
    description: "Initialize a new workspace with bare repo and main worktree",
  },
  args: {
    path: {
      type: "positional",
      description: "Workspace directory path",
      required: true,
    },
    branch: {
      type: "string",
      description: "Default branch name",
      default: "main",
    },
    orgUrl: {
      type: "string",
      description: "GitHub organization URL",
    },
  },
  async run({ args }) {
    const workspaceRoot = resolve(args.path as string);
    const barePath = getBarePath(workspaceRoot);
    const mainPath = getMainWorktreePath(workspaceRoot);

    consola.start(`Initializing workspace at: ${workspaceRoot}`);

    // Create workspace directory if it doesn't exist
    if (!existsSync(workspaceRoot)) {
      mkdirSync(workspaceRoot, { recursive: true });
      consola.success("Created workspace directory");
    } else {
      if (existsSync(barePath)) {
        consola.error(`Workspace already initialized at ${workspaceRoot}`);
        process.exit(1);
      }
    }

    // Initialize bare repository
    mkdirSync(barePath, { recursive: true });
    await gitInitBare(barePath);
    consola.success("Initialized bare repository in .bare/");

    // Create .git pointer file
    await writeGitPointer(workspaceRoot, "./.bare");
    consola.success("Created .git pointer");

    // Create main worktree
    await gitWorktreeAdd(workspaceRoot, "main", args.branch as string);
    consola.success(`Created main worktree on branch '${args.branch}'`);

    // Write config
    await writeConfig(workspaceRoot, {
      version: "1.0",
      defaultBranch: args.branch as string,
      apps: [],
      orgUrl: args.orgUrl as string | undefined,
    });
    consola.success("Created jade.json config");

    consola.box(`Workspace initialized successfully!\n\nNext steps:\n  cd ${args.path}\n  jade add <repo-url> --name <app-name>`);
  },
});

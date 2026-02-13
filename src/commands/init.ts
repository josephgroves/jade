import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";
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

    console.log(`🌆 Initializing workspace at: ${workspaceRoot}`);

    // Create workspace directory if it doesn't exist
    if (!existsSync(workspaceRoot)) {
      mkdirSync(workspaceRoot, { recursive: true });
      console.log(`✓ Created workspace directory`);
    } else {
      if (existsSync(barePath)) {
        console.error(`❌ Workspace already initialized at ${workspaceRoot}`);
        process.exit(1);
      }
    }

    // Initialize bare repository
    mkdirSync(barePath, { recursive: true });
    await gitInitBare(barePath);
    console.log(`✓ Initialized bare repository in .bare/`);

    // Create .git pointer file
    await writeGitPointer(workspaceRoot, "./.bare");
    console.log(`✓ Created .git pointer`);

    // Create main worktree
    await gitWorktreeAdd(workspaceRoot, "main", args.branch as string);
    console.log(`✓ Created main worktree on branch '${args.branch}'`);

    // Write config
    await writeConfig(workspaceRoot, {
      version: "1.0",
      defaultBranch: args.branch as string,
      apps: [],
      orgUrl: args.orgUrl as string | undefined,
    });
    console.log(`✓ Created jade.json config`);

    console.log(`\n✨ Workspace initialized successfully!`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${args.path}`);
    console.log(`  jade add <repo-url> --name <app-name>`);
  },
});

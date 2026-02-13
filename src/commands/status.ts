import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync } from "fs";
import { gitWorktreeList, gitSubmoduleList, gitCurrentBranch } from "../utils/git.ts";
import { findWorkspaceRoot } from "../utils/workspace.ts";
import { readConfig } from "../utils/config.ts";

export default defineCommand({
  meta: {
    name: "status",
    description: "Show workspace status: worktrees, submodules, and branches",
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
      // Read config
      const config = await readConfig(workspaceRoot);

      console.log(`\n🌆 Jade Workspace Status`);
      console.log(`\nWorkspace: ${workspaceRoot}`);
      console.log(`Default branch: ${config.defaultBranch}`);
      if (config.orgUrl) {
        console.log(`Organization: ${config.orgUrl}`);
      }

      // List worktrees
      console.log(`\n📂 Worktrees:`);
      const worktrees = await gitWorktreeList(workspaceRoot);
      for (const wt of worktrees) {
        const shortCommit = wt.commit.substring(0, 7);
        const relPath = wt.path.replace(workspaceRoot + "/", "");
        console.log(`  • ${wt.branch.padEnd(25)} ${relPath} (${shortCommit})`);
      }

      // List submodules in main worktree
      const mainPath = resolve(workspaceRoot, "main");
      if (existsSync(mainPath)) {
        console.log(`\n📦 Submodules (in main):`);
        const submodules = await gitSubmoduleList(mainPath);

        if (submodules.length === 0) {
          console.log(`  No submodules yet. Use 'jade add <url>' to add apps.`);
        } else {
          for (const submodule of submodules) {
            const submodulePath = resolve(mainPath, submodule);
            if (existsSync(submodulePath)) {
              try {
                const branch = await gitCurrentBranch(submodulePath);
                console.log(`  • ${submodule.padEnd(25)} on ${branch}`);
              } catch {
                console.log(`  • ${submodule.padEnd(25)} (not initialized)`);
              }
            }
          }
        }
      }

      // Show apps from config
      if (config.apps.length > 0) {
        console.log(`\n📋 Registered apps: ${config.apps.join(", ")}`);
      }

      console.log();
    } catch (error) {
      console.error(`❌ Failed to get status: ${error}`);
      process.exit(1);
    }
  },
});

import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync } from "fs";
import consola from "consola";
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
      consola.error("Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    try {
      // Read config
      const config = await readConfig(workspaceRoot);

      consola.log("");
      consola.box("Jade Workspace Status");
      consola.log("");
      consola.info(`Workspace: ${workspaceRoot}`);
      consola.info(`Default branch: ${config.defaultBranch}`);
      if (config.orgUrl) {
        consola.info(`Organization: ${config.orgUrl}`);
      }

      // List worktrees
      consola.log("\n📂 Worktrees:");
      const worktrees = await gitWorktreeList(workspaceRoot);
      for (const wt of worktrees) {
        const shortCommit = wt.commit.substring(0, 7);
        const relPath = wt.path.replace(workspaceRoot + "/", "");
        consola.log(`  • ${wt.branch.padEnd(25)} ${relPath} (${shortCommit})`);
      }

      // List submodules in main worktree
      const mainPath = resolve(workspaceRoot, "main");
      if (existsSync(mainPath)) {
        consola.log("\n📦 Submodules (in main):");
        const submodules = await gitSubmoduleList(mainPath);

        if (submodules.length === 0) {
          consola.log("  No submodules yet. Use 'jade add <url>' to add apps.");
        } else {
          for (const submodule of submodules) {
            const submodulePath = resolve(mainPath, submodule);
            if (existsSync(submodulePath)) {
              try {
                const branch = await gitCurrentBranch(submodulePath);
                consola.log(`  • ${submodule.padEnd(25)} on ${branch}`);
              } catch {
                consola.log(`  • ${submodule.padEnd(25)} (not initialized)`);
              }
            }
          }
        }
      }

      // Show apps from config
      if (config.apps.length > 0) {
        consola.log(`\n📋 Registered apps: ${config.apps.join(", ")}`);
      }

      consola.log("");
    } catch (error) {
      consola.error(`Failed to get status: ${error}`);
      process.exit(1);
    }
  },
});

import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { gitCurrentBranch } from "../utils/git.ts";
import { findWorkspaceRoot, listBareRepos, listWorktreeDirs } from "../utils/workspace.ts";
import { readConfig, getAppNames } from "../utils/config.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export default defineCommand({
  meta: {
    name: "status",
    description: "Show workspace status: worktree groups, apps, and branches",
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
      : await findWorkspaceRoot();

    if (!workspaceRoot) {
      console.error("❌ Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    try {
      // Read config
      const config = await readConfig(workspaceRoot);

      console.log(`\n🌆 Jade Workspace Status`);
      console.log(`\nWorkspace: ${workspaceRoot}`);
      if (config.orgUrl) {
        console.log(`Organization: ${config.orgUrl}`);
      }

      // List worktree groups
      const worktreeDirs = await listWorktreeDirs(workspaceRoot);
      const bareRepos = await listBareRepos(workspaceRoot);

      console.log(`\n📂 Worktree Groups:`);
      if (worktreeDirs.length === 0) {
        console.log(`  No worktree groups yet. Use 'jade worktree add <name>' to create one.`);
      } else {
        for (const dirName of worktreeDirs) {
          console.log(`  • ${dirName}/`);
        }
      }

      // List apps
      console.log(`\n📦 Apps:`);
      if (bareRepos.length === 0) {
        console.log(`  No apps yet. Use 'jade add <url>' to add apps.`);
      } else {
        for (const appName of bareRepos) {
          console.log(`  • ${appName}`);
          
          // Show branches in each worktree group
          for (const dirName of worktreeDirs) {
            const appPath = resolve(workspaceRoot, dirName, appName);
            if (await pathExists(appPath)) {
              try {
                const branch = await gitCurrentBranch(appPath);
                console.log(`      ${dirName.padEnd(20)} → ${branch}`);
              } catch {
                console.log(`      ${dirName.padEnd(20)} → (error)`);
              }
            }
          }
        }
      }

      // Show registered apps from config
      const appNames = getAppNames(config);
      if (appNames.length > 0) {
        console.log(`\n📋 Registered apps: ${appNames.join(", ")}`);
      }

      console.log();
    } catch (error) {
      console.error(`❌ Failed to get status: ${error}`);
      process.exit(1);
    }
  },
});

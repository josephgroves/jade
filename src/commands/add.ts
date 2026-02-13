import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync } from "fs";
import { gitSubmoduleAdd, gitAdd, gitCommit } from "../utils/git.ts";
import { findWorkspaceRoot, getMainWorktreePath } from "../utils/workspace.ts";
import { addAppToConfig, readConfig } from "../utils/config.ts";

export default defineCommand({
  meta: {
    name: "add",
    description: "Add a repository as a submodule in the apps/ directory",
  },
  args: {
    repoNameOrUrl: {
      type: "positional",
      description: "Repository name (uses orgUrl from config) or full git URL",
      required: true,
    },
    name: {
      type: "string",
      description: "App name (defaults to repo name)",
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

    // Read config to get orgUrl
    const config = await readConfig(workspaceRoot);
    const input = args.repoNameOrUrl as string;

    // Determine if input is a URL or repo name
    const isUrl = input.includes("://") || input.startsWith("git@");
    let url: string;
    let appName = args.name as string | undefined;

    if (isUrl) {
      // Full URL provided
      url = input;
      
      // Extract app name from URL if not provided
      if (!appName) {
        const match = url.match(/\/([^/]+?)(?:\.git)?$/);
        if (!match?.[1]) {
          console.error("❌ Could not extract app name from URL. Use --name flag.");
          process.exit(1);
        }
        appName = match[1];
      }
    } else {
      // Repo name provided - construct URL from orgUrl
      if (!config.orgUrl) {
        console.error(
          "❌ No orgUrl configured. Either:\n" +
          "  1. Provide a full git URL: jade add https://github.com/org/repo\n" +
          "  2. Set orgUrl in jade.json, then use: jade add repo-name"
        );
        process.exit(1);
      }

      appName = appName || input;
      const baseUrl = config.orgUrl.replace(/\/$/, ""); // Remove trailing slash
      
      // Handle both https and ssh URL formats
      if (baseUrl.startsWith("git@")) {
        // SSH format: git@github.com:org -> git@github.com:org/repo.git
        url = `${baseUrl}/${input}.git`;
      } else {
        // HTTPS format: https://github.com/org -> https://github.com/org/repo
        url = `${baseUrl}/${input}`;
      }
      
      console.log(`🔗 Using orgUrl from config: ${config.orgUrl}`);
    }

    const appPath = `apps/${appName}`;
    const fullAppPath = resolve(mainPath, appPath);

    console.log(`📦 Adding ${appName} from ${url}`);

    // Check if app already exists
    if (existsSync(fullAppPath)) {
      console.error(`❌ App '${appName}' already exists in apps/`);
      process.exit(1);
    }

    try {
      // Add submodule
      await gitSubmoduleAdd(mainPath, url, appPath);
      console.log(`✓ Added submodule at ${appPath}`);

      // Commit the submodule addition
      await gitAdd(mainPath, [".gitmodules", appPath]);
      await gitCommit(mainPath, `chore: add ${appName} submodule`);
      console.log(`✓ Committed submodule addition`);

      // Update config
      await addAppToConfig(workspaceRoot, appName);
      console.log(`✓ Updated jade.json config`);

      console.log(`\n✨ Successfully added ${appName}!`);
    } catch (error) {
      console.error(`❌ Failed to add submodule: ${error}`);
      process.exit(1);
    }
  },
});

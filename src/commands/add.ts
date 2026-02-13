import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { gitCloneBare, gitWorktreeAdd } from "../utils/git.ts";
import { findWorkspaceRoot, getBarePath, listWorktreeDirs } from "../utils/workspace.ts";
import { addAppToConfig, readConfig } from "../utils/config.ts";

export default defineCommand({
  meta: {
    name: "add",
    description: "Add a repository to the workspace",
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

    const barePath = getBarePath(workspaceRoot);
    const bareRepoPath = resolve(barePath, appName);

    console.log(`📦 Adding ${appName} from ${url}`);

    // Check if app already exists
    if (existsSync(bareRepoPath)) {
      console.error(`❌ App '${appName}' already exists in .bare/`);
      process.exit(1);
    }

    try {
      // Clone bare repository
      await gitCloneBare(url, bareRepoPath);
      console.log(`✓ Cloned bare repository to .bare/${appName}`);

      // Get all worktree directories
      const worktreeDirs = listWorktreeDirs(workspaceRoot);

      // Create worktrees in each directory
      for (const dirName of worktreeDirs) {
        const worktreePath = resolve(workspaceRoot, dirName, appName);
        
        // Create parent directory if it doesn't exist
        mkdirSync(resolve(workspaceRoot, dirName), { recursive: true });

        if (dirName === "main") {
          // For main, use the repo's default branch
          const actualBranch = await gitWorktreeAdd(bareRepoPath, worktreePath);
          console.log(`✓ Created worktree in main/${appName} (branch: ${actualBranch})`);
        } else {
          // For other directories, use the directory name as branch (create or checkout)
          const actualBranch = await gitWorktreeAdd(bareRepoPath, worktreePath, dirName);
          if (actualBranch !== dirName) {
            console.log(`✓ Created worktree in ${dirName}/${appName} (branch: ${actualBranch} - conflict resolved)`);
          } else {
            console.log(`✓ Created worktree in ${dirName}/${appName} (branch: ${dirName})`);
          }
        }
      }

      // Update config
      await addAppToConfig(workspaceRoot, appName);
      console.log(`✓ Updated jade.json config`);

      console.log(`\n✨ Successfully added ${appName}!`);
    } catch (error) {
      console.error(`❌ Failed to add repository: ${error}`);
      process.exit(1);
    }
  },
});

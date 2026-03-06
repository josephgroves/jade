import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { $ } from "bun";
import { intro, outro, cancel, log, spinner } from "@clack/prompts";
import { findWorkspaceRoot, getBarePath, getWorktreeGroupPath, listWorktreeDirs } from "../utils/workspace.ts";
import { addAppToConfig, readConfig } from "../utils/config.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function makeAddCommand(git: GitBackend = realGitBackend) {
  return defineCommand({
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
      branch: {
        type: "string",
        alias: "b",
        description: "Default branch to use for main worktree (auto-detected if not specified)",
      },
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path (defaults to current directory)",
      },
    },
    async run({ args }) {
      intro(`Adding repository to workspace`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const config = await readConfig(workspaceRoot);
      const input = args.repoNameOrUrl as string;

      const isUrl =
        input.includes("://") ||
        input.startsWith("git@") ||
        input.startsWith("/") ||
        input.startsWith("./") ||
        input.startsWith("../");
      let url: string;
      let appName = args.name as string | undefined;

      if (isUrl) {
        url = input;
        if (!appName) {
          const match = url.match(/\/([^/]+?)(?:\.git)?$/);
          if (!match?.[1]) {
            cancel(`Could not extract app name from URL. Use --name flag.`);
            process.exit(1);
          }
          appName = match[1];
        }
      } else {
        if (!config.orgUrl) {
          cancel(
            `No orgUrl configured. Either:\n` +
            `  1. Provide a full git URL: jade add https://github.com/org/repo\n` +
            `  2. Set orgUrl in jade.json, then use: jade add repo-name`
          );
          process.exit(1);
        }

        appName = appName || input;
        const baseUrl = config.orgUrl.replace(/\/$/, "");
        url = baseUrl.startsWith("git@")
          ? `${baseUrl}/${input}.git`
          : `${baseUrl}/${input}`;

        log.info(`Using orgUrl from config: ${config.orgUrl}`);
      }

      const barePath = getBarePath(workspaceRoot);
      const bareRepoPath = resolve(barePath, appName);

      if (await pathExists(bareRepoPath)) {
        cancel(`App '${appName}' already exists in .bare/`);
        process.exit(1);
      }

      try {
        const cloneSpinner = spinner();
        cloneSpinner.start(`Cloning ${appName} from ${url}`);
        await git.cloneBare(url, bareRepoPath);
        cloneSpinner.stop(`Cloned bare repository to .bare/${appName}`);

        const defaultBranch = args.branch as string | undefined;
        let detectedBranch: string | undefined;

        if (!defaultBranch) {
          const branchSpinner = spinner();
          branchSpinner.start(`Detecting default branch`);
          try {
            detectedBranch = await git.getDefaultBranch(bareRepoPath);
            branchSpinner.stop(`Default branch: ${detectedBranch}`);
          } catch (error) {
            branchSpinner.stop(`Could not detect default branch`);
            cancel(`Use --branch flag to specify: jade add ${input} --branch <branch-name>`);
            throw error;
          }
        }

        const worktreeDirs = await listWorktreeDirs(workspaceRoot);
        const worktreeSpinner = spinner();
        worktreeSpinner.start(`Creating worktrees`);

        for (const dirName of worktreeDirs) {
          const groupPath = getWorktreeGroupPath(workspaceRoot, dirName);
          const worktreePath = resolve(groupPath, appName);

          if (await pathExists(worktreePath)) continue;

          if (!await pathExists(groupPath)) {
            await $`mkdir -p ${groupPath}`;
          }

          if (dirName === "main") {
            const branchToUse = defaultBranch || detectedBranch;
            const actualBranch = await git.worktreeAdd(bareRepoPath, worktreePath, branchToUse);
            worktreeSpinner.message(`Created main/${appName} (branch: ${actualBranch})`);
          } else {
            const actualBranch = await git.worktreeAdd(bareRepoPath, worktreePath, dirName);
            const branchLabel = actualBranch !== dirName ? `${actualBranch} - conflict resolved` : dirName;
            worktreeSpinner.message(`Created workspace/${dirName}/${appName} (branch: ${branchLabel})`);
          }
        }

        worktreeSpinner.stop(`Worktrees created`);

        await addAppToConfig(workspaceRoot, appName, defaultBranch);
        log.success(`Updated jade.json config`);

        outro(`Successfully added ${appName}!`);
      } catch (error) {
        cancel(`Failed to add repository: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeAddCommand();

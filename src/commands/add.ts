import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { $ } from "bun";
import { intro, outro, cancel, log, spinner } from "@clack/prompts";
import { findWorkspaceRoot, getBarePath, getWorktreeGroupPath } from "../utils/workspace.ts";
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

/**
 * Is the positional argument a clone URL rather than a bare repo name?
 * Covers scheme URLs (https://, ssh://), scp-style SSH (git@host:org/repo), and
 * local paths — everything else is resolved against `orgUrl`.
 */
export function isRepoUrl(input: string): boolean {
  return (
    input.includes("://") ||
    input.startsWith("git@") ||
    input.startsWith("/") ||
    input.startsWith("./") ||
    input.startsWith("../")
  );
}

/**
 * Join a configured `orgUrl` with a bare repo name.
 *
 * scp-style SSH (`git@github.com:org`) needs the `.git` suffix, since without a
 * scheme git can't tell `org/repo` from a path. Scheme URLs — `https://…` and
 * `ssh://…` — resolve fine without it.
 */
export function buildOrgRepoUrl(orgUrl: string, repoName: string): string {
  const baseUrl = orgUrl.replace(/\/+$/, "");
  return baseUrl.startsWith("git@")
    ? `${baseUrl}/${repoName}.git`
    : `${baseUrl}/${repoName}`;
}

/**
 * Derive the app name from a clone URL — the last path segment, minus `.git`.
 *
 * Splits on `:` as well as `/` so scp-style SSH URLs with no path segment
 * (`git@host:repo.git`) still resolve. Returns null when there's nothing to
 * derive, and the caller must ask for --name.
 */
export function deriveAppName(url: string): string | null {
  const trimmed = url.replace(/\/+$/, "");
  const match = trimmed.match(/[/:]([^/:]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
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
        description: "Default branch for the main workspace (auto-detected if not specified)",
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

      let url: string;
      let appName = args.name as string | undefined;

      if (isRepoUrl(input)) {
        url = input;
        if (!appName) {
          const derived = deriveAppName(url);
          if (!derived) {
            cancel(`Could not extract app name from URL. Use --name flag.`);
            process.exit(1);
          }
          appName = derived;
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
        url = buildOrgRepoUrl(config.orgUrl, input);

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

        const worktreeSpinner = spinner();
        worktreeSpinner.start(`Setting up main workspace`);

        const mainGroupPath = getWorktreeGroupPath(workspaceRoot, "main");
        const mainWorktreePath = resolve(mainGroupPath, appName);

        if (!await pathExists(mainWorktreePath)) {
          if (!await pathExists(mainGroupPath)) {
            await $`mkdir -p ${mainGroupPath}`;
          }

          const branchToUse = defaultBranch || detectedBranch;
          const actualBranch = await git.worktreeAdd(bareRepoPath, mainWorktreePath, branchToUse);
          worktreeSpinner.message(`Created main/${appName} (branch: ${actualBranch})`);
        }

        worktreeSpinner.stop(`Main workspace ready`);

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

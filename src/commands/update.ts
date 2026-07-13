import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { intro, outro, cancel, log, spinner } from "@clack/prompts";
import { findWorkspaceRoot, getBarePath, getWorktreeGroupPath, listBareRepos } from "../utils/workspace.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function makeUpdateCommand(git: GitBackend = realGitBackend) {
  return defineCommand({
    meta: {
      name: "update",
      description: "Fetch latest and fast-forward the main workspace",
    },
    args: {
      verbose: {
        type: "boolean",
        alias: "v",
        description: "Show per-app fetch/pull details",
        default: false,
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
        : await findWorkspaceRoot();
      const verbose = args.verbose as boolean;

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const bareRepos = await listBareRepos(workspaceRoot);
      const barePath = getBarePath(workspaceRoot);
      const mainPath = getWorktreeGroupPath(workspaceRoot, "main");

      if (bareRepos.length === 0) {
        cancel(`No apps found. Add apps with 'jade add <repo-url>'`);
        process.exit(1);
      }

      if (verbose) intro(`Updating main workspace`);

      const updated: string[] = [];
      const failed: { name: string; error: unknown }[] = [];
      const s = verbose ? spinner() : undefined;

      for (const appName of bareRepos) {
        const bareRepoPath = resolve(barePath, appName);
        const appWorktreePath = resolve(mainPath, appName);

        if (!await pathExists(appWorktreePath)) continue;

        s?.start(`Updating ${appName}`);
        try {
          await git.pullFF(appWorktreePath);
          updated.push(appName);
          s?.stop(`Updated ${appName}`);
        } catch (error) {
          s?.stop(`Failed ${appName}`);
          if (verbose) log.warn(`${appName}: ${error}`);
          failed.push({ name: appName, error });
        }
      }

      if (verbose) {
        if (updated.length > 0) log.success(`Updated: ${updated.join(", ")}`);
        if (failed.length > 0) log.warn(`Failed: ${failed.map((f) => f.name).join(", ")}`);
        outro(`Done`);
      } else {
        const parts: string[] = [];
        if (updated.length > 0) parts.push(`${updated.length} updated`);
        if (failed.length > 0) parts.push(`${failed.length} failed`);
        const summary = parts.length > 0 ? parts.join(", ") : "nothing to update";
        log.info(`main: ${summary}`);
        for (const { name, error } of failed) {
          log.warn(`  ${name}: ${error}`);
        }
      }
    },
  });
}

export default makeUpdateCommand();

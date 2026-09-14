import { defineCommand } from "citty";
import { resolve } from "path";
import { cancel, log } from "@clack/prompts";
import { findWorkspaceRoot, getWorktreeGroupPath, listBareRepos } from "../utils/workspace.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";
import { createGemProgress, jadeIntro, jadeOutro } from "../utils/theme.ts";

export function makeUpdateCommand(
  git: GitBackend = realGitBackend,
  fs: FileSystemBackend = realFileSystemBackend
) {
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
        : await findWorkspaceRoot(process.cwd(), fs);
      const verbose = args.verbose as boolean;

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      const bareRepos = await listBareRepos(workspaceRoot, fs);
      const mainPath = getWorktreeGroupPath(workspaceRoot, "main");

      if (bareRepos.length === 0) {
        cancel(`No apps found. Add apps with 'jade add <repo-url>'`);
        process.exit(1);
      }

      if (verbose) jadeIntro(`Updating main workspace`);

      const appsToUpdate = (
        await Promise.all(
          bareRepos.map(async (appName) => ({
            appName,
            exists: await fs.pathExists(resolve(mainPath, appName)),
          }))
        )
      )
        .filter((a) => a.exists)
        .map((a) => a.appName);

      const updated: string[] = [];
      const failed: { name: string; error: unknown }[] = [];
      const progress = verbose ? createGemProgress(appsToUpdate) : undefined;

      for (const appName of appsToUpdate) {
        const appWorktreePath = resolve(mainPath, appName);

        progress?.start(appName, "updating…");
        try {
          await git.pullFF(appWorktreePath);
          updated.push(appName);
          progress?.finish(appName, "done", "updated");
        } catch (error) {
          progress?.finish(appName, "failed", "failed");
          if (verbose) log.warn(`${appName}: ${error}`);
          failed.push({ name: appName, error });
        }
      }

      if (verbose) {
        if (updated.length > 0) log.success(`Updated: ${updated.join(", ")}`);
        if (failed.length > 0) log.warn(`Failed: ${failed.map((f) => f.name).join(", ")}`);
        jadeOutro(`Done`);
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

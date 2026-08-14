import { defineCommand } from "citty";
import { resolve } from "path";
import { intro, outro, cancel, log, spinner } from "@clack/prompts";
import { findWorkspaceRoot, listBareRepos, listWorktreeDirs } from "../utils/workspace.ts";
import { getEnvDirPath, syncEnvToGroup } from "../utils/env.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";

export function makeEnvSyncCommand(fs: FileSystemBackend = realFileSystemBackend) {
  return defineCommand({
    meta: {
      name: "sync",
      description: "Copy .env files from .env/<app>/.env to all worktrees",
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
        : await findWorkspaceRoot(process.cwd(), fs);

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      intro(`Syncing env files`);

      const envDir = getEnvDirPath(workspaceRoot);
      const envDirExists = await fs.pathExists(envDir);
      if (!envDirExists) {
        cancel(`No .env/ directory found at ${envDir}`);
        process.exit(1);
      }

      const groups = await listWorktreeDirs(workspaceRoot, fs);
      const apps = await listBareRepos(workspaceRoot, fs);

      if (groups.length === 0 || apps.length === 0) {
        log.warn(`No worktrees found to sync.`);
        outro(`Done`);
        return;
      }

      const s = spinner();
      s.start(`Copying env files`);

      const allCopied: string[] = [];
      const allSkipped = new Set<string>();

      for (const group of groups) {
        const result = await syncEnvToGroup(workspaceRoot, group, apps, fs);
        allCopied.push(...result.copied);
        result.skipped.forEach((a) => allSkipped.add(a));
      }

      s.stop(`Sync complete`);

      if (allCopied.length > 0) {
        log.success(`Copied:\n${allCopied.map((c) => `  ${c}/.env`).join("\n")}`);
      }
      if (allSkipped.size > 0) {
        log.info(`No source .env for: ${[...allSkipped].join(", ")}`);
      }

      outro(`Done`);
    },
  });
}

export const syncCommand = makeEnvSyncCommand();

const envCommand = defineCommand({
  meta: {
    name: "env",
    description: "Manage environment files",
  },
  subCommands: {
    sync: syncCommand,
  },
});

export default envCommand;

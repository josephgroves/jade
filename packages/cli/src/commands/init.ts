import { defineCommand } from "citty";
import { resolve } from "path";
import { intro, outro, cancel, log } from "@clack/prompts";
import { getBarePath, getMainWorktreePath, getWorktreeContainerPath } from "../utils/workspace.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";
import { type ConfigBackend, realConfigBackend } from "../utils/config-backend.ts";

export function makeInitCommand(
  fs: FileSystemBackend = realFileSystemBackend,
  config: ConfigBackend = realConfigBackend
) {
  return defineCommand({
    meta: {
      name: "init",
      description: "Initialize a new workspace",
    },
    args: {
      path: {
        type: "positional",
        description: "Workspace directory path",
        required: true,
      },
      orgUrl: {
        type: "string",
        description: "GitHub organization URL",
      },
    },
    async run({ args }) {
      const workspaceRoot = resolve(args.path as string);
      const barePath = getBarePath(workspaceRoot);
      const mainPath = getMainWorktreePath(workspaceRoot);
      const worktreeContainerPath = getWorktreeContainerPath(workspaceRoot);

      intro(`Initializing workspace at: ${workspaceRoot}`);

      if (!await fs.pathExists(workspaceRoot)) {
        await fs.mkdirp(workspaceRoot);
        log.success(`Created workspace directory`);
      } else {
        if (await fs.pathExists(barePath)) {
          cancel(`Workspace already initialized at ${workspaceRoot}`);
          process.exit(1);
        }
      }

      await fs.mkdirp(barePath);
      log.success(`Created .bare/ directory`);

      await fs.mkdirp(mainPath);
      log.success(`Created main/ directory`);

      await fs.mkdirp(worktreeContainerPath);
      log.success(`Created workspace/ directory`);

      await config.writeConfig(workspaceRoot, {
        version: "1.0",
        apps: [],
        orgUrl: args.orgUrl as string | undefined,
      });
      log.success(`Created jade.json config`);

      outro(`Workspace initialized! Next: cd ${args.path} && jade add <repo-url>`);
    },
  });
}

export default makeInitCommand();

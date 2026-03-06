import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { $ } from "bun";
import { intro, outro, cancel, log } from "@clack/prompts";
import { writeConfig } from "../utils/config.ts";
import { getBarePath, getMainWorktreePath, getWorktreeContainerPath } from "../utils/workspace.ts";

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

    if (!await pathExists(workspaceRoot)) {
      await $`mkdir -p ${workspaceRoot}`;
      log.success(`Created workspace directory`);
    } else {
      if (await pathExists(barePath)) {
        cancel(`Workspace already initialized at ${workspaceRoot}`);
        process.exit(1);
      }
    }

    await $`mkdir -p ${barePath}`;
    log.success(`Created .bare/ directory`);

    await $`mkdir -p ${mainPath}`;
    log.success(`Created main/ directory`);

    await $`mkdir -p ${worktreeContainerPath}`;
    log.success(`Created workspace/ directory`);

    await writeConfig(workspaceRoot, {
      version: "1.0",
      apps: [],
      orgUrl: args.orgUrl as string | undefined,
    });
    log.success(`Created jade.json config`);

    outro(`Workspace initialized! Next: cd ${args.path} && jade add <repo-url>`);
  },
});

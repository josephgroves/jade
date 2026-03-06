import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { intro, outro, cancel, note } from "@clack/prompts";
import { findWorkspaceRoot, getWorktreeGroupPath, listBareRepos, listWorktreeDirs } from "../utils/workspace.ts";
import { readConfig, getAppNames } from "../utils/config.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function makeStatusCommand(git: GitBackend = realGitBackend) {
  return defineCommand({
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
      intro(`Jade Workspace Status`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      try {
        const config = await readConfig(workspaceRoot);
        const worktreeDirs = await listWorktreeDirs(workspaceRoot);
        const bareRepos = await listBareRepos(workspaceRoot);

        const groupLines = worktreeDirs.length === 0
          ? [`No worktree groups yet. Use 'jade worktree add <name>' to create one.`]
          : worktreeDirs.map((d) => `• ${d}/`);

        note(groupLines.join("\n"), "Worktree Groups");

        if (bareRepos.length === 0) {
          note(`No apps yet. Use 'jade add <url>' to add apps.`, "Apps");
        } else {
          const appLines: string[] = [];
          for (const appName of bareRepos) {
            appLines.push(`• ${appName}`);
            for (const dirName of worktreeDirs) {
              const appPath = resolve(getWorktreeGroupPath(workspaceRoot, dirName), appName);
              if (await pathExists(appPath)) {
                try {
                  const branch = await git.currentBranch(appPath);
                  appLines.push(`    ${dirName.padEnd(20)} → ${branch}`);
                } catch {
                  appLines.push(`    ${dirName.padEnd(20)} → (error)`);
                }
              }
            }
          }
          note(appLines.join("\n"), "Apps");
        }

        const header = [
          `Workspace: ${workspaceRoot}`,
          ...(config.orgUrl ? [`Organization: ${config.orgUrl}`] : []),
        ];
        const appNames = getAppNames(config);
        if (appNames.length > 0) {
          header.push(`Registered: ${appNames.join(", ")}`);
        }

        outro(header.join("\n"));
      } catch (error) {
        cancel(`Failed to get status: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeStatusCommand();

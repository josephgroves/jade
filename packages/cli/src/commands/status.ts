import { defineCommand } from "citty";
import { resolve } from "path";
import {
  findWorkspaceRoot,
  getCurrentGroup,
  getWorktreeGroupPath,
  listBareRepos,
  listWorktreeDirs,
} from "../utils/workspace.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";
import { type ConfigBackend, realConfigBackend } from "../utils/config-backend.ts";
import pkg from "../../package.json" with { type: "json" };

function printAllStatus(workspaceRoot: string, orgUrl: string | undefined, groups: string[]): void {
  const lines: string[] = [
    `version: ${pkg.version}`,
    `root: ${workspaceRoot}`,
  ];
  if (orgUrl) {
    lines.push(`org: ${orgUrl}`);
  }
  lines.push("workspaces:");
  if (groups.length === 0) {
    lines.push("  (none)");
  } else {
    for (const name of groups) {
      lines.push(`  - ${name}`);
    }
  }
  console.log(lines.join("\n"));
}

/**
 * Full-workspace JSON contract. herdr's quick-switch pane needs exactly this
 * shape (every group, no per-app git calls) — it requests it explicitly via
 * `jade status --json --all`, so this must stay stable regardless of what the
 * default (unscoped) --json shape looks like.
 */
function printAllStatusJson(workspaceRoot: string, orgUrl: string | undefined, groups: string[]): void {
  console.log(JSON.stringify({ version: pkg.version, root: workspaceRoot, orgUrl, groups }));
}

function printGroupStatus(
  group: string,
  orgUrl: string | undefined,
  apps: { name: string; branch: string }[]
): void {
  const lines: string[] = [
    `version: ${pkg.version}`,
    `workspace: ${group}`,
  ];
  if (orgUrl) {
    lines.push(`org: ${orgUrl}`);
  }
  lines.push("apps:");
  if (apps.length === 0) {
    lines.push("  (none)");
  } else {
    for (const app of apps) {
      lines.push(`  - ${app.name} (${app.branch})`);
    }
  }
  console.log(lines.join("\n"));
}

function printGroupStatusJson(
  workspaceRoot: string,
  group: string,
  orgUrl: string | undefined,
  apps: { name: string; branch: string }[]
): void {
  console.log(JSON.stringify({ version: pkg.version, root: workspaceRoot, workspace: group, orgUrl, apps }));
}

export function makeStatusCommand(
  git: GitBackend = realGitBackend,
  fs: FileSystemBackend = realFileSystemBackend,
  config: ConfigBackend = realConfigBackend
) {
  return defineCommand({
    meta: {
      name: "status",
      description: "Print status for the current workspace group (use --all for every group)",
    },
    args: {
      group: {
        type: "positional",
        description: "Worktree group to show (defaults to current group, or 'main')",
        required: false,
      },
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path",
      },
      all: {
        type: "boolean",
        alias: "a",
        description: "Show every workspace group instead of just one (also affects --json)",
        default: false,
      },
      json: {
        type: "boolean",
        description: "Print machine-readable JSON instead of plain text",
        default: false,
      },
    },
    async run({ args }) {
      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot(process.cwd(), fs);

      if (!workspaceRoot) {
        console.error("jade status: not in a jade workspace (no .bare/). Run `jade init` first.");
        process.exit(1);
      }

      try {
        const jadeConfig = await config.readConfig(workspaceRoot);
        const groups = await listWorktreeDirs(workspaceRoot, fs);

        if (args.all) {
          if (args.json) {
            printAllStatusJson(workspaceRoot, jadeConfig.orgUrl, groups);
          } else {
            printAllStatus(workspaceRoot, jadeConfig.orgUrl, groups);
          }
          return;
        }

        const group =
          (args.group as string | undefined) ||
          getCurrentGroup(workspaceRoot, process.cwd()) ||
          "main";

        if (!groups.includes(group)) {
          console.error(`jade status: worktree group '${group}' not found. See 'jade workspace list'.`);
          process.exit(1);
        }

        const groupPath = getWorktreeGroupPath(workspaceRoot, group);
        const bareRepos = await listBareRepos(workspaceRoot, fs);
        const apps: { name: string; branch: string }[] = [];

        for (const appName of bareRepos) {
          const appPath = resolve(groupPath, appName);
          if (await fs.pathExists(appPath)) {
            try {
              apps.push({ name: appName, branch: await git.currentBranch(appPath) });
            } catch {
              apps.push({ name: appName, branch: "?" });
            }
          }
        }

        if (args.json) {
          printGroupStatusJson(workspaceRoot, group, jadeConfig.orgUrl, apps);
        } else {
          printGroupStatus(group, jadeConfig.orgUrl, apps);
        }
      } catch (error) {
        console.error(`jade status: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeStatusCommand();

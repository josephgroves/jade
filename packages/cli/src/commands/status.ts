import { defineCommand } from "citty";
import { resolve } from "path";
import { findWorkspaceRoot, listWorktreeDirs } from "../utils/workspace.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";
import { type ConfigBackend, realConfigBackend } from "../utils/config-backend.ts";
import pkg from "../../package.json" with { type: "json" };

function printStatus(workspaceRoot: string, orgUrl: string | undefined, groups: string[]): void {
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

function printStatusJson(workspaceRoot: string, orgUrl: string | undefined, groups: string[]): void {
  console.log(JSON.stringify({ version: pkg.version, root: workspaceRoot, orgUrl, groups }));
}

export function makeStatusCommand(
  fs: FileSystemBackend = realFileSystemBackend,
  config: ConfigBackend = realConfigBackend
) {
  return defineCommand({
    meta: {
      name: "status",
      description: "Print jade version, workspace root, org URL, and workspace groups",
    },
    args: {
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path",
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
        if (args.json) {
          printStatusJson(workspaceRoot, jadeConfig.orgUrl, groups);
        } else {
          printStatus(workspaceRoot, jadeConfig.orgUrl, groups);
        }
      } catch (error) {
        console.error(`jade status: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeStatusCommand();

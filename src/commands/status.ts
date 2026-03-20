import { defineCommand } from "citty";
import { resolve } from "path";
import { findWorkspaceRoot, listWorktreeDirs } from "../utils/workspace.ts";
import { readConfig } from "../utils/config.ts";
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

export function makeStatusCommand() {
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
    },
    async run({ args }) {
      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        console.error("jade status: not in a jade workspace (no .bare/). Run `jade init` first.");
        process.exit(1);
      }

      try {
        const config = await readConfig(workspaceRoot);
        const groups = await listWorktreeDirs(workspaceRoot);
        printStatus(workspaceRoot, config.orgUrl, groups);
      } catch (error) {
        console.error(`jade status: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeStatusCommand();

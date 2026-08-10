import { defineCommand } from "citty";
import { resolve } from "path";
import { $ } from "bun";
import { intro, outro, cancel, log } from "@clack/prompts";
import {
  findWorkspaceRoot,
  getCurrentGroup,
  getWorktreeGroupPath,
  listBareRepos,
} from "../utils/workspace.ts";
import { getAppNames } from "../utils/config.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";
import { type ConfigBackend, realConfigBackend } from "../utils/config-backend.ts";

/**
 * Runs a herdr CLI invocation and returns its stdout (herdr prints a JSON
 * object per command). Injected so tests can capture commands and feed canned
 * responses without a running multiplexer. The real implementation prefers
 * HERDR_BIN_PATH (set by herdr inside a managed pane) and falls back to `herdr`
 * on PATH. Output is captured (quiet) so herdr's JSON doesn't clutter the pane.
 */
export type HerdrRunner = (args: string[]) => Promise<string>;

const defaultRunHerdr: HerdrRunner = async (args) => {
  const bin = process.env.HERDR_BIN_PATH || "herdr";
  const result = await $`${bin} ${args}`.quiet();
  return result.stdout.toString();
};

/** Find an existing herdr workspace's id by its label, from `workspace list` JSON. */
function findWorkspaceIdByLabel(listOutput: string, label: string): string | null {
  try {
    const parsed = JSON.parse(listOutput);
    const workspaces = parsed?.result?.workspaces ?? [];
    const match = workspaces.find((w: { label?: string }) => w.label === label);
    return match?.workspace_id ?? null;
  } catch {
    return null;
  }
}

/** Pull the new workspace id and its initial tab id out of `workspace create` JSON. */
function parseCreatedWorkspace(createOutput: string): { workspaceId: string | null; rootTabId: string | null } {
  try {
    const parsed = JSON.parse(createOutput);
    const result = parsed?.result ?? {};
    return {
      workspaceId: result.workspace?.workspace_id ?? result.workspace_id ?? null,
      rootTabId: result.tab?.tab_id ?? result.root_pane?.tab_id ?? null,
    };
  } catch {
    return { workspaceId: null, rootTabId: null };
  }
}

export function makeOpenCommand(
  runHerdr: HerdrRunner = defaultRunHerdr,
  fs: FileSystemBackend = realFileSystemBackend,
  config: ConfigBackend = realConfigBackend
) {
  return defineCommand({
    meta: {
      name: "open",
      description:
        "Open a worktree group as a dedicated herdr workspace (labeled with the group name), with a root tab plus one tab per app",
    },
    args: {
      group: {
        type: "positional",
        description: "Worktree group to open (defaults to the current group, or 'main')",
        required: false,
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

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      if (process.env.HERDR_ENV !== "1") {
        cancel(
          `jade open must be run inside a herdr session (HERDR_ENV is not set).\n` +
            `  Start a herdr pane and run jade open from there.`
        );
        process.exit(1);
      }

      const group =
        (args.group as string | undefined) ||
        getCurrentGroup(workspaceRoot, process.cwd()) ||
        "main";
      const groupPath = getWorktreeGroupPath(workspaceRoot, group);

      if (!(await fs.pathExists(groupPath))) {
        cancel(`Worktree group '${group}' not found. See 'jade workspace list'.`);
        process.exit(1);
      }

      // Which apps are physically present in this group.
      const bareRepos = await listBareRepos(workspaceRoot, fs);
      const present = new Set<string>();
      for (const app of bareRepos) {
        if (await fs.pathExists(resolve(groupPath, app))) present.add(app);
      }

      // Order tabs by jade.json (the order apps were added) for a stable, intuitive
      // layout; append any present-but-unlisted apps alphabetically as a fallback.
      const configOrder = getAppNames(await config.readConfig(workspaceRoot));
      const apps = [
        ...configOrder.filter((app) => present.has(app)),
        ...[...present].filter((app) => !configOrder.includes(app)).sort(),
      ];

      intro(`Opening '${group}' in herdr`);

      try {
        // If a herdr workspace for this group already exists, just focus it —
        // re-running jade open shouldn't pile up duplicate workspaces/tabs.
        const existingId = findWorkspaceIdByLabel(await runHerdr(["workspace", "list"]), group);
        if (existingId) {
          await runHerdr(["workspace", "focus", existingId]);
          outro(`Focused existing '${group}' workspace. Run claude in its root tab for cross-app context.`);
          return;
        }

        // Create a dedicated, focused herdr workspace for this group so the
        // sidebar shows which group you're in. `workspace create` also spawns
        // an initial tab at groupPath — that's our root tab; rename it to the
        // group so it reads clearly.
        const { workspaceId, rootTabId } = parseCreatedWorkspace(
          await runHerdr(["workspace", "create", "--cwd", groupPath, "--label", group, "--focus"])
        );

        if (!workspaceId) {
          cancel(`herdr did not return a workspace id for '${group}'.`);
          process.exit(1);
        }

        if (rootTabId) {
          await runHerdr(["tab", "rename", rootTabId, group]);
        }

        // One tab per app inside the new workspace, without stealing focus so
        // the root tab stays active.
        for (const app of apps) {
          await runHerdr([
            "tab",
            "create",
            "--workspace",
            workspaceId,
            "--cwd",
            resolve(groupPath, app),
            "--label",
            app,
            "--no-focus",
          ]);
        }
      } catch (error) {
        cancel(`Failed to drive herdr: ${error}`);
        process.exit(1);
      }

      if (apps.length > 0) {
        log.success(`Opened workspace '${group}' with tabs: ${group} (root), ${apps.join(", ")}`);
      } else {
        log.warn(`No apps found in '${group}'. Opened the '${group}' workspace with a root tab only.`);
      }

      outro(`Ready — run claude in the '${group}' root tab for cross-app context.`);
    },
  });
}

export default makeOpenCommand();

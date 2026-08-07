import { defineCommand } from "citty";
import { resolve } from "path";
import {
  findWorkspaceRoot,
  getCurrentGroup,
  listWorktreeDirs,
  pathExists,
} from "../utils/workspace.ts";
import { resolveGroup, type ResolvedGroup } from "../utils/group.ts";
import { readConfig } from "../utils/config.ts";
import { getAppEnvSourcePath } from "../utils/env.ts";
import { type GitBackend, realGitBackend, type WorktreeStatus } from "../utils/git-backend.ts";
import { defaultRunHerdr, findWorkspaceByLabel, type HerdrRunner } from "../utils/herdr.ts";
import pkg from "../../package.json" with { type: "json" };

export type StatusTarget = { view: "root" } | { view: "workspace"; name: string };

/**
 * Decide whether `jade status` reports the whole root or a single workspace.
 *
 * Kept pure and exported so the contextual rules are testable without chdir'ing
 * the test process. An explicit name always wins — including over --root — so
 * `jade status <name>` means the same thing wherever you run it.
 */
export function resolveStatusTarget(opts: {
  workspaceRoot: string;
  explicitName?: string;
  forceRoot: boolean;
  cwd: string;
}): StatusTarget {
  if (opts.explicitName) return { view: "workspace", name: opts.explicitName };
  if (opts.forceRoot) return { view: "root" };

  const current = getCurrentGroup(opts.workspaceRoot, opts.cwd);
  if (current) return { view: "workspace", name: current };

  return { view: "root" };
}

type AttentionKind =
  | "branch-drift"
  | "detached-head"
  | "missing-worktree"
  | "missing-env"
  | "git-error";

interface Attention {
  app: string;
  kind: AttentionKind;
  message: string;
  fix?: string;
}

interface AppReport {
  name: string;
  present: boolean;
  path: string;
  branch: string | null;
  drift: boolean;
  detached: boolean;
  tree: (WorktreeStatus & { clean: boolean }) | null;
  env: { present: boolean; sourceAvailable: boolean } | null;
  error: string | null;
}

interface HerdrReport {
  open: boolean;
  focused: boolean;
  workspaceId: string | null;
}

/**
 * Raised for an unknown workspace name so the single catch below can render a
 * helpful message instead of a bare stringified error.
 */
class WorkspaceNotFoundError extends Error {
  constructor(readonly workspaceName: string, readonly available: string[]) {
    super(`workspace '${workspaceName}' not found`);
  }
}

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
  console.log(
    JSON.stringify({ view: "root", version: pkg.version, root: workspaceRoot, orgUrl, groups })
  );
}

/**
 * The workspace name plus the apps actually checked out here, one per line with
 * their branch. Deliberately terse — everything else (working-tree state, env
 * gaps, missing apps, herdr, the actionable `attention` list) stays available
 * via --json rather than crowding the interactive view.
 */
function printWorkspaceStatus(group: ResolvedGroup, apps: AppReport[]): void {
  const lines: string[] = [`workspace: ${group.name}`];
  const installed = apps.filter((app) => app.present);

  if (installed.length === 0) {
    lines.push("  (none)");
  } else {
    const rows = installed.map((app) => ({
      name: app.name,
      branch: app.error ? "(error)" : (app.branch ?? "?"),
      // Only branch-level facts earn a marker here; the branch is the one thing
      // this view reports, so drift and detachment are what can contradict it.
      marker: app.detached ? "[detached]" : app.drift ? "[drift]" : "",
    }));

    const nameWidth = Math.max(...rows.map((r) => r.name.length));
    const branchWidth = Math.max(...rows.map((r) => r.branch.length));

    for (const row of rows) {
      const cells = `  ${row.name.padEnd(nameWidth)}  ${
        row.marker ? row.branch.padEnd(branchWidth) : row.branch
      }`;
      lines.push(row.marker ? `${cells}  ${row.marker}` : cells);
    }
  }

  console.log(lines.join("\n"));
}

function printWorkspaceStatusJson(
  workspaceRoot: string,
  orgUrl: string | undefined,
  group: ResolvedGroup,
  apps: AppReport[],
  herdr: HerdrReport | null,
  attention: Attention[]
): void {
  console.log(
    JSON.stringify({
      view: "workspace",
      version: pkg.version,
      root: workspaceRoot,
      orgUrl,
      workspace: group.name,
      path: group.path,
      isMain: group.isMain,
      ...(herdr ? { herdr } : {}),
      apps,
      attention,
    })
  );
}

/**
 * Gather per-app state for one workspace. Runs the apps concurrently: this is
 * the only view that makes git calls, so per-app latency is what the user feels.
 *
 * `detailed` gates the work the terse text view never renders — a status call
 * and two stats per app — so the interactive path costs one git call per app.
 */
async function collectApps(
  workspaceRoot: string,
  group: ResolvedGroup,
  git: GitBackend,
  detailed: boolean
): Promise<AppReport[]> {
  return await Promise.all(
    group.apps.map(async (app): Promise<AppReport> => {
      if (!app.present) {
        return {
          name: app.name,
          present: false,
          path: app.path,
          branch: null,
          drift: false,
          detached: false,
          tree: null,
          env: null,
          error: null,
        };
      }

      const env = detailed
        ? {
            present: await pathExists(resolve(app.path, ".env")),
            sourceAvailable: await pathExists(getAppEnvSourcePath(workspaceRoot, app.name)),
          }
        : null;

      try {
        const [branch, tree] = await Promise.all([
          git.currentBranch(app.path),
          detailed ? git.status(app.path) : null,
        ]);

        // `rev-parse --abbrev-ref HEAD` reports the literal "HEAD" when detached;
        // that isn't branch drift, it's a different problem worth naming.
        const detached = branch === "HEAD";

        return {
          name: app.name,
          present: true,
          path: app.path,
          branch,
          drift: !detached && branch !== group.name,
          detached,
          tree: tree
            ? { ...tree, clean: tree.staged === 0 && tree.unstaged === 0 && tree.untracked === 0 }
            : null,
          env,
          error: null,
        };
      } catch (error) {
        // One broken worktree must not sink the whole report.
        return {
          name: app.name,
          present: true,
          path: app.path,
          branch: null,
          drift: false,
          detached: false,
          tree: null,
          env,
          error: String(error),
        };
      }
    })
  );
}

function buildAttention(group: ResolvedGroup, apps: AppReport[]): Attention[] {
  const attention: Attention[] = [];

  for (const app of apps) {
    if (!app.present) {
      attention.push({
        app: app.name,
        kind: "missing-worktree",
        message: "no worktree in this workspace",
        fix: `jade workspace add ${group.name}`,
      });
      continue;
    }

    if (app.error) {
      attention.push({
        app: app.name,
        kind: "git-error",
        message: `could not read git state: ${app.error}`,
      });
      continue;
    }

    if (app.detached) {
      attention.push({
        app: app.name,
        kind: "detached-head",
        message: "detached HEAD, not on a branch",
        // `jade checkout --app` resolves the app relative to cwd.
        fix: `cd ${group.path} && jade checkout ${group.name} --app ${app.name}`,
      });
    } else if (app.drift) {
      attention.push({
        app: app.name,
        kind: "branch-drift",
        message:
          `on '${app.branch}', not '${group.name}' ` +
          `(the branch was likely already checked out in another workspace)`,
        fix: `cd ${group.path} && jade checkout ${group.name} --app ${app.name}`,
      });
    }

    if (app.env && !app.env.present && app.env.sourceAvailable) {
      attention.push({
        app: app.name,
        kind: "missing-env",
        message: ".env missing, source available",
        fix: "jade env sync",
      });
    }
  }

  return attention;
}

/**
 * Query herdr for whether this group is open in the current session. Best
 * effort by design: status must never fail because herdr is unreachable.
 */
async function collectHerdr(
  groupName: string,
  runHerdr: HerdrRunner
): Promise<HerdrReport | null> {
  if (process.env.HERDR_ENV !== "1") return null;

  try {
    const found = findWorkspaceByLabel(await runHerdr(["workspace", "list"]), groupName);
    if (!found) return { open: false, focused: false, workspaceId: null };
    return { open: true, focused: found.focused, workspaceId: found.workspaceId };
  } catch {
    return null;
  }
}

export function makeStatusCommand(
  git: GitBackend = realGitBackend,
  runHerdr: HerdrRunner = defaultRunHerdr
) {
  return defineCommand({
    meta: {
      name: "status",
      description:
        "Show workspace status. Inside a workspace, reports that workspace's apps, branches and gaps; at the workspace root, lists jade version, root, org URL and workspaces",
    },
    args: {
      name: {
        type: "positional",
        description: "Workspace to report on (defaults to the current workspace, if any)",
        required: false,
      },
      workspace: {
        type: "string",
        alias: "w",
        description: "Workspace root path",
      },
      root: {
        type: "boolean",
        description: "Force the root summary even when run from inside a workspace",
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
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        console.error("jade status: not in a jade workspace (no .bare/). Run `jade init` first.");
        process.exit(1);
      }

      try {
        const config = await readConfig(workspaceRoot);
        const target = resolveStatusTarget({
          workspaceRoot,
          explicitName: args.name as string | undefined,
          forceRoot: args.root as boolean,
          cwd: process.cwd(),
        });

        if (target.view === "root") {
          const groups = await listWorktreeDirs(workspaceRoot);
          if (args.json) {
            printStatusJson(workspaceRoot, config.orgUrl, groups);
          } else {
            printStatus(workspaceRoot, config.orgUrl, groups);
          }
          return;
        }

        const group = await resolveGroup(workspaceRoot, target.name);

        if (!group.exists) {
          throw new WorkspaceNotFoundError(target.name, await listWorktreeDirs(workspaceRoot));
        }

        const asJson = args.json as boolean;
        const apps = await collectApps(workspaceRoot, group, git, asJson);

        if (!asJson) {
          printWorkspaceStatus(group, apps);
          return;
        }

        // Only the JSON view carries the full picture, so only it pays for the
        // extra gathering — including the herdr subprocess.
        const herdr = await collectHerdr(group.name, runHerdr);
        printWorkspaceStatusJson(
          workspaceRoot,
          config.orgUrl,
          group,
          apps,
          herdr,
          buildAttention(group, apps)
        );
      } catch (error) {
        if (error instanceof WorkspaceNotFoundError) {
          console.error(
            `jade status: workspace '${error.workspaceName}' not found.\n` +
              (error.available.length > 0
                ? `  Available: ${error.available.join(", ")}`
                : `  No workspaces yet. Create one with 'jade workspace add <name>'.`)
          );
        } else {
          console.error(`jade status: ${error}`);
        }
        process.exit(1);
      }
    },
  });
}

export default makeStatusCommand();

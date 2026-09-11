import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { intro, outro, cancel, log } from "@clack/prompts";
import {
  findWorkspaceRoot,
  getCurrentGroup,
  getWorktreeGroupPath,
  listBareRepos,
} from "../utils/workspace.ts";
import { getAppNames, readConfig } from "../utils/config.ts";
import { defaultRunHerdr, findWorkspaceByLabel, type HerdrRunner } from "../utils/herdr.ts";
import {
  defaultRunTmux,
  defaultAttachTmux,
  tmuxSessionExists,
  type TmuxRunner,
  type TmuxAttacher,
} from "../utils/tmux.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export type { HerdrRunner, TmuxRunner, TmuxAttacher };

/** Find an existing herdr workspace's id by its label, from `workspace list` JSON. */
function findWorkspaceIdByLabel(listOutput: string, label: string): string | null {
  return findWorkspaceByLabel(listOutput, label)?.workspaceId ?? null;
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

/**
 * tmux backend for `jade open`. Mirrors the herdr flow (focus an existing
 * session, else create one) but addresses everything by name — tmux has no
 * opaque ids to parse out of JSON like herdr does. Has no precondition of its
 * own (unlike herdr's `HERDR_ENV` requirement) — it works from anywhere,
 * handing off to the session differently depending on where "anywhere" is:
 *
 * - Already attached to a tmux client (`$TMUX` set): a quick, non-blocking
 *   `switch-client` — you're already looking at a tmux client, just point it
 *   at the new session.
 * - Inside a herdr pane (`--tmux` forced the tmux backend despite
 *   `HERDR_ENV=1`): create/find the session and stop there. There's no plain
 *   terminal to hand off to, and attaching would nest a tmux client inside
 *   the herdr pane, so it's left running in the background instead.
 * - Otherwise (a plain terminal, no multiplexer at all): hand the terminal
 *   over to an interactive `attach-session` via `attachTmux`.
 *
 * Returns the tmux client's exit code when it does that interactive attach,
 * or `undefined` for the other two (non-blocking) cases. Callers must
 * `process.exit()` with a defined result themselves, and only *outside* any
 * try/catch around this call — a caught rethrow followed by `process.exit(1)`
 * would otherwise stomp a real (e.g. 0) exit code from a successful attach.
 */
async function openWithTmux(
  runTmux: TmuxRunner,
  attachTmux: TmuxAttacher,
  group: string,
  groupPath: string,
  apps: string[]
): Promise<number | undefined> {
  const attachedToTmux = Boolean(process.env.TMUX);
  const inHerdr = process.env.HERDR_ENV === "1";

  const existed = await tmuxSessionExists(runTmux, group);

  if (!existed) {
    const created = await runTmux(["new-session", "-d", "-s", group, "-n", group, "-c", groupPath]);
    if (created.exitCode !== 0) {
      cancel(`Failed to create tmux session '${group}': ${created.stderr || created.stdout}`);
      process.exit(1);
    }

    for (const app of apps) {
      // Trailing colon forces a session-only target — the root window shares
      // its name with the session, so a bare `-t group` is ambiguous and tmux
      // resolves it to that window instead of "append to this session".
      await runTmux(["new-window", "-t", `${group}:`, "-n", app, "-c", resolve(groupPath, app)]);
    }

    // Creating windows leaves the last one selected; bring focus back to root.
    await runTmux(["select-window", "-t", `${group}:${group}`]);

    if (apps.length > 0) {
      log.success(`Opened tmux session '${group}' with windows: ${group} (root), ${apps.join(", ")}`);
    } else {
      log.warn(`No apps found in '${group}'. Opened the '${group}' tmux session with a root window only.`);
    }
  }

  if (attachedToTmux) {
    await runTmux(["switch-client", "-t", group]);
    outro(
      existed
        ? `Focused existing '${group}' tmux session. Run claude in its root window for cross-app context.`
        : `Ready — run claude in the '${group}' root window for cross-app context.`
    );
    return undefined;
  }

  if (inHerdr) {
    outro(
      existed
        ? `tmux session '${group}' is already running in the background. Attach from a terminal with 'tmux attach -t ${group}'.`
        : `tmux session '${group}' created in the background. Attach from a terminal with 'tmux attach -t ${group}'.`
    );
    return undefined;
  }

  outro(
    existed
      ? `Attaching to existing '${group}' tmux session. Run claude in its root window for cross-app context.`
      : `Ready — run claude in the '${group}' root window for cross-app context.`
  );
  return await attachTmux(group);
}

export function makeOpenCommand(
  runHerdr: HerdrRunner = defaultRunHerdr,
  runTmux: TmuxRunner = defaultRunTmux,
  attachTmux: TmuxAttacher = defaultAttachTmux
) {
  return defineCommand({
    meta: {
      name: "open",
      description:
        "Open a worktree group as a dedicated herdr workspace or tmux session (labeled with the group name), with a root tab/window plus one per app",
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
      tmux: {
        type: "boolean",
        description: "Force the tmux backend, even inside a herdr pane (HERDR_ENV=1)",
        default: false,
      },
    },
    async run({ args }) {
      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
        process.exit(1);
      }

      // herdr wins when both are active, unless --tmux forces the tmux
      // backend; otherwise tmux is the universal fallback — it needs no
      // pre-existing session (see openWithTmux).
      const useHerdr = process.env.HERDR_ENV === "1" && !args.tmux;

      const group =
        (args.group as string | undefined) ||
        getCurrentGroup(workspaceRoot, process.cwd()) ||
        "main";
      const groupPath = getWorktreeGroupPath(workspaceRoot, group);

      if (!(await pathExists(groupPath))) {
        cancel(`Worktree group '${group}' not found. See 'jade workspace list'.`);
        process.exit(1);
      }

      // Which apps are physically present in this group.
      const bareRepos = await listBareRepos(workspaceRoot);
      const present = new Set<string>();
      for (const app of bareRepos) {
        if (await pathExists(resolve(groupPath, app))) present.add(app);
      }

      // Order tabs by jade.json (the order apps were added) for a stable, intuitive
      // layout; append any present-but-unlisted apps alphabetically as a fallback.
      const configOrder = getAppNames(await readConfig(workspaceRoot));
      const apps = [
        ...configOrder.filter((app) => present.has(app)),
        ...[...present].filter((app) => !configOrder.includes(app)).sort(),
      ];

      intro(`Opening '${group}' in ${useHerdr ? "herdr" : "tmux"}`);

      if (!useHerdr) {
        let tmuxExitCode: number | undefined;
        try {
          tmuxExitCode = await openWithTmux(runTmux, attachTmux, group, groupPath, apps);
        } catch (error) {
          cancel(`Failed to drive tmux: ${error}`);
          process.exit(1);
        }
        // Exit outside the try/catch so a real attach exit code (e.g. 0)
        // can't be mistaken for — and overwritten by — the failure path above.
        if (tmuxExitCode !== undefined) process.exit(tmuxExitCode);
        return;
      }

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

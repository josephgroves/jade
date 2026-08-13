import { spawnSync } from "node:child_process";
import { select, isCancel, intro, outro, cancel, log, text } from "@clack/prompts";
import { resolveContextCwd, jadeBin } from "../lib/context.ts";
import { listOpenWorkspaces, focusWorkspace, type OpenWorkspace } from "../lib/herdr.ts";

function jadeCaptured(args: string[], cwd: string): { stdout: string; status: number } {
  const result = spawnSync(jadeBin(), args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return { stdout: result.stdout ?? "", status: result.status ?? 1 };
}

function jadeInherited(args: string[], cwd: string): number {
  const result = spawnSync(jadeBin(), args, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

/**
 * Prints an error and waits for a keypress before returning. Panes close as soon
 * as their process exits, so an error printed right before process.exit() can
 * flash by unread — this forces a deliberate dismissal.
 */
async function waitToClose(message: string): Promise<void> {
  log.error(message);
  await text({ message: "Press Enter to close this pane" });
}

// Sort so the most likely quick-switch targets come first: other open
// workspaces, then not-yet-opened groups, then the one you're already in.
const RANK = { open: 0, closed: 1, current: 2 } as const;

function classify(name: string, open: Map<string, OpenWorkspace>) {
  const ws = open.get(name);
  if (ws?.focused) return { ws, rank: RANK.current, hint: "current" };
  if (ws) return { ws, rank: RANK.open, hint: "open — switch to it" };
  return { ws: undefined, rank: RANK.closed, hint: "open workspace" };
}

async function main() {
  const cwd = resolveContextCwd();

  intro("Jade switch");

  // `jade status --json --all` is just a directory scan (no per-app git calls),
  // so the switcher stays snappy — the whole point of a quick-switch overlay.
  // --all is required: plain `jade status --json` now scopes to the current
  // group, which isn't what a cross-group switcher needs.
  const statusResult = jadeCaptured(["status", "--json", "--all"], cwd);
  if (statusResult.status !== 0) {
    await waitToClose(
      `Not a jade workspace here (${cwd}).\nRun 'jade init', or summon this from inside a jade-managed workspace.`
    );
    process.exit(1);
  }

  let groups: string[];
  try {
    ({ groups } = JSON.parse(statusResult.stdout) as { groups: string[] });
  } catch {
    await waitToClose(`Could not parse 'jade status --json --all' output from ${cwd}.`);
    process.exit(1);
  }

  if (!groups || groups.length === 0) {
    await waitToClose(`No workspaces yet in ${cwd}.\nCreate one with 'jade workspace add <name>'.`);
    process.exit(1);
  }

  // Which groups are already open in this herdr session (matched by workspace label).
  const open = listOpenWorkspaces();

  const options = groups
    .map((name) => ({ name, ...classify(name, open) }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map(({ name, hint }) => ({ value: name, label: name, hint }));

  const choice = await select({ message: "Switch to a workspace", options });

  if (isCancel(choice)) {
    cancel("Cancelled");
    process.exit(0);
  }

  const group = choice as string;
  const ws = open.get(group);

  // Already open: focus it directly through herdr — instant, no jade spin-up.
  // Fall back to a full `jade open` if focusing fails (e.g. a stale id).
  if (ws) {
    if (ws.focused) {
      outro(`Already in '${group}'`);
      process.exit(0);
    }
    outro(`Switching to '${group}'`);
    const status = focusWorkspace(ws.workspaceId);
    if (status === 0) process.exit(0);
    log.warn(`Could not focus '${group}' directly; reopening via jade.`);
  }

  // Not open (or focus failed): open the full workspace as tabs.
  outro(`Opening '${group}'`);
  process.exit(jadeInherited(["open", group], cwd));
}

main();

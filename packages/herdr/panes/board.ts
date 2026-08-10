import { spawnSync } from "node:child_process";
import { select, text, isCancel, intro, outro, cancel, log, spinner } from "@clack/prompts";
import { resolveContextCwd, jadeBin } from "../lib/context.ts";

interface WorkspaceApp {
  name: string;
  branch: string;
}

interface WorkspaceGroup {
  name: string;
  apps: WorkspaceApp[];
}

const NEW_WORKSPACE = "__new_workspace__";

function jadeCaptured(args: string[], cwd: string): { stdout: string; status: number } {
  const result = spawnSync(jadeBin(), args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return { stdout: result.stdout ?? "", status: result.status ?? 1 };
}

function jadeInherited(args: string[], cwd: string): number {
  const result = spawnSync(jadeBin(), args, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

/**
 * Prints an error and waits for a keypress before returning. Panes appear to
 * close as soon as their process exits, so an error printed right before
 * process.exit() can flash by unread — this forces a deliberate dismissal.
 */
async function waitToClose(message: string): Promise<void> {
  log.error(message);
  await text({ message: "Press Enter to close this pane" });
}

/** Compact per-group hint: app count plus a few branch names, never a wall of text. */
function groupHint(g: WorkspaceGroup): string {
  if (g.apps.length === 0) return "empty";
  const shown = g.apps.slice(0, 3).map((a) => `${a.name}@${a.branch}`);
  const rest = g.apps.length - shown.length;
  return `${g.apps.length} apps: ${shown.join(", ")}${rest > 0 ? `, +${rest} more` : ""}`;
}

async function main() {
  const cwd = resolveContextCwd();

  intro("Jade board");

  // `jade workspace list` runs a git call per app per group, so on big
  // workspaces it takes a few seconds. Show feedback so the pane isn't blank.
  const s = spinner();
  s.start(`Loading workspaces from ${cwd}`);
  const listResult = jadeCaptured(["workspace", "list", "--json"], cwd);

  if (listResult.status !== 0) {
    s.error("Could not read workspaces");
    await waitToClose(
      `Not a jade workspace here (${cwd}).\nRun 'jade init', or open this pane from inside a jade-managed workspace.`
    );
    process.exit(1);
  }

  let groups: WorkspaceGroup[];
  try {
    ({ groups } = JSON.parse(listResult.stdout) as { groups: WorkspaceGroup[] });
  } catch {
    s.error("Could not read workspaces");
    await waitToClose(`Could not parse 'jade workspace list --json' output from ${cwd}.`);
    process.exit(1);
  }
  s.stop(`${groups.length} workspace${groups.length === 1 ? "" : "s"}`);

  const choice = await select({
    message: "Open a workspace group, or create a new one",
    options: [
      ...groups.map((g) => ({
        value: g.name,
        label: g.name,
        hint: groupHint(g),
      })),
      { value: NEW_WORKSPACE, label: "+ New feature workspace" },
    ],
  });

  if (isCancel(choice)) {
    cancel("Cancelled");
    process.exit(0);
  }

  let group = choice as string;

  if (group === NEW_WORKSPACE) {
    const name = await text({ message: "Workspace name" });
    if (isCancel(name) || !name) {
      cancel("Cancelled");
      process.exit(0);
    }
    group = name as string;

    const createStatus = jadeInherited(["workspace", "add", group, "-a"], cwd);
    if (createStatus !== 0) {
      await waitToClose(`Failed to create workspace '${group}' (exit ${createStatus}).`);
      process.exit(createStatus);
    }
  }

  outro(`Opening '${group}'`);
  process.exit(jadeInherited(["open", group], cwd));
}

main();

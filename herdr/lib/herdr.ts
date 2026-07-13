import { spawnSync } from "node:child_process";

/**
 * The herdr binary to drive. Inside a plugin pane herdr sets HERDR_BIN_PATH to
 * the exact binary running the session; fall back to `herdr` on PATH otherwise.
 * Mirrors how `jade open` resolves herdr so the plugin and CLI stay in step.
 */
export function herdrBin(): string {
  return process.env.HERDR_BIN_PATH || "herdr";
}

export interface OpenWorkspace {
  label: string;
  workspaceId: string;
  focused: boolean;
}

/**
 * Parse `herdr workspace list` JSON into workspaces keyed by label. `jade open`
 * labels every workspace with its group name, so the label is what we match a
 * jade group against. Pure and defensive: malformed or unexpected output yields
 * an empty map rather than throwing, so the caller degrades to "nothing open".
 */
export function parseOpenWorkspaces(stdout: string): Map<string, OpenWorkspace> {
  const map = new Map<string, OpenWorkspace>();
  try {
    const parsed = JSON.parse(stdout);
    const workspaces = parsed?.result?.workspaces ?? [];
    for (const w of workspaces) {
      if (typeof w?.label === "string" && typeof w?.workspace_id === "string") {
        map.set(w.label, {
          label: w.label,
          workspaceId: w.workspace_id,
          focused: Boolean(w.focused),
        });
      }
    }
  } catch {
    // fall through to empty map
  }
  return map;
}

/**
 * Query herdr for the workspaces currently open in this session, keyed by label.
 * Returns an empty map if herdr can't be reached — callers treat that as
 * "nothing is open yet" and open fresh.
 */
export function listOpenWorkspaces(): Map<string, OpenWorkspace> {
  const result = spawnSync(herdrBin(), ["workspace", "list"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || !result.stdout) return new Map();
  return parseOpenWorkspaces(result.stdout);
}

/** Focus an already-open herdr workspace by id. Returns the exit status. */
export function focusWorkspace(workspaceId: string): number {
  const result = spawnSync(herdrBin(), ["workspace", "focus", workspaceId], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  return result.status ?? 1;
}

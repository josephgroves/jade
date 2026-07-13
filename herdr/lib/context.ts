/**
 * Resolve the directory the invoked jade commands should run in.
 *
 * We must NOT rely on this process's own cwd: herdr launches plugin entry
 * points from the plugin root so their relative command paths resolve, which
 * means process.cwd() is the plugin dir, not the user's workspace. Instead the
 * keybinding forwards the focused pane's directory explicitly:
 *   - JADE_CWD env var (set via `herdr plugin pane open --env JADE_CWD=...`),
 *   - or HERDR_PLUGIN_CONTEXT_JSON's tab/pane/workspace cwd when herdr provides
 *     it (e.g. for actions invoked with context).
 * Falls back to process.cwd() only as a last resort.
 */
export function resolveContextCwd(): string {
  const explicit = process.env.JADE_CWD;
  if (explicit && explicit.length > 0) return explicit;

  // herdr's context JSON uses flat keys (verified against a live 0.7 session):
  // focused_pane_cwd, workspace_cwd, tab_id, ... — not nested objects.
  const raw = process.env.HERDR_PLUGIN_CONTEXT_JSON;
  if (raw) {
    try {
      const ctx = JSON.parse(raw);
      const cwd = ctx?.focused_pane_cwd ?? ctx?.workspace_cwd;
      if (typeof cwd === "string" && cwd.length > 0) return cwd;
    } catch {
      // fall through
    }
  }

  return process.cwd();
}

export function jadeBin(): string {
  return process.env.JADE_BIN_PATH || "jade";
}

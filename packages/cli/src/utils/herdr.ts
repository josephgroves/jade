import { $ } from "bun";

/**
 * Runs a herdr CLI invocation and returns its stdout (herdr prints a JSON
 * object per command). Injected so tests can capture commands and feed canned
 * responses without a running multiplexer. The real implementation prefers
 * HERDR_BIN_PATH (set by herdr inside a managed pane) and falls back to `herdr`
 * on PATH. Output is captured (quiet) so herdr's JSON doesn't clutter the pane.
 */
export type HerdrRunner = (args: string[]) => Promise<string>;

export const defaultRunHerdr: HerdrRunner = async (args) => {
  const bin = process.env.HERDR_BIN_PATH || "herdr";
  const result = await $`${bin} ${args}`.quiet();
  return result.stdout.toString();
};

export interface HerdrWorkspace {
  workspaceId: string;
  focused: boolean;
}

/**
 * Find a herdr workspace by its label in `workspace list` JSON. `jade open`
 * labels every herdr workspace with its jade group name, so the label is the
 * only join key between the two systems.
 *
 * Defensive by design: malformed or unexpected output yields null rather than
 * throwing, so callers degrade to "not open" instead of failing.
 */
export function findWorkspaceByLabel(listOutput: string, label: string): HerdrWorkspace | null {
  try {
    const parsed = JSON.parse(listOutput);
    const workspaces = parsed?.result?.workspaces ?? [];
    const match = workspaces.find((w: { label?: string }) => w.label === label);
    const workspaceId = match?.workspace_id;
    if (typeof workspaceId !== "string") return null;
    return { workspaceId, focused: Boolean(match.focused) };
  } catch {
    return null;
  }
}

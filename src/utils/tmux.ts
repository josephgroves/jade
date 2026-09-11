import { $ } from "bun";

/**
 * Runs a tmux CLI invocation and returns its exit code plus captured
 * stdout/stderr. Injected so tests can capture commands and feed canned exit
 * codes without a running tmux server. Unlike herdr, tmux communicates
 * success/failure and "already exists" via exit code rather than JSON, so
 * `.nothrow()` is required — a nonzero `has-session` exit is an expected
 * "session not found" signal, not a real error. Prefers `TMUX_BIN_PATH`
 * (mirroring herdr's `HERDR_BIN_PATH`) and falls back to `tmux` on PATH.
 */
export type TmuxRunner = (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export const defaultRunTmux: TmuxRunner = async (args) => {
  const bin = process.env.TMUX_BIN_PATH || "tmux";
  const result = await $`${bin} ${args}`.quiet().nothrow();
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
};

/** True when a tmux session named `name` already exists. */
export async function tmuxSessionExists(runTmux: TmuxRunner, name: string): Promise<boolean> {
  const { exitCode } = await runTmux(["has-session", "-t", name]);
  return exitCode === 0;
}

/**
 * Hands the terminal over to `tmux attach-session`, resolving with its exit
 * code once the user detaches (or the client otherwise exits). Separate from
 * `TmuxRunner` because it's inherently interactive — it inherits this
 * process's stdio rather than capturing output — so it's only used to launch
 * tmux from a plain (non-multiplexed) terminal, never mocked the same way as
 * the scriptable commands above.
 */
export type TmuxAttacher = (target: string) => Promise<number>;

export const defaultAttachTmux: TmuxAttacher = async (target) => {
  const bin = process.env.TMUX_BIN_PATH || "tmux";
  const proc = Bun.spawn([bin, "attach-session", "-t", target], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
};

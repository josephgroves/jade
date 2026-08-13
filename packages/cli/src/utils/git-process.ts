import { $ } from "bun";

export interface GitProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Injectable git subprocess runner. utils/git.ts is the only caller today —
 * this exists to give it one place to invoke `git` and one typed failure
 * shape, instead of 20+ ad hoc `$` template calls.
 */
export interface GitProcessRunner {
  run(args: string[], opts?: { cwd?: string; nothrow?: boolean }): Promise<GitProcessResult>;
}

/**
 * Structured failure from a git subprocess invocation — carries the exact
 * command/cwd/exitCode/stderr instead of a raw shell error string.
 */
export class GitError extends Error {
  readonly command: string[];
  readonly cwd?: string;
  readonly exitCode: number;
  readonly stderr: string;

  constructor(command: string[], cwd: string | undefined, exitCode: number, stderr: string) {
    super(`git ${command.join(" ")} failed (${exitCode}): ${stderr.trim()}`);
    this.name = "GitError";
    this.command = command;
    this.cwd = cwd;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Real git process runner — the only place that shells out to `git`.
 */
export const realGitProcessRunner: GitProcessRunner = {
  async run(args, opts) {
    const result = await $`git ${args}`.cwd(opts?.cwd ?? process.cwd()).nothrow().quiet();
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();

    if (!opts?.nothrow && result.exitCode !== 0) {
      throw new GitError(args, opts?.cwd, result.exitCode, stderr);
    }

    return { stdout, stderr, exitCode: result.exitCode };
  },
};

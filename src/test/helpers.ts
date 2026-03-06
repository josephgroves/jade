import { mkdtemp, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { $ } from "bun";
import { expect } from "bun:test";
import { gitCloneBare } from "../utils/git.ts";

export interface TempDir {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Create a temporary directory for tests. Call cleanup() in afterEach.
 */
export async function createTempDir(): Promise<TempDir> {
  const path = await mkdtemp(join(tmpdir(), "jade-test-"));
  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

/**
 * Create a local git repo with an initial commit. Use as "remote" for bare clones (no network).
 */
export async function createLocalGitRepo(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await $`git init`.cwd(dir);
  await Bun.write(join(dir, "README.md"), "# Test repo\n");
  await $`git add README.md`.cwd(dir);
  await $`git config user.email "test@test.com"`.cwd(dir);
  await $`git config user.name "Test User"`.cwd(dir);
  await $`git commit -m "Initial commit"`.cwd(dir);
  return dir;
}

/**
 * Create a minimal jade workspace: .bare/, main/, jade.json
 */
export async function createTestWorkspace(dir: string): Promise<string> {
  await $`mkdir -p ${join(dir, ".bare")}`;
  await $`mkdir -p ${join(dir, "main")}`;
  await Bun.write(
    join(dir, "jade.json"),
    JSON.stringify({ version: "1.0", apps: [] }, null, 2) + "\n"
  );
  return dir;
}

/**
 * Clone a local repo as bare. Wraps git clone --bare for test setup.
 */
export async function createBareClone(
  sourceRepo: string,
  destPath: string
): Promise<string> {
  await gitCloneBare(sourceRepo, destPath);
  return destPath;
}

/**
 * Capture console.log and process.stdout output for the duration of the async callback.
 * Returns the lines that were written (splitting on newlines).
 *
 * Usage:
 *   const logs = await withCapturedConsole(() => command.run!(...));
 *   expect(logs).toContain("some output");
 */
export async function withCapturedConsole(fn: () => Promise<void>): Promise<string[]> {
  const chunks: string[] = [];

  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };

  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown, ...rest: unknown[]) => {
    if (typeof chunk === "string") chunks.push(chunk);
    else if (chunk instanceof Buffer) chunks.push(chunk.toString());
    return true;
  };

  try {
    await fn();
  } finally {
    console.log = origLog;
    process.stdout.write = origWrite;
  }

  return chunks.flatMap((c) => c.split("\n")).filter((l) => l.trim().length > 0);
}

/**
 * Assert that the async callback calls process.exit with the given code (default 1).
 * Handles save/mock/restore automatically so tests stay focused on intent.
 *
 * Usage:
 *   await expectsExit(() => command.run!({ args: { name: "bad" } } as any));
 *   await expectsExit(() => command.run!(...), 0); // expect exit(0)
 */
export async function expectsExit(fn: () => Promise<void>, expectedCode = 1): Promise<void> {
  const origExit = process.exit;
  let exitCode: number | undefined;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT:${exitCode}`);
  }) as (code?: number) => never;
  try {
    await fn();
  } catch {
    // expected — process.exit throws in mock
  } finally {
    process.exit = origExit;
  }
  expect(exitCode).toBe(expectedCode);
}

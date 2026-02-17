import { mkdtemp, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { $ } from "bun";
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

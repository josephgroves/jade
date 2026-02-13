import { $ } from "bun";
import { resolve } from "path";
import consola from "consola";

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

/**
 * Initialize a bare git repository
 */
export async function gitInitBare(path: string): Promise<void> {
  await $`git init --bare ${path}`.cwd(path.split("/").slice(0, -1).join("/"));
}

/**
 * Create a git pointer file
 */
export async function writeGitPointer(path: string, bareDir: string): Promise<void> {
  await Bun.write(`${path}/.git`, `gitdir: ${bareDir}\n`);
}

/**
 * Add a worktree
 */
export async function gitWorktreeAdd(
  cwd: string,
  name: string,
  branch?: string
): Promise<void> {
  if (branch) {
    await $`git worktree add ${name} -b ${branch}`.cwd(cwd);
  } else {
    await $`git worktree add ${name}`.cwd(cwd);
  }
}

/**
 * List all worktrees
 */
export async function gitWorktreeList(cwd: string): Promise<WorktreeInfo[]> {
  const result =
    await $`git worktree list --porcelain`.cwd(cwd).text();

  const worktrees: WorktreeInfo[] = [];
  const lines = result.split("\n");
  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      current.path = line.substring(9);
    } else if (line.startsWith("branch ")) {
      current.branch = line.substring(7).replace("refs/heads/", "");
    } else if (line.startsWith("HEAD ")) {
      current.commit = line.substring(5);
    } else if (line.startsWith("bare")) {
      // Bare repo worktree - skip it
      current = {};
    } else if (line === "" && current.path) {
      // Only add if we have required fields
      if (current.path && current.branch && current.commit) {
        worktrees.push(current as WorktreeInfo);
      }
      current = {};
    }
  }

  // Handle last entry if file doesn't end with newline
  if (current.path && current.branch && current.commit) {
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}

/**
 * Remove a worktree (deinitializes submodules first)
 */
export async function gitWorktreeRemove(cwd: string, name: string): Promise<void> {
  const worktreePath = `${cwd}/${name}`;
  
  // First, deinitialize all submodules in the worktree
  try {
    await $`git submodule deinit --all -f`.cwd(worktreePath);
  } catch {
    // Ignore if no submodules exist
  }
  
  // Now remove the worktree
  await $`git worktree remove ${name} -f`.cwd(cwd);
  await $`git worktree prune`.cwd(cwd);
}

/**
 * Add a submodule
 */
export async function gitSubmoduleAdd(
  cwd: string,
  url: string,
  path: string
): Promise<void> {
  await $`git submodule add ${url} ${path}`.cwd(cwd);
}

/**
 * Initialize submodules recursively
 */
export async function gitSubmoduleUpdate(cwd: string): Promise<void> {
  await $`git submodule update --init --recursive`.cwd(cwd);
}

/**
 * Create a branch in all submodules
 */
export async function gitSubmoduleCreateBranches(
  cwd: string,
  branchName: string
): Promise<string[]> {
  const submodules = await gitSubmoduleList(cwd);
  const created: string[] = [];

  for (const submodule of submodules) {
    const submodulePath = resolve(cwd, submodule);
    try {
      // Check if branch already exists
      const branches = await $`git branch --list ${branchName}`.cwd(submodulePath).text();
      
      if (branches.trim()) {
        // Branch exists, just check it out
        await gitCheckout(submodulePath, branchName, false);
      } else {
        // Branch doesn't exist, create it
        await gitCheckout(submodulePath, branchName, true);
        created.push(submodule);
      }
    } catch (error) {
      consola.warn(`Could not create branch '${branchName}' in ${submodule}: ${error}`);
    }
  }

  return created;
}

/**
 * List submodules
 */
export async function gitSubmoduleList(cwd: string): Promise<string[]> {
  try {
    const result = await $`git config --file .gitmodules --get-regexp path`.cwd(cwd).text();
    return result
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.split(" ")[1]!);
  } catch {
    return [];
  }
}

/**
 * Checkout a branch
 */
export async function gitCheckout(
  cwd: string,
  branch: string,
  create: boolean = false
): Promise<void> {
  if (create) {
    await $`git checkout -b ${branch}`.cwd(cwd);
  } else {
    await $`git checkout ${branch}`.cwd(cwd);
  }
}

/**
 * Get current branch name
 */
export async function gitCurrentBranch(cwd: string): Promise<string> {
  const result = await $`git rev-parse --abbrev-ref HEAD`.cwd(cwd).text();
  return result.trim();
}

/**
 * Commit changes
 */
export async function gitCommit(cwd: string, message: string): Promise<void> {
  await $`git commit -m ${message}`.cwd(cwd);
}

/**
 * Add files to staging
 */
export async function gitAdd(cwd: string, files: string[]): Promise<void> {
  await $`git add ${files}`.cwd(cwd);
}

/**
 * Check if a branch exists in worktrees
 */
export async function isBranchCheckedOut(cwd: string, branch: string): Promise<boolean> {
  const worktrees = await gitWorktreeList(cwd);
  return worktrees.some((wt) => wt.branch === branch);
}

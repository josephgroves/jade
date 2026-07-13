import { $ } from "bun";

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

/**
 * Clone a bare repository
 */
export async function gitCloneBare(url: string, destPath: string): Promise<void> {
  await $`git clone --bare ${url} ${destPath}`;
  // `git clone --bare` omits the fetch refspec, so `git fetch` can't populate
  // refs/remotes/origin/*. Worktrees need those refs to pull updates from main.
  await $`git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"`.cwd(destPath);
}

/**
 * Remove a bare repository directory
 */
export async function gitRemoveBareRepo(barePath: string): Promise<void> {
  await $`rm -rf ${barePath}`;
}

/**
 * Get the default branch name from a bare repository
 */
export async function gitGetDefaultBranch(bareRepoPath: string): Promise<string> {
  try {
    const result = await $`git symbolic-ref HEAD`.cwd(bareRepoPath).text();
    return result.trim().replace("refs/heads/", "");
  } catch {
    const branches = await $`git branch`.cwd(bareRepoPath).text();

    if (branches.includes("main")) return "main";
    if (branches.includes("master")) return "master";
    if (branches.includes("develop")) return "develop";
    if (branches.includes("trunk")) return "trunk";

    const firstBranch = branches.trim().split("\n")[0];
    const branchName = firstBranch?.replace(/^\*?\s*/, "").trim();

    if (!branchName) {
      throw new Error("No branches found in repository");
    }

    return branchName;
  }
}

/**
 * Add a worktree from a bare repository
 * @param bareRepoPath - Path to the bare repository
 * @param worktreePath - Absolute path where the worktree should be created
 * @param branch - Optional branch name to checkout or create
 * @returns The actual branch name used (may differ from input if conflict occurred)
 */
export async function gitWorktreeAdd(
  bareRepoPath: string,
  worktreePath: string,
  branch?: string
): Promise<string | undefined> {
  if (branch) {
    // Check if branch already exists
    const branches = await $`git branch --list ${branch}`.cwd(bareRepoPath).text();
    
    if (branches.trim()) {
      // Branch exists - try to checkout
      try {
        await $`git worktree add ${worktreePath} ${branch}`.cwd(bareRepoPath);
        // Best-effort: only succeeds if origin/<branch> exists on the remote
        await $`git branch --set-upstream-to=origin/${branch} ${branch}`.cwd(worktreePath).nothrow().quiet();
        return branch;
      } catch (error) {
        // Failed to checkout (branch already checked out or other conflict)
        // Generate unique name and create from the original branch
        const uniqueName = await generateUniqueBranchName(bareRepoPath, branch);
        await $`git worktree add ${worktreePath} -b ${uniqueName} ${branch}`.cwd(bareRepoPath);
        await $`git branch --set-upstream-to=origin/${branch} ${uniqueName}`.cwd(worktreePath).nothrow().quiet();
        return uniqueName;
      }
    } else {
      // Branch doesn't exist, try to create it
      try {
        await $`git worktree add ${worktreePath} -b ${branch}`.cwd(bareRepoPath);
        // Best-effort: only succeeds if origin/<branch> exists on the remote
        await $`git branch --set-upstream-to=origin/${branch} ${branch}`.cwd(worktreePath).nothrow().quiet();
        return branch;
      } catch (error) {
        // Failed to create (hierarchical conflict like test vs test/something)
        // Generate unique name and create
        const uniqueName = await generateUniqueBranchName(bareRepoPath, branch);
        await $`git worktree add ${worktreePath} -b ${uniqueName}`.cwd(bareRepoPath);
        return uniqueName;
      }
    }
  } else {
    // No branch specified, use the repository's default branch
    const defaultBranch = await gitGetDefaultBranch(bareRepoPath);
    await $`git worktree add ${worktreePath} ${defaultBranch}`.cwd(bareRepoPath);
    // Best-effort: only succeeds if origin/<branch> exists on the remote
    await $`git branch --set-upstream-to=origin/${defaultBranch} ${defaultBranch}`.cwd(worktreePath).nothrow().quiet();
    return defaultBranch;
  }
}

/**
 * List all worktrees for a bare repository
 */
export async function gitWorktreeList(bareRepoPath: string): Promise<WorktreeInfo[]> {
  const result = await $`git worktree list --porcelain`.cwd(bareRepoPath).text();

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
 * Remove a worktree from a bare repository
 * @param bareRepoPath - Path to the bare repository
 * @param worktreePath - Absolute path to the worktree to remove
 */
export async function gitWorktreeRemove(bareRepoPath: string, worktreePath: string): Promise<void> {
  await $`git worktree remove ${worktreePath} -f`.cwd(bareRepoPath);
  await $`git worktree prune`.cwd(bareRepoPath);
}

/**
 * Check if a branch is currently checked out in any worktree
 * @param bareRepoPath - Path to the bare repository
 * @param branch - Branch name to check
 */
export async function isBranchCheckedOutInWorktree(bareRepoPath: string, branch: string): Promise<boolean> {
  const worktrees = await gitWorktreeList(bareRepoPath);
  return worktrees.some((wt) => wt.branch === branch);
}

/**
 * Generate a unique branch name with a short hash suffix
 * @param bareRepoPath - Path to the bare repository
 * @param baseName - Base name for the branch
 */
export async function generateUniqueBranchName(bareRepoPath: string, baseName: string): Promise<string> {
  const result = await $`git rev-parse HEAD`.cwd(bareRepoPath).text();
  const shortHash = result.trim().substring(0, 7);
  return `${baseName}-${shortHash}`;
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

/**
 * Fetch all remotes for a bare repository
 */
export async function gitFetch(bareRepoPath: string): Promise<void> {
  await $`git fetch --all --prune`.cwd(bareRepoPath);
}

/**
 * Fast-forward pull in a worktree directory
 */
export async function gitPullFF(cwd: string): Promise<void> {
  const branch = (await $`git rev-parse --abbrev-ref HEAD`.cwd(cwd).text()).trim();
  await $`git pull --ff-only --prune origin ${branch}`.cwd(cwd);
}

/**
 * Delete a branch in a repository
 */
export async function gitDeleteBranch(
  cwd: string,
  branch: string,
  force: boolean = false
): Promise<void> {
  if (force) {
    await $`git branch -D ${branch}`.cwd(cwd);
  } else {
    await $`git branch -d ${branch}`.cwd(cwd);
  }
}

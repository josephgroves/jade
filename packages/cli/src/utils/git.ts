import { fsRemove } from "./fs.ts";
import { realGitProcessRunner } from "./git-process.ts";

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
}

export interface WorktreeStatus {
  staged: number;
  unstaged: number;
  untracked: number;
}

/**
 * Count staged / unstaged / untracked entries in a worktree.
 *
 * Uses the default --untracked-files=normal so an untracked directory collapses
 * to a single entry instead of enumerating every file beneath it. A file can be
 * both staged and unstaged (porcelain "MM") and is counted in both — that
 * distinction is the useful part.
 */
export function parseStatusPorcelain(output: string): WorktreeStatus {
  const status: WorktreeStatus = { staged: 0, unstaged: 0, untracked: 0 };

  for (const line of output.split("\n")) {
    // Porcelain v1 lines are "XY path"; anything shorter isn't an entry.
    if (line.length < 3) continue;

    const x = line[0]!;
    const y = line[1]!;

    if (x === "?" && y === "?") {
      status.untracked++;
      continue;
    }

    if (x !== " ") status.staged++;
    if (y !== " ") status.unstaged++;
  }

  return status;
}

/**
 * Clone a bare repository
 */
export async function gitCloneBare(url: string, destPath: string): Promise<void> {
  await realGitProcessRunner.run(["clone", "--bare", url, destPath]);
  // `git clone --bare` omits the fetch refspec, so `git fetch` can't populate
  // refs/remotes/origin/*. Worktrees need those refs to pull updates from main.
  await realGitProcessRunner.run(
    ["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
    { cwd: destPath }
  );
  // The refspec only says where fetched refs land — it doesn't create them. Until
  // something fetches, refs/remotes/origin/* is empty and every
  // `--set-upstream-to=origin/<branch>` in gitWorktreeAdd silently no-ops, leaving
  // worktrees with no upstream. Best-effort: the clone already succeeded, so a
  // remote that briefly can't be re-reached shouldn't fail the whole add.
  await realGitProcessRunner.run(["fetch", "origin"], { cwd: destPath, nothrow: true });
}

/**
 * Remove a bare repository directory
 */
export async function gitRemoveBareRepo(barePath: string): Promise<void> {
  await fsRemove(barePath);
}

/**
 * Get the default branch name from a bare repository
 */
export async function gitGetDefaultBranch(bareRepoPath: string): Promise<string> {
  try {
    const { stdout } = await realGitProcessRunner.run(["symbolic-ref", "HEAD"], { cwd: bareRepoPath });
    return stdout.trim().replace("refs/heads/", "");
  } catch {
    const { stdout: branches } = await realGitProcessRunner.run(["branch"], { cwd: bareRepoPath });

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
    const { stdout: branches } = await realGitProcessRunner.run(["branch", "--list", branch], {
      cwd: bareRepoPath,
    });

    if (branches.trim()) {
      // Branch exists - try to checkout
      try {
        await realGitProcessRunner.run(["worktree", "add", worktreePath, branch], { cwd: bareRepoPath });
        // Best-effort: only succeeds if origin/<branch> exists on the remote
        await realGitProcessRunner.run(
          ["branch", `--set-upstream-to=origin/${branch}`, branch],
          { cwd: worktreePath, nothrow: true }
        );
        return branch;
      } catch (error) {
        // Failed to checkout (branch already checked out or other conflict)
        // Generate unique name and create from the original branch
        const uniqueName = await generateUniqueBranchName(bareRepoPath, branch);
        await realGitProcessRunner.run(["worktree", "add", worktreePath, "-b", uniqueName, branch], {
          cwd: bareRepoPath,
        });
        await realGitProcessRunner.run(
          ["branch", `--set-upstream-to=origin/${branch}`, uniqueName],
          { cwd: worktreePath, nothrow: true }
        );
        return uniqueName;
      }
    } else {
      // Branch doesn't exist, try to create it
      try {
        await realGitProcessRunner.run(["worktree", "add", worktreePath, "-b", branch], { cwd: bareRepoPath });
        // Best-effort: only succeeds if origin/<branch> exists on the remote
        await realGitProcessRunner.run(
          ["branch", `--set-upstream-to=origin/${branch}`, branch],
          { cwd: worktreePath, nothrow: true }
        );
        return branch;
      } catch (error) {
        // Failed to create (hierarchical conflict like test vs test/something)
        // Generate unique name and create
        const uniqueName = await generateUniqueBranchName(bareRepoPath, branch);
        await realGitProcessRunner.run(["worktree", "add", worktreePath, "-b", uniqueName], {
          cwd: bareRepoPath,
        });
        return uniqueName;
      }
    }
  } else {
    // No branch specified, use the repository's default branch
    const defaultBranch = await gitGetDefaultBranch(bareRepoPath);
    await realGitProcessRunner.run(["worktree", "add", worktreePath, defaultBranch], { cwd: bareRepoPath });
    // Best-effort: only succeeds if origin/<branch> exists on the remote
    await realGitProcessRunner.run(
      ["branch", `--set-upstream-to=origin/${defaultBranch}`, defaultBranch],
      { cwd: worktreePath, nothrow: true }
    );
    return defaultBranch;
  }
}

/**
 * List all worktrees for a bare repository
 */
export async function gitWorktreeList(bareRepoPath: string): Promise<WorktreeInfo[]> {
  const { stdout: result } = await realGitProcessRunner.run(["worktree", "list", "--porcelain"], {
    cwd: bareRepoPath,
  });

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
  await realGitProcessRunner.run(["worktree", "remove", worktreePath, "-f"], { cwd: bareRepoPath });
  await realGitProcessRunner.run(["worktree", "prune"], { cwd: bareRepoPath });
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
  const { stdout: result } = await realGitProcessRunner.run(["rev-parse", "HEAD"], { cwd: bareRepoPath });
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
    await realGitProcessRunner.run(["checkout", "-b", branch], { cwd });
  } else {
    await realGitProcessRunner.run(["checkout", branch], { cwd });
  }
}

/**
 * Get current branch name
 */
export async function gitCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await realGitProcessRunner.run(["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return stdout.trim();
}

/**
 * Get the working-tree state of a worktree
 */
export async function gitStatus(cwd: string): Promise<WorktreeStatus> {
  const { stdout } = await realGitProcessRunner.run(["status", "--porcelain"], { cwd });
  return parseStatusPorcelain(stdout);
}

/**
 * Commit changes
 */
export async function gitCommit(cwd: string, message: string): Promise<void> {
  await realGitProcessRunner.run(["commit", "-m", message], { cwd });
}

/**
 * Add files to staging
 */
export async function gitAdd(cwd: string, files: string[]): Promise<void> {
  await realGitProcessRunner.run(["add", ...files], { cwd });
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
  await realGitProcessRunner.run(["fetch", "--all", "--prune"], { cwd: bareRepoPath });
}

/**
 * Fast-forward pull in a worktree directory
 */
export async function gitPullFF(cwd: string): Promise<void> {
  const { stdout } = await realGitProcessRunner.run(["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  const branch = stdout.trim();
  await realGitProcessRunner.run(["pull", "--ff-only", "--prune", "origin", branch], { cwd });
}

/**
 * Merge a branch from origin into the currently checked out branch of a worktree.
 * Assumes refs/remotes/origin/<branch> is already current — call gitFetch first.
 * Throws (leaving the worktree mid-merge, for manual resolution) on conflict.
 */
export async function gitMergeBranch(cwd: string, branch: string): Promise<"merged" | "up-to-date"> {
  const { stdout } = await realGitProcessRunner.run(["merge", "--no-edit", `origin/${branch}`], { cwd });
  return /already up to date/i.test(stdout) ? "up-to-date" : "merged";
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
    await realGitProcessRunner.run(["branch", "-D", branch], { cwd });
  } else {
    await realGitProcessRunner.run(["branch", "-d", branch], { cwd });
  }
}

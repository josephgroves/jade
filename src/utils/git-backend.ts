/**
 * Injectable git backend interface.
 * Commands accept a GitBackend and default to the real implementation.
 * Tests can pass a mock backend to simulate git effects without spawning git.
 */
export interface GitBackend {
  cloneBare(url: string, destPath: string): Promise<void>;
  getDefaultBranch(bareRepoPath: string): Promise<string>;
  worktreeAdd(bareRepoPath: string, worktreePath: string, branch?: string): Promise<string | undefined>;
  worktreeRemove(bareRepoPath: string, worktreePath: string): Promise<void>;
  currentBranch(cwd: string): Promise<string>;
  deleteBranch(cwd: string, branch: string, force?: boolean): Promise<void>;
  removeBareRepo(barePath: string): Promise<void>;
}

import {
  gitCloneBare,
  gitGetDefaultBranch,
  gitWorktreeAdd,
  gitWorktreeRemove,
  gitCurrentBranch,
  gitDeleteBranch,
  gitRemoveBareRepo,
} from "./git.ts";

/**
 * Real git backend — delegates to the actual git utilities.
 * This is the default used by all commands in production.
 */
export const realGitBackend: GitBackend = {
  cloneBare: gitCloneBare,
  getDefaultBranch: gitGetDefaultBranch,
  worktreeAdd: gitWorktreeAdd,
  worktreeRemove: gitWorktreeRemove,
  currentBranch: gitCurrentBranch,
  deleteBranch: gitDeleteBranch,
  removeBareRepo: gitRemoveBareRepo,
};

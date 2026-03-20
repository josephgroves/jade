import { mkdir, rm } from "fs/promises";
import { join } from "path";
import type { GitBackend, WorktreeInfo } from "../utils/git-backend.ts";

/**
 * In-memory state that the mock backend tracks per bare repo path.
 * Tests can inspect or pre-configure this to control mock behavior.
 */
export interface MockBareRepoState {
  defaultBranch: string;
  /** Set of branch names that already exist in this repo */
  branches: Set<string>;
  /** Map from worktree path -> branch name for currently checked-out worktrees */
  worktrees: Map<string, string>;
}

/**
 * Create a MockBareRepoState with sensible defaults.
 */
export function makeMockBareRepoState(overrides: Partial<MockBareRepoState> = {}): MockBareRepoState {
  return {
    defaultBranch: "main",
    branches: new Set(overrides.branches ?? ["main"]),
    worktrees: new Map(overrides.worktrees),
    ...overrides,
  };
}

/**
 * Mock GitBackend that simulates git effects on the filesystem (creating directories)
 * and maintains in-memory state for branches and worktrees.
 *
 * Usage in tests:
 *
 *   const { git, getState } = createMockGitBackend();
 *   const cmd = makeAddCommand(git);
 *   await cmd.run!({ args: { ... } } as any);
 *   expect(getState("/path/to/bare")).toBeDefined();
 */
export interface MockGitBackend {
  git: GitBackend;
  /** Get in-memory state for a bare repo (returns undefined if never cloned/initialized) */
  getState(bareRepoPath: string): MockBareRepoState | undefined;
  /** Pre-seed state for a bare repo (useful for pre-existing repos in worktree tests) */
  seedState(bareRepoPath: string, state?: Partial<MockBareRepoState>): void;
  /** Calls recorded on the backend (for assertion purposes) */
  calls: { method: string; args: unknown[] }[];
}

export function createMockGitBackend(): MockGitBackend {
  const states = new Map<string, MockBareRepoState>();
  const calls: { method: string; args: unknown[] }[] = [];

  function record(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  function ensureState(bareRepoPath: string): MockBareRepoState {
    if (!states.has(bareRepoPath)) {
      states.set(bareRepoPath, makeMockBareRepoState());
    }
    return states.get(bareRepoPath)!;
  }

  const git: GitBackend = {
    /**
     * Simulate bare clone: create the destination directory and initialize state.
     * Does NOT require a real URL or remote.
     */
    async cloneBare(_url: string, destPath: string): Promise<void> {
      record("cloneBare", _url, destPath);
      await mkdir(destPath, { recursive: true });
      // Write a minimal HEAD file so the dir looks like a bare repo
      await Bun.write(join(destPath, "HEAD"), "ref: refs/heads/main\n");
      states.set(destPath, makeMockBareRepoState());
    },

    /**
     * Return the configured default branch for this repo (defaults to "main").
     */
    async getDefaultBranch(bareRepoPath: string): Promise<string> {
      record("getDefaultBranch", bareRepoPath);
      return ensureState(bareRepoPath).defaultBranch;
    },

    /**
     * Simulate worktree add:
     * - Creates the worktree directory on disk
     * - Tracks the branch->path mapping in memory
     * - Resolves branch conflicts by appending "-mock" suffix (deterministic)
     */
    async worktreeAdd(
      bareRepoPath: string,
      worktreePath: string,
      branch?: string
    ): Promise<string | undefined> {
      record("worktreeAdd", bareRepoPath, worktreePath, branch);
      const state = ensureState(bareRepoPath);
      const requestedBranch = branch ?? state.defaultBranch;

      // Determine the actual branch name to use
      let actualBranch = requestedBranch;

      if (state.branches.has(requestedBranch)) {
        // Branch already exists — check if it's currently checked out elsewhere
        const alreadyCheckedOut = [...state.worktrees.values()].includes(requestedBranch);
        if (alreadyCheckedOut) {
          // Conflict: produce a unique name deterministically
          actualBranch = `${requestedBranch}-mock`;
          state.branches.add(actualBranch);
        }
        // else: branch exists but is free — checkout is fine, keep actualBranch
      } else {
        // New branch — create it
        state.branches.add(requestedBranch);
      }

      // Create the worktree directory on disk
      await mkdir(worktreePath, { recursive: true });
      state.worktrees.set(worktreePath, actualBranch);

      return actualBranch;
    },

    /**
     * Return all worktrees for a bare repo as WorktreeInfo[].
     */
    async worktreeList(bareRepoPath: string): Promise<WorktreeInfo[]> {
      record("worktreeList", bareRepoPath);
      const state = states.get(bareRepoPath);
      if (!state) return [];
      return [...state.worktrees.entries()].map(([path, branch]) => ({
        path,
        branch,
        commit: "mock-commit-sha",
      }));
    },

    /**
     * Simulate worktree remove: delete the in-memory record (caller removes the dir).
     */
    async worktreeRemove(bareRepoPath: string, worktreePath: string): Promise<void> {
      record("worktreeRemove", bareRepoPath, worktreePath);
      const state = states.get(bareRepoPath);
      if (state) {
        state.worktrees.delete(worktreePath);
      }
    },

    /**
     * Simulate checkout: update the branch tracked at the given worktree path.
     */
    async checkout(cwd: string, branch: string, create?: boolean): Promise<void> {
      record("checkout", cwd, branch, create);
      for (const state of states.values()) {
        if (state.worktrees.has(cwd)) {
          state.worktrees.set(cwd, branch);
          if (create) state.branches.add(branch);
          return;
        }
      }
    },

    /**
     * Return the branch checked out at a worktree path.
     * Falls back to searching all repo states if not found by path.
     */
    async currentBranch(cwd: string): Promise<string> {
      record("currentBranch", cwd);
      for (const state of states.values()) {
        const branch = state.worktrees.get(cwd);
        if (branch) return branch;
      }
      return "main";
    },

    /**
     * Simulate branch deletion — just removes the branch name from state.
     */
    async deleteBranch(cwd: string, branch: string, _force?: boolean): Promise<void> {
      record("deleteBranch", cwd, branch, _force);
      for (const state of states.values()) {
        state.branches.delete(branch);
      }
    },

    /**
     * Simulate removing the bare repo directory — deletes on disk and in memory.
     */
    async removeBareRepo(barePath: string): Promise<void> {
      record("removeBareRepo", barePath);
      states.delete(barePath);
      await rm(barePath, { recursive: true, force: true });
    },

    async fetch(bareRepoPath: string): Promise<void> {
      record("fetch", bareRepoPath);
    },

    async pullFF(cwd: string): Promise<void> {
      record("pullFF", cwd);
    },
  };

  return {
    git,
    getState: (bareRepoPath) => states.get(bareRepoPath),
    seedState(bareRepoPath, overrides = {}) {
      states.set(bareRepoPath, makeMockBareRepoState(overrides));
    },
    calls,
  };
}

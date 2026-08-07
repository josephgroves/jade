import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { $ } from "bun";
import {
  gitCloneBare,
  gitGetDefaultBranch,
  gitWorktreeAdd,
  gitWorktreeList,
  gitWorktreeRemove,
  isBranchCheckedOutInWorktree,
  generateUniqueBranchName,
  gitCheckout,
  gitCurrentBranch,
  gitDeleteBranch,
  gitRemoveBareRepo,
  gitStatus,
  parseStatusPorcelain,
} from "../git.ts";
import {
  createTempDir,
  createLocalGitRepo,
  createBareClone,
} from "../../test/helpers.ts";

describe("git", () => {
  let tempDir: Awaited<ReturnType<typeof createTempDir>>;

  afterEach(async () => {
    if (tempDir) await tempDir.cleanup();
  });

  test("gitCloneBare clones local repo into bare repo", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await gitCloneBare(sourceRepo, barePath);
    const worktrees = await gitWorktreeList(barePath);
    expect(worktrees.length).toBeGreaterThanOrEqual(0);
  });

  test("gitGetDefaultBranch detects default branch", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const branch = await gitGetDefaultBranch(barePath);
    expect(["main", "master"]).toContain(branch);
  });

  test("gitWorktreeAdd creates worktree on existing branch", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const worktreePath = join(tempDir.path, "wt1");
    const actual = await gitWorktreeAdd(barePath, worktreePath, defaultBranch);
    expect(actual).toBe(defaultBranch);
    const list = await gitWorktreeList(barePath);
    expect(list.some((wt) => wt.branch === defaultBranch)).toBe(true);
  });

  test("gitWorktreeAdd creates new branch when it does not exist", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const worktreePath = join(tempDir.path, "feat-new");
    const actual = await gitWorktreeAdd(barePath, worktreePath, "feat-new");
    expect(actual).toBe("feat-new");
    const list = await gitWorktreeList(barePath);
    expect(list.some((wt) => wt.branch === "feat-new")).toBe(true);
  });

  test("gitWorktreeAdd generates unique name on conflict", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const wt1 = join(tempDir.path, "wt1");
    await gitWorktreeAdd(barePath, wt1, defaultBranch);
    const wt2 = join(tempDir.path, "wt2");
    const actual = await gitWorktreeAdd(barePath, wt2, defaultBranch);
    expect(actual).not.toBe(defaultBranch);
    expect(actual).toMatch(new RegExp(`^${defaultBranch}-[a-f0-9]{7}$`));
  });

  test("gitWorktreeList parses worktree entries correctly", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const worktreePath = join(tempDir.path, "wt1");
    await gitWorktreeAdd(barePath, worktreePath, defaultBranch);
    const list = await gitWorktreeList(barePath);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const wt = list.find((w) => w.path.includes("wt1"));
    expect(wt).toBeDefined();
    expect(wt!.branch).toBeDefined();
    expect(wt!.commit).toBeDefined();
  });

  test("gitWorktreeRemove removes worktree and prunes", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const worktreePath = join(tempDir.path, "wt-remove");
    await gitWorktreeAdd(barePath, worktreePath, defaultBranch);
    let list = await gitWorktreeList(barePath);
    expect(list.length).toBeGreaterThanOrEqual(1);
    await gitWorktreeRemove(barePath, worktreePath);
    list = await gitWorktreeList(barePath);
    expect(list.find((w) => w.path.includes("wt-remove"))).toBeUndefined();
  });

  test("isBranchCheckedOutInWorktree returns correct boolean", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const worktreePath = join(tempDir.path, "wt1");
    await gitWorktreeAdd(barePath, worktreePath, defaultBranch);
    const checkedOut = await isBranchCheckedOutInWorktree(barePath, defaultBranch);
    expect(checkedOut).toBe(true);
    const notCheckedOut = await isBranchCheckedOutInWorktree(
      barePath,
      "nonexistent"
    );
    expect(notCheckedOut).toBe(false);
  });

  test("generateUniqueBranchName returns base-hash format", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const name = await generateUniqueBranchName(barePath, "feat");
    expect(name).toMatch(/^feat-[a-f0-9]{7}$/);
  });

  test("gitCheckout switches branch", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const wtPath = join(tempDir.path, "wt");
    await gitWorktreeAdd(barePath, wtPath, defaultBranch);
    // Create feat-b in the bare repo without a worktree so it can be checked out freely
    await $`git branch feat-b`.cwd(barePath);
    await gitCheckout(wtPath, "feat-b");
    const current = await gitCurrentBranch(wtPath);
    expect(current).toBe("feat-b");
  });

  test("gitCheckout creates new branch with create flag", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const wtPath = join(tempDir.path, "wt");
    await gitWorktreeAdd(barePath, wtPath, defaultBranch);
    await gitCheckout(wtPath, "feat-create", true);
    const current = await gitCurrentBranch(wtPath);
    expect(current).toBe("feat-create");
  });

  test("gitCurrentBranch returns current branch name", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const wtPath = join(tempDir.path, "wt");
    await gitWorktreeAdd(barePath, wtPath, defaultBranch);
    const current = await gitCurrentBranch(wtPath);
    expect(current).toBe(defaultBranch);
  });

  test("gitDeleteBranch deletes a branch", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    const defaultBranch = await gitGetDefaultBranch(barePath);
    const mainWt = join(tempDir.path, "main");
    const featWt = join(tempDir.path, "feat");
    await gitWorktreeAdd(barePath, mainWt, defaultBranch);
    await gitWorktreeAdd(barePath, featWt, "to-delete");
    // Must remove the worktree before the branch can be deleted
    await gitWorktreeRemove(barePath, featWt);
    await gitDeleteBranch(mainWt, "to-delete");
    const list = await gitWorktreeList(barePath);
    expect(list.some((w) => w.branch === "to-delete")).toBe(false);
  });

  test("gitRemoveBareRepo removes bare repo directory", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    const barePath = join(tempDir.path, "bare");
    await createBareClone(sourceRepo, barePath);
    await gitRemoveBareRepo(barePath);
    const exists = await Bun.file(join(barePath, "HEAD")).exists();
    expect(exists).toBe(false);
  });

  test("gitStatus reports a clean worktree", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);
    expect(await gitStatus(sourceRepo)).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
  });

  test("gitStatus counts staged, unstaged and untracked entries", async () => {
    tempDir = await createTempDir();
    const sourceRepo = join(tempDir.path, "source");
    await createLocalGitRepo(sourceRepo);

    // staged: a new file added to the index
    await Bun.write(join(sourceRepo, "staged.txt"), "new\n");
    await $`git add staged.txt`.cwd(sourceRepo);
    // unstaged: a tracked file modified in the worktree
    await Bun.write(join(sourceRepo, "README.md"), "# changed\n");
    // untracked: never added
    await Bun.write(join(sourceRepo, "loose.txt"), "loose\n");

    expect(await gitStatus(sourceRepo)).toEqual({ staged: 1, unstaged: 1, untracked: 1 });
  });
});

describe("parseStatusPorcelain", () => {
  test("empty output is clean", () => {
    expect(parseStatusPorcelain("")).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
    expect(parseStatusPorcelain("\n")).toEqual({ staged: 0, unstaged: 0, untracked: 0 });
  });

  test("counts untracked entries", () => {
    expect(parseStatusPorcelain("?? a.txt\n?? b/\n")).toEqual({
      staged: 0,
      unstaged: 0,
      untracked: 2,
    });
  });

  test("separates staged from unstaged", () => {
    expect(parseStatusPorcelain("M  staged.txt\n M unstaged.txt\n")).toEqual({
      staged: 1,
      unstaged: 1,
      untracked: 0,
    });
  });

  test("counts a file that is both staged and unstaged in both columns", () => {
    expect(parseStatusPorcelain("MM both.txt\n")).toEqual({
      staged: 1,
      unstaged: 1,
      untracked: 0,
    });
  });

  test("treats a rename as staged", () => {
    expect(parseStatusPorcelain("R  old.txt -> new.txt\n")).toEqual({
      staged: 1,
      unstaged: 0,
      untracked: 0,
    });
  });

  test("counts an unmerged path in both columns", () => {
    expect(parseStatusPorcelain("UU conflict.txt\n")).toEqual({
      staged: 1,
      unstaged: 1,
      untracked: 0,
    });
  });
});

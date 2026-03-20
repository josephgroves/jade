---
name: jade-workspace
description: >-
  Documents the Jade CLI multi-repo workspace layout (bare repos under .bare/,
  main and named worktree groups), discovery by walking up to .bare/, and
  commands for init, add, status, and workspace add/list/remove. Use when
  working in a Jade-managed tree, automating Jade, or when the user mentions
  jade, multi-app workspaces, git worktrees, or .bare/.
---

# Jade workspace

## Mental model

Jade keeps **one bare clone per app** under `.bare/<app>/`. Each **worktree group** is a directory of **git worktrees** (one per app) so every app can sit on the same branch name for a feature. The **`main`** group tracks default branches; other groups live under **`workspace/<name>/`** and usually use branch `<name>` across apps.

## Directory layout (ground truth)

Paths are relative to the **workspace root** (the directory that contains `.bare/`).

```
<workspace-root>/
  jade.json              # config: apps[], optional orgUrl
  .bare/
    <app>/               # bare clone (single source of truth for git objects)
  main/
    <app>/               # worktree on default branch (for main)
  workspace/
    <name>/              # named group (feature workspace)
      <app>/             # worktree; branch typically matches <name>
```

The project README sometimes shows feature folders at the root; in code, **every non-`main` group is under `workspace/<name>/`** (`getWorktreeGroupPath` in `src/utils/workspace.ts`).

## Discovery

Commands resolve the workspace root by **walking up from cwd** until a `.bare/` directory exists (`findWorkspaceRoot`). Pass **`-w <path>`** (or `--workspace`) to use an explicit root when cwd is outside the tree.

## Command cheat sheet

| Command | Purpose |
|--------|---------|
| `jade init <path> [--orgUrl <url>]` | Create `.bare/`, `main/`, `workspace/`, and `jade.json`. |
| `jade add <repo-or-url> [--name <app>] [-b branch] [-w path]` | Bare-clone app into `.bare/<app>`, then add a worktree for **each existing group** (`main` on default branch; other groups on branch = group directory name). |
| `jade status [-w path]` | Plain summary: jade version, root, optional `org`, workspace group names. |
| `jade skills install [--project <dir>]` | Copy bundled Cursor skills into `<dir>/.cursor/skills/`. |
| `jade workspace add <name> [-a] [-w path]` | Create `workspace/<name>/` (or add missing apps). `-a` adds all apps without prompting. |
| `jade workspace list [-w path]` | List groups and each app’s current branch. |
| `jade workspace remove <name> [-d] [-f] [-w path]` | Remove group worktrees and delete `workspace/<name>/`. **Cannot remove `main`.** `-d` deletes branch `<name>` in apps (from `main/<app>` as reference); `-f` force-deletes branches. |

## Agent workflow

1. Run **`jade status`** (or **`jade status -w <workspace-root>`**) for root, version, org, and group names; use **`jade workspace list`** for per-app branches.
2. Treat **“workspace”** in Jade as a **group**: either **`main/`** or **`workspace/<name>/`**.
3. Edit and run git **inside** `main/<app>/` or `workspace/<name>/<app>/`, not inside `.bare/`.
4. After **`jade workspace add`**, confirm actual branches with **`jade workspace list`** if worktree add hit a naming conflict (Git may use a uniquified branch).

## Pitfalls

- **`main` is special**: listed with other groups but lives at **`main/`** at the root; **`jade workspace remove main`** is rejected.
- **`jade add short-name`** requires **`orgUrl`** in `jade.json`; otherwise use a full git URL.
- **Folder name vs branch**: the group directory name is the *intended* branch for non-`main` groups; collisions can produce a different branch name—verify with **`jade workspace list`**.

## Where to install this skill

- **Project**: from the target repo root, run **`jade skills install`** (optional **`--project <dir>`**) — copies bundled skills into **`.cursor/skills/`** for Cursor.
- **Personal**: copy **`jade-workspace/`** to **`~/.cursor/skills/jade-workspace/`** for use across all projects.

Do not place custom skills under `~/.cursor/skills-cursor/` (reserved for Cursor).

## Out of scope here

For **`jade checkout`**, **`jade update`**, **`jade remove`** (app removal), and opinionated multi-app workflows, read the CLI help or a follow-up skill—this skill covers workspace **layout and lifecycle** only.

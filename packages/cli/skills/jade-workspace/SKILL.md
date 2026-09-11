---
name: jade-workspace
description: >-
  Documents the Jade CLI multi-repo workspace layout (bare repos under .bare/,
  main and named worktree groups), discovery by walking up to .bare/, and
  commands for init, add, contextual status, and workspace add/list/remove. Use when
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

The project README sometimes shows feature folders at the root; in code, **every non-`main` group is under `workspace/<name>/`** (`getWorktreeGroupPath` in `packages/cli/src/utils/workspace.ts`).

## Discovery

Commands resolve the workspace root by **walking up from cwd** until a `.bare/` directory exists (`findWorkspaceRoot`). Pass **`-w <path>`** (or `--workspace`) to use an explicit root when cwd is outside the tree.

## Command cheat sheet

| Command | Purpose |
|--------|---------|
| `jade init <path> [--orgUrl <url>]` | Create `.bare/`, `main/`, `workspace/`, and `jade.json`. |
| `jade add <repo-or-url> [--name <app>] [-b branch] [-w path]` | Bare-clone app into `.bare/<app>`, then add a worktree for **each existing group** (`main` on default branch; other groups on branch = group directory name). |
| `jade status [<group>] [--root] [--json] [-w path]` | **Contextual — output shape depends on cwd.** See "Reading `jade status`" below. |
| `jade skills install [--project <dir>] [--target cursor\|claude\|all] [--scope project\|user]` | Copy bundled skills into `.cursor/skills/` and/or `.claude/skills/`, project-local or under the home directory. |
| `jade workspace add <name> [-a] [--apps app1,app2] [-w path]` | Create `workspace/<name>/` (or add missing apps). `-a` adds all apps without prompting; `--apps` adds exactly the named apps non-interactively (bypasses both `-a` and the prompt). |
| `jade workspace list [-w path]` | List groups and each app's current branch. |
| `jade workspace remove <name> [-d] [-f] [-w path]` | Remove group worktrees and delete `workspace/<name>/`. **Cannot remove `main`.** `-d` deletes branch `<name>` in apps (from `main/<app>` as reference); `-f` force-deletes branches. |

## Reading `jade status`

`jade status` reports **two different things** depending on where it runs. Always know which one you asked for.

| Invocation | Output |
|---|---|
| From the workspace root (or any path outside a group) | **Root summary**: jade version, root, optional `org`, group names. |
| From inside `main/` or `workspace/<name>/` (at any depth) | **Workspace view** for that group: the group name, then one line per **installed** app with its branch. |
| `jade status <group>` | Workspace view for `<group>` from anywhere. Wins over `--root`. |
| `jade status --root` | Forces the root summary even from inside a group. |

The text workspace view is deliberately terse — group name plus installed apps and branches:

```
workspace: feat-auth
  cms       feat-auth
  frontend  feat-auth-a1b2c3d  [drift]
```

Markers cover only what can contradict the branch: `[drift]` (branch ≠ group name) and `[detached]` (detached HEAD). Apps with **no worktree in this group are omitted** from the text view.

**`--json` is the full report — use it for anything beyond eyeballing branches.** It adds, per app, `tree` (staged/unstaged/untracked + `clean`), `env` (`present`/`sourceAvailable`), and `present: false` rows for apps missing from the group; plus `herdr` open/focused state and an `attention[]` array pairing each problem with the command that fixes it. `attention[].kind` is one of `branch-drift`, `detached-head`, `missing-worktree`, `missing-env`, `git-error`.

```
--json (root)      → {view:"root", version, root, orgUrl, groups:[...]}
--json (workspace) → {view:"workspace", workspace, path, isMain, apps:[...], attention:[...], herdr?}
```

**When scripting or parsing, always pass `--root` or an explicit `<group>`** — never rely on cwd. Branch on the `view` field, don't assume a shape.

Cost: root view is a pure directory scan; the text workspace view is one git call per app; `--json` is two plus a herdr query. Ahead/behind vs upstream is **not** reported — it would need a fetch to be truthful.

## Agent workflow

1. Run **`jade status --root`** (or **`jade status --root -w <workspace-root>`**) for root, version, org, and group names.
2. Run **`jade status <group>`** to see one group's apps and branches; add **`--json`** when you need dirty state, `.env` gaps, missing apps, or fix commands. Prefer it over **`jade workspace list`** when you care about *one* group; `jade workspace list` remains the way to see branches across *all* groups at once.
3. Treat **"workspace"** in Jade as a **group**: either **`main/`** or **`workspace/<name>/`**.
4. Edit and run git **inside** `main/<app>/` or `workspace/<name>/<app>/`, not inside `.bare/`.
5. After **`jade workspace add`**, run **`jade status <name>`** — it flags a uniquified branch as `[drift]` and prints the `jade checkout` command to correct it.

## Pitfalls

- **`main` is special**: listed with other groups but lives at **`main/`** at the root; **`jade workspace remove main`** is rejected.
- **`jade add short-name`** requires **`orgUrl`** in `jade.json`; otherwise use a full git URL.
- **Folder name vs branch**: the group directory name is the *intended* branch for non-`main` groups; collisions can produce a different branch name—**`jade status <group>`** shows the real branch and flags it `[drift]`.
- **`jade status` is cwd-sensitive**: the same command prints a group list at the root and a per-app report inside a group. Pass **`--root`** or an explicit **`<group>`** whenever the shape matters.
- **A workspace can silently lack an app**: **`jade add`** only creates worktrees in `.bare/` and `main/`, so groups created earlier miss it. The terse text view **omits** such apps — use **`jade status <group> --json`** to see them (`present: false`); **`jade workspace add <group>`** backfills.

## Where to install this skill

- **Project**: from the target repo root, run **`jade skills install`** (optional **`--project <dir>`**, **`--target cursor|claude|all`**) — auto-detects and copies bundled skills into **`.cursor/skills/`** and/or **`.claude/skills/`**.
- **Personal**: run **`jade skills install --scope user`** to install into **`~/.cursor/skills/`** and/or **`~/.claude/skills/`** for use across all projects.

Do not place custom skills under `~/.cursor/skills-cursor/` (reserved for Cursor).

## Out of scope here

For **`jade checkout`**, **`jade update`**, **`jade remove`** (app removal), and opinionated multi-app workflows, read the CLI help or a follow-up skill—this skill covers workspace **layout and lifecycle** only.

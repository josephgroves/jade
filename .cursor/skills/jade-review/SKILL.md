---
name: jade-review
description: >-
  Documents a workflow for assembling a ticket-scoped review workspace
  (workspace/<ticket-id>/ containing only the apps with a matching branch or
  PR) built entirely from existing jade commands (workspace add, checkout,
  update, workspace remove) plus plain git/gh for discovery. Use when asked to
  review, check out, or pull up a ticket or PR by id across a jade multi-repo
  workspace, or when the user mentions reviewing a ticket across multiple
  apps/repos.
---

# Jade review

## Mental model

A review workspace is a **normal `workspace/<ticket-id>/` group** — nothing new is created in jade itself. What's different is *how its membership is decided*: instead of hand-picking apps, you search every configured app for a branch or PR matching a ticket id, then narrow the group down to just the apps where something matched. See [[jade-workspace]] for the general group/worktree mental model this builds on.

There is currently no `jade review` command. This skill is a recipe using commands that already exist.

## Workflow

Given a ticket id, e.g. `JADE-01`:

1. **Refresh remote data.** Run `jade update` so `main/`'s worktrees — and therefore each bare repo's `origin/*` remote-tracking refs — are current. This fetches from `origin` with the default refspec, which updates all of that remote's tracking branches, not just the current one.

   ```bash
   jade update
   ```

2. **Search each configured app for a match.** For every app (see `jade status --root` or `jade.json`'s `apps`), check for a branch or open PR referencing the ticket:

   ```bash
   # If gh is installed and orgUrl is set — search PR titles.
   # owner comes from orgUrl (e.g. https://github.com/myorg -> myorg); repo == app name.
   gh pr list --repo <owner>/<app> --search "JADE-01 in:title" --json headRefName,title,number

   # Always also check branch names directly (local + remote-tracking).
   git -C .bare/<app> branch -a | grep -i jade-01
   ```

   These are plain shell commands you run per app — not jade commands. If an app has more than one distinct matching branch (from either source), treat it as **ambiguous**: don't guess, flag it for the user to resolve by hand.

3. **Scaffold the group with every app.** `jade workspace add` only supports adding **all** apps non-interactively (`--all`/`-a`) or an interactive picker — there's no flag yet to pass a specific app list (tracked in `todo.md`). So create the group with everything, then narrow down:

   ```bash
   jade workspace add JADE-01 --all
   ```

   This checks out a branch literally named `JADE-01` for every app. For apps where that exact branch doesn't already exist, jade creates a new, empty local branch of that name from the bare repo's HEAD — harmless, but see Pitfalls below.

4. **Point matched apps at their real branch.** For each app with exactly one match, check out the real branch — run this from the workspace root, no `cd` required:

   ```bash
   jade checkout <matched-branch> --app workspace/JADE-01/<app>
   ```

   `jade checkout` (without `-c`) runs a plain `git checkout <branch>`, so git's own behavior transparently creates a correct local tracking branch when `<branch>` only exists as `origin/<branch>` — you get the real PR content, not an empty branch.

5. **Drop the apps with no match.** For every app that had no match, remove its worktree so the group only contains ticket-relevant apps:

   ```bash
   git -C .bare/<app> worktree remove workspace/JADE-01/<app>
   ```

6. **Report.** Summarize which apps were kept (with their branch/PR), which were dropped, and which were flagged ambiguous for manual follow-up.

When the review is done, clean up with:

```bash
jade workspace remove JADE-01 -d   # -d also deletes the placeholder/review branches
```

## Command reference

| Command | Role in this workflow |
|---|---|
| `jade update` | Refresh remote-tracking branches before searching. |
| `jade workspace add <name> --all` | Scaffold the group with every app (no per-app selection exists yet). |
| `jade checkout <branch> --app workspace/<name>/<app>` | Point a matched app at its real branch; handles remote-only branches via git's own checkout behavior. |
| `jade workspace remove <name> -d` | Tear down the review workspace and delete the branches it created, including placeholders. |

## Pitfalls

- **Placeholder branches**: step 3's `--all` creates a branch literally named `<ticket-id>` in every app, including ones you'll drop in step 5. This is a harmless but real side effect — `jade workspace remove <name> -d` cleans it up.
- **`gh` is optional**: if it's not installed or not authenticated, you just fall back to branch-name search — that's expected, not an error.
- **Ambiguous matches need a human**: if an app has more than one candidate branch/PR, don't pick automatically — surface both and let the user decide.
- **Owner/repo assumption**: PR search assumes the app's directory name in `.bare/` equals its GitHub repo name, and that `orgUrl` resolves to the right owner — same assumption jade already makes when cloning via `jade add <repo-name>`.
- **No `jade review` command exists**: this is a manual/agent-driven recipe over existing commands, not a single command invocation.

## Where to install this skill

- **Project**: from the target repo root, run `jade skills install` (optional `--project <dir>`) — copies bundled skills into `.cursor/skills/` for Cursor.
- **Personal**: copy `jade-review/` to `~/.cursor/skills/jade-review/` for use across all projects.

## Out of scope here

For the general workspace/worktree layout and lifecycle, see [[jade-workspace]]. For first-time setup, see [[jade-setup]].

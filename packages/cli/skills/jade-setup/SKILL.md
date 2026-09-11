---
name: jade-setup
description: >-
  Step-by-step guide for setting up a brand-new jade workspace from scratch:
  installing the jade CLI, running jade init, adding repos, creating a
  feature workspace group, and (optionally) wiring up herdr. Use when someone
  is starting fresh — no workspace exists yet — as opposed to jade-workspace,
  which documents the layout and commands for a workspace that already
  exists.
---

# Setting up a jade workspace

This skill walks through **first-time setup**: getting from "nothing installed"
to a working multi-repo workspace. For the mental model, directory layout,
and command reference once a workspace already exists, see [[jade-workspace]].

## 1. Prerequisites

- **Bun v1.0+** — https://bun.sh
- **Git v2.5+** (needed for worktree support)

Check both:

```bash
bun --version
git --version
```

## 2. Install jade

```bash
# From the jade repo root, install workspace deps first
bun install

# Then link the CLI globally for local/dev use
cd packages/cli && bun link

# Or compile a standalone binary (from the repo root)
bun run install-global   # places binary at ~/.local/bin/jade
```

Verify with `jade --help`. Make sure `~/.local/bin` (or wherever `bun link`
puts it) is on `PATH`.

## 3. Initialize the workspace

Pick a directory that will hold everything — `.bare/` clones, worktree
groups, and `jade.json`. This directory does **not** need to exist yet;
`jade init` creates it.

```bash
jade init ~/work/my-workspace --orgUrl https://github.com/myorg
cd ~/work/my-workspace
```

`--orgUrl` is optional but strongly recommended: it lets you add repos by
short name later (`jade add frontend`) instead of typing full URLs every
time. You can skip it and pass full URLs instead, or add it later by editing
`jade.json` directly.

This creates:

```
my-workspace/
  jade.json     # { version, apps: [], orgUrl }
  .bare/        # empty — bare clones land here
  main/         # empty — default-branch worktrees land here
  workspace/    # empty — named feature groups land here
```

## 4. Add your repos

```bash
jade add frontend                                     # resolves via orgUrl
jade add backend
jade add https://github.com/other-org/shared-lib --name shared   # full URL, no orgUrl needed
```

Each `add` bare-clones the repo into `.bare/<app>/` and checks out a
worktree on the default branch into `main/<app>/`. It also back-fills the app
into every **existing** workspace group (there's only `main` at this point).

Confirm what you've got:

```bash
jade status            # version, root, orgUrl, group names
jade workspace list    # groups + each app's current branch
```

## 5. Create your first feature workspace

A "workspace group" puts every app on the same branch, side by side:

```bash
jade workspace add feat-navigation
cd workspace/feat-navigation
```

Now `frontend/` and `backend/` here are both git worktrees on a
`feat-navigation` branch (created from each app's default branch). Work in
them like any normal checkout — commit, push, open PRs per app.

When you're done:

```bash
cd ~/work/my-workspace
jade workspace remove feat-navigation -d   # -d also deletes the branches
```

## 6. Optional: herdr integration

If you use the [herdr](https://herdr.dev) terminal multiplexer, `jade open`
turns a workspace group into its own herdr workspace with one tab per app
plus a root tab. See the README's "Herdr integration" section for the plugin
install steps and keybinding setup — not needed to use jade on its own.

## 7. Optional: install the agent skill into other projects

If an app in your workspace will have agents (Claude, Cursor) operating on
it and you want them to understand the jade layout, run from that app's repo
root:

```bash
jade skills install                     # auto-detects: installs into .cursor/skills/ and/or .claude/skills/
jade skills install --project <dir>     # or target a specific directory
jade skills install --target claude     # force a specific tool (cursor | claude | all)
jade skills install --scope user        # install to ~/.claude/skills (and/or ~/.cursor/skills) instead of a project
```

## Common setup pitfalls

- **`jade add <short-name>` fails** — you didn't set `orgUrl` in `jade.json`.
  Either add `orgUrl` (re-run `jade init --orgUrl ...` isn't idempotent for
  this — edit `jade.json` directly) or use a full git URL with `add`.
- **Wrong branch after `workspace add`** — if the intended branch name
  collided with an existing one, git may have uniquified it. Verify with
  `jade workspace list` rather than assuming the group name equals the
  branch name.
- **Running jade commands from the wrong directory** — jade discovers the
  workspace root by walking up from cwd looking for `.bare/`. If you're
  outside the tree, pass `-w <path>` explicitly.

## Where to go next

- Ongoing layout, discovery, and command reference: [[jade-workspace]]
- Full feature list and configuration reference: `README.md`

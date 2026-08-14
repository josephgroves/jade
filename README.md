# jade

A CLI for managing multi-repo workspaces using git bare repos. Work on multiple branches across multiple repositories simultaneously without cloning anything twice.

This repo is a Bun workspace with two packages:

| Package | Description |
|---------|-------------|
| [`packages/cli`](packages/cli) | The `jade` CLI itself |
| [`packages/herdr`](packages/herdr) | The [herdr](https://herdr.dev) plugin that surfaces jade operations as herdr UI |

## Install

Requires [Bun](https://bun.sh) (v1.0+) and Git (v2.5+).

```bash
# Install workspace dependencies
bun install

# Link the CLI globally for development
cd packages/cli && bun link

# Or compile and install a standalone binary (from the repo root)
bun run install-global  # places binary at ~/.local/bin/jade
```

Verify with `jade --help`.

To verify that compiled binaries embed Cursor skills text, run **`bun run --cwd packages/cli test:embed`** (optional; skipped in default `bun test` because some environments block `.cursor` creation in spawned processes).

## Features

| Command | Description |
|---------|-------------|
| `jade init <path>` | Create a new workspace with a `.bare/` and `main/` directory |
| `jade add <repo>` | Clone a repo (bare) and add it to all existing workspaces |
| `jade remove <app>` | Remove an app and its data from all workspaces |
| `jade workspace add <name>` | Create a workspace — a directory with every app on a shared branch |
| `jade workspace list` | List all workspaces and their apps/branches |
| `jade workspace remove <name>` | Remove a workspace (optionally delete branches with `-d`) |
| `jade checkout <branch>` | Checkout or create (`-c`) a branch in a specific app |
| `jade status [name]` | Report a workspace's apps and branches, or the root summary when run outside one (`--root` to force, `--json` for the full report) |
| `jade open [group]` | Open a worktree group in the [herdr](https://herdr.dev) multiplexer: a root tab plus one tab per app |
| `jade skills install` | Copy bundled Cursor agent skills into `<project>/.cursor/skills/` |

Use **`jade skills install`** from any project root (or **`--project <dir>`**) to add the Jade workspace skill for Cursor agents. Skill text is **imported at build time** (`skills/*/SKILL.md` with `type: "text"`), so a **`bun build --compile`** binary embeds them and does not need a separate `skills/` folder next to the executable.

## How it works

Each repository is cloned **once** as a bare repo inside `.bare/`. Workspaces are directories that group apps together by branch name. This means no duplicate clones, instant branch switching, and a clean directory layout:

```
workspace/
  .bare/
    frontend/          # bare clone
    backend/           # bare clone
  main/
    frontend/          # on default branch
    backend/           # on default branch
  feat-auth/
    frontend/          # on feat-auth branch
    backend/           # on feat-auth branch
  jade.json            # workspace config
```

## Workflow example

```bash
# Initialize a workspace with your GitHub org
jade init ~/work/my-workspace --orgUrl https://github.com/myorg
cd ~/work/my-workspace

# Add repos by name (resolves against orgUrl) or full URL
jade add frontend
jade add backend
jade add https://github.com/other-org/shared-lib --name shared

# See what you've got
jade status

# Start a feature — creates a workspace with every app on the same branch
jade workspace add feat-navigation

# Work in the feature workspace
cd feat-navigation/frontend
# ... make changes, commit, push ...

cd ../backend
# ... make changes, commit, push ...

# Clean up when the feature is done
cd ~/work/my-workspace
jade workspace remove feat-navigation -d   # -d also deletes the branches
```

## Checking on a workspace

`jade status` is contextual — inside a workspace it reports that workspace's apps and the
branch each is on, marking any that don't match (`[drift]`, `[detached]`):

```console
$ cd ~/work/my-workspace/workspace/feat-navigation
$ jade status
workspace: feat-navigation
  frontend  feat-navigation
  backend   feat-navigation-a1b2c3d  [drift]
```

Pass a name (`jade status feat-auth`) to report a workspace from anywhere, `--root` to
force the root summary, or `--json` for the full report — working-tree state, `.env` gaps,
missing apps, and an `attention[]` list pairing each problem with the command that fixes it.

## Herdr integration

If you use the [herdr](https://herdr.dev) terminal multiplexer, `jade open` opens a
worktree group as its **own herdr workspace**, labeled with the group name so the
sidebar shows which group you're in:

- A **dedicated herdr workspace** named after the group (e.g. `feat-x`), focused.
- Inside it, a **root tab** at the group root. Since every app is an immediate
  subdirectory here, you can run `claude` in this tab and it can pull context from all
  apps at once.
- **One tab per app**, each `cd`'d into its app directory (`workspace/feat-x/frontend`,
  `…/backend`, …), in the order apps appear in `jade.json`.

Re-running `jade open` for a group that already has a herdr workspace just **focuses
it** instead of creating duplicate tabs.

```bash
cd workspace/feat-navigation
jade open            # opens the current group
jade open feat-auth  # or name a group explicitly (defaults to `main`)
```

`jade open` drives herdr through its CLI (`herdr workspace create` / `tab create`) and
only runs inside a herdr session — it checks `HERDR_ENV=1` and prefers `HERDR_BIN_PATH`
when herdr sets it. Outside herdr it exits with a hint instead of doing anything.

### Herdr plugin

The [`packages/herdr`](packages/herdr) directory is a real [herdr plugin](https://herdr.dev/docs/plugins/) that
closes the loop the other direction — surfacing jade operations as herdr UI instead of
requiring you to type `jade` commands by hand:

- **Actions** (palette-triggered): "Jade: Open workspace group" and "Jade: Sync env files".
- **Pane**: "Jade board" — an interactive overlay listing every workspace group and its
  per-app branches; pick one to open it as tabs, or create a new feature workspace from
  the same picker.
- **Pane**: "Jade: Switch workspace" — a lightweight quick-switch overlay. It lists every
  group, marks which are **already open** in the current herdr session, and floats those
  to the top. Pick an open one and it **focuses that workspace instantly** (via
  `herdr workspace focus`, no jade spin-up); pick a closed one and it runs the full
  `jade open` to create the tabs. Unlike the board, it skips per-app git lookups (backed
  by `jade status --json --root`, a plain directory scan) so it stays snappy, and it has
  no create-new flow — it's purely for jumping between workspaces.

Bind a key to summon the switcher by adding to `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+shift+s"
type = "shell"
command = 'herdr plugin pane open --plugin apptegy.jade --entrypoint switcher --placement overlay --focus --env JADE_CWD="$HERDR_ACTIVE_PANE_CWD"'
description = "Jade: switch workspace"
```

(`--env JADE_CWD=...` forwards the focused pane's directory so the switcher finds the
workspace root regardless of the plugin's own cwd.) Run `herdr server reload-config`
to apply it.

Install the plugin with:

```bash
herdr plugin install <org>/jade/packages/herdr   # once published on GitHub
herdr plugin link /path/to/jade/packages/herdr   # for local development
```

Every plugin script is a thin wrapper that shells out to the `jade` binary on `PATH`
(override with `JADE_BIN_PATH`) — no jade logic is duplicated in the plugin. Open-state
detection queries herdr directly (`herdr workspace list`, matching workspace labels to
group names), which is herdr UI concern, not jade logic. `jade status --json --root` and
`jade workspace list --json` back the panes with structured data.

## Configuration

`jade.json` is created at the workspace root by `jade init` and updated automatically as you add/remove apps.

```json
{
  "version": "1.0",
  "apps": ["frontend", "backend", "shared"],
  "orgUrl": "https://github.com/myorg"
}
```

Setting `orgUrl` lets you `jade add <repo-name>` instead of typing full URLs.

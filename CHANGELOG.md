# Changelog

Notable changes to `jade`, a CLI for managing multi-repo development workspaces built on git bare repos + worktrees. No git tags/releases yet, so earlier entries are grouped by rough date; the current line reflects `packages/cli`'s `package.json` version.

## 0.2.0 — 2026-08

- `jade workspace add --apps app1,app2` — pick an explicit, non-interactive list of apps to add, instead of `--all` or the interactive prompt. Used by the `jade-review` skill to scaffold ticket-scoped workspaces with only the relevant apps.
- `jade skills install` can now target Claude Code (`.claude/skills/`) as well as Cursor (`.cursor/skills/`), with `--target cursor|claude|all` (auto-detected by default) and `--scope project|user` (install into the home directory for use across all projects).
- Added the `jade-review` skill: a recipe for assembling a `workspace/<ticket-id>/` group containing only the apps with a matching branch or PR for a given ticket.
- `jade workspace update` — merge each app's latest default-branch changes into a workspace group.
- Internal refactor for cleaner dependency-injection seams (`GitProcessRunner`/`GitError`, `fs-backend`, `config-backend`) so commands are easier to test and extend.

## 0.1.2 — 2026-08

- `jade status` made contextual — reports a root summary outside a workspace, or a per-app report when run inside one; added `--json` output and an `attention[]` list of detected problems with fix-it commands.
- Fixed bare-clone fetch ordering so worktree upstream tracking resolves correctly, and fixed newly-added repos only landing in `.bare/` + `main/`.

## 2026-07

- Two-way [herdr](https://herdr.dev) terminal multiplexer integration (`herdr/` package): `jade open` turns a workspace group into a herdr workspace with a root tab plus one tab per app, plus a quick workspace-switcher pane.
- Dependency updates.

## 2026-05

- Added `.env` sync: a dedicated command plus auto-copy of `.env` files when adding apps to a workspace.

## 2026-03

- Introduced bundled agent skills: `jade skills install` copies skill docs (e.g. `jade-workspace`) into a project so coding agents understand the jade layout; skill text is embedded at build time so compiled binaries need no external `skills/` folder.
- Renamed "worktree" command family to "workspace" for clarity.
- Reworked workspace management with interactive (Clack) prompts and the current `main/` + `workspace/<name>/` directory layout.
- Reworked `jade status` output to be plain and machine-readable.

## 2026-02

- Initial version of `jade`: a CLI for managing multiple git repos as worktree-based workspaces (bare clone once under `.bare/`, checkout branches as worktrees).
- Added core commands: `add`, `remove`, worktree/workspace management, and branch/checkout handling.
- Introduced the `GitBackend` interface so git plumbing can be swapped for a test fake — the basis for the project's test suite.

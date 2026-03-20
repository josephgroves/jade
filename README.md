# jade

A CLI for managing multi-repo workspaces using git bare repos. Work on multiple branches across multiple repositories simultaneously without cloning anything twice.

## Install

Requires [Bun](https://bun.sh) (v1.0+) and Git (v2.5+).

```bash
# Link globally for development
bun link

# Or compile and install a standalone binary
bun run install-global  # places binary at ~/.local/bin/jade
```

Verify with `jade --help`.

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
| `jade status` | Show workspace config, workspaces, and registered apps |

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

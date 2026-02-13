---
name: ""
overview: ""
todos: []
isProject: false
---

# Technical Plan: Multi-App Workspace via Git Bare Repo & Worktrees

## Goal

Create a centralized, high-efficiency development environment where multiple frontend applications (managed as Git submodules) can be worked on across isolated physical directories (worktrees) without cross-contamination of `node_modules` or build states.

## 1. Architecture Overview

- **Root Directory:** A "Bare" Git repository acting as the central hub.
- **Storage:** The `.bare/` folder contains the entire Git history for the hub.
- **Worktrees:** Sibling directories (e.g., `/main`, `/feat-auth`) that serve as isolated workspaces.
- **Submodules:** Individual FE apps (App A, App B, etc.) registered in the hub and initialized per worktree.

## 2. Infrastructure Setup

The agent should execute the following to initialize the hub:

Bash

```
# Create the parent container
mkdir fe-workspace && cd fe-workspace

# Initialize a bare repository in a hidden folder
git init --bare .bare

# Link the root to the bare repo
echo "gitdir: ./.bare" > .git

# Create the primary 'main' worktree
git worktree add main

```

## 3. Submodule Registration

Within the `main` worktree, register the FE applications:

Bash

```
cd main
# For each FE app:
git submodule add <repository-url> apps/<app-name>
git commit -m "chore: initialize FE apps as submodules"
git push origin main

```

## 4. Feature Branch Workflow (The "Capsule")

To work on a feature affecting multiple apps, the agent should follow this protocol:

1. **Create Worktree:** From the root, run `git worktree add ../feature-<name> -b feature/<name>`.
2. **Initialize Apps:** Navigate to the new folder and run `git submodule update --init --recursive`.
3. **Local Development:**
  - Navigate into `apps/<app-name>`.
  - Create a local branch within the submodule.
  - Make changes and commit *inside* the submodule.
4. **Hub Sync:** Back in the worktree root, commit the updated submodule pointers to the Hub’s feature branch.

## 5. IDE & Environment Configuration

To ensure a smooth developer experience (DX), the agent should:

- **VS Code:** Create a `.vscode/settings.json` in the root that excludes the `.bare` folder from searches.
- **Ignore Files:** Ensure `.gitignore` accounts for the fact that worktrees are siblings, not children, of the Git database.
- **Cleanup Script:** Provide a `cleanup.sh` to remove worktrees and prune the Git database once features are merged.

---

## 6. Constraints & Safety Rails

- **No Nested Worktrees:** Never initialize a worktree inside a submodule.
- **Branch Locking:** Ensure the agent checks `git worktree list` before creating a branch to avoid "Branch already checked out" errors.
- **Relative Paths:** Ensure any shared build scripts (e.g., Turbo or Nx) use relative paths that remain valid across sibling worktree directories.


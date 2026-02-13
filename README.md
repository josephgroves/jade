# jade 🌆

Elegant CLI tool for managing multi-repository workspaces using git bare repos and worktrees.

## Installation

### Link globally with Bun

From this directory, run:

```bash
bun link
```

This makes the `jade` command available globally. You can now run `jade` from any directory.

### Verify installation

```bash
jade --help
```

## Usage

### Initialize a new workspace

```bash
jade init <path>
```

Creates a new workspace directory structure with `.bare/` and `main/` directories.

**Options:**
- `--branch <name>` - Default branch name (default: "main")
- `--orgUrl <url>` - GitHub organization URL

**Example:**
```bash
jade init ~/workspaces/my-workspace --branch main --orgUrl https://github.com/myorg
cd ~/workspaces/my-workspace
```

### Add a repository

```bash
jade add <repo-name-or-url> [--name <app-name>]
```

Clones a bare repository to `.bare/<app-name>/` and creates worktrees in all existing worktree directories.

**Smart URL Resolution:**
- If you provide a **full URL**, it uses that directly
- If you provide a **repo name** (no URL), it constructs the URL from `orgUrl` in `jade.json`

**Options:**
- `--name <name>` - App name (defaults to repo name extracted from URL/input)
- `--workspace <path>` / `-w <path>` - Workspace root (defaults to current directory)

**Examples:**

```bash
# If jade.json has "orgUrl": "https://github.com/myorg"
jade add frontend              # Clones https://github.com/myorg/frontend
jade add backend              # Clones https://github.com/myorg/backend

# Or use full URLs directly
jade add https://github.com/other-org/shared-lib --name shared

# SSH URLs also work
jade add git@github.com:myorg/private-repo.git
```

### Remove a repository

```bash
jade remove <app-name>
```

Removes all worktrees for an app and deletes the bare repository from `.bare/<app-name>/`.

**Options:**
- `--workspace <path>` / `-w <path>` - Workspace root (defaults to current directory)

**Example:**

```bash
jade remove old-app
```

### Manage worktree groups

#### Create a new worktree group

```bash
jade worktree add <name>
```

Creates a new worktree directory with all apps on a branch matching the directory name. Each app will either create a new branch or check out an existing branch with that name.

**Options:**
- `--workspace <path>` / `-w <path>` - Workspace root

**Example:**
```bash
jade worktree add feature-auth
```

This will:
1. Create directory `./feature-auth/`
2. For each app, create a worktree at `feature-auth/<app>/` on branch `feature-auth`

#### List worktree groups

```bash
jade worktree list
```

Shows all worktree directories and the apps/branches within each.

#### Remove a worktree group

```bash
jade worktree remove <name> [--delete-branches] [--force]
```

Removes a worktree directory and optionally deletes the branches in all apps.

**Options:**
- `--delete-branches` / `-d` - Delete branches with the same name in all apps
- `--force` / `-f` - Force delete branches (use with `-d` for unmerged branches)
- `--workspace <path>` / `-w <path>` - Workspace root

**Example:**
```bash
# Remove worktree group only
jade worktree remove feature-auth

# Remove worktree AND delete branches in all apps
jade worktree remove feature-auth -d

# Force delete even if branches have unmerged changes
jade worktree remove feature-auth -df
```

### Checkout branches

```bash
jade checkout <branch> [--app <name>] [--create]
```

Checkout or create a branch in a specific app.

**Options:**
- `--app <name>` - App name (checkouts within that app)
- `--create` / `-c` - Create a new branch
- `--workspace <path>` / `-w <path>` - Workspace root

**Examples:**
```bash
# Checkout branch in current directory
jade checkout feature/new-feature

# Create and checkout a branch in a specific app
cd main
jade checkout feature/user-auth --app frontend --create
```

### Show workspace status

```bash
jade status
```

Displays:
- Workspace configuration
- All worktree groups
- Apps and their branches in each worktree
- Registered apps

## Workflow Example

```bash
# 1. Initialize workspace with orgUrl
jade init ~/workspaces/my-workspace --orgUrl https://github.com/myorg

# 2. Add apps (using repo names - much simpler!)
cd ~/workspaces/my-workspace
jade add frontend
jade add backend
jade add shared-components

# Or mix with full URLs for external repos
jade add https://github.com/external/library --name external-lib

# 3. Check status
jade status

# 4. Create a feature worktree group
jade worktree add feat-navigation
# Creates feat-navigation/ with all apps on 'feat-navigation' branch

# 5. Work in the new worktree
cd feat-navigation/frontend
# make changes
git add .
git commit -m "feat: update navigation"
git push origin feat-navigation

cd ../backend
# make changes
git add .
git commit -m "feat: update API for navigation"
git push origin feat-navigation

# 6. When done, clean up (optionally delete branches)
cd ../..
jade worktree remove feat-navigation -d  # -d deletes branches in all apps
```

## Architecture

The new architecture removes all submodule usage and treats each repository independently:

```
workspace-root/
  ├── .bare/
  │   ├── frontend/      (bare clone of frontend repo)
  │   ├── backend/       (bare clone of backend repo)
  │   └── shared/        (bare clone of shared repo)
  ├── main/
  │   ├── frontend/      (worktree on default branch)
  │   ├── backend/       (worktree on default branch)
  │   └── shared/        (worktree on default branch)
  ├── feat-navigation/
  │   ├── frontend/      (worktree on feat-navigation branch)
  │   ├── backend/       (worktree on feat-navigation branch)
  │   └── shared/        (worktree on feat-navigation branch)
  └── jade.json          (configuration)
```

**Key concepts:**
- **Bare repos** (`.bare/<app>/`) - Central git database for each repository
- **Worktree groups** (`main/`, `feat-navigation/`, etc.) - Directories that group worktrees by branch name
- **App worktrees** - Git worktrees from bare repos, organized by group
- **Config** (`jade.json`) - Workspace metadata

**Benefits:**
- No submodule complexity
- Each app is a fully independent git repo
- Fast worktree creation (no network fetches after initial clone)
- Natural branch organization by directory

## Configuration File

The `jade.json` file is automatically created at the workspace root when you run `jade init`. It stores workspace metadata and configuration.

### Location

```
workspace-root/
  ├── .bare/           # Bare repositories
  ├── main/            # Main worktree group
  ├── jade.json        # Configuration file (here!)
  └── ...other worktree groups
```

### Structure

```json
{
  "version": "1.0",
  "defaultBranch": "main",
  "apps": [
    "frontend",
    "backend",
    "shared-components"
  ],
  "orgUrl": "https://github.com/myorg"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Config file format version (currently "1.0") |
| `defaultBranch` | string | Default branch name (informational only) |
| `apps` | string[] | List of registered app names (auto-updated by `jade add`) |
| `orgUrl` | string? | Optional GitHub organization URL. **When set, you can use `jade add repo-name` instead of full URLs!** |

### Manual Editing

You can manually edit `jade.json` if needed:

```bash
# Edit workspace config
vim workspace-root/jade.json
```

**Example use cases:**
- Remove apps that no longer exist
- Add an organization URL after initialization

### Auto-Updates

The config is automatically updated by jade commands:
- `jade init` - Creates the initial config
- `jade add` - Adds app names to the `apps` array
- `jade remove` - Removes app names from the `apps` array

## Development

Run locally without linking:

```bash
bun run index.ts --help
```

## Requirements

- Bun runtime
- Git


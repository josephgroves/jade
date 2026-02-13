# jade 🌆

Elegant CLI tool for managing git bare-repo + worktree workspaces with submodules.

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

Creates a new workspace with a bare repository and main worktree.

**Options:**
- `--branch <name>` - Default branch name (default: "main")
- `--orgUrl <url>` - GitHub organization URL

**Example:**
```bash
jade init ~/workspaces/my-workspace --branch main --orgUrl https://github.com/myorg
cd ~/workspaces/my-workspace
```

### Add a repository as a submodule

```bash
jade add <repo-name-or-url> [--name <app-name>]
```

Adds a repository as a submodule in the `apps/` directory of the main worktree.

**Smart URL Resolution:**
- If you provide a **full URL**, it uses that directly
- If you provide a **repo name** (no URL), it constructs the URL from `orgUrl` in `jade.json`

**Options:**
- `--name <name>` - App name (defaults to repo name extracted from URL/input)
- `--workspace <path>` / `-w <path>` - Workspace root (defaults to current directory)

**Examples:**

```bash
# If jade.json has "orgUrl": "https://github.com/myorg"
jade add frontend              # Adds https://github.com/myorg/frontend
jade add backend              # Adds https://github.com/myorg/backend

# Or use full URLs directly
jade add https://github.com/other-org/shared-lib --name shared

# SSH URLs also work
jade add git@github.com:myorg/private-repo.git
```

### Manage worktrees

#### Create a new worktree

```bash
jade worktree add <name> [--branch <branch>]
```

Creates a new worktree and initializes all submodules. **Automatically creates matching branches in all submodules** with the same name as the worktree branch.

**Options:**
- `--branch <name>` / `-b <name>` - Branch name (defaults to worktree name)
- `--workspace <path>` / `-w <path>` - Workspace root

**Example:**
```bash
jade worktree add feature-auth --branch feature/authentication
```

This will:
1. Create a new worktree at `./feature-auth`
2. Create branch `feature/authentication` for the worktree
3. Initialize all submodules
4. Create branch `feature/authentication` in each submodule automatically

#### List worktrees

```bash
jade worktree list
```

#### Remove a worktree

```bash
jade worktree remove <name>
```

**Example:**
```bash
jade worktree remove feature-auth
```

### Checkout branches

```bash
jade checkout <branch> [--app <name>] [--create]
```

Checkout or create a branch on the hub worktree or within a specific app submodule.

**Options:**
- `--app <name>` - App name (checkouts within that submodule)
- `--create` / `-c` - Create a new branch
- `--workspace <path>` / `-w <path>` - Workspace root

**Examples:**
```bash
# Checkout branch in current worktree
jade checkout feature/new-feature

# Create and checkout a branch in a specific app
jade checkout feature/user-auth --app frontend --create
```

### Show workspace status

```bash
jade status
```

Displays:
- Workspace configuration
- All worktrees with their branches
- Submodules and their current branches
- Registered apps

## Workflow Example

```bash
# 1. Initialize workspace with orgUrl
jade init ~/workspaces/fe-workspace --orgUrl https://github.com/myorg

# 2. Add apps as submodules (using repo names - much simpler!)
cd ~/workspaces/fe-workspace/main
jade add app-a
jade add app-b
jade add shared-components

# Or mix with full URLs for external repos
jade add https://github.com/external/library --name external-lib

# 3. Check status
jade status

# 4. Create a feature worktree
jade worktree add feat-navigation -b feature/navigation
# ✓ Automatically creates 'feature/navigation' branch in all submodules!

# 5. Work in the new worktree
cd feat-navigation

# 6. All submodules are already on the feature/navigation branch
# Just start making changes!
cd app-a
# make changes
git add .
git commit -m "feat: update navigation"
cd ..

# 7. Commit submodule pointer updates in the worktree
git add app-a shared-components
git commit -m "feat: update app navigation"

# 8. When done, clean up
cd ..
jade worktree remove feat-navigation
```

## Architecture

- **Bare repo** (`.bare/`) - Central git database
- **Worktrees** - Isolated physical directories for different branches
- **Submodules** - Individual apps in `apps/` directory
- **Config** (`jade.json`) - Workspace metadata

## Configuration File

The `jade.json` file is automatically created at the workspace root when you run `jade init`. It stores workspace metadata and configuration.

### Location

```
workspace-root/
  ├── .bare/           # Git bare repository
  ├── main/            # Main worktree
  ├── jade.json        # Configuration file (here!)
  └── ...other worktrees
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
| `defaultBranch` | string | Default branch name used when creating worktrees |
| `apps` | string[] | List of registered app names (auto-updated by `jade add`) |
| `orgUrl` | string? | Optional GitHub organization URL. **When set, you can use `jade add repo-name` instead of full URLs!** |

### Manual Editing

You can manually edit `jade.json` if needed:

```bash
# Edit workspace config
vim workspace-root/jade.json
```

**Example use cases:**
- Change the default branch for new worktrees
- Remove apps that no longer exist
- Add an organization URL after initialization

### Auto-Updates

The config is automatically updated by jade commands:
- `jade init` - Creates the initial config
- `jade add` - Adds app names to the `apps` array

**Note:** The `apps` array is for tracking purposes. Removing an app from the config doesn't delete the submodule - you'll need to use git commands for that.

## Development

Run locally without linking:

```bash
bun run index.ts --help
```

## Requirements

- Bun runtime
- Git

## Features

- 🎨 Beautiful colored output with structured logging
- 🚀 Fast TypeScript execution with Bun
- 🌳 Smart branch management across all submodules
- 📦 Simple repo management with orgUrl shortcuts
- 🔄 Automatic submodule initialization


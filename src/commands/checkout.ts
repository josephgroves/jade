import { defineCommand } from "citty";
import { resolve } from "path";
import { existsSync } from "fs";
import { gitCheckout } from "../utils/git.ts";
import { findWorkspaceRoot } from "../utils/workspace.ts";

export default defineCommand({
  meta: {
    name: "checkout",
    description: "Checkout or create a branch on the hub or a specific app",
  },
  args: {
    branch: {
      type: "positional",
      description: "Branch name",
      required: true,
    },
    app: {
      type: "string",
      description: "App name (if checking out in a submodule)",
    },
    create: {
      type: "boolean",
      alias: "c",
      description: "Create a new branch",
      default: false,
    },
    workspace: {
      type: "string",
      alias: "w",
      description: "Workspace root path",
    },
  },
  async run({ args }) {
    const workspaceRoot = args.workspace
      ? resolve(args.workspace as string)
      : findWorkspaceRoot();

    if (!workspaceRoot) {
      console.error("❌ Not in a jade workspace. Run 'jade init' first.");
      process.exit(1);
    }

    const branch = args.branch as string;
    const create = args.create as boolean;
    const app = args.app as string | undefined;

    let targetPath: string;
    let targetDescription: string;

    if (app) {
      // Checkout in a specific app submodule
      targetPath = resolve(process.cwd(), "apps", app);
      targetDescription = `app '${app}'`;

      if (!existsSync(targetPath)) {
        console.error(`❌ App '${app}' not found in current worktree`);
        process.exit(1);
      }
    } else {
      // Checkout in the current worktree
      targetPath = process.cwd();
      targetDescription = "current worktree";
    }

    const action = create ? "Creating and checking out" : "Checking out";
    console.log(`${action} branch '${branch}' in ${targetDescription}`);

    try {
      await gitCheckout(targetPath, branch, create);
      console.log(`✓ ${create ? "Created and checked out" : "Checked out"} branch '${branch}'`);
    } catch (error) {
      console.error(`❌ Failed to checkout branch: ${error}`);
      process.exit(1);
    }
  },
});

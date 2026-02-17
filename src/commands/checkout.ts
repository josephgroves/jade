import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { findWorkspaceRoot } from "../utils/workspace.ts";
import { type GitBackend, realGitBackend } from "../utils/git-backend.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function makeCheckoutCommand(git: GitBackend = realGitBackend) {
  return defineCommand({
    meta: {
      name: "checkout",
      description: "Checkout or create a branch in a specific app",
    },
    args: {
      branch: {
        type: "positional",
        description: "Branch name",
        required: true,
      },
      app: {
        type: "string",
        description: "App name (if checking out in a specific app)",
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
        : await findWorkspaceRoot();

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
        targetPath = resolve(process.cwd(), app);
        targetDescription = `app '${app}'`;

        if (!await pathExists(targetPath)) {
          console.error(`❌ App '${app}' not found in current directory`);
          process.exit(1);
        }
      } else {
        targetPath = process.cwd();
        targetDescription = "current directory";
      }

      const action = create ? "Creating and checking out" : "Checking out";
      console.log(`${action} branch '${branch}' in ${targetDescription}`);

      try {
        await git.checkout(targetPath, branch, create);
        console.log(`✓ ${create ? "Created and checked out" : "Checked out"} branch '${branch}'`);
      } catch (error) {
        console.error(`❌ Failed to checkout branch: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeCheckoutCommand();

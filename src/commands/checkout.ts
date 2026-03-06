import { defineCommand } from "citty";
import { resolve } from "path";
import { stat } from "fs/promises";
import { intro, outro, cancel, spinner } from "@clack/prompts";
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
      intro(`Checkout`);

      const workspaceRoot = args.workspace
        ? resolve(args.workspace as string)
        : await findWorkspaceRoot();

      if (!workspaceRoot) {
        cancel(`Not in a jade workspace. Run 'jade init' first.`);
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
          cancel(`App '${app}' not found in current directory`);
          process.exit(1);
        }
      } else {
        targetPath = process.cwd();
        targetDescription = "current directory";
      }

      const s = spinner();
      s.start(`${create ? "Creating and checking out" : "Checking out"} branch '${branch}' in ${targetDescription}`);

      try {
        await git.checkout(targetPath, branch, create);
        s.stop(`${create ? "Created and checked out" : "Checked out"} branch '${branch}'`);
        outro(`Done`);
      } catch (error) {
        s.stop(`Failed`);
        cancel(`Failed to checkout branch: ${error}`);
        process.exit(1);
      }
    },
  });
}

export default makeCheckoutCommand();

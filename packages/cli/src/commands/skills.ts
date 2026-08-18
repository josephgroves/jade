import { defineCommand } from "citty";
import { resolve } from "path";
import { homedir } from "os";
import { bundledSkillPackages } from "../bundled-skills/registry.ts";
import {
  installBundledSkillPackages,
  resolveSkillsInstallTargets,
  SKILLS_INSTALL_DEST_SEGMENTS,
  type SkillsInstallTargetArg,
} from "../utils/install-skills.ts";
import { type FileSystemBackend, realFileSystemBackend } from "../utils/fs-backend.ts";

const VALID_TARGETS = new Set<SkillsInstallTargetArg>(["cursor", "claude", "all"]);
const VALID_SCOPES = new Set(["project", "user"]);

export function makeSkillsInstallCommand(fs: FileSystemBackend = realFileSystemBackend) {
  return defineCommand({
    meta: {
      name: "install",
      description:
        "Copy bundled agent skills into .cursor/skills/ and/or .claude/skills/, project-local or user-global",
    },
    args: {
      project: {
        type: "string",
        description: "Project root directory (default: current working directory; invalid with --scope user)",
      },
      scope: {
        type: "string",
        description: "Install scope: project (default) or user (installs to the home dir, e.g. ~/.claude/skills)",
      },
      target: {
        type: "string",
        description: "Install target: cursor, claude, or all (default: auto-detect from destination root)",
      },
    },
    async run({ args }) {
      const projectArg = args.project as string | undefined;
      const scopeArg = (args.scope as string | undefined) ?? "project";
      const targetArg = args.target as string | undefined;

      if (!VALID_SCOPES.has(scopeArg)) {
        console.error(`jade skills install: invalid --scope "${scopeArg}" (expected project or user)`);
        process.exit(1);
        return;
      }
      if (targetArg !== undefined && !VALID_TARGETS.has(targetArg as SkillsInstallTargetArg)) {
        console.error(`jade skills install: invalid --target "${targetArg}" (expected cursor, claude, or all)`);
        process.exit(1);
        return;
      }
      if (scopeArg === "user" && projectArg !== undefined) {
        console.error(`jade skills install: --project cannot be combined with --scope user`);
        process.exit(1);
        return;
      }

      const destRoot = scopeArg === "user" ? homedir() : resolve(projectArg ?? process.cwd());

      try {
        const targets = await resolveSkillsInstallTargets(targetArg as SkillsInstallTargetArg | undefined, destRoot, fs);

        for (const target of targets) {
          const destSegments = SKILLS_INSTALL_DEST_SEGMENTS[target];
          const names = await installBundledSkillPackages(bundledSkillPackages, destRoot, { destSegments }, fs);
          const dest = resolve(destRoot, ...destSegments);
          if (names.length === 0) {
            console.log(`jade skills install: created ${dest} (no bundled skill packages)`);
            continue;
          }
          for (const name of names) {
            console.log(`installed: ${dest}/${name}`);
          }
        }
      } catch (error) {
        console.error(`jade skills install: ${error}`);
        process.exit(1);
      }
    },
  });
}

export function makeSkillsCommand(fs: FileSystemBackend = realFileSystemBackend) {
  return defineCommand({
    meta: {
      name: "skills",
      description: "Install agent skills bundled with jade (Cursor, Claude Code, or both)",
    },
    subCommands: {
      install: makeSkillsInstallCommand(fs),
    },
  });
}

export default makeSkillsCommand();

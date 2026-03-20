import { defineCommand } from "citty";
import { resolve } from "path";
import { bundledSkillPackages } from "../bundled-skills/registry.ts";
import { installBundledSkillPackages } from "../utils/install-skills.ts";

const installCommand = defineCommand({
  meta: {
    name: "install",
    description: "Copy bundled Cursor skills into the project's .cursor/skills/",
  },
  args: {
    project: {
      type: "string",
      description: "Project root directory (default: current working directory)",
    },
  },
  async run({ args }) {
    const projectRoot = resolve((args.project as string | undefined) ?? process.cwd());

    try {
      const names = await installBundledSkillPackages(bundledSkillPackages, projectRoot);
      const dest = resolve(projectRoot, ".cursor", "skills");
      if (names.length === 0) {
        console.log(`jade skills install: created ${dest} (no bundled skill packages)`);
        return;
      }
      for (const name of names) {
        console.log(`installed: ${dest}/${name}`);
      }
    } catch (error) {
      console.error(`jade skills install: ${error}`);
      process.exit(1);
    }
  },
});

const skillsCommand = defineCommand({
  meta: {
    name: "skills",
    description: "Install Cursor agent skills bundled with jade",
  },
  subCommands: {
    install: installCommand,
  },
});

export default skillsCommand;

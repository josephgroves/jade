import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { readFile, mkdir, mkdtemp, rm, stat } from "fs/promises";
import { bundledSkillPackages } from "../../bundled-skills/registry.ts";
import { installBundledSkillPackages } from "../../utils/install-skills.ts";

/**
 * Workspace-local temp so tests can create `.cursor/` (sandbox often blocks that under /tmp).
 */
async function createProjectTemp(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(process.cwd(), "jade-test-skill-"));
  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}

describe("installBundledSkillPackages", () => {
  let project: Awaited<ReturnType<typeof createProjectTemp>>;

  afterEach(async () => {
    if (project) await project.cleanup();
  });

  test("installs registry packages under dest (default in CLI is .cursor/skills)", async () => {
    project = await createProjectTemp();
    const projectPath = join(project.path, "my-app");
    await mkdir(projectPath, { recursive: true });

    const names = await installBundledSkillPackages(bundledSkillPackages, projectPath, {
      destSegments: ["_jade_skill_install", "skills"],
    });

    expect(names).toContain("jade-workspace");
    const skillPath = join(projectPath, "_jade_skill_install", "skills", "jade-workspace", "SKILL.md");
    const body = await readFile(skillPath, "utf8");
    expect(body).toContain("name: jade-workspace");
  });

  test("creates dest only when packages empty", async () => {
    project = await createProjectTemp();
    const projectPath = join(project.path, "my-app");
    await mkdir(projectPath, { recursive: true });
    const names = await installBundledSkillPackages({}, projectPath, {
      destSegments: ["_jade_skill_install", "skills"],
    });
    expect(names).toEqual([]);
    expect((await stat(join(projectPath, "_jade_skill_install", "skills"))).isDirectory()).toBe(true);
  });
});

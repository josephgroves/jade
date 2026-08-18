import { describe, test, expect, afterEach } from "bun:test";
import { join } from "path";
import { readFile, mkdir, mkdtemp, rm, stat } from "fs/promises";
import { bundledSkillPackages } from "../../bundled-skills/registry.ts";
import {
  installBundledSkillPackages,
  resolveSkillsInstallTargets,
  detectSkillsInstallTargets,
} from "../../utils/install-skills.ts";
import { createMockFileSystemBackend } from "../../test/mock-filesystem-backend.ts";

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

    expect(names).toContain("jade-review");
    const reviewSkillPath = join(projectPath, "_jade_skill_install", "skills", "jade-review", "SKILL.md");
    const reviewBody = await readFile(reviewSkillPath, "utf8");
    expect(reviewBody).toContain("name: jade-review");
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

describe("resolveSkillsInstallTargets / detectSkillsInstallTargets", () => {
  test("explicit target wins regardless of what's on disk", async () => {
    const { fs } = createMockFileSystemBackend();
    expect(await resolveSkillsInstallTargets("cursor", "/proj", fs)).toEqual(["cursor"]);
    expect(await resolveSkillsInstallTargets("claude", "/proj", fs)).toEqual(["claude"]);
    expect(await resolveSkillsInstallTargets("all", "/proj", fs)).toEqual(["cursor", "claude"]);
  });

  test("auto-detects cursor only when just .cursor/ exists", async () => {
    const { fs } = createMockFileSystemBackend();
    await fs.mkdirp("/proj/.cursor");
    expect(await detectSkillsInstallTargets("/proj", fs)).toEqual(["cursor"]);
    expect(await resolveSkillsInstallTargets(undefined, "/proj", fs)).toEqual(["cursor"]);
  });

  test("auto-detects claude only when just .claude/ exists", async () => {
    const { fs } = createMockFileSystemBackend();
    await fs.mkdirp("/proj/.claude");
    expect(await detectSkillsInstallTargets("/proj", fs)).toEqual(["claude"]);
  });

  test("falls back to both when neither config dir exists", async () => {
    const { fs } = createMockFileSystemBackend();
    expect(await detectSkillsInstallTargets("/proj", fs)).toEqual(["cursor", "claude"]);
  });

  test("installs into both when neither dir exists but both are present", async () => {
    const { fs } = createMockFileSystemBackend();
    await fs.mkdirp("/proj/.cursor");
    await fs.mkdirp("/proj/.claude");
    expect(await detectSkillsInstallTargets("/proj", fs)).toEqual(["cursor", "claude"]);
  });
});

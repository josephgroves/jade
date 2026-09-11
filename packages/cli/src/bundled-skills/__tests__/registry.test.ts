import { describe, test, expect } from "bun:test";
import { bundledSkillPackages, listBundledSkillNames } from "../registry.ts";

describe("bundledSkillPackages", () => {
  test("includes jade-workspace with embedded SKILL.md", () => {
    expect(listBundledSkillNames()).toContain("jade-workspace");
    const md = bundledSkillPackages["jade-workspace"]?.files["SKILL.md"];
    expect(md).toBeDefined();
    expect(md).toContain("name: jade-workspace");
  });

  test("includes jade-review with embedded SKILL.md", () => {
    expect(listBundledSkillNames()).toContain("jade-review");
    const md = bundledSkillPackages["jade-review"]?.files["SKILL.md"];
    expect(md).toBeDefined();
    expect(md).toContain("name: jade-review");
  });
});

import jadeWorkspaceSkill from "../../skills/jade-workspace/SKILL.md" with { type: "text" };

export type BundledSkillPackage = {
  /** Relative paths inside the skill folder (e.g. SKILL.md) */
  files: Record<string, string>;
};

/**
 * Skill packages shipped with jade. Sources are imported as text so `bun build --compile`
 * embeds them in the binary — no runtime `skills/` directory on disk.
 */
export const bundledSkillPackages: Record<string, BundledSkillPackage> = {
  "jade-workspace": {
    files: {
      "SKILL.md": jadeWorkspaceSkill,
    },
  },
};

export function listBundledSkillNames(): string[] {
  return Object.keys(bundledSkillPackages).sort();
}

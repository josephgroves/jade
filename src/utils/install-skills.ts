import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import type { BundledSkillPackage } from "../bundled-skills/registry.ts";

export type InstallSkillsOptions = {
  /** Relative path segments under projectRoot (default: [".cursor", "skills"]) */
  destSegments?: string[];
};

/**
 * Write bundled skill packages (in-memory file maps) into
 * `<projectRoot>/.cursor/skills/<package>/<relpath>`, unless `destSegments` overrides.
 */
export async function installBundledSkillPackages(
  packages: Record<string, BundledSkillPackage>,
  projectRoot: string,
  options?: InstallSkillsOptions
): Promise<string[]> {
  const segments = options?.destSegments ?? [".cursor", "skills"];
  const destRoot = join(projectRoot, ...segments);
  const names = Object.keys(packages).sort();

  await mkdir(destRoot, { recursive: true });

  if (names.length === 0) {
    return [];
  }

  for (const name of names) {
    const pkg = packages[name]!;
    const pkgDest = join(destRoot, name);
    await mkdir(pkgDest, { recursive: true });
    for (const [relPath, content] of Object.entries(pkg.files)) {
      const fullPath = join(pkgDest, relPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    }
  }

  return names;
}

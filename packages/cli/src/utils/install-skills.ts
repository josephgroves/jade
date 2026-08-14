import { join } from "path";
import type { BundledSkillPackage } from "../bundled-skills/registry.ts";
import { type FileSystemBackend, realFileSystemBackend } from "./fs-backend.ts";

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
  options?: InstallSkillsOptions,
  fs: FileSystemBackend = realFileSystemBackend
): Promise<string[]> {
  const segments = options?.destSegments ?? [".cursor", "skills"];
  const destRoot = join(projectRoot, ...segments);
  const names = Object.keys(packages).sort();

  await fs.mkdirp(destRoot);

  if (names.length === 0) {
    return [];
  }

  for (const name of names) {
    const pkg = packages[name]!;
    const pkgDest = join(destRoot, name);
    await fs.mkdirp(pkgDest);
    for (const [relPath, content] of Object.entries(pkg.files)) {
      const fullPath = join(pkgDest, relPath);
      await fs.writeFile(fullPath, content);
    }
  }

  return names;
}

import { join } from "path";
import type { BundledSkillPackage } from "../bundled-skills/registry.ts";
import { type FileSystemBackend, realFileSystemBackend } from "./fs-backend.ts";

export type InstallSkillsOptions = {
  /** Relative path segments under projectRoot (default: [".cursor", "skills"]) */
  destSegments?: string[];
};

export type SkillsInstallTarget = "cursor" | "claude";
export type SkillsInstallTargetArg = SkillsInstallTarget | "all";

/** Destination segments for each supported tool, relative to the project root. */
export const SKILLS_INSTALL_DEST_SEGMENTS: Record<SkillsInstallTarget, string[]> = {
  cursor: [".cursor", "skills"],
  claude: [".claude", "skills"],
};

/**
 * Figure out which tool(s) to install into when the user didn't pass `--target`.
 * If the project already has a `.cursor/` or `.claude/` directory, install into
 * whichever one(s) exist; if neither exists, install into both since there's no
 * signal that one tool is more "default" than the other.
 */
export async function detectSkillsInstallTargets(
  projectRoot: string,
  fs: FileSystemBackend = realFileSystemBackend
): Promise<SkillsInstallTarget[]> {
  const [hasCursor, hasClaude] = await Promise.all([
    fs.pathExists(join(projectRoot, ".cursor")),
    fs.pathExists(join(projectRoot, ".claude")),
  ]);

  if (hasCursor && !hasClaude) return ["cursor"];
  if (hasClaude && !hasCursor) return ["claude"];
  return ["cursor", "claude"];
}

/** Resolve an explicit `--target` argument (or auto-detect) into concrete install targets. */
export async function resolveSkillsInstallTargets(
  target: SkillsInstallTargetArg | undefined,
  projectRoot: string,
  fs: FileSystemBackend = realFileSystemBackend
): Promise<SkillsInstallTarget[]> {
  if (target === "all") return ["cursor", "claude"];
  if (target === "cursor" || target === "claude") return [target];
  return detectSkillsInstallTargets(projectRoot, fs);
}

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

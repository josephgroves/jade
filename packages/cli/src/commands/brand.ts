import { defineCommand } from "citty";
import {
  amber,
  bg,
  bold,
  colorEnabled,
  createGemProgress,
  dim,
  fg,
  jade,
  jadeIntro,
  jadeOutro,
  jadeSpinner,
  printJadeLogoLockup,
  red,
  statusBullet,
  type RGB,
  type StatusBulletState,
} from "../utils/theme.ts";
import pkg from "../../package.json" with { type: "json" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function heading(title: string): void {
  console.log();
  console.log(bold(fg(jade.core, `── ${title} ──`)));
  console.log();
}

/** Every named color in the palette, and where the real CLI uses it. */
function showPalette(): void {
  heading("Palette");
  const swatches: Array<{ name: string; rgb: RGB; use: string }> = [
    { name: "jade.deep", rgb: jade.deep, use: "darkest tone — unused directly outside gradients" },
    { name: "jade.forest", rgb: jade.forest, use: "facet spinner's dim frame" },
    { name: "jade.core", rgb: jade.core, use: "primary accent — ◆ bullets, intro/outro, clean/done states" },
    { name: "jade.bright", rgb: jade.bright, use: "active states — spinner mid-frame, in-progress rows" },
    { name: "jade.mint", rgb: jade.mint, use: "brightest — JADE wordmark, logo glints" },
    { name: "amber", rgb: amber, use: "warning — [drift] marker in `jade status`" },
    { name: "red", rgb: red, use: "error — [detached] marker, failed progress rows" },
  ];
  const nameWidth = Math.max(...swatches.map((s) => s.name.length));
  for (const { name, rgb, use } of swatches) {
    const [r, g, b] = rgb;
    console.log(`  ${bg(rgb, "      ")}  ${fg(rgb, name.padEnd(nameWidth))}  ${dim(`rgb(${r}, ${g}, ${b})`)}  ${dim(use)}`);
  }
}

/** L3 — the logo lockup shown once, at the top of `jade init`. */
function showLogo(): void {
  heading("Logo — printJadeLogoLockup() (shown once, at the top of `jade init`)");
  if (!colorEnabled) {
    console.log(dim("  (hidden here too — it only renders in a real, colorized terminal)"));
    return;
  }
  printJadeLogoLockup("Workspace manager for multi-app development", pkg.version);
}

/** A — the compact intro/outro header wrapping every command. */
function showHeader(): void {
  heading("Header (A) — jadeIntro() / jadeOutro(), wrapping every command");
  jadeIntro("Adding repository to workspace");
  console.log(fg(jade.forest, "│"));
  console.log(`${fg(jade.forest, "◇")}  cloning apptegy/cms`);
  jadeOutro("Successfully added cms!");
}

/** C — the facet spinner, a themed drop-in for clack's spinner(). */
async function showSpinner(): Promise<void> {
  heading("Spinner (C) — jadeSpinner(), replacing every bare spinner()");
  const s = jadeSpinner();
  s.start("cloning apptegy/cms");
  await sleep(900);
  s.message("checking out feature/foo");
  await sleep(700);
  s.stop(`${fg(jade.core, "◆")} cms ready`);
}

/** D — the per-app gem progress tracker used for multi-repo syncs. */
async function showProgress(): Promise<void> {
  heading("Progress (D) — createGemProgress(), used by update/workspace add/update");
  const apps = ["cms", "engage-frontend", "tasks-frontend"];
  const progress = createGemProgress(apps);
  for (const app of apps) {
    progress.start(app, "syncing…");
    await sleep(350);
    progress.finish(app, "done", "synced");
  }
}

/** E — the status bullets used by `jade status`, one row per state. */
function showStatus(): void {
  heading("Status (E) — statusBullet(), the states `jade status` can show");
  const rows: Array<{ name: string; branch: string; state: StatusBulletState; marker?: string }> = [
    { name: "cms", branch: "feature/foo", state: "clean" },
    { name: "engage-frontend", branch: "feature/foo", state: "dirty" },
    { name: "tasks-frontend", branch: "main", state: "drift", marker: "[drift]" },
    { name: "analytics-frontend", branch: "HEAD", state: "detached", marker: "[detached]" },
    { name: "media-frontend", branch: "(error)", state: "error" },
  ];
  const nameWidth = Math.max(...rows.map((r) => r.name.length));
  for (const row of rows) {
    const marker = row.marker ? `  ${row.marker}` : "";
    console.log(`  ${statusBullet(row.state)} ${row.name.padEnd(nameWidth)}  ${row.branch}${marker}`);
  }
}

export function makeBrandCommand() {
  return defineCommand({
    meta: {
      name: "brand",
      description: "Preview jade's branding: palette, logo, header, spinner, progress, and status states",
    },
    async run() {
      showPalette();
      showLogo();
      showHeader();
      await showSpinner();
      await showProgress();
      showStatus();
      console.log();
    },
  });
}

export default makeBrandCommand();

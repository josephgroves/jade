import { spinner, type SpinnerResult } from "@clack/prompts";

/**
 * Jade branding: shared palette, color/typography helpers, and the pieces
 * every command is built from — a compact header mark, a logo lockup, a
 * facet spinner, a per-app progress tracker, and status bullets. Run
 * `jade brand` for a live preview of all of it.
 */

export type RGB = [number, number, number];

export const jade = {
  deep: [11, 79, 60] as RGB,
  forest: [15, 111, 82] as RGB,
  core: [31, 168, 130] as RGB,
  bright: [79, 209, 165] as RGB,
  mint: [168, 240, 209] as RGB,
};
export const amber: RGB = [214, 158, 46];
export const red: RGB = [214, 68, 68];

// Raw ANSI, not clack's own (picocolors-based) coloring, so it needs its own
// NO_COLOR/TTY guard — otherwise piping `jade` output to a file or CI log
// would embed escape codes literally.
const forceColor = Boolean(process.env.FORCE_COLOR) && process.env.FORCE_COLOR !== "0";
export const colorEnabled = forceColor || (!process.env.NO_COLOR && process.stdout.isTTY === true);

export function fg([r, g, b]: RGB, text: string): string {
  return colorEnabled ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m` : text;
}

export function bg([r, g, b]: RGB, text: string): string {
  return colorEnabled ? `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m` : text;
}

export function bold(text: string): string {
  return colorEnabled ? `\x1b[1m${text}\x1b[22m` : text;
}

export function dim(text: string): string {
  return colorEnabled ? `\x1b[2m${text}\x1b[22m` : text;
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;
}

// ── A ── compact mark: a one-line jade-branded header/footer, replacing
// clack's boxed intro()/outro() with a bullet in the style of clack's own
// tree glyphs (┌ ◇ └). Message text is preserved verbatim so callers that
// match on it (tests included) don't care which chrome wraps it.
export function jadeIntro(message: string): void {
  console.log(`${fg(jade.core, "◆")}  ${bold(message)}`);
}

export function jadeOutro(message: string): void {
  console.log(`${fg(jade.core, "└")}  ${fg(jade.core, message)}`);
}

// ── L3 ── logo lockup: a main drop flanked by two smaller satellite drops
// and a couple of glints — a compact mark for a splash rather than a full
// banner. Only worth the screen space in an interactive terminal; a
// non-TTY caller (CI, a pipe, `bun test`) should never see it.
//
// The shape itself is fixed — it never changes at runtime — so it's written
// out here as static rows instead of recomputed from width/height math on
// every call. Each row is { left satellite, glint, main drop, glint, right
// satellite }; color is the only thing applied per render.
const LOGO_ART: ReadonlyArray<[left: string, glint: string, mid: string, right: string]> = [
  ["   ", "✦", "   █   ", "   "],
  ["   ", "·", "  ███  ", "   "],
  ["   ", " ", " █████ ", "   "],
  [" █ ", " ", "███████", " █ "],
  ["███", " ", "███████", "███"],
  [" █ ", " ", " █████ ", " █ "],
];

export function jadeLogoLockup(subtitle: string, version: string): string[] {
  const text = ["", bold(fg(jade.mint, "J A D E")), dim(subtitle), "", dim(`v${version}`)];
  return LOGO_ART.map(([left, glint, mid, right], i) => {
    const shape =
      fg(jade.bright, left) + fg(jade.mint, glint) + fg(jade.core, mid) + fg(jade.mint, glint) + fg(jade.bright, right);
    return text[i] ? `  ${shape}  ${text[i]}` : `  ${shape}`;
  });
}

export function printJadeLogoLockup(subtitle: string, version: string): void {
  if (!colorEnabled) return;
  console.log();
  for (const line of jadeLogoLockup(subtitle, version)) console.log(line);
  console.log();
}

// ── C ── facet spinner: clack's spinner() with jade frames, a drop-in
// replacement for every bare `spinner()` call site.
const facetFrameColors = new Map<string, RGB>([
  ["◇", jade.forest],
  ["◈", jade.core],
  ["◆", jade.bright],
]);

export function jadeSpinner(): SpinnerResult {
  return spinner({
    frames: ["◇", "◈", "◆", "◈"],
    delay: 120,
    styleFrame: (frame) => fg(facetFrameColors.get(frame) ?? jade.core, frame),
  });
}

// ── D ── gem progress: a per-app row tracker for multi-repo syncs (`jade
// update`, `jade workspace update`, `jade workspace add`). Redraws in place
// on a real terminal; falls back to one line per finished app otherwise, so
// piped/CI/test output stays a plain, appendable log instead of a stream of
// cursor-movement escapes.
export type GemProgressStatus = "queued" | "active" | "done" | "failed";

export interface GemProgress {
  start(name: string, message?: string): void;
  finish(name: string, status: "done" | "failed", message?: string): void;
}

export function createGemProgress(names: string[]): GemProgress {
  const nameWidth = Math.max(0, ...names.map((n) => n.length));
  const state = new Map<string, { status: GemProgressStatus; message?: string }>(
    names.map((n) => [n, { status: "queued" }])
  );
  // Matches clack's own isCI()/isTTY() gate: a real terminal only, never CI —
  // an interactive `bun test` run in a real terminal is still a terminal.
  const live = process.stdout.isTTY === true && process.env.CI !== "true";
  let drawnLines = 0;

  function formatRow(name: string): string {
    const row = state.get(name);
    const label = name.padEnd(nameWidth);
    if (!row || row.status === "queued") return `  ${dim("◇")} ${dim(label)}  ${dim("queued")}`;
    if (row.status === "active") {
      return `  ${fg(jade.bright, "◈")} ${label}  ${fg(jade.bright, row.message ?? "working…")}`;
    }
    if (row.status === "failed") {
      return `  ${fg(red, "◆")} ${fg(red, label)}  ${fg(red, row.message ?? "failed")}`;
    }
    return `  ${fg(jade.core, "◆")} ${fg(jade.core, label)}  ${fg(jade.core, row.message ?? "done")}`;
  }

  function redraw(): void {
    if (drawnLines > 0) process.stdout.write(`\x1b[${drawnLines}A`);
    for (const name of names) process.stdout.write(`\x1b[2K${formatRow(name)}\n`);
    drawnLines = names.length;
  }

  if (live) redraw();

  return {
    start(name, message) {
      state.set(name, { status: "active", message });
      if (live) redraw();
    },
    finish(name, status, message) {
      state.set(name, { status, message });
      if (live) redraw();
      else console.log(formatRow(name));
    },
  };
}

// ── E ── status accent: jade-toned bullets for `jade status`'s workspace
// view. Kept to just the bullet — the surrounding text is status.ts's own,
// since tests match on it verbatim.
export type StatusBulletState = "clean" | "dirty" | "drift" | "detached" | "error";

export function statusBullet(state: StatusBulletState): string {
  switch (state) {
    case "clean":
      return fg(jade.core, "◆");
    case "dirty":
      return fg(jade.bright, "◈");
    case "error":
      return fg(red, "◇");
    default:
      return fg(amber, "◇");
  }
}

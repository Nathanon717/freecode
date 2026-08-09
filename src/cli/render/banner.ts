/**
 * @role Clears the terminal and prints the freecode ASCII banner in a rotating pastel color.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import chalk, { type ChalkInstance } from "chalk";
import { startOverlayEpoch } from "../../util/screen-buffer.js";

const PASTEL_COLORS: [number, number, number][] = [
  [255, 182, 193],
  [255, 210, 170],
  [255, 250, 160],
  [182, 248, 182],
  [170, 232, 255],
  [182, 200, 255],
  [220, 182, 255],
  [255, 182, 230],
];

const COLOR_STATE_PATH = join(
  process.env.FREECODE_HOME ?? join(homedir(), ".config", "freecode"),
  "banner-color.json",
);

export function clearEntireTerminal() {
  process.stdout.write("\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[3J\x1b[H");
}

// Like redrawBanner() but preserves scrollback (`\x1b[2J` not `\x1b[3J`) — safe to
// call on a resize where the banner is the only thing on screen (no transcript yet).
export function clearAndRedrawBanner() {
  process.stdout.write("\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[H");
  const cols = process.stdout.columns ?? 80;
  const banner = cols < 82 ? COMPACT_BANNER : FULL_BANNER;
  console.log(getBannerColor()(banner));
  startOverlayEpoch(); // Exclude the just-drawn banner from overlay repaints.
}

function nextBannerColor(): ChalkInstance {
  let idx = 0;
  try {
    if (existsSync(COLOR_STATE_PATH)) {
      const saved = JSON.parse(readFileSync(COLOR_STATE_PATH, "utf-8")) as {
        idx: number;
      };
      idx = (saved.idx + 1) % PASTEL_COLORS.length;
    }
  } catch {
    /* ignore */
  }
  try {
    const dir = join(COLOR_STATE_PATH, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(COLOR_STATE_PATH, JSON.stringify({ idx }), "utf-8");
  } catch {
    /* ignore */
  }
  currentBannerColorIdx = idx;
  const [r, g, b] = PASTEL_COLORS[idx];
  return chalk.rgb(r, g, b);
}

let currentBannerColorIdx = 0;
try {
  if (existsSync(COLOR_STATE_PATH)) {
    const saved = JSON.parse(readFileSync(COLOR_STATE_PATH, "utf-8")) as {
      idx: number;
    };
    currentBannerColorIdx = saved.idx % PASTEL_COLORS.length;
  }
} catch {
  /* ignore */
}

export function getBannerColor(): ChalkInstance {
  const [r, g, b] = PASTEL_COLORS[currentBannerColorIdx];
  return chalk.rgb(r, g, b);
}

export function getBannerColorRGB(): [number, number, number] {
  return PASTEL_COLORS[currentBannerColorIdx];
}

const FULL_BANNER = [
  "",
  " //////////////////////////////////////////////////////////////////////////////",
  " //                                                                          //",
  " //     .d888                                                888             //",
  ' //    d88P"                                                 888             //',
  " //    888                                                   888             //",
  " //    888888 888d888 .d88b.   .d88b.   .d8888b .d88b.   .d88888  .d88b.     //",
  ' //    888    888P"  d8P  Y8b d8P  Y8b d88P"   d88""88b d88" 888 d8P  Y8b    //',
  " //    888    888    88888888 88888888 888     888  888 888  888 88888888    //",
  " //    888    888    Y8b.     Y8b.     Y88b.   Y88..88P Y88b 888 Y8b.        //",
  ' //    888    888     "Y8888   "Y8888   "Y8888P "Y88P"   "Y88888  "Y8888     //',
  " //                                                                          //",
  " //////////////////////////////////////////////////////////////////////////////",
  "",
].join("\n");

const COMPACT_BANNER = [
  "",
  " ////////////////////",
  " //                //",
  " //    freecode    //",
  " //                //",
  " ////////////////////",
  "",
].join("\n");

export function showBanner() {
  clearEntireTerminal();
  const cols = process.stdout.columns ?? 80;
  const banner = cols < 82 ? COMPACT_BANNER : FULL_BANNER;
  console.log(nextBannerColor()(banner));
  startOverlayEpoch(); // Exclude the just-drawn banner from overlay repaints.
}

export function redrawBanner() {
  clearEntireTerminal();
  const cols = process.stdout.columns ?? 80;
  const banner = cols < 82 ? COMPACT_BANNER : FULL_BANNER;
  console.log(getBannerColor()(banner));
  startOverlayEpoch(); // Exclude the just-drawn banner from overlay repaints.
}

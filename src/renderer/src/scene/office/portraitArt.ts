// Procedural portraits for the Stark-lab robot cast.
//
// Each character is an explicit recipe layering shell → face screen → eyes →
// antenna → torso → chest display → locomotion base on an 18×28 canvas (scene
// sprites 18×32, adding legs/treads/hover). Fully custom-drawn, no third-party
// assets — a robot reads as metal+screen, not a recolored human, and the in-scene
// sprite reuses the portrait's exact head so an agent on the floor looks
// identical to its card.
//
// CRAFT: lighting, ramp construction, sel-out, dithering, and speculars follow
// docs/ART-TECHNIQUES.md (the bible) — one top-left key light, 5-shade
// hue-shifted ramps, selective outlines. This file is its reference
// implementation.

import type { OfficeCharacterName } from './cast';

export const PORTRAIT_W = 24;
export const PORTRAIT_H = 42;
// In-scene walking sprite: same width + upper body as the portrait, taller to add the base.
export const SCENE_W = 24;
export const SCENE_H = 48;
const OUTLINE: RGB = [24, 18, 30];
// Head shell columns on the 24px canvas (was 4..13 on 18px).
const HX0 = 6, HX1 = 17;
/** MODOK dome silhouette: [row, x0, x1] — egg widest at the brain (24px canvas). */
const BIG_EDGE: [number, number, number][] = [
  [3, 9, 14], [4, 8, 15], [5, 7, 16], [6, 6, 17],
  [6, 6, 17], [7, 5, 18], [8, 5, 18], [9, 5, 18],
  [21, 5, 18], [22, 6, 17], [23, 6, 17], [24, 7, 16],
  [25, 8, 15], [26, 9, 14],
];

type RGB = [number, number, number];
type Buf = Uint8ClampedArray;

// Current canvas dims — set per compose() so the same drawing primitives serve
// both the 18×28 portrait and the 18×32 scene sprite. (Rendering is synchronous.)
let CUR_W = PORTRAIT_W, CUR_H = PORTRAIT_H;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
/**
 * 5-shade hue-shifted ramp (Art Bible §2): [specular, highlight, base,
 * shadow, core]. Shadows drift toward blue-violet (add blue, pull red),
 * highlights toward warm — the technique that separates lit metal from
 * "darker base". Every painter draws from these steps only.
 */
function ramp5(rgb: RGB): [RGB, RGB, RGB, RGB, RGB] {
  const [r, g, b] = rgb;
  return [
    [clamp(r * 0.35 + 255 * 0.65), clamp(g * 0.35 + 250 * 0.65), clamp(b * 0.20 + 238 * 0.80)], // 0 specular
    [clamp(r * 1.25 + 10), clamp(g * 1.25 - 2), clamp(b * 1.25 - 20)],                            // 1 highlight — warm
    [r, g, b],                                                                                     // 2 base
    [clamp(r * 0.62 - 8), clamp(g * 0.62 - 2), clamp(b * 0.62 + 18)],                              // 3 shadow — blue-violet
    [clamp(r * 0.34 - 8), clamp(g * 0.34 - 4), clamp(b * 0.34 + 26)]                               // 4 core shadow
  ];
}
/** Legacy 3-shade accessor kept for transitional call sites: [hi, base, shadow]. */
function shades(rgb: RGB, _dl = 1.22, _dd = 0.68): [RGB, RGB, RGB] {
  const rp = ramp5(rgb);
  return [rp[1], rp[2], rp[3]];
}

function set(buf: Buf, x: number, y: number, c: RGB, a = 255): void {
  if (x < 0 || x >= CUR_W || y < 0 || y >= CUR_H) return;
  const i = (y * CUR_W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
}
function alphaAt(buf: Buf, x: number, y: number): number {
  if (x < 0 || x >= CUR_W || y < 0 || y >= CUR_H) return 0;
  return buf[(y * CUR_W + x) * 4 + 3];
}
function eq(a: RGB, b: RGB): boolean { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
function rect(buf: Buf, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(buf, x, y, c);
}

// ─── recipe schema ──────────────────────────────────────────────────────────
/** Face-screen style. */
type EyeStyle = 'round' | 'visor' | 'single' | 'gem';
/** What sits on top of the head. */
type AntennaKind = 'none' | 'single' | 'dual' | 'mast';
/** Center-chest display. */
type ChestKind = 'reactor' | 'grid' | 'panel' | 'none';
/** How the robot gets around. */
type BaseKind = 'legs' | 'treads' | 'hover';

interface Recipe {
  shell: RGB;
  /** Secondary shell tone: shoulders / base / trims. */
  accent: RGB;
  /** LED / screen glow color for eyes + chest display. */
  glow: RGB;
  eye: EyeStyle;
  antenna: AntennaKind;
  chest: ChestKind;
  base: BaseKind;
  /** Bulkier torso (VERONICA's Hulkbuster frame). */
  heavy?: boolean;
  /** Glossy hero finish: sheen band on dome + torso. Drones stay matte. */
  sheen?: boolean;
  /** Angry visor with the edges angled down (Ultron's scowl). */
  scowl?: boolean;
  /** All-head build: giant dome over a tiny hover throne (MODOK). */
  bigHead?: boolean;
  /** Hologram: translucent, scanline-dimmed, no outline (LYLA). */
  holo?: boolean;
}

// ─── head ───────────────────────────────────────────────────────────────────
/** Rounded metal dome on the 24px canvas, lit top-left (Art Bible §1):
 *  highlight crescent on the upper-left of the curve, core shadow on the
 *  lower-right, jaw shadow, panel seam + rivets, ear pods. */
function drawShellHead(buf: Buf, r: Recipe): void {
  const rp = ramp5(r.shell);
  const [hi, base, sh, core] = [rp[1], rp[2], rp[3], rp[4]];
  if (r.bigHead) {
    // MODOK: giant egg dome rows 3-26 — widest at the brain, tapering chin.
    for (let y = 3; y <= 26; y++) {
      let x0 = 6, x1 = 17;
      for (const [ey, a, b] of BIG_EDGE) if (ey === y) { x0 = a; x1 = b; }
      for (let x = x0; x <= x1; x++) set(buf, x, y, base);
    }
    // key light on the egg's upper-left curve (§1)
    for (const [x, y] of [[8, 3], [9, 3], [10, 3], [7, 4], [8, 4], [7, 5], [6, 6], [6, 7], [6, 8], [6, 9]] as const) set(buf, x, y, hi);
    // vertical panel seam down the egg's midline + rivets (24px has room)
    for (let y = 6; y <= 20; y++) set(buf, 11, y, sh);
    for (const [x, y] of [[10, 8], [13, 8], [10, 16], [13, 16]] as const) set(buf, x, y, sh);
    // core shadow along the lower-right (§1)
    for (let y = 14; y <= 25; y++) set(buf, 17, y, sh);
    for (let y = 20; y <= 25; y++) set(buf, 16, y, sh);
    for (const x of [14, 15, 16]) set(buf, x, 25, core);
    for (const x of [11, 12, 13, 14]) set(buf, x, 26, core);
    for (let y = 8; y <= 20; y++) { set(buf, 5, y, sh); set(buf, 18, y, sh); }
    if (r.sheen) set(buf, 8, 3, rp[0]);   // the single specular (§8)
    // big ear pods (2px wide now)
    for (const ex of [3, 20]) { set(buf, ex, 14, base); set(buf, ex + 1, 14, base); set(buf, ex, 15, base); set(buf, ex + 1, 15, sh); set(buf, ex, 16, sh); }
    return;
  }
  // normal dome rows 5-24, cols 6-17
  for (let y = 5; y <= 24; y++) {
    for (let x = HX0; x <= HX1; x++) {
      if (((x === HX0 || x === HX1) && (y === 5 || y === 24)) || ((x === HX0 + 1 || x === HX1 - 1) && y === 5)) continue;
      set(buf, x, y, base);
    }
  }
  // key-light crescent: upper-left of the dome (§1)
  for (const [x, y] of [[8, 5], [9, 5], [10, 5], [7, 6], [8, 6], [7, 7], [7, 8]] as const) set(buf, x, y, hi);
  if (r.sheen) set(buf, 8, 5, rp[0]);    // specular at the curve top (§8 — glossy only)
  // panel seam across the crown (24px detail budget)
  for (let x = 9; x <= 14; x++) set(buf, x, 8, sh);
  set(buf, 9, 8, hi);                     // seam catch-light
  // core shadow: right edge + jaw
  for (let y = 13; y <= 23; y++) set(buf, HX1, y, sh);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 24, sh);
  set(buf, HX1 - 1, 23, core); set(buf, HX1 - 2, 24, core);
  for (let y = 7; y < 24; y++) { set(buf, HX0, y, sh); }
  // ear pods — lit pod on the key side, shadow pod on the far side
  set(buf, HX0 - 1, 13, hi); set(buf, HX0 - 1, 14, base); set(buf, HX0 - 1, 15, sh);
  set(buf, HX1 + 1, 13, base); set(buf, HX1 + 1, 14, sh); set(buf, HX1 + 1, 15, sh);
  // neck (2px taller)
  rect(buf, 10, 25, 13, 27, sh);
}

/** Inset dark face screen on the 24px canvas: normal rows 7-20 cols 7-16;
 *  MODOK's giant screen rows 8-21 cols 7-16. Eyes/mouth glow on it. */
function drawFaceScreen(buf: Buf, r: Recipe): void {
  const screen: RGB = [16, 14, 26];
  const g = r.glow;
  const bright: RGB = [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)];
  const dk: RGB = [10, 9, 18];

  if (r.bigHead) {
    // MODOK's giant face screen: scowl brows, big 3px eyes with glints, frown.
    rect(buf, 7, 8, 16, 21, screen);
    for (let x = 7; x <= 16; x++) { set(buf, x, 8, [30, 26, 44]); set(buf, x, 21, dk); }
    // brow lines angled down toward the middle
    const accSh = shades(r.accent)[2];
    set(buf, 7, 9, accSh); set(buf, 8, 10, accSh);
    set(buf, 16, 9, accSh); set(buf, 15, 10, accSh);
    // big eyes (3 wide x 4 tall now) with white glints + bright pupils
    for (const [ex0, ex1] of [[8, 11], [13, 16]] as const) {
      for (let y = 12; y <= 15; y++) for (let x = ex0; x <= ex1; x++) set(buf, x, y, g);
      set(buf, ex0 + 1, 13, bright); set(buf, ex0 + 2, 13, bright);
      set(buf, ex0 + 1, 14, bright);
      set(buf, ex0 + 1, 12, [255, 255, 255]);
    }
    // frown: corners low, middle high (2px band)
    set(buf, 8, 20, g); set(buf, 9, 20, g); set(buf, 15, 20, g); set(buf, 16, 20, g);
    for (let x = 10; x <= 13; x++) { set(buf, x, 19, g); }
    return;
  }

  rect(buf, 7, 7, 16, 20, screen);
  // bevel: lighter top-left, darker bottom-right edges
  const [hi] = shades(r.shell);
  for (let x = 7; x <= 16; x++) { set(buf, x, 7, [30, 26, 44]); }
  set(buf, 7, 8, hi);
  for (let x = 7; x <= 16; x++) set(buf, x, 20, dk);

  if (r.eye === 'round') {
    // two round LED eyes (3px wide now): bright pupil + white glint
    for (const cx of [9, 14]) {
      set(buf, cx, 11, g); set(buf, cx - 1, 11, g); set(buf, cx + 1, 11, g);
      set(buf, cx - 1, 10, g); set(buf, cx, 10, g); set(buf, cx + 1, 10, g);
      set(buf, cx, 12, g);
      set(buf, cx, 11, bright);
      set(buf, cx - 1, 10, [255, 255, 255]);
    }
  } else if (r.eye === 'visor') {
    if (r.scowl) {
      // Ultron: the visor angles down at the edges — an angry chevron (24px)
      for (let x = 10; x <= 13; x++) set(buf, x, 10, g);        // apex, high
      for (let x = 8; x <= 15; x++) set(buf, x, 11, g);         // mid band
      set(buf, 7, 12, g); set(buf, 8, 12, g);                    // drooping ends, low
      set(buf, 16, 12, g); set(buf, 15, 12, g);
      set(buf, 11, 11, bright); set(buf, 12, 11, bright);       // hot core at center
    } else {
      // a single glowing strip across the screen (2px tall now)
      for (let x = 8; x <= 15; x++) { set(buf, x, 11, g); set(buf, x, 12, g); }
      set(buf, 8, 11, bright); set(buf, 9, 11, bright); set(buf, 9, 12, bright);
    }
  } else if (r.eye === 'single') {
    // one big central eye (5px field): glow ring, bright pupil, white-hot core
    rect(buf, 9, 10, 14, 15, g);
    rect(buf, 10, 11, 13, 14, bright);
    set(buf, 11, 12, [255, 255, 255]); set(buf, 12, 12, [255, 255, 255]);
    const gl = [clamp(g[0] * 1.15), clamp(g[1] * 1.15), clamp(g[2] * 1.15)] as RGB;
    for (const [x, y] of [[9, 10], [14, 10], [9, 15], [14, 15]] as const) set(buf, x, y, gl);
  } else if (r.eye === 'gem') {
    // Vision: a faceted diamond gem glowing on the forehead, calm eyes below
    set(buf, 11, 8, bright); set(buf, 12, 8, bright);
    rect(buf, 10, 9, 13, 10, g);
    set(buf, 11, 11, g); set(buf, 12, 11, g);
    // facet highlight: one light pixel + one dark pixel across the gem
    set(buf, 11, 9, [255, 250, 255]);
    set(buf, 12, 10, [clamp(g[0] * 0.5), clamp(g[1] * 0.5), clamp(g[2] * 0.5)]);
    for (const cx of [9, 14]) { set(buf, cx, 14, g); set(buf, cx + (cx === 9 ? 1 : -1), 14, g); }
  }

  // mouth
  if (r.eye === 'round') {
    // friendly smile arc: corners high, middle low (2px band)
    set(buf, 8, 17, g); set(buf, 9, 17, g); set(buf, 14, 17, g); set(buf, 15, 17, g);
    for (let x = 10; x <= 13; x++) set(buf, x, 18, g);
  } else if (r.eye === 'visor') { for (let x = 9; x <= 14; x++) set(buf, x, 17, [64, 58, 84]); }
  else if (r.eye === 'gem') { set(buf, 10, 18, g); set(buf, 11, 18, g); set(buf, 13, 18, g); set(buf, 14, 18, g); }
  else { rect(buf, 9, 17, 14, 17, [64, 58, 84]); set(buf, 10, 17, g); set(buf, 13, 17, g); }
}

/** Antenna / mast on the crown (24px canvas). */
function drawAntenna(buf: Buf, r: Recipe): void {
  const [hi, base] = shades(r.accent);
  const g = r.glow;
  if (r.antenna === 'single') {
    set(buf, 11, 4, base); set(buf, 12, 4, base);
    set(buf, 11, 3, base); set(buf, 12, 3, base);
    set(buf, 11, 2, g); set(buf, 12, 2, g); set(buf, 11, 1, g); set(buf, 12, 1, g);
    set(buf, 12, 1, [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)]);
  } else if (r.antenna === 'dual') {
    for (const ax of [8, 15]) {
      set(buf, ax, 4, base); set(buf, ax, 3, base); set(buf, ax, 2, base); set(buf, ax, 1, g);
    }
    set(buf, 8, 1, [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)]);
  } else if (r.antenna === 'mast') {
    rect(buf, 11, 0, 12, 5, base);
    set(buf, 11, 0, hi); set(buf, 12, 0, hi);
    set(buf, 10, 1, g); set(buf, 13, 1, g);
    set(buf, 10, 3, g); set(buf, 13, 3, g);
  }
}

// ─── torso + chest ──────────────────────────────────────────────────────────
/** Shoulders → torso, rows 19-27 on the portrait. Lit top-left (§1): a
 *  highlight column down the key side, core shadow at the lower-right. */
function drawTorso(buf: Buf, r: Recipe, topY: number, bottomY: number): void {
  const rp = ramp5(r.shell);
  const [hi, base, sh, core] = [rp[1], rp[2], rp[3], rp[4]];
  const acc = ramp5(r.accent);
  const wide = r.heavy ? 1 : 2;
  if (r.bigHead) {
    // MODOK: no shoulders — a neck stem + tiny vented bib under the giant head
    rect(buf, 9, 28, 14, 30, sh);         // neck stem
    rect(buf, 6, 31, 17, bottomY, base);  // bib
    for (let y = 31; y <= bottomY; y++) { set(buf, 6, y, sh); set(buf, 17, y, sh); }
    set(buf, 7, 31, hi); set(buf, 8, 31, hi);   // bib catch-light (key side)
    set(buf, 16, bottomY, core); set(buf, 15, bottomY, core);
    // grid vents with a glow core (wider vents on the 24px canvas)
    const g = r.glow;
    for (let y = 32; y <= Math.min(bottomY - 1, 34); y++) {
      set(buf, 9, y, acc[2]); set(buf, 14, y, acc[2]);
      set(buf, 10, y, g); set(buf, 11, y, g); set(buf, 12, y, g); set(buf, 13, y, g);
    }
    return;
  }
  // shoulders on the 24px canvas: pads 3px tall, torso spans cols 3-20
  rect(buf, 4 + (r.heavy ? -1 : 0), topY, 19 + (r.heavy ? 1 : 0), topY, base);
  rect(buf, 2 + wide, topY + 1, 21 - wide, topY + 1, base);
  rect(buf, 1 + wide, topY + 2, 22 - wide, bottomY, base);
  // shoulder accent pads — key-side pad lit, far pad shadowed (§1)
  for (const [sx0, sx1] of [[1 + wide, 4 + wide], [19 - wide, 22 - wide]] as const) {
    rect(buf, sx0, topY + 1, sx1, topY + 3, acc[1]);
    set(buf, sx0, topY + 1, acc[0]);
  }
  set(buf, 19 - wide, topY + 3, acc[3]);  // far pad's shadow corner
  if (r.heavy) {
    // VERONICA: chunky pauldrons — armor blocks overlapping the shoulder line
    for (const [px0, px1] of [[1, 4], [19, 22]] as const) {
      rect(buf, px0, topY + 2, px1, topY + 5, acc[1]);
      set(buf, px0, topY + 2, acc[0]);
      set(buf, px1, topY + 5, acc[3]);
      // bolt heads on the pauldrons (24px detail budget)
      set(buf, px0 + 1, topY + 3, acc[3]); set(buf, px1 - 1, topY + 4, acc[3]);
    }
    set(buf, 1, topY + 2, acc[0]);       // lit pauldron specular (§8)
  }
  // key-light column down the left edge; core shadow pooling at the lower-right
  for (let y = topY + 2; y <= bottomY; y++) { set(buf, 1 + wide, y, hi); set(buf, 22 - wide, y, sh); }
  for (let x = 13 - wide; x <= 21 - wide; x++) set(buf, x, bottomY, sh);
  set(buf, 21 - wide, bottomY, core); set(buf, 20 - wide, bottomY, core);
  // waist seam where torso meets the hips (24px has room)
  for (let x = 4 + wide; x <= 19 - wide; x++) set(buf, x, bottomY - 1, sh);
  if (r.sheen) {
    // §4 dither band at the shoulder→chest transition (glossy heroes only)
    for (let x = 4; x <= 10; x++) set(buf, x, topY + 2, (x % 2 === 0 ? hi : base));
    set(buf, 4, topY + 2, rp[0]);         // one specular on the chest plate (§8)
  }

  // chest display — wider plates, taller readouts on the 24px canvas
  const g = r.glow;
  const bright: RGB = [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)];
  const cy = topY + 4;
  if (r.chest === 'reactor') {
    // arc-reactor: a glowing triangle-in-circle (5px wide now)
    rect(buf, 9, cy, 14, cy + 4, [22, 20, 34]);
    rect(buf, 9, cy + 1, 14, cy + 3, g);
    set(buf, 10, cy + 1, bright); set(buf, 11, cy + 1, bright); set(buf, 12, cy + 1, bright);
    set(buf, 10, cy + 2, bright); set(buf, 12, cy + 2, bright);
    set(buf, 11, cy + 3, bright);
    // outer ring corners
    set(buf, 8, cy, acc[1]); set(buf, 15, cy, acc[1]);
    set(buf, 8, cy + 4, acc[1]); set(buf, 15, cy + 4, acc[1]);
  } else if (r.chest === 'grid') {
    // vent grid: alternating slats (wider + taller)
    for (let x = 8; x <= 15; x += 2) for (let y = cy; y <= cy + 4; y++) set(buf, x, y, acc[2]);
    for (let x = 9; x <= 14; x += 2) { set(buf, x, cy + 1, acc[1]); set(buf, x, cy + 3, acc[1]); }
  } else if (r.chest === 'panel') {
    // status panel: a wide glow-bar readout
    rect(buf, 8, cy, 15, cy + 3, [22, 20, 34]);
    for (let x = 9; x <= 14; x++) set(buf, x, cy + 1, g);
    set(buf, 9, cy + 1, bright); set(buf, 10, cy + 2, g);
  }
}

// ─── bases (scene sprites only, rows 36-47 on the 48px canvas) ─────────────
/** §7 ambient bounce: one row of blue-tinted shadow at an underside — the
 *  floor reflects up. Applied by each base painter at its bottom row. */
function bounceRow(c: RGB): RGB {
  return [clamp(c[0] - 2), clamp(c[1] + 2), clamp(c[2] + 12)];
}

function drawLegs(buf: Buf, r: Recipe, phase: number): void {
  const rp = ramp5(r.accent);
  const [, base, sh] = [rp[1], rp[2], rp[3]];
  // hip block: a pelvis slab rows 36-38 connecting torso to legs cleanly
  rect(buf, 5, 36, 18, 38, base);
  for (let x = 6; x <= 17; x++) set(buf, x, 38, sh);
  set(buf, 5, 38, sh); set(buf, 18, 38, sh);
  set(buf, 5, 36, rp[1]); set(buf, 6, 36, rp[1]);   // hip catch-light (key side)
  void r;
  // legs: 3px thighs tapering to 2px shins, knee piston at mid-leg
  for (const [lx0, lx1] of [[6, 8], [15, 17]] as const) {
    rect(buf, lx0, 38, lx1, 43, base);               // thigh (3px wide)
    for (let y = 38; y <= 43; y++) set(buf, lx1, y, sh);
    set(buf, lx0, 38, rp[1]);                       // lit leg edge (key side)
    // knee joint + piston (24px detail budget)
    set(buf, lx0, 41, sh); set(buf, lx1 - 1, 41, sh);
    set(buf, lx0 + 1, 41, rp[0]);
    rect(buf, lx0 + 1, 42, lx1 - 1, 45, base);      // shin (tapered)
    for (let y = 42; y <= 45; y++) set(buf, lx1 - 1, y, sh);
  }
  // feet — lift one per walk phase; the grounded foot gets the §7 bounce
  const leftLow = phase !== 1, rightLow = phase !== 2;
  const shoe: RGB = [44, 40, 48];
  const shoeBounce = bounceRow(shoe);
  const fy = (low: boolean) => (low ? 47 : 46);
  rect(buf, 5, fy(leftLow), 9, fy(leftLow), leftLow ? shoeBounce : shoe);
  rect(buf, 14, fy(rightLow), 18, fy(rightLow), rightLow ? shoeBounce : shoe);
  // lifted foot keeps a plain shoe + a hint of shadow under it
  if (!leftLow) { for (let x = 6; x <= 8; x++) set(buf, x, 47, shoe, 120); }
  if (!rightLow) { for (let x = 15; x <= 17; x++) set(buf, x, 47, shoe, 120); }
}

function drawTreads(buf: Buf, r: Recipe): void {
  const rp = ramp5(r.accent);
  const [hi, base, sh] = [rp[1], rp[2], rp[3]];
  const x0 = r.heavy ? 1 : 3, x1 = 23 - x0;
  rect(buf, x0, 38, x1, 45, base);
  for (let x = x0; x <= x1; x += 2) { set(buf, x, 41, sh); set(buf, x, 43, sh); }  // tread notches
  rect(buf, x0 + 1, 38, x1 - 1, 38, hi);            // top rim (key side)
  for (let x = x0 + 1; x <= x1 - 1; x++) set(buf, x, 45, bounceRow(base));  // §7 bounce row
  set(buf, x0 + 1, 38, rp[0]);                     // tread specular (§8 — gloss rolls)
  // side vents above the treads (24px detail budget)
  for (const vx of [x0 + 3, x0 + 8, x0 + 13]) { set(buf, vx, 39, sh); set(buf, vx + 1, 39, hi); }
}

function drawHover(buf: Buf, r: Recipe, phase: number): void {
  // rounded hover skirt + repulsor glow; the bob replaces the walk gait
  const bob = phase === 1 ? 0 : 1;
  const rp = ramp5(r.accent);
  const [, base, sh] = [rp[1], rp[2], rp[3]];
  const g = r.glow;
  if (r.bigHead) {
    // MODOK's float throne: a bracket seat under the giant head (24px)
    rect(buf, 7, 34 - bob, 16, 36 - bob, base);
    rect(buf, 5, 37 - bob, 18, 37 - bob, base);
    set(buf, 4, 36 - bob, base); set(buf, 19, 36 - bob, base);  // armrest stubs
    for (let x = 6; x <= 17; x++) set(buf, x, 37 - bob, sh);
    set(buf, 7, 34 - bob, rp[1]);       // throne catch-light
    set(buf, 9, 36 - bob, g); set(buf, 14, 36 - bob, g);       // throne glow dots
  } else {
    // float throne: wide at the waist, tapering to a narrower bottom row
    rect(buf, 4, 36 - bob, 19, 39 - bob, base);
    rect(buf, 6, 40 - bob, 17, 41 - bob, base);
    for (let x = 6; x <= 17; x++) set(buf, x, 41 - bob, bounceRow(base));   // §7 bounce
    for (let x = 4; x <= 9; x++) set(buf, x, 36 - bob, rp[1]);  // key-side rim
    // skirt vents (24px detail budget)
    for (const vx of [8, 12, 16]) { set(buf, vx, 39 - bob, sh); set(buf, vx + 1, 39 - bob, sh); }
  }
  // repulsor glow — wider, 2 rows of falloff
  for (let x = 7; x <= 16; x++) set(buf, x, 43 + bob, g, 150);
  for (let x = 9; x <= 14; x++) set(buf, x, 44 + bob, g, 220);
}

// ─── compose ─────────────────────────────────────────────────────────────────
// 24px layout: head rows 5-24, neck 25-27, torso topY..bottomY per canvas,
// bases rows 36-47 on the 48-tall scene sprite.
function compose(r: Recipe): Buf {
  CUR_W = PORTRAIT_W; CUR_H = PORTRAIT_H;
  const buf = new Uint8ClampedArray(PORTRAIT_W * PORTRAIT_H * 4);
  drawTorso(buf, r, 28, 41);
  drawShellHead(buf, r);
  drawFaceScreen(buf, r);
  drawAntenna(buf, r);
  if (r.holo) holoPass(buf); else outlinePass(buf);
  return buf;
}

function composeScene(r: Recipe, phase: number, back: boolean): Buf {
  CUR_W = SCENE_W; CUR_H = SCENE_H;
  const buf = new Uint8ClampedArray(SCENE_W * SCENE_H * 4);
  drawTorso(buf, r, 28, 37);
  if (r.base === 'legs') drawLegs(buf, r, phase);
  else if (r.base === 'treads') drawTreads(buf, r);
  else drawHover(buf, r, phase);
  if (back) drawHeadBack(buf, r);
  else {
    drawShellHead(buf, r);
    drawFaceScreen(buf, r);
    drawAntenna(buf, r);
  }
  if (r.holo) holoPass(buf); else outlinePass(buf);
  return buf;
}

/** Back of the head: plain shell + antenna (no screen) — 24px canvas. */
function drawHeadBack(buf: Buf, r: Recipe): void {
  const rp = ramp5(r.shell);
  const [hi, base, sh] = [rp[1], rp[2], rp[3]];
  if (r.bigHead) {
    // MODOK from behind: the whole egg, maintenance hatch, no face screen
    for (let y = 3; y <= 26; y++) {
      let x0 = 6, x1 = 17;
      for (const [ey, a, b] of BIG_EDGE) if (ey === y) { x0 = a; x1 = b; }
      for (let x = x0; x <= x1; x++) set(buf, x, y, base);
    }
    rect(buf, 8, 12, 15, 19, sh);   // hatch panel
    for (let y = 9; y <= 22; y++) set(buf, 11, y, sh);  // seam
    for (let x = 9; x <= 14; x++) set(buf, x, 4, hi);   // crown catch-light
    for (const [x, y] of [[7, 5], [8, 5], [7, 6], [7, 7], [6, 8], [6, 9], [6, 10]] as const) set(buf, x, y, hi);
    for (const ex of [3, 20]) { set(buf, ex, 14, base); set(buf, ex + 1, 14, base); set(buf, ex, 15, sh); set(buf, ex + 1, 15, sh); }
    return;
  }
  const rows: [number, number, number][] = [
    [5, 8, 15], [6, 7, 16], [7, 6, 17], [8, 6, 17], [9, 6, 17], [10, 6, 17],
    [11, 6, 17], [12, 6, 17], [13, 6, 17], [14, 6, 17], [15, 6, 17], [16, 6, 17],
    [17, 6, 17], [18, 6, 17], [19, 6, 17], [20, 6, 17], [21, 6, 17], [22, 7, 16], [23, 8, 15], [24, 9, 14],
  ];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, base);
  // maintenance hatch: a darker panel + seam down the middle
  rect(buf, 8, 11, 15, 17, sh);
  for (let y = 9; y <= 20; y++) set(buf, 11, y, sh);
  for (let x = 9; x <= 14; x++) set(buf, x, 5, hi);
  for (const [x, y] of [[8, 6], [7, 7], [7, 8], [7, 9]] as const) set(buf, x, y, hi);  // key-side rim
  rect(buf, 10, 25, 13, 27, sh);   // neck
  // antenna seen from behind
  if (r.antenna === 'single') { set(buf, 11, 4, base); set(buf, 12, 4, base); set(buf, 12, 1, r.glow); }
  else if (r.antenna === 'dual') { set(buf, 8, 4, base); set(buf, 15, 4, base); set(buf, 8, 1, r.glow); }
  else if (r.antenna === 'mast') { rect(buf, 11, 0, 12, 3, base); set(buf, 11, 0, hi); }
}

// ─── outline / hologram passes ──────────────────────────────────────────────
/**
 * Selective outline (Art Bible §3). A uniform near-black rim flattens and
 * dates sprite art; sel-out keeps the rim only where light can't reach:
 * each outline pixel looks at its 4-neighbors' opaque surface color and,
 * when the outline sits on that surface's LIT side (the outline pixel is
 * above or left of it — the key side), blends toward the surface's shadow
 * tone so the rim opens up. Shadow-side pixels stay near-black. LYLA never
 * reaches this pass (holoPass replaces it — light has no dark rim).
 */
function outlinePass(buf: Buf): void {
  const pts: [number, number, boolean][] = [];
  for (let y = 0; y < CUR_H; y++) {
    for (let x = 0; x < CUR_W; x++) {
      if (alphaAt(buf, x, y) !== 0) continue;
      let lit = false;
      let neighbor: RGB | null = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (alphaAt(buf, nx, ny) === 255) {
          // this outline pixel is on the surface's lit side when the surface
          // is BELOW or RIGHT of it (light comes from top-left)
          if (dy === 1 || dx === 1) {
            lit = true;
            const i = (ny * CUR_W + nx) * 4;
            neighbor = [buf[i], buf[i + 1], buf[i + 2]];
          } else if (!neighbor) {
            const i = (ny * CUR_W + nx) * 4;
            neighbor = [buf[i], buf[i + 1], buf[i + 2]];
          }
        }
      }
      if (neighbor) pts.push([x, y, lit]);
    }
  }
  for (const [x, y, lit] of pts) {
    // lit-side rim opens toward the surface tone; shadow-side stays near-black
    set(buf, x, y, lit ? SEL_LIT : OUTLINE);
  }
}
/** The lit-edge rim tone: OUTLINE warmed ~40% toward mid — reads as the
 *  material's shadow catching light, not as missing outline. */
const SEL_LIT: RGB = [64, 52, 74];

/** Hologram finish (LYLA): translucent pixels + scanlines across the face
 *  screen; no outline — light doesn't have a dark rim. */
function holoPass(buf: Buf): void {
  for (let y = 0; y < CUR_H; y++) {
    for (let x = 0; x < CUR_W; x++) {
      const i = (y * CUR_W + x) * 4;
      if (buf[i + 3] === 0) continue;
      buf[i + 3] = Math.min(buf[i + 3], 205);
      if (y >= 7 && y <= 20 && (y - 7) % 3 === 2) {
        buf[i] = Math.round(buf[i] * 0.5);
        buf[i + 1] = Math.round(buf[i + 1] * 0.5);
        buf[i + 2] = Math.round(buf[i + 2] * 0.5);
      }
    }
  }
}

// ─── recipes ─────────────────────────────────────────────────────────────────
const RECIPES: Record<OfficeCharacterName, Recipe> = {
  // DUM-E: the lab lead. Arc-reactor blue shell, gold reactor, friendly round eyes.
  dume:          { shell: [38, 111, 214], accent: [12, 56, 122],  glow: [244, 211, 94],  eye: 'round',  antenna: 'single', chest: 'reactor', base: 'legs', sheen: true },
  // H.E.R.B.I.E: green helper bot, one big curious eye, hover base.
  herbie:        { shell: [110, 168, 84],  accent: [70, 108, 56],  glow: [180, 240, 140], eye: 'single',  antenna: 'mast',   chest: 'panel',   base: 'hover' },
  // Butterfingers: orange shop bot, treads, visor — drops the wrench anyway.
  butterfingers: { shell: [228, 138, 62],  accent: [150, 86, 40],  glow: [255, 196, 120], eye: 'visor',   antenna: 'none',   chest: 'grid',    base: 'treads' },
  // Doombot: plain gray-blue worker drone, default worker look. Matte drone shell.
  doombot:       { shell: [91, 110, 122],  accent: [58, 72, 82],   glow: [140, 220, 255], eye: 'visor',   antenna: 'dual',   chest: 'panel',   base: 'legs' },
  // Sentinel: purple, tall and watchful, single scanning eye. Matte drone shell.
  sentinel:      { shell: [122, 88, 190],  accent: [74, 52, 122],  glow: [220, 160, 255], eye: 'single',  antenna: 'mast',   chest: 'grid',    base: 'legs' },
  // Rover: tan explorer, treads + mast light.
  rover:         { shell: [201, 123, 61],  accent: [130, 74, 36],  glow: [255, 232, 160], eye: 'single',  antenna: 'mast',   chest: 'panel',   base: 'treads' },
  // Vision: crimson shell, forehead gem, calm round eyes. Glossy hero finish.
  vision:        { shell: [176, 48, 96],   accent: [108, 26, 58],  glow: [255, 170, 210], eye: 'gem',     antenna: 'none',   chest: 'reactor', base: 'legs', sheen: true },
  // Ultron: blood-red menace, narrow visor, twin antennas. Glossy, and scowling.
  ultron:        { shell: [168, 42, 38],   accent: [94, 20, 18],   glow: [255, 70, 60],   eye: 'visor',   antenna: 'dual',   chest: 'reactor', base: 'legs', sheen: true, scowl: true },
  // Ultron-bot: darker, smaller — the swarm workers. Matte drone shell.
  ultronbot:     { shell: [122, 33, 30],   accent: [70, 16, 14],   glow: [255, 96, 80],   eye: 'visor',   antenna: 'none',   chest: 'panel',   base: 'legs' },
  // MODOK: gold analyst — all-head float: giant dome over a tiny hover throne.
  modok:         { shell: [232, 185, 62],  accent: [150, 112, 30], glow: [255, 244, 180], eye: 'round',   antenna: 'none',   chest: 'grid',    base: 'hover', bigHead: true },
  // VERONICA: bulky Hulkbuster blue, heavy frame + pauldrons, wide treads. Glossy.
  veronica:      { shell: [62, 142, 222],  accent: [28, 70, 120],  glow: [180, 230, 255], eye: 'round',   antenna: 'single', chest: 'reactor', base: 'treads', heavy: true, sheen: true },
  // EDITH: teal drone-frame, visor, hover — the surveillance glasses.
  edith:         { shell: [77, 182, 172],  accent: [40, 100, 96],  glow: [200, 255, 250], eye: 'visor',   antenna: 'dual',   chest: 'panel',   base: 'hover' },
  // LYLA: pink hologram assistant, hovering, translucent scanlined projection.
  lyla:          { shell: [224, 111, 168], accent: [140, 56, 100], glow: [255, 200, 235], eye: 'round',   antenna: 'none',   chest: 'panel',   base: 'hover', holo: true },
};

// ─── public render ───────────────────────────────────────────────────────────
const bufCache = new Map<OfficeCharacterName, Buf>();
const sceneCache = new Map<OfficeCharacterName, SceneFrames>();

function getBuf(name: OfficeCharacterName): Buf {
  let buf = bufCache.get(name);
  if (!buf) {
    buf = compose(RECIPES[name] ?? RECIPES.doombot);
    bufCache.set(name, buf);
  }
  return buf;
}

export interface SceneFrames { front: Buf[]; back: Buf[]; }

/** Walk-phase frames (stand, step-L, step-R) for the in-scene sprite, front + back. */
export function sceneFrameBufs(name: OfficeCharacterName): SceneFrames {
  let frames = sceneCache.get(name);
  if (!frames) {
    const r = RECIPES[name] ?? RECIPES.doombot;
    frames = {
      front: [composeScene(r, 0, false), composeScene(r, 1, false), composeScene(r, 2, false)],
      back: [composeScene(r, 0, true), composeScene(r, 1, true), composeScene(r, 2, true)],
    };
    sceneCache.set(name, frames);
  }
  return frames;
}

/** Paint a character's procedural portrait onto `ctx`, nearest-neighbor at `scale`. */
export function paintPortrait(ctx: CanvasRenderingContext2D, name: OfficeCharacterName, scale = 2): void {
  const buf = getBuf(name);
  // Stage at 1× on an offscreen canvas, then blit scaled with smoothing off.
  const stage = document.createElement('canvas');
  stage.width = PORTRAIT_W; stage.height = PORTRAIT_H;
  const sctx = stage.getContext('2d')!;
  const img = sctx.createImageData(PORTRAIT_W, PORTRAIT_H);
  img.data.set(buf);
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PORTRAIT_W * scale, PORTRAIT_H * scale);
  ctx.drawImage(stage, 0, 0, PORTRAIT_W, PORTRAIT_H, 0, 0, PORTRAIT_W * scale, PORTRAIT_H * scale);
}

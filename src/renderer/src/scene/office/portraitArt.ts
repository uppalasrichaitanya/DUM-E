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

export const PORTRAIT_W = 18;
export const PORTRAIT_H = 28;
// In-scene walking sprite: same width + upper body as the portrait, taller to add the base.
export const SCENE_W = 18;
export const SCENE_H = 32;
const OUTLINE: RGB = [24, 18, 30];
const HX0 = 4, HX1 = 13; // head shell columns
/** MODOK dome silhouette: [row, x0, x1] — egg widest at the brain. */
const BIG_EDGE: [number, number, number][] = [
  [2, 7, 10], [3, 6, 11], [4, 5, 12], [5, 4, 13],
  [15, 4, 13], [16, 5, 12], [17, 5, 12], [18, 6, 11], [19, 7, 10],
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
/** Rounded metal dome rows 4-16, lit top-left (Art Bible §1): highlight
 *  crescent on the upper-left of the curve, core shadow on the lower-right,
 *  jaw shadow, ear pods. */
function drawShellHead(buf: Buf, r: Recipe): void {
  const rp = ramp5(r.shell);
  const [hi, base, sh, core] = [rp[1], rp[2], rp[3], rp[4]];
  if (r.bigHead) {
    // MODOK: giant egg dome rows 2-19 — widest at the brain, tapering chin.
    for (let y = 2; y <= 19; y++) {
      let x0 = 3, x1 = 14;
      for (const [ey, a, b] of BIG_EDGE) if (ey === y) { x0 = a; x1 = b; }
      for (let x = x0; x <= x1; x++) set(buf, x, y, base);
    }
    // key light on the egg's upper-left curve (§1)
    for (const [x, y] of [[5, 4], [6, 4], [7, 4], [4, 5], [5, 5], [4, 6], [4, 7], [4, 8], [4, 9]] as const) set(buf, x, y, hi);
    // core shadow along the lower-right (§1)
    for (let y = 10; y <= 18; y++) set(buf, 13, y, sh);
    for (let y = 14; y <= 18; y++) set(buf, 12, y, sh);
    for (const x of [10, 11, 12]) set(buf, x, 18, core);
    for (const x of [8, 9, 10, 11]) set(buf, x, 19, core);
    for (let y = 6; y <= 13; y++) { set(buf, 3, y, sh); set(buf, 14, y, sh); }
    for (let x = 7; x <= 10; x++) set(buf, x, 19, sh);
    if (r.sheen) set(buf, 5, 4, rp[0]);   // the single specular (§8)
    // big ear pods
    for (const ex of [2, 15]) { set(buf, ex, 10, base); set(buf, ex, 11, base); set(buf, ex, 12, sh); }
    return;
  }
  for (let y = 4; y <= 16; y++) {
    for (let x = HX0; x <= HX1; x++) {
      if (((x === HX0 || x === HX1) && (y === 4 || y === 16)) || ((x === 5 || x === 12) && y === 4)) continue;
      set(buf, x, y, base);
    }
  }
  // key-light crescent: upper-left of the dome (§1) — replaces the full-width sheen
  for (const [x, y] of [[6, 4], [7, 4], [5, 5], [6, 5], [5, 6]] as const) set(buf, x, y, hi);
  if (r.sheen) set(buf, 6, 4, rp[0]);    // specular at the curve top (§8 — glossy only)
  // core shadow: right edge + jaw
  for (let y = 9; y <= 15; y++) set(buf, HX1, y, sh);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 16, sh);
  set(buf, 12, 15, core); set(buf, 11, 16, core);
  for (let y = 6; y < 16; y++) { set(buf, HX0, y, sh); }
  // ear pods — lit pod on the key side, shadow pod on the far side
  set(buf, HX0 - 1, 9, hi); set(buf, HX0 - 1, 10, base); set(buf, HX0 - 1, 11, sh);
  set(buf, HX1 + 1, 9, base); set(buf, HX1 + 1, 10, sh); set(buf, HX1 + 1, 11, sh);
  // neck
  rect(buf, 7, 17, 10, 18, sh);
}

/** Inset dark face screen rows 6-13, cols 5-12 — the eyes and mouth glow on it. */
function drawFaceScreen(buf: Buf, r: Recipe): void {
  const screen: RGB = [16, 14, 26];
  const g = r.glow;
  const bright: RGB = [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)];
  const dk: RGB = [10, 9, 18];

  if (r.bigHead) {
    // MODOK's giant face screen rows 7-15, cols 5-12: scowl brows, big eyes, frown.
    rect(buf, 5, 7, 12, 15, screen);
    for (let x = 5; x <= 12; x++) { set(buf, x, 7, [30, 26, 44]); set(buf, x, 15, dk); }
    // brow lines angled down toward the middle (accent-dark so they read on the screen)
    const accSh = shades(r.accent)[2];
    set(buf, 5, 8, accSh); set(buf, 6, 9, accSh);
    set(buf, 12, 8, accSh); set(buf, 11, 9, accSh);
    // big round eyes with white glints
    for (const [ex0, ex1] of [[6, 8], [10, 12]] as const) {
      for (let y = 10; y <= 12; y++) for (let x = ex0; x <= ex1; x++) set(buf, x, y, g);
      set(buf, ex0 + 1, 11, bright);
      set(buf, ex0, 10, [255, 255, 255]);
    }
    // small frown: corners low, middle high
    set(buf, 6, 14, g); set(buf, 11, 14, g);
    for (let x = 7; x <= 10; x++) set(buf, x, 13, g);
    return;
  }

  rect(buf, 5, 6, 12, 13, screen);
  // bevel: lighter top-left, darker bottom-right edges
  const [hi] = shades(r.shell);
  for (let x = 5; x <= 12; x++) { set(buf, x, 6, [30, 26, 44]); }
  set(buf, 5, 7, hi);
  for (let x = 5; x <= 12; x++) set(buf, x, 13, dk);

  if (r.eye === 'round') {
    // two round LED eyes: bright pupil core + a white glint
    for (const cx of [7, 10]) {
      set(buf, cx, 8, g); set(buf, cx - 1, 8, g); set(buf, cx + 1, 8, g);
      set(buf, cx, 9, g); set(buf, cx, 7, g);
      set(buf, cx, 9, bright);
      set(buf, cx - 1, 7, [255, 255, 255]);
    }
  } else if (r.eye === 'visor') {
    if (r.scowl) {
      // Ultron: the visor angles down at the edges — an angry chevron, 1px steps
      set(buf, 8, 7, g); set(buf, 9, 7, g);            // apex, high
      for (let x = 7; x <= 10; x++) set(buf, x, 8, g); // mid band
      set(buf, 6, 9, g); set(buf, 11, 9, g);           // drooping ends, low
      set(buf, 8, 8, bright); set(buf, 9, 8, bright);  // hot core at center
    } else {
      // a single glowing strip across the screen
      for (let x = 6; x <= 11; x++) set(buf, x, 8, g);
      set(buf, 6, 8, bright); set(buf, 7, 8, bright);
    }
  } else if (r.eye === 'single') {
    // one big central eye: glow field, bright pupil ring, white-hot core
    rect(buf, 7, 7, 10, 10, g);
    rect(buf, 8, 8, 9, 9, bright);
    set(buf, 9, 9, [255, 255, 255]);
    const gl = [clamp(g[0] * 1.15), clamp(g[1] * 1.15), clamp(g[2] * 1.15)] as RGB;
    set(buf, 7, 7, gl); set(buf, 10, 7, gl); set(buf, 7, 10, gl); set(buf, 10, 10, gl);
  } else if (r.eye === 'gem') {
    // Vision: a faceted diamond gem glowing on the forehead, calm eyes below
    set(buf, 8, 5, bright); set(buf, 9, 5, bright);
    rect(buf, 7, 6, 10, 7, g);
    set(buf, 8, 8, g); set(buf, 9, 8, g);
    // facet highlight: one light pixel + one dark pixel across the gem
    set(buf, 8, 6, [255, 250, 255]);
    set(buf, 9, 7, [clamp(g[0] * 0.5), clamp(g[1] * 0.5), clamp(g[2] * 0.5)]);
    for (const cx of [7, 10]) { set(buf, cx, 10, g); set(buf, cx + (cx === 7 ? 1 : -1), 10, g); }
  }

  // mouth
  if (r.eye === 'round') {
    // friendly smile arc: corners high, middle low
    set(buf, 6, 10, g); set(buf, 11, 10, g);
    for (let x = 7; x <= 10; x++) set(buf, x, 11, g);
  } else if (r.eye === 'visor') { for (let x = 7; x <= 10; x++) set(buf, x, 11, [64, 58, 84]); }
  else if (r.eye === 'gem') { set(buf, 8, 12, g); set(buf, 9, 12, g); set(buf, 7, 12, g); set(buf, 10, 12, g); }
  else { rect(buf, 7, 11, 10, 11, [64, 58, 84]); set(buf, 8, 11, g); set(buf, 10, 11, g); }
}

/** Antenna / mast on the crown. */
function drawAntenna(buf: Buf, r: Recipe): void {
  const [hi, base] = shades(r.accent);
  const g = r.glow;
  if (r.antenna === 'single') {
    set(buf, 8, 3, base); set(buf, 9, 3, base);
    set(buf, 8, 2, base); set(buf, 9, 2, base);
    set(buf, 8, 1, g); set(buf, 9, 1, g); set(buf, 9, 0, g); set(buf, 8, 0, g);
    set(buf, 9, 1, [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)]);
  } else if (r.antenna === 'dual') {
    for (const ax of [6, 11]) {
      set(buf, ax, 3, base); set(buf, ax, 2, base); set(buf, ax, 1, g);
    }
    set(buf, 6, 1, [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)]);
  } else if (r.antenna === 'mast') {
    rect(buf, 8, 0, 9, 4, base);
    set(buf, 8, 0, hi); set(buf, 9, 0, hi);
    set(buf, 7, 1, g); set(buf, 10, 1, g);
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
    rect(buf, 7, 19, 10, 21, sh);        // neck stem
    rect(buf, 5, 22, 12, bottomY, base); // bib
    for (let y = 22; y <= bottomY; y++) { set(buf, 5, y, sh); set(buf, 12, y, sh); }
    set(buf, 6, 22, hi); set(buf, 7, 22, hi);   // bib catch-light (key side)
    set(buf, 11, bottomY, core); set(buf, 10, bottomY, core);
    // grid vents with a glow core
    const g = r.glow;
    for (let y = 23; y <= Math.min(bottomY - 1, 25); y++) {
      set(buf, 7, y, acc[2]); set(buf, 10, y, acc[2]);
      set(buf, 8, y, g); set(buf, 9, y, g);
    }
    return;
  }
  // pauldron blocks: heavy frames get a distinct pad row overlapping the shoulder line
  rect(buf, 3 + (r.heavy ? 0 : 1), topY, 14 - (r.heavy ? 0 : 1), topY, base);
  rect(buf, 2 + wide, topY + 1, 15 - wide, topY + 1, base);
  rect(buf, 1 + wide, topY + 2, 16 - wide, bottomY, base);
  // shoulder accent pads — key-side pad lit, far pad shadowed (§1)
  for (const [sx0, sx1] of [[1 + wide, 3 + wide], [12 - wide, 14 - wide]] as const) {
    rect(buf, sx0, topY + 1, sx1, topY + 3, acc[1]);
    set(buf, sx0, topY + 1, acc[0]);
  }
  set(buf, 12 - wide, topY + 3, acc[3]);  // far pad's shadow corner
  if (r.heavy) {
    // VERONICA: +1px pauldrons each side — armor blocks overlapping the shoulder line
    for (const [px0, px1] of [[1, 3], [14, 16]] as const) {
      rect(buf, px0, topY + 2, px1, topY + 4, acc[1]);
      set(buf, px0, topY + 2, acc[0]);
      set(buf, px1, topY + 4, acc[3]);
    }
    set(buf, 1, topY + 2, acc[0]);       // lit pauldron specular (§8)
  }
  // key-light column down the left edge; core shadow pooling at the lower-right
  for (let y = topY + 2; y <= bottomY; y++) { set(buf, 1 + wide, y, hi); set(buf, 16 - wide, y, sh); }
  for (let x = 9 - wide; x <= 15 - wide; x++) set(buf, x, bottomY, sh);
  set(buf, 15 - wide, bottomY, core); set(buf, 14 - wide, bottomY, core);
  if (r.sheen) {
    // §4 dither band at the shoulder→chest transition (glossy heroes only)
    for (let x = 4; x <= 8; x++) set(buf, x, topY + 2, (x % 2 === 0 ? hi : base));
    set(buf, 4, topY + 2, rp[0]);         // one specular on the chest plate (§8)
  }

  // chest display
  const g = r.glow;
  const bright: RGB = [clamp(g[0] * 1.3), clamp(g[1] * 1.3), clamp(g[2] * 1.3)];
  const cy = topY + 3;
  if (r.chest === 'reactor') {
    // arc-reactor: a glowing triangle-in-circle
    rect(buf, 7, cy, 10, cy + 3, [22, 20, 34]);
    rect(buf, 7, cy + 1, 10, cy + 2, g);
    set(buf, 8, cy + 1, bright); set(buf, 9, cy + 1, bright);
    set(buf, 8, cy + 2, bright);
    // outer ring
    set(buf, 6, cy, acc[1]); set(buf, 11, cy, acc[1]);
    set(buf, 6, cy + 3, acc[1]); set(buf, 11, cy + 3, acc[1]);
  } else if (r.chest === 'grid') {
    // vent grid: alternating slats
    for (let x = 6; x <= 11; x += 2) for (let y = cy; y <= cy + 3; y++) set(buf, x, y, acc[2]);
    for (let x = 7; x <= 10; x += 2) set(buf, x, cy + 1, acc[1]);
  } else if (r.chest === 'panel') {
    // status panel: a small glow bar readout
    rect(buf, 6, cy, 11, cy + 2, [22, 20, 34]);
    for (let x = 7; x <= 10; x++) set(buf, x, cy + 1, g);
    set(buf, 7, cy + 1, bright);
  }
}

// ─── bases (scene sprites only, rows 24-31) ────────────────────────────────
/** §7 ambient bounce: one row of blue-tinted shadow at an underside — the
 *  floor reflects up. Applied by each base painter at its bottom row. */
function bounceRow(c: RGB): RGB {
  return [clamp(c[0] - 2), clamp(c[1] + 2), clamp(c[2] + 12)];
}

function drawLegs(buf: Buf, r: Recipe, phase: number): void {
  const rp = ramp5(r.accent);
  const [, base, sh] = [rp[1], rp[2], rp[3]];
  // hip block: a pelvis slab rows 24-25 connecting torso to legs cleanly
  rect(buf, 4, 24, 13, 25, base);
  for (let x = 5; x <= 12; x++) set(buf, x, 25, sh);
  set(buf, 4, 25, sh); set(buf, 13, 25, sh);
  set(buf, 4, 24, rp[1]);               // hip catch-light (key side)
  void r;
  for (const [lx0, lx1] of [[5, 7], [10, 12]] as const) {
    rect(buf, lx0, 25, lx1, 30, base);
    for (let y = 25; y <= 30; y++) set(buf, lx1, y, sh);
    set(buf, lx0, 25, rp[1]);           // lit leg edge (key side)
    // knee joint
    set(buf, lx0 + 1, 27, sh); set(buf, lx1 - 1, 27, sh);
  }
  // feet — lift one per walk phase; the grounded foot gets the §7 bounce
  const leftLow = phase !== 1, rightLow = phase !== 2;
  const shoe: RGB = [44, 40, 48];
  const shoeBounce = bounceRow(shoe);
  rect(buf, 5, leftLow ? 31 : 30, 7, leftLow ? 31 : 30, leftLow ? shoeBounce : shoe);
  rect(buf, 10, rightLow ? 31 : 30, 12, rightLow ? 31 : 30, rightLow ? shoeBounce : shoe);
  // lifted foot keeps a plain shoe + a hint of shadow under it
  if (!leftLow) set(buf, 6, 31, shoe, 120);
  if (!rightLow) set(buf, 11, 31, shoe, 120);
}

function drawTreads(buf: Buf, r: Recipe): void {
  const rp = ramp5(r.accent);
  const [hi, base, sh] = [rp[1], rp[2], rp[3]];
  const x0 = r.heavy ? 1 : 3, x1 = 17 - x0;
  rect(buf, x0, 26, x1, 30, base);
  for (let x = x0; x <= x1; x += 2) set(buf, x, 28, sh); // tread notches
  rect(buf, x0 + 1, 26, x1 - 1, 26, hi);
  for (let x = x0 + 1; x <= x1 - 1; x++) set(buf, x, 30, bounceRow(base));  // §7 bounce row
  set(buf, x0 + 1, 26, rp[0]);          // tread specular (§8 — gloss rolls)
}

function drawHover(buf: Buf, r: Recipe, phase: number): void {
  // rounded hover skirt + repulsor glow; the bob replaces the walk gait
  const bob = phase === 1 ? 0 : 1;
  const rp = ramp5(r.accent);
  const [, base, sh] = [rp[1], rp[2], rp[3]];
  const g = r.glow;
  if (r.bigHead) {
    // MODOK's float throne: a tiny bracket seat under the giant head
    rect(buf, 6, 25 - bob, 11, 26 - bob, base);
    rect(buf, 5, 27 - bob, 12, 27 - bob, base);
    set(buf, 4, 26 - bob, base); set(buf, 13, 26 - bob, base); // armrest stubs
    for (let x = 5; x <= 12; x++) set(buf, x, 27 - bob, sh);
    set(buf, 6, 25 - bob, rp[1]);       // throne catch-light
    set(buf, 7, 26 - bob, g); set(buf, 10, 26 - bob, g); // throne glow dots
  } else {
    // float throne: wide at the waist, tapering to a narrower bottom row
    rect(buf, 4, 25 - bob, 13, 27 - bob, base);
    rect(buf, 5, 28 - bob, 12, 28 - bob, base);
    for (let x = 5; x <= 12; x++) set(buf, x, 28 - bob, bounceRow(base));   // §7 bounce
    for (let x = 4; x <= 7; x++) set(buf, x, 25 - bob, rp[1]); // key-side rim
  }
  // repulsor glow
  for (let x = 6; x <= 11; x++) set(buf, x, 30 + bob, g, 170);
  set(buf, 7, 30 + bob, g, 220); set(buf, 8, 30 + bob, g, 220); set(buf, 9, 30 + bob, g, 220); set(buf, 10, 30 + bob, g, 220);
}

// ─── compose ─────────────────────────────────────────────────────────────────
function compose(r: Recipe): Buf {
  CUR_W = PORTRAIT_W; CUR_H = PORTRAIT_H;
  const buf = new Uint8ClampedArray(PORTRAIT_W * PORTRAIT_H * 4);
  drawTorso(buf, r, 18, 27);
  drawShellHead(buf, r);
  drawFaceScreen(buf, r);
  drawAntenna(buf, r);
  if (r.holo) holoPass(buf); else outlinePass(buf);
  return buf;
}

function composeScene(r: Recipe, phase: number, back: boolean): Buf {
  CUR_W = SCENE_W; CUR_H = SCENE_H;
  const buf = new Uint8ClampedArray(SCENE_W * SCENE_H * 4);
  drawTorso(buf, r, 18, 24);
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

/** Back of the head: plain shell + antenna (no screen). */
function drawHeadBack(buf: Buf, r: Recipe): void {
  const [hi, base, sh] = shades(r.shell);
  if (r.bigHead) {
    // MODOK from behind: the whole egg, maintenance hatch, no face screen
    for (let y = 2; y <= 19; y++) {
      let x0 = 3, x1 = 14;
      for (const [ey, a, b] of BIG_EDGE) if (ey === y) { x0 = a; x1 = b; }
      for (let x = x0; x <= x1; x++) set(buf, x, y, base);
    }
    rect(buf, 6, 9, 11, 14, sh); // hatch panel
    for (let y = 6; y <= 16; y++) set(buf, 8, y, sh); // seam
    for (let x = 7; x <= 10; x++) set(buf, x, 3, hi);
    for (const ex of [2, 15]) { set(buf, ex, 10, base); set(buf, ex, 11, base); set(buf, ex, 12, sh); }
    return;
  }
  const rows: [number, number, number][] = [
    [4, 6, 11], [5, 5, 12], [6, 4, 13], [7, 4, 13], [8, 4, 13], [9, 4, 13],
    [10, 4, 13], [11, 4, 13], [12, 4, 13], [13, 4, 13], [14, 4, 13], [15, 5, 12], [16, 6, 11],
  ];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, base);
  // maintenance hatch: a darker panel + seam down the middle
  rect(buf, 6, 8, 11, 12, sh);
  for (let y = 6; y <= 14; y++) set(buf, 8, y, sh);
  for (let x = 7; x <= 10; x++) set(buf, x, 4, hi);
  rect(buf, 7, 17, 10, 18, sh);
  // antenna seen from behind
  if (r.antenna === 'single') { set(buf, 8, 2, base); set(buf, 9, 2, base); set(buf, 9, 1, r.glow); }
  else if (r.antenna === 'dual') { set(buf, 6, 2, base); set(buf, 11, 2, base); set(buf, 6, 1, r.glow); }
  else if (r.antenna === 'mast') { rect(buf, 8, 0, 9, 3, base); set(buf, 8, 0, hi); }
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
      if (y >= 6 && y <= 13 && (y - 6) % 3 === 2) {
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

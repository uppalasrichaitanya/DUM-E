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
function shades(rgb: RGB, dl = 1.22, dd = 0.68): [RGB, RGB, RGB] {
  return [
    [clamp(rgb[0] * dl), clamp(rgb[1] * dl), clamp(rgb[2] * dl)],
    [rgb[0], rgb[1], rgb[2]],
    [clamp(rgb[0] * dd), clamp(rgb[1] * dd), clamp(rgb[2] * dd)],
  ];
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
/** Rounded metal dome rows 4-16; the same silhouette the human heads used, so
 *  every consumer's framing still holds. */
function drawShellHead(buf: Buf, r: Recipe): void {
  const [hi, base, sh] = shades(r.shell);
  if (r.bigHead) {
    // MODOK: giant egg dome rows 2-19 — widest at the brain, tapering chin.
    for (let y = 2; y <= 19; y++) {
      let x0 = 3, x1 = 14;
      for (const [ey, a, b] of BIG_EDGE) if (ey === y) { x0 = a; x1 = b; }
      for (let x = x0; x <= x1; x++) set(buf, x, y, base);
    }
    for (let y = 6; y <= 13; y++) { set(buf, 3, y, sh); set(buf, 14, y, sh); }
    for (let x = 7; x <= 10; x++) set(buf, x, 19, sh);
    if (r.sheen) { for (let x = 6; x <= 11; x++) set(buf, x, 4, hi); }
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
  // metal sheen: a bright band under the crown (glossy heroes only), dark at the jaw
  if (r.sheen) {
    for (let x = 6; x <= 11; x++) set(buf, x, 5, hi);
    set(buf, 5, 6, hi); set(buf, 6, 6, hi);
  }
  for (let x = HX0; x <= HX1; x++) set(buf, x, 16, sh);
  for (let y = 6; y < 16; y++) { set(buf, HX0, y, sh); set(buf, HX1, y, sh); }
  // ear pods
  for (const ex of [HX0 - 1, HX1 + 1]) { set(buf, ex, 9, base); set(buf, ex, 10, base); set(buf, ex, 11, sh); }
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
/** Shoulders → torso, rows 19-27 on the portrait. */
function drawTorso(buf: Buf, r: Recipe, topY: number, bottomY: number): void {
  const [hi, base, sh] = shades(r.shell);
  const acc = shades(r.accent);
  const wide = r.heavy ? 1 : 2;
  if (r.bigHead) {
    // MODOK: no shoulders — a neck stem + tiny vented bib under the giant head
    rect(buf, 7, 19, 10, 21, sh);        // neck stem
    rect(buf, 5, 22, 12, bottomY, base); // bib
    for (let y = 22; y <= bottomY; y++) { set(buf, 5, y, sh); set(buf, 12, y, sh); }
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
  // shoulder accent pads
  for (const [sx0, sx1] of [[1 + wide, 3 + wide], [12 - wide, 14 - wide]] as const) {
    rect(buf, sx0, topY + 1, sx1, topY + 3, acc[1]);
    set(buf, sx0, topY + 1, acc[0]);
  }
  if (r.heavy) {
    // VERONICA: +1px pauldrons each side — armor blocks overlapping the shoulder line
    for (const [px0, px1] of [[1, 3], [14, 16]] as const) {
      rect(buf, px0, topY + 2, px1, topY + 4, acc[1]);
      set(buf, px0, topY + 2, acc[0]);
      set(buf, px1, topY + 4, acc[2]);
    }
  }
  // side shading + metal sheen down the left
  for (let y = topY + 2; y <= bottomY; y++) { set(buf, 1 + wide, y, sh); set(buf, 16 - wide, y, sh); }
  if (r.sheen) { for (let x = 4; x <= 7; x++) set(buf, x, topY + 2, hi); }

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

// ─── bases (scene sprites only, rows 25-31) ─────────────────────────────────
function drawLegs(buf: Buf, r: Recipe, phase: number): void {
  const [, base, sh] = shades(r.accent);
  // hip block: a pelvis slab rows 24-25 connecting torso to legs cleanly
  rect(buf, 4, 24, 13, 25, base);
  for (let x = 5; x <= 12; x++) set(buf, x, 25, sh);
  set(buf, 4, 25, sh); set(buf, 13, 25, sh);
  void r;
  for (const [lx0, lx1] of [[5, 7], [10, 12]] as const) {
    rect(buf, lx0, 25, lx1, 30, base);
    for (let y = 25; y <= 30; y++) set(buf, lx1, y, sh);
    // knee joint
    set(buf, lx0 + 1, 27, sh); set(buf, lx1 - 1, 27, sh);
  }
  // feet — lift one per walk phase (same gait rhythm the humans used)
  const leftLow = phase !== 1, rightLow = phase !== 2;
  const shoe: RGB = [44, 40, 48];
  rect(buf, 5, leftLow ? 31 : 30, 7, leftLow ? 31 : 30, shoe);
  rect(buf, 10, rightLow ? 31 : 30, 12, rightLow ? 31 : 30, shoe);
}

function drawTreads(buf: Buf, r: Recipe): void {
  const [hi, base, sh] = shades(r.accent);
  const x0 = r.heavy ? 1 : 3, x1 = 17 - x0;
  rect(buf, x0, 26, x1, 30, base);
  for (let x = x0; x <= x1; x += 2) set(buf, x, 28, sh); // tread notches
  rect(buf, x0 + 1, 26, x1 - 1, 26, hi);
  for (let x = x0; x <= x1; x++) set(buf, x, 30, sh);
}

function drawHover(buf: Buf, r: Recipe, phase: number): void {
  // rounded hover skirt + repulsor glow; the bob replaces the walk gait
  const bob = phase === 1 ? 0 : 1;
  const [, base, sh] = shades(r.accent);
  const g = r.glow;
  if (r.bigHead) {
    // MODOK's float throne: a tiny bracket seat under the giant head
    rect(buf, 6, 25 - bob, 11, 26 - bob, base);
    rect(buf, 5, 27 - bob, 12, 27 - bob, base);
    set(buf, 4, 26 - bob, base); set(buf, 13, 26 - bob, base); // armrest stubs
    for (let x = 5; x <= 12; x++) set(buf, x, 27 - bob, sh);
    set(buf, 7, 26 - bob, g); set(buf, 10, 26 - bob, g); // throne glow dots
  } else {
    // float throne: wide at the waist, tapering to a narrower bottom row
    rect(buf, 4, 25 - bob, 13, 27 - bob, base);
    rect(buf, 5, 28 - bob, 12, 28 - bob, base);
    for (let x = 5; x <= 12; x++) set(buf, x, 28 - bob, sh);
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
function outlinePass(buf: Buf): void {
  const pts: [number, number][] = [];
  for (let y = 0; y < CUR_H; y++) {
    for (let x = 0; x < CUR_W; x++) {
      if (alphaAt(buf, x, y) !== 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (alphaAt(buf, x + dx, y + dy) === 255) { pts.push([x, y]); break; }
      }
    }
  }
  for (const [x, y] of pts) set(buf, x, y, OUTLINE);
}

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

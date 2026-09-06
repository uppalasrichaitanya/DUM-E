'use strict';
/**
 * Lab tileset generator — paints DUM-E's lab atlases.
 *
 * THE ORIGINALS ARE GONE: the office floor's atlases were LimeZu "Modern
 * Interiors" art (license-encumbered). This tool paints original replacement
 * atlases with the SAME grid layout (16×16 tiles, same atlas dimensions, same
 * gid space) so the existing Tiled maps render without re-authoring.
 *
 * CRAFT: follows docs/ART-TECHNIQUES.md (the bible) — one top-left key light,
 * 5-shade hue-shifted ramps (§2: shadows drift blue-violet, highlights warm),
 * bevels on every raised surface (§5), 2px dither bands at ramp transitions
 * (§4), emissive halos within budget (§6), ambient bounce at undersides (§7),
 * speculars on glossy metal only (§8), seeded texture noise on large fills
 * (§9). When this file and the bible disagree, fix this file.
 *
 *   node tools/make-lab-tilesets.cjs [--preview]
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src/renderer/src/assets/tilesets');
fs.mkdirSync(OUT, { recursive: true });

// ── 5-shade hue-shifted ramp (bible §2) ─────────────────────────────────────
// shadows drift toward blue-violet (+blue, −red), highlights toward warm
// white. The hue shift is the whole point — "darker base" reads dead,
// "bluer shadow" reads lit.
const clampR = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** [specular, highlight, base, shadow, core] for a material base color. */
function ramp(rgb) {
  const [r, g, b] = rgb;
  return [
    [clampR(r * 0.35 + 255 * 0.65), clampR(g * 0.35 + 250 * 0.65), clampR(b * 0.20 + 238 * 0.80)], // 0 specular — warm key
    [clampR(r * 1.25 + 10), clampR(g * 1.25 - 2), clampR(b * 1.25 - 20)],                          // 1 highlight — warm
    [r, g, b],                                                                                   // 2 base
    [clampR(r * 0.62 - 8), clampR(g * 0.62 - 2), clampR(b * 0.62 + 18)],                           // 3 shadow — blue-violet
    [clampR(r * 0.34 - 8), clampR(g * 0.34 - 4), clampR(b * 0.34 + 26)]                             // 4 core shadow
  ];
}

// ── lab palette (base colors; painters use their 5-step ramps) ─────────────
const FLOOR_B  = [46, 60, 80];    // steel plate
const WALL_B   = [34, 42, 58];    // panel wall (cooler, darker than floor)
const FURN_B   = [58, 66, 82];    // furniture metal (slightly warm-neutral)
const PAINT_B  = [52, 58, 72];    // painted metal (flatter, for cabinets/crates)
const SCREEN_OFF = [12, 15, 24];
const SCREEN_ON  = [88, 178, 255];
const ACCENT  = [64, 140, 255];  // arc-reactor blue (emissive)
const GOLD    = [244, 211, 94];   // DUM-E gold (emissive/accent)
const HAZARD  = [212, 160, 52];  // caution yellow, sparingly

// Material ramps (bible §2) — the [specular, highlight, base, shadow, core].
const STEEL  = ramp(FLOOR_B);
const WALLR  = ramp(WALL_B);
const FURNR  = ramp(FURN_B);
const PAINTR = ramp(PAINT_B);
const GOLDR  = ramp(GOLD);

// Legacy aliases used by existing painters — mapped to ramp steps so the
// migration is incremental and each painter can be re-lit one at a time.
const FLOOR   = STEEL[2];
const FLOOR_D = STEEL[3];
const FLOOR_H = STEEL[1];
const INLAY   = STEEL[3];
const WALL    = WALLR[2];
const WALL_D  = WALLR[3];
const WALL_H  = WALLR[1];
const FURN    = FURNR[2];
const FURN_D  = FURNR[3];
const FURN_H  = FURNR[1];

// ── PNG writer (from make-logo.cjs, same minimal encoder) ──────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const buf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    buf.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── canvas ──────────────────────────────────────────────────────────────────
// Tier 2: tiles render at 24px (was 16). All painter geometry below is
// authored against these 24px bounds — re-drawn, not upscaled: more rivets,
// longer streaks, 2px cables, real handles, 2px code-lines. The atlas grid
// keeps 16 COLUMNS of tiles (the map's `columns` field), so gid math is
// unchanged — only tile dimensions grow.
const TILE = 24;
const MAX = TILE - 1;
class Tile {
  constructor() { this.px = new Uint8ClampedArray(TILE * TILE * 4); }
  set(x, y, c, a = 255) {
    if (x < 0 || x > MAX || y < 0 || y > MAX) return;
    const i = (y * TILE + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = a;
  }
  fill(c) { for (let y = 0; y <= MAX; y++) for (let x = 0; x <= MAX; x++) this.set(x, y, c); }
  rect(x0, y0, x1, y1, c, a = 255) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c, a); }
  hline(y, x0, x1, c, a = 255) { for (let x = x0; x <= x1; x++) this.set(x, y, c, a); }
  vline(x, y0, y1, c, a = 255) { for (let y = y0; y <= y1; y++) this.set(x, y, c, a); }
}

// Deterministic per-gid variation so tiles are stable across regenerations.
function seeded(seed) {
  let s = seed * 2654435761 % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ── craft helpers (bible §4 §5 §6 §7 §9) ────────────────────────────────────
/** §9 texture noise: seeded ±N luminance jitter over a rect, stable per seed.
 *  Luminance-only (never hue) — kills flatness on big fills, invisible at
 *  50% zoom. Keep N in [3..6]; higher reads dirty. */
function noise(t, x0, y0, x1, y1, rnd, n = 4) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * TILE + x) * 4;
      if (t.px[i + 3] === 0 || t.px[i + 3] < 200) continue;   // skip transparent/holo
      const d = Math.round((rnd() - 0.5) * 2 * n);
      t.px[i] = clampR(t.px[i] + d);
      t.px[i + 1] = clampR(t.px[i + 1] + d);
      t.px[i + 2] = clampR(t.px[i + 2] + d);
    }
  }
}

/** §4 dither band: 2px checker where shade A (upper) meets B (lower). One
 *  row of A|B checker at the boundary — the classic pixel gradient fake. */
function ditherBand(t, y, x0, x1, a, b) {
  for (let x = x0; x <= x1; x++) {
    t.set(x, y, (x - x0) % 2 === 0 ? a : b);
  }
}

/** §5 bevel: 1px light top+left, 1px dark bottom+right around a rect — the
 *  SNES raised-surface recipe. `inset` flips it for recessed surfaces
 *  (screen wells, inlays). Corners get base so the light turns. */
function bevel(t, x0, y0, x1, y1, rp, inset = false) {
  const light = inset ? rp[3] : rp[1];
  const dark  = inset ? rp[1] : rp[3];
  t.hline(y0, x0, x1, light);
  t.vline(x0, y0, y1, light);
  t.hline(y1, x0, x1, dark);
  t.vline(x1, y0, y1, dark);
  t.set(x0, y0, inset ? rp[3] : rp[1]);   // corners read as the light turning
  t.set(x1, y1, inset ? rp[1] : rp[3]);
}

/** §6 emissive halo: 1px dim ring of the glow's hue (~35% mix into the
 *  surface below) around a point. Budget: the CALLER enforces ≤2 zones. */
function halo(t, x, y, glow, surface) {
  const mix = (c, s) => c.map((v, i) => clampR(v * 0.35 + s[i] * 0.65));
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const i = ((y + dy) * TILE + (x + dx)) * 4;
    if (y + dy < 0 || y + dy > MAX || x + dx < 0 || x + dx > MAX) continue;
    if (t.px[i + 3] === 0) continue;
    const c = mix(glow, [t.px[i], t.px[i + 1], t.px[i + 2]]);
    t.set(x + dx, y + dy, c);
  }
}

/** §7 ambient bounce: 1px blue-tinted shadow at an underside edge — the
 *  floor reflects up. One row only, at the very bottom of a surface. */
function bounce(t, x0, x1, yEdge, rp) {
  const c = [clampR(rp[3][0] + 8), clampR(rp[3][1] + 8), clampR(rp[3][2] + 16)];
  t.hline(yEdge, x0, x1, c);
}

// ── tile painters by semantic class ────────────────────────────────────────
// Art direction: Tony's workshop at a glance — brushed steel underfoot that
// RECEDES (agents walk on it), walls that carry lab infrastructure (conduit,
// backlit strips, grilles), equipment that reads as equipment (benches,
// consoles, crates, racks), monitors that show CODE (the agents' desk screens
// are the hero tiles), and two signature pieces (arc-ring charger, holo
// pylon). Steel stays quiet; emissives are rationed (≤2 accents per tile).

/** Steel floor plate (bible §1 §2 §4 §5 §9) — authored for 24px: longer
 *  brushed streaks, a bigger engraved inlay with SIX bolts, full-width
 *  catch-lights. QUIET under the agents. */
function paintFloor(t, rnd) {
  t.fill(STEEL[2]);
  noise(t, 0, 0, MAX, MAX, rnd, 4);                                // §9 grain
  // brushed streaks: longer 1px runs (5-14px), sparse, never rows
  for (let i = 0; i < 5; i++) {
    const y = 2 + Math.floor(rnd() * 20);
    const x0 = Math.floor(rnd() * 10), x1 = x0 + 5 + Math.floor(rnd() * 9);
    t.hline(y, x0, Math.min(MAX, x1), STEEL[3]);
  }
  // engraved panel inlay (most tiles; some plain for variety)
  if (rnd() < 0.7) {
    t.rect(3, 3, 20, 20, STEEL[3]);               // inset wall of the engraving
    t.rect(4, 4, 19, 19, STEEL[4]);               // engraving floor — core shadow deep
    noise(t, 4, 4, 19, 19, rnd, 3);
    bevel(t, 4, 4, 19, 19, STEEL, true);           // §5 recessed bevel
    ditherBand(t, 3, 4, 19, STEEL[2], STEEL[3]);   // §4 lip transition
    // six bolts: corners + mid-edges of the bigger plate
    for (const [bx, by] of [[6, 6], [17, 6], [6, 17], [17, 17], [6, 11], [17, 11]]) {
      t.set(bx, by, STEEL[3]); t.set(bx + 1, by, STEEL[3]);
    }
  }
  t.hline(MAX, 0, MAX, STEEL[3]); t.vline(MAX, 0, MAX, STEEL[3]);  // plate seams
  t.hline(0, 0, MAX, STEEL[1]);                     // top catch-light
  t.vline(0, 0, MAX, STEEL[1]);                     // left catch-light (key side)
}

/** Hazard-trim floor: doorway/transitional plates — double chevron rows. */
function paintFloorHazard(t) {
  t.fill(STEEL[3]);
  for (let i = 0; i < TILE; i += 6) {
    for (let k = 0; k < 6 && i + k < TILE; k++) {
      t.set(i + k, k % 2 === 0 ? 0 : MAX, HAZARD);
      t.set(i + k, k % 2 === 0 ? MAX : 0, HAZARD);
      t.set(i + k, k % 2 === 0 ? 1 : MAX - 1, HAZARD);
      t.set(i + k, k % 2 === 0 ? MAX - 1 : 1, HAZARD);
    }
  }
  t.rect(3, 3, 20, 20, STEEL[2]);
  noise(t, 3, 3, 20, 20, seeded(31), 4);
  bevel(t, 3, 3, 20, 20, STEEL, true);
}

/** Lab wall (bible §1 §2 §5 §6 §9) — authored for 24px: three panel seams,
 *  2px conduit cable with bracket pairs, 2px backlit strip, taller grille.
 *  Variant rolls are taken FIRST so preview seeds stay stable regardless of
 *  how many rolls the noise pass consumes. */
function paintWall(t, rnd) {
  const v = rnd();                                                  // variant selector (stable)
  const cy = 3 + Math.floor(rnd() * 3);                             // conduit height
  const sy = 16 + Math.floor(rnd() * 3);                            // backlit height
  const rx = 4 + Math.floor(rnd() * 16);                            // rivet column
  t.fill(WALLR[2]);
  noise(t, 0, 0, MAX, MAX, rnd, 4);                                // §9 grain
  t.hline(0, 0, MAX, WALLR[1]);                                    // top catch-light
  t.hline(MAX - 1, 0, MAX, WALLR[3]); t.hline(MAX, 0, MAX, WALLR[4]);  // base shadow
  // three panel seams with bevel edges (24px fits three sheets)
  for (const [bump, shad] of [[7, 8], [15, 16]]) {
    t.hline(bump, 0, MAX, WALLR[1]);
    t.hline(shad, 0, MAX, WALLR[3]);
  }
  if (v < 0.3) {
    // conduit run: 2px shadowed cable, U-clamp bracket pairs with rim light
    t.hline(cy, 0, MAX, [16, 20, 30]);
    t.hline(cy + 1, 0, MAX, [11, 14, 22]);
    t.hline(cy + 2, 0, MAX, [8, 10, 17]);
    for (const bx of [3, 13]) {
      t.set(bx, cy - 1, WALLR[1]); t.set(bx + 1, cy - 1, WALLR[1]);   // bracket rims
      t.set(bx, cy + 3, WALLR[3]); t.set(bx + 1, cy + 3, WALLR[3]);
      t.set(bx, cy, WALLR[1]); t.set(bx + 1, cy, WALLR[1]);           // clamp highlights
    }
  } else if (v < 0.55) {
    // backlit strip (emissive §6): 2px Stark-blue line + halo + rim
    t.hline(sy, 1, MAX - 1, ACCENT);
    t.hline(sy + 1, 1, MAX - 1, ACCENT);
    t.hline(sy + 2, 1, MAX - 1, [28, 60, 110]);                   // halo dim row
    t.hline(sy - 1, 1, MAX - 1, WALLR[1]);                        // rim above
  } else if (v < 0.8) {
    // vent grille: recessed bevel + louvered slats (taller in 24px)
    t.rect(5, 8, 18, 18, WALLR[4]);
    bevel(t, 5, 8, 18, 18, WALLR, true);
    for (let y = 10; y <= 16; y += 2) t.hline(y, 6, 17, WALLR[3]);
    t.hline(9, 6, 17, WALLR[1]);
  }
  // occasional rivet column for panel texture (deterministic: ~1 in 3 tiles)
  if (rx % 3 === 0) t.vline(rx, 2, 20, WALLR[3]);
}

/** Wall-top cap (bible §5 §7): the ledge where wall meets floor — a full
 *  raised bevel (light top-left, dark bottom-right) + ambient bounce. */
function paintWallCap(t) {
  t.fill(WALLR[2]);
  noise(t, 0, 0, MAX, MAX, seeded(4242), 4);
  bevel(t, 0, 0, MAX, MAX, WALLR);
  bounce(t, 0, MAX, MAX, WALLR);                                   // §7 floor bounce
}

/** Workbench/furniture (bible §2 §5 §9). Seeded kinds, all on the FURN ramp
 *  except cabinets/crates which use the PAINT ramp — material contrast.
 *  Every face gets a raised bevel; large faces get noise. */
function paintFurniture(t, rnd) {
  const pad = 1 + Math.floor(rnd() * 3);
  const kind = rnd();
  const rp = (kind >= 0.6 && kind < 0.8) ? PAINTR : FURNR;          // cabinet = painted
  const x1 = MAX - pad, y1 = MAX - 2;
  t.rect(pad, 3, x1, y1, rp[2]);
  noise(t, pad, 3, x1, y1, rnd, 4);
  bevel(t, pad, 3, x1, y1, rp);                                      // §5 raised face
  if (kind < 0.35) {
    // workbench: 2px surface lip + scorch cluster + status LED with halo
    t.hline(7, pad + 1, x1 - 1, rp[3]);
    t.hline(8, pad + 1, x1 - 1, rp[1]);
    const sx = 6 + Math.floor(rnd() * 8);
    t.set(sx, 11, [70, 62, 58]); t.set(sx + 1, 11, [58, 52, 48]); t.set(sx, 12, [58, 52, 48]);
    t.set(sx + 2, 10, [58, 52, 48]);
    t.set(x1 - 2, y1 - 3, ACCENT);
    halo(t, x1 - 2, y1 - 3, ACCENT, rp);                            // §6 LED halo
  } else if (kind < 0.6) {
    // instrument console: recessed readout well + 2px multi-hue readouts
    t.rect(pad + 3, 9, x1 - 3, y1 - 2, rp[4]);
    bevel(t, pad + 3, 9, x1 - 3, y1 - 2, rp, true);
    for (const [ry, hue] of [[11, ACCENT], [15, GOLD]]) {
      const w = 4 + Math.floor(rnd() * 8);
      t.hline(ry, pad + 4, pad + 3 + w, hue);
      t.hline(ry + 1, pad + 4, pad + 3 + Math.floor(w * 0.6), hue);
    }
    t.set(pad + 4, 10, rp[0]);                                      // well specular
  } else if (kind < 0.8) {
    // tool cabinet: painted metal, 3 drawers with handle notches
    for (const hy of [8, 13, 18]) {
      t.hline(hy, pad + 2, x1 - 2, rp[3]);
      t.hline(hy + 1, pad + 2, x1 - 2, rp[1]);
      for (const hx of [pad + 4, pad + 10]) { t.vline(hx, hy + 2, hy + 3, rp[3]); t.set(hx, hy + 2, rp[1]); }
    }
    t.hline(y1 - 2, pad + 2, x1 - 2, rp[3]);
  } else {
    // crate: painted cross-straps + hazard corner chips
    t.hline(11, pad + 1, x1 - 1, rp[3]);
    t.hline(12, pad + 1, x1 - 1, rp[1]);
    t.vline(pad + 7, 4, y1 - 1, rp[3]);
    t.vline(pad + 8, 4, y1 - 1, rp[1]);
    t.set(pad + 3, y1 - 3, HAZARD); t.set(pad + 4, y1 - 3, HAZARD);
    t.set(x1 - 3, 6, HAZARD); t.set(x1 - 2, 6, HAZARD);
  }
  bounce(t, pad + 1, x1 - 1, y1, rp);                                // §7 underside
}

/** Server rack (bible §2 §5 §6 §9) — authored for 24px: beveled frame, five
 *  bays with real HANDLE bars, paired LEDs (halos on active), fan column. */
function paintRack(t, rnd) {
  const x0 = 4, x1 = 19, y1 = 21;
  t.rect(x0, 1, x1, y1, FURNR[3]);
  noise(t, x0, 1, x1, y1, rnd, 4);
  bevel(t, x0, 1, x1, y1, FURNR);
  t.rect(x0 + 1, 2, x1 - 1, 5, FURNR[2]);           // header plate
  t.hline(3, x0 + 1, x1 - 1, FURNR[1]);              // header sheen
  t.set(x0 + 2, 3, FURNR[0]);                        // header specular
  for (let y = 7; y <= y1 - 2; y += 3) {
    t.hline(y, x0 + 1, x1 - 1, FURNR[2]);
    t.hline(y + 1, x0 + 1, x1 - 1, FURNR[4]);
    // handle bar across the bay (2px, key-side highlight)
    t.hline(y + 2, x0 + 2, x1 - 2, FURNR[3]);
    t.hline(y + 2, x0 + 2, x0 + 4, FURNR[1]);
    const hot = rnd() < 0.5;
    const led = hot ? ACCENT : [40, 50, 66];
    t.set(x0 + 2, y + 1, led);
    if (hot) halo(t, x0 + 2, y + 1, led, FURNR);     // §6 LED halo (active bays only)
    t.set(x1 - 2, y + 1, hot ? GOLD : ACCENT);       // paired contrast LED, no halo (budget)
  }
  for (let y = 6; y <= y1 - 1; y += 2) t.set(x1, y, FURNR[2]);    // fan grille column
  bounce(t, x0 + 1, x1 - 1, y1, FURNR);               // §7 underside
}

/** Monitor — THE hero tiles (Phase 3), authored for 24px: wider two-tier
 *  beveled bezel, 2px code-lines with a CURSOR block, diagonal reflection
 *  streak, glow spill, stand + shadow + bounce. OFF: near-black + standby LED. */
function paintScreen(t, on, rnd) {
  // outer bezel — raised bevel, noised face
  t.rect(1, 3, 22, 18, FURNR[2]);
  noise(t, 1, 3, 22, 18, rnd, 3);
  bevel(t, 1, 3, 22, 18, FURNR);
  // screen well — recessed (inverted bevel), dark navy
  t.rect(2, 4, 21, 16, SCREEN_OFF);
  bevel(t, 2, 4, 21, 16, FURNR, true);
  if (on) {
    const CODE = [88, 178, 255];        // cyan statements
    const CODE2 = [244, 211, 94];       // gold keywords (syntax variety)
    const CODE3 = [178, 208, 235];      // pale comments
    // code lines: 2px-tall rows with varying indent/width, seeded
    for (let y = 5; y <= 14; y += 2) {
      if (rnd() < 0.25) continue;
      const indent = 4 + Math.floor(rnd() * 3);
      const w = 3 + Math.floor(rnd() * 10);
      const roll = rnd();
      const hue = roll < 0.2 ? CODE2 : (roll < 0.34 ? CODE3 : CODE);
      t.hline(y, indent, Math.min(21, indent + w), hue);
      if (rnd() < 0.4) t.hline(y + 1, indent + 2, Math.min(21, indent + Math.floor(w * 0.5)), hue);
    }
    // cursor block at a seeded spot on the last line (a live editor)
    const cx = 6 + Math.floor(rnd() * 8);
    t.rect(cx, 15, cx + 1, 15, [200, 230, 250]);
    // diagonal reflection streak (§8 gloss): upper-left to mid, translucent
    for (let i = 0; i < 8; i++) {
      t.set(3 + i, 4 + i, [190, 220, 245], 120);
      t.set(4 + i, 4 + i, [190, 220, 245], 90);
    }
    t.hline(4, 2, 21, [140, 205, 255]);              // top scanline sheen
    t.hline(17, 3, 20, [40, 80, 140]);               // glow spill onto bezel (§6)
    t.set(20, 4, ACCENT);                            // power corner-dot
    halo(t, 20, 4, ACCENT, FURNR);                   // its 1px halo
  } else {
    t.hline(9, 3, 20, [20, 25, 38]);
    t.set(4, 15, [64, 84, 64]);                      // dim standby LED — no halo (off)
  }
  // stand: neck + foot + ground shadow + bounce
  t.rect(9, 19, 14, 20, FURNR[3]);
  t.rect(7, 21, 16, 21, FURNR[2]);
  t.hline(MAX, 7, 16, FURNR[3]);
  bounce(t, 7, 16, 21, FURNR);
}

/** Charging station (Phase 3 signature), authored for 24px: arc-ring pad —
 *  TWELVE segments with gaps, gold charge pips with specular core, docked
 *  port notch, floor bounce. */
function paintCharger(t) {
  t.rect(2, 1, 21, 21, FURNR[2]);
  noise(t, 2, 1, 21, 21, seeded(77), 4);
  bevel(t, 2, 1, 21, 21, FURNR);
  t.rect(4, 3, 19, 9, FURNR[4]);                     // dark dock well (recessed)
  bevel(t, 4, 3, 19, 9, FURNR, true);
  // arc ring: 12 segments with gaps (a real circle in 24px); halos = budget
  const R = ACCENT;
  const C = 11;                                      // center col (ring at rows 4-8)
  for (const [dx, dy] of [[-3, 0], [3, 0], [-2, 2], [2, 2], [0, 3], [0, -3], [-2, -2], [2, -2], [-3, 1], [3, 1], [-1, 3], [1, 3]]) {
    t.set(C + dx, 6 + dy, R);
  }
  halo(t, C - 3, 3, R, FURNR); halo(t, C + 3, 3, R, FURNR);   // two halos = budget
  // charge pips: gold cluster with the ONE specular (§8)
  t.set(10, 6, GOLDR[1]); t.set(11, 6, GOLDR[1]); t.set(12, 6, GOLDR[1]);
  t.set(10, 7, GOLDR[1]); t.set(11, 7, GOLDR[0]); t.set(12, 7, GOLDR[1]);
  for (const x of [5, 11, 17]) { t.set(x, 13, GOLDR[2]); t.set(x + 1, 13, GOLDR[2]); }
  // port notch bottom-center (recessed)
  t.rect(10, 17, 13, 19, FURNR[4]);
  bevel(t, 10, 17, 13, 19, FURNR, true);
  t.hline(MAX - 1, 4, 19, FURNR[3]);
  bounce(t, 3, 20, 21, FURNR);
}

/** Holo-pylon (Phase 3 signature), authored for 24px: dark mast, a 6×6
 *  hologram cube with chromatic fringe (cyan/pink offsets — echoes LYLA),
 *  brighter core, emitter bevel, base light spill, floor bounce. */
function paintPylon(t) {
  t.rect(8, 9, 15, 21, FURNR[3]);
  noise(t, 8, 9, 15, 21, seeded(88), 4);
  t.vline(8, 9, 21, FURNR[4]);
  t.rect(6, 4, 17, 8, FURNR[2]);                     // emitter head
  bevel(t, 6, 4, 17, 8, FURNR);
  t.hline(6, 7, 16, ACCENT);                         // emitter line (2px)
  t.hline(7, 7, 16, [100, 160, 255]);
  t.set(11, 5, GOLD); t.set(12, 5, GOLD); t.set(11, 6, GOLDR[1]);
  // hologram cube: 3 concentric translucent golds, 6×6, chromatic fringe
  t.rect(8, 11, 15, 18, [244, 211, 94], 90);
  t.rect(10, 13, 13, 16, [244, 211, 94], 150);
  t.set(11, 14, [255, 244, 180], 235); t.set(12, 14, [255, 244, 180], 220);
  t.set(12, 15, [255, 244, 180], 235);
  t.vline(8, 12, 17, [120, 220, 255], 110);          // cyan fringe (left)
  t.vline(15, 11, 18, [255, 150, 220], 80);         // pink fringe (right)
  t.hline(10, 9, 14, [120, 220, 255], 70);           // cyan fringe (top)
  // base light spill + bounce
  t.hline(8, 8, 15, [50, 46, 30]);
  bounce(t, 8, 15, 21, FURNR);
  t.rect(9, MAX, 14, MAX, FURNR[4]);                // base shadow
}

// ── atlas assemblers ─────────────────────────────────────────────────────────
// Atlas dims = 16 columns × TILE px wide; height = rows × TILE. Same gid
// layout and classification as the 16px era — the map contract is size, not
// layout, and TiledMapRenderer scales by mapData.tilewidth.
function blitInto(img, imgW, idx, t) {
  const col = idx % 16, row = Math.floor(idx / 16);
  const ox = col * TILE, oy = row * TILE;
  for (let y = 0; y <= MAX; y++) {
    for (let x = 0; x <= MAX; x++) {
      const i = (y * TILE + x) * 4;
      const o = ((oy + y) * imgW + ox + x) * 4;
      img[o] = t.px[i]; img[o + 1] = t.px[i + 1]; img[o + 2] = t.px[i + 2]; img[o + 3] = t.px[i + 3];
    }
  }
}

/** Atlas 1 — the main floor/furniture page (firstgid 1, 512 tiles, 384×768). */
function buildMain() {
  const W = 16 * TILE, H = 32 * TILE;
  const img = new Uint8ClampedArray(W * H * 4);
  const blit = (idx, painter, arg) => {
    const t = new Tile();
    painter(t, arg);
    blitInto(img, W, idx, t);
  };

  // local-gid classification (local gid = gid - 1, zero-based tile index)
  const FLOOR_SET = new Set([0, 1, 2, 3, 17, 18, 19, 37, 38, 39, 53, 54, 55]);
  const WALL_SET = new Set([160, 161, 176, 177, 190, 191, 192, 193, 206, 207, 222, 223, 228]);
  const WALLCAP_SET = new Set([256, 257, 259, 265, 268, 273, 275, 280, 281, 284, 288]);
  const SCREEN_SET = new Map([[364, 'off'], [365, 'off'], [369, 'off'],
    [366, 'on'], [367, 'on'], [368, 'on'], [382, 'on'], [383, 'on'], [394, 'off'],
    [326, 'on'], [327, 'on'], [328, 'on'], [329, 'on']]);
  const CHARGER_SET = new Set([296, 297, 300, 304]);   // coffee-machine region
  const PYLON_SET = new Set([410, 430, 431, 450, 451, 466, 467, 469, 470]);  // plant region
  const RACK_SET = new Set([342, 343, 348, 353, 394]);

  for (let local = 0; local < 512; local++) {
    const rnd = seeded(local + 1);
    if (FLOOR_SET.has(local)) blit(local, paintFloor, rnd);
    else if (local === 20 || local === 21) blit(local, paintFloorHazard);
    else if (WALL_SET.has(local)) blit(local, paintWall, rnd);
    else if (WALLCAP_SET.has(local)) blit(local, paintWallCap);
    else if (SCREEN_SET.has(local)) blit(local, (t) => paintScreen(t, SCREEN_SET.get(local) === 'on', seeded(local + 777)));
    else if (CHARGER_SET.has(local)) blit(local, paintCharger);
    else if (PYLON_SET.has(local)) blit(local, paintPylon);
    else if (RACK_SET.has(local)) blit(local, paintRack, rnd);
    else if (local >= 256) blit(local, paintFurniture, rnd);   // furniture band
    else if (local >= 160) blit(local, paintWall, rnd);        // wall band
    else blit(local, paintFloor, rnd);                          // default: floor
  }
  return encodePng(W, H, img);
}

/** Atlas 2 — floors/walls page (firstgid 513, 512 tiles, 384×768). */
function buildA5() {
  const W = 16 * TILE, H = 32 * TILE;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let local = 0; local < 512; local++) {
    const rnd = seeded(local + 9001);
    const t = new Tile();
    const row = Math.floor(local / 16);
    if (row < 16) paintFloor(t, rnd);            // floor pages
    else if (row < 24) paintWallCap(t);
    else paintWall(t, rnd);                     // wall pages
    blitInto(img, W, local, t);
  }
  return encodePng(W, H, img);
}

/** Atlas 3 — interiors page (firstgid 1025, 1424 tiles, 384×2136). */
function buildInteriors() {
  const W = 16 * TILE, H = 89 * TILE;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let local = 0; local < 1424; local++) {
    const rnd = seeded(local + 4242);
    const t = new Tile();
    const row = Math.floor(local / 16);
    if (row < 4) paintFloor(t, rnd);             // a few floor pieces up top
    else if (local % 3 === 0) paintRack(t, rnd);
    else paintFurniture(t, rnd);
    blitInto(img, W, local, t);
  }
  return encodePng(W, H, img);
}

// ── preview (the no-image-viewer iteration loop) ───────────────────────────
//   node tools/make-lab-tilesets.cjs --preview
// Renders one representative tile per painter class as ASCII: '#' dark, '.'
// mid, '+' light, 'B' arc-blue, 'G' gold, 'R' red/warm, '~' translucent.
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function asciiTile(t) {
  const rows = [];
  for (let y = 0; y <= MAX; y++) {
    let line = '';
    for (let x = 0; x <= MAX; x++) {
      const i = (y * TILE + x) * 4;
      const r = t.px[i], g = t.px[i + 1], b = t.px[i + 2], a = t.px[i + 3];
      if (a === 0) { line += ' '; continue; }
      if (a < 200) { line += '~'; continue; }
      const c = [r, g, b];
      if (b > r + 60 && b > 100) line += 'B';          // arc blue
      else if (r > 200 && g > 180 && b < 140) line += 'G';  // gold
      else if (r > g + 40 && r > b + 40) line += 'R';   // warm/red
      else {
        // steel ramp: bucket on luminance across the LAB's dark range (~14-90)
        const l = lum(c);
        if (l > 70) line += '+';
        else if (l > 52) line += '.';
        else if (l > 32) line += ':';
        else if (l > 18) line += '-';
        else line += '#';
      }
    }
    rows.push(line);
  }
  return rows;
}
function preview() {
  // seeds chosen so each wall variant actually shows: first roll selects the
  // variant (conduit <0.3, backlit <0.55, grille <0.8, plain else).
  const cases = [
    ['floor', (t) => paintFloor(t, seeded(2))],
    ['floor-hazard', (t) => paintFloorHazard(t)],
    ['wall (conduit)', (t) => paintWall(t, seeded(101))],      // 1st roll 0.10 → conduit
    ['wall (backlit)', (t) => paintWall(t, seeded(100))],      // 1st roll 0.44 → backlit
    ['wall (grille)', (t) => paintWall(t, seeded(103))],      // 1st roll 0.70 → grille
    ['wall-cap', (t) => paintWallCap(t)],
    ['furniture (bench)', (t) => paintFurniture(t, seeded(4))],
    ['furniture (console)', (t) => paintFurniture(t, seeded(6))],
    ['furniture (crate)', (t) => paintFurniture(t, seeded(11))],
    ['rack', (t) => paintRack(t, seeded(7))],
    ['monitor ON', (t) => paintScreen(t, true, seeded(9))],
    ['monitor OFF', (t) => paintScreen(t, false, seeded(9))],
    ['charger', (t) => paintCharger(t)],
    ['pylon', (t) => paintPylon(t)],
  ];
  for (const [name, paint] of cases) {
    const t = new Tile();
    paint(t);
    const rows = asciiTile(t);
    console.log(`── ${name} ──`);
    rows.forEach((r) => console.log('|' + r + '|'));
    console.log();
  }
}

// ── run ────────────────────────────────────────────────────────────────────
if (process.argv.includes('--preview')) {
  preview();
} else {
  const wrote = [];
  const emit = (name, buf) => {
    fs.writeFileSync(path.join(OUT, name), buf);
    wrote.push(`${name.padEnd(22)} ${(buf.length / 1024).toFixed(1)} KB`);
  };
  emit('lab-tileset.png', buildMain());
  emit('lab-a5.png', buildA5());
  emit('lab-interiors.png', buildInteriors());
  console.log(wrote.join('\n'));
}

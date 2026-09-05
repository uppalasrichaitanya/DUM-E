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
class Tile {
  constructor() { this.px = new Uint8ClampedArray(16 * 16 * 4); }
  set(x, y, c, a = 255) {
    if (x < 0 || x > 15 || y < 0 || y > 15) return;
    const i = (y * 16 + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = a;
  }
  fill(c) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) this.set(x, y, c); }
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
      const i = (y * 16 + x) * 4;
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
    const i = ((y + dy) * 16 + (x + dx)) * 4;
    if (y + dy < 0 || y + dy > 15 || x + dx < 0 || x + dx > 15) continue;
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

/** Steel floor plate (bible §1 §2 §4 §5 §9): base fill with texture noise,
 *  engraved panel inlay with an inverted (recessed) bevel + corner bolts,
 *  brushed streaks, dither at the inlay lip. QUIET under the agents. */
function paintFloor(t, rnd) {
  t.fill(STEEL[2]);
  noise(t, 0, 0, 15, 15, rnd, 4);                                  // §9 grain
  // brushed streaks: 1px horizontal runs, sparse, never rows
  for (let i = 0; i < 4; i++) {
    const y = 2 + Math.floor(rnd() * 12);
    const x0 = Math.floor(rnd() * 8), x1 = x0 + 4 + Math.floor(rnd() * 6);
    t.hline(y, x0, Math.min(15, x1), STEEL[3]);
  }
  // engraved panel inlay (most tiles; some plain for variety)
  if (rnd() < 0.7) {
    t.rect(2, 2, 13, 13, STEEL[3]);               // inset wall of the engraving
    t.rect(3, 3, 12, 12, STEEL[4]);               // engraving floor — core shadow deep
    noise(t, 3, 3, 12, 12, rnd, 3);
    bevel(t, 3, 3, 12, 12, STEEL, true);           // §5 recessed bevel
    ditherBand(t, 2, 3, 12, STEEL[2], STEEL[3]);   // §4 lip transition
    for (const [bx, by] of [[4, 4], [11, 4], [4, 11], [11, 11]]) t.set(bx, by, STEEL[3]);  // bolts
  }
  t.hline(15, 0, 15, STEEL[3]); t.vline(15, 0, 15, STEEL[3]);     // plate seams
  t.hline(0, 0, 15, STEEL[1]);                                     // top catch-light
  t.vline(0, 0, 15, STEEL[1]);                                     // left catch-light (key side)
}

/** Hazard-trim floor: doorway/transitional plates — chevrons at the edges. */
function paintFloorHazard(t) {
  t.fill(FLOOR_D);
  for (let i = 0; i < 16; i += 4) {
    for (let k = 0; k < 4 && i + k < 16; k++) {
      t.set(i + k, k % 2 === 0 ? 0 : 15, HAZARD);
      t.set(i + k, k % 2 === 0 ? 15 : 0, HAZARD);
    }
  }
  t.rect(2, 2, 13, 13, FLOOR);
}

/** Lab wall (bible §1 §2 §5 §6 §9): texture-noised panels with horizontal
 *  seams; three seeded infrastructure variants — conduit run, backlit strip
 *  (emissive + halo), vent grille. Emissive budget: ≤1 zone per wall tile.
 *  Variant rolls are taken FIRST so preview seeds stay stable regardless of
 *  how many rolls the noise pass consumes. */
function paintWall(t, rnd) {
  const v = rnd();                                                  // variant selector (stable)
  const cy = 2 + Math.floor(rnd() * 2);                             // conduit height
  const sy = 11 + Math.floor(rnd() * 2);                            // backlit height
  const rx = 3 + Math.floor(rnd() * 10);                            // rivet column
  t.fill(WALLR[2]);
  noise(t, 0, 0, 15, 15, rnd, 4);                                  // §9 grain
  t.hline(0, 0, 15, WALLR[1]);                                      // top catch-light
  t.hline(14, 0, 15, WALLR[3]); t.hline(15, 0, 15, WALLR[4]);      // base shadow
  // horizontal panel seams with a bevel edge (bump above, shadow below)
  t.hline(5, 0, 15, WALLR[1]);
  t.hline(6, 0, 15, WALLR[3]);
  t.hline(10, 0, 15, WALLR[1]);
  t.hline(11, 0, 15, WALLR[3]);
  if (v < 0.3) {
    // conduit run: shadowed cable with U-clamp brackets, key-side rim light
    t.hline(cy, 0, 15, [16, 20, 30]);
    t.hline(cy + 1, 0, 15, [11, 14, 22]);
    for (const bx of [2, 9]) {
      t.set(bx, cy - 1, WALLR[1]); t.set(bx, cy + 2, WALLR[3]);    // bracket + rim
      t.set(bx, cy, WALLR[1]);                                     // clamp highlight
    }
  } else if (v < 0.55) {
    // backlit strip (emissive §6): Stark-blue line + 1px halo row beneath
    t.hline(sy, 1, 14, ACCENT);
    t.hline(sy + 1, 1, 14, [28, 60, 110]);                         // halo dim row
    t.hline(sy - 1, 1, 14, WALLR[1]);                              // rim above
  } else if (v < 0.8) {
    // vent grille: recessed bevel + louvered slats
    t.rect(4, 6, 11, 11, WALLR[4]);
    bevel(t, 4, 6, 11, 11, WALLR, true);
    for (let y = 8; y <= 10; y += 2) t.hline(y, 5, 10, WALLR[3]);
    t.hline(7, 5, 10, WALLR[1]);
  }
  // occasional rivet column for panel texture (deterministic: ~1 in 3 tiles)
  if (rx % 3 === 0) t.vline(rx, 2, 12, WALLR[3]);
}

/** Wall-top cap (bible §5 §7): the ledge where wall meets floor — a full
 *  raised bevel (light top-left, dark bottom-right) + ambient bounce. */
function paintWallCap(t) {
  t.fill(WALLR[2]);
  noise(t, 0, 0, 15, 15, seeded(4242), 4);
  bevel(t, 0, 0, 15, 15, WALLR);
  bounce(t, 0, 15, 15, WALLR);                                     // §7 floor bounce
}

/** Workbench/furniture (bible §2 §5 §9). Seeded kinds, all on the FURN ramp
 *  except cabinets/crates which use the PAINT ramp — material contrast.
 *  Every face gets a raised bevel; large faces get noise. */
function paintFurniture(t, rnd) {
  const pad = 1 + Math.floor(rnd() * 2);
  const kind = rnd();
  const rp = (kind >= 0.6 && kind < 0.8) ? PAINTR : FURNR;          // cabinet = painted
  t.rect(pad, 2, 15 - pad, 14, rp[2]);
  noise(t, pad, 2, 15 - pad, 14, rnd, 4);
  bevel(t, pad, 2, 15 - pad, 14, rp);                                // §5 raised face
  if (kind < 0.35) {
    // workbench: surface lip + scorch marks near a corner + one status LED
    t.hline(5, pad + 1, 14 - pad, rp[3]);
    const sx = 4 + Math.floor(rnd() * 6);
    t.set(sx, 7, [70, 62, 58]); t.set(sx + 1, 7, [58, 52, 48]); t.set(sx, 8, [58, 52, 48]);
    t.set(13 - pad, 12, ACCENT);
    halo(t, 13 - pad, 12, ACCENT, rp);                              // §6 LED halo
  } else if (kind < 0.6) {
    // instrument console: recessed readout well + 1px multi-hue readouts
    t.rect(pad + 2, 6, 13 - pad, 12, rp[4]);
    bevel(t, pad + 2, 6, 13 - pad, 12, rp, true);
    for (const [ry, hue] of [[8, ACCENT], [11, GOLD]]) {
      const w = 3 + Math.floor(rnd() * 6);
      t.hline(ry, pad + 3, pad + 2 + w, hue);
    }
    t.set(pad + 3, 7, rp[0]);                                        // well specular
  } else if (kind < 0.8) {
    // tool cabinet: painted metal, drawer handle notches
    for (const hx of [pad + 3, pad + 8]) { t.vline(hx, 7, 12, rp[3]); t.set(hx, 7, rp[1]); }
    t.hline(13, pad + 2, 13 - pad, rp[3]);
  } else {
    // crate: painted cross-straps + hazard corner
    t.hline(8, pad + 1, 14 - pad, rp[3]);
    t.vline(pad + 5, 5, 13, rp[3]);
    t.set(pad + 2, 12, HAZARD);
  }
  bounce(t, pad + 1, 15 - pad, 14, rp);                              // §7 underside
}

/** Server rack (bible §2 §5 §6 §9): beveled frame, noised face, bay rails
 *  with paired activity LEDs (halos), fan-grille column, floor bounce. */
function paintRack(t, rnd) {
  t.rect(3, 1, 12, 14, FURNR[3]);
  noise(t, 3, 1, 12, 14, rnd, 4);
  bevel(t, 3, 1, 12, 14, FURNR);
  t.rect(4, 2, 11, 3, FURNR[2]);                    // header plate
  t.hline(2, 4, 11, FURNR[1]);                      // header sheen
  for (let y = 4; y <= 13; y += 3) {
    t.hline(y, 4, 11, FURNR[2]);
    t.hline(y + 1, 4, 11, FURNR[4]);
    const hot = rnd() < 0.5;
    const led = hot ? ACCENT : [40, 50, 66];
    t.set(5, y + 1, led);
    halo(t, 5, y + 1, led, FURNR);                 // §6 LED halo (active bays only)
    t.set(10, y + 1, hot ? GOLD : ACCENT);          // paired contrast LED, no halo (budget)
  }
  for (let y = 5; y <= 13; y += 2) t.set(12, y, FURNR[2]);       // fan grille column
  bounce(t, 4, 11, 14, FURNR);                      // §7 underside
}

/** Monitor — THE hero tiles (Phase 3). Two-tier beveled bezel (§5), diagonal
 *  reflection streak, seeded code-lines with syntax hue variety (§6 screen
 *  content), glow spill onto the bezel's bottom edge, stand + shadow + bounce.
 *  OFF: near-black + one dim standby LED (budget 1 emissive). */
function paintScreen(t, on, rnd) {
  // outer bezel — raised bevel, noised face
  t.rect(1, 2, 14, 12, FURNR[2]);
  noise(t, 1, 2, 14, 12, rnd, 3);
  bevel(t, 1, 2, 14, 12, FURNR);
  // screen well — recessed (inverted bevel), dark navy
  t.rect(2, 3, 13, 11, SCREEN_OFF);
  bevel(t, 2, 3, 13, 11, FURNR, true);
  if (on) {
    const CODE = [88, 178, 255];        // cyan statements
    const CODE2 = [244, 211, 94];       // gold keywords (syntax variety)
    const CODE3 = [178, 208, 235];       // pale comments
    // code lines: 1px rows, varying indent/width, seeded; blank rows breathe
    for (let y = 4; y <= 10; y++) {
      if (rnd() < 0.25) continue;
      const indent = 3 + Math.floor(rnd() * 2);
      const w = 2 + Math.floor(rnd() * 7);
      const roll = rnd();
      const hue = roll < 0.2 ? CODE2 : (roll < 0.32 ? CODE3 : CODE);
      t.hline(y, indent, Math.min(13, indent + w), hue);
    }
    // diagonal reflection streak (§8 gloss): upper-left to mid, translucent
    for (let i = 0; i < 5; i++) {
      t.set(3 + i, 3 + i, [190, 220, 245], 120);
      t.set(4 + i, 3 + i, [190, 220, 245], 90);
    }
    t.hline(3, 2, 13, [140, 205, 255]);              // top scanline sheen
    t.hline(11, 3, 12, [40, 80, 140]);              // glow spill onto bezel (§6)
    t.set(13, 3, ACCENT);                            // power corner-dot
    halo(t, 13, 3, ACCENT, FURNR);                   // its 1px halo
  } else {
    t.hline(6, 3, 12, [20, 25, 38]);
    t.set(3, 11, [64, 84, 64]);                      // dim standby LED — no halo (off)
  }
  // stand: neck + foot + ground shadow + bounce
  t.rect(6, 13, 9, 13, FURNR[3]);
  t.rect(5, 14, 10, 14, FURNR[2]);
  t.hline(14, 5, 10, FURNR[3]);
  bounce(t, 5, 10, 14, FURNR);
}

/** Charging station (Phase 3 signature): arc-ring pad — segmented glowing
 *  ring (each segment earns a halo), gold charge pips with a core specular,
 *  docked-device port notch, floor bounce. */
function paintCharger(t) {
  t.rect(2, 1, 13, 14, FURNR[2]);
  noise(t, 2, 1, 13, 14, seeded(77), 4);
  bevel(t, 2, 1, 13, 14, FURNR);
  t.rect(3, 2, 12, 6, FURNR[4]);                     // dark dock well (recessed)
  bevel(t, 3, 2, 12, 6, FURNR, true);
  // arc ring: 4 segments with gaps (energy ring, not a box); two halos = budget
  const R = ACCENT;
  t.hline(3, 5, 7, R); t.hline(3, 9, 11, R);
  t.hline(6, 5, 6, R); t.hline(6, 10, 11, R);
  t.vline(5, 4, 5, R); t.vline(5, 10, 11, R);
  t.vline(6, 4, 5, R); t.vline(6, 10, 11, R);
  halo(t, 5, 3, R, FURNR); halo(t, 11, 3, R, FURNR);  // two halos = the budget
  // charge pips: gold with a specular core pixel (§8)
  t.set(7, 5, GOLDR[1]); t.set(8, 5, GOLDR[1]); t.set(7, 6, GOLDR[1]);
  t.set(8, 5, GOLDR[0]);                            // the ONE specular
  for (const x of [4, 8, 12]) t.set(x, 9, GOLDR[2]);
  // port notch bottom-center (recessed)
  t.rect(7, 11, 9, 12, FURNR[4]);
  bevel(t, 7, 11, 9, 12, FURNR, true);
  t.hline(13, 3, 12, FURNR[3]);
  bounce(t, 3, 12, 14, FURNR);
}

/** Holo-pylon (Phase 3 signature): dark mast, floating hologram cube with a
 *  chromatic fringe (1px cyan offset + 1px pink — echoes LYLA), brighter
 *  core, base light spill, floor bounce. The hologram is the emissive zone. */
function paintPylon(t) {
  t.rect(5, 6, 10, 14, FURNR[3]);
  noise(t, 5, 6, 10, 14, seeded(88), 4);
  t.vline(5, 6, 14, FURNR[4]);
  t.rect(4, 3, 11, 5, FURNR[2]);                     // emitter head
  bevel(t, 4, 3, 11, 5, FURNR);
  t.hline(4, 5, 10, ACCENT);                          // emitter line
  t.set(7, 4, GOLD); t.set(8, 4, GOLD);
  // hologram cube: 3 concentric translucent golds + chromatic fringe
  t.rect(6, 8, 10, 12, [244, 211, 94], 90);
  t.rect(7, 9, 9, 11, [244, 211, 94], 150);
  t.set(8, 10, [255, 244, 180], 235);                 // bright core
  t.vline(6, 9, 12, [120, 220, 255], 110);            // cyan fringe (left)
  t.vline(10, 8, 11, [255, 150, 220], 80);           // pink fringe (right)
  t.hline(7, 7, 9, [120, 220, 255], 70);             // cyan fringe (top)
  // base light spill + bounce
  t.hline(7, 5, 10, [50, 46, 30], 255);
  bounce(t, 5, 10, 14, FURNR);
  t.rect(6, 15, 9, 15, FURNR[4]);                    // base shadow
}

// ── atlas assemblers ─────────────────────────────────────────────────────────
/** Atlas 1 — the main floor/furniture page (firstgid 1, 512 tiles, 256×512). */
function buildMain() {
  const W = 256, H = 512;
  const img = new Uint8ClampedArray(W * H * 4);
  const blit = (idx, painter, arg) => {
    const t = new Tile();
    painter(t, arg);
    const col = idx % 16, row = Math.floor(idx / 16);
    const ox = col * 16, oy = row * 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const o = ((oy + y) * W + ox + x) * 4;
        img[o] = t.px[i]; img[o + 1] = t.px[i + 1]; img[o + 2] = t.px[i + 2]; img[o + 3] = t.px[i + 3];
      }
    }
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

/** Atlas 2 — floors/walls page (firstgid 513, 512 tiles, 256×512). */
function buildA5() {
  const W = 256, H = 512;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let local = 0; local < 512; local++) {
    const rnd = seeded(local + 9001);
    const t = new Tile();
    const row = Math.floor(local / 16);
    if (row < 16) paintFloor(t, rnd);            // floor pages
    else if (row < 24) paintWallCap(t);
    else paintWall(t, rnd);                     // wall pages
    const col = local % 16;
    const ox = col * 16, oy = row * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const o = ((oy + y) * W + ox + x) * 4;
      img[o] = t.px[i]; img[o + 1] = t.px[i + 1]; img[o + 2] = t.px[i + 2]; img[o + 3] = t.px[i + 3];
    }
  }
  return encodePng(W, H, img);
}

/** Atlas 3 — interiors page (firstgid 1025, 1424 tiles, 256×1424). */
function buildInteriors() {
  const W = 256, H = 1424;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let local = 0; local < 1424; local++) {
    const rnd = seeded(local + 4242);
    const t = new Tile();
    const row = Math.floor(local / 16);
    if (row < 4) paintFloor(t, rnd);             // a few floor pieces up top
    else if (local % 3 === 0) paintRack(t, rnd);
    else paintFurniture(t, rnd);
    const col = local % 16;
    const ox = col * 16, oy = row * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const o = ((oy + y) * W + ox + x) * 4;
      img[o] = t.px[i]; img[o + 1] = t.px[i + 1]; img[o + 2] = t.px[i + 2]; img[o + 3] = t.px[i + 3];
    }
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
  for (let y = 0; y < 16; y++) {
    let line = '';
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
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

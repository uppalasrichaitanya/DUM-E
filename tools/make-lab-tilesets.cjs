'use strict';
/**
 * Lab tileset generator — paints DUM-E's placeholder-lab atlases.
 *
 * THE ORIGINALS ARE GONE: the office floor's atlases were LimeZu "Modern
 * Interiors" free-version art (non-commercial license). This tool paints
 * original replacement atlases with the SAME grid layout (16×16 tiles, same
 * atlas dimensions, same gid space) so the existing Tiled maps render without
 * re-authoring: floors become metal plates, walls become lab panels, furniture
 * becomes racks/workbenches, monitors keep their exact gid slots (the theme's
 * monitor config points at them).
 *
 * Coherence comes from one palette + seeded variation, not from imitating the
 * originals (which we never redistribute or derive from). When the team's
 * artist ships a real lab tileset, swap the PNGs and delete this tool.
 *
 *   node tools/make-lab-tilesets.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src/renderer/src/assets/tilesets');
fs.mkdirSync(OUT, { recursive: true });

// ── lab palette ─────────────────────────────────────────────────────────────
const FLOOR   = [46, 60, 80];    // steel plate (raised — was too dark to read)
const FLOOR_D = [30, 39, 54];    // seam / darker plate
const FLOOR_H = [62, 78, 102];   // plate highlight
const INLAY   = [36, 46, 62];    // engraved panel inset (darker than seam)
const WALL    = [34, 42, 58];    // panel wall
const WALL_D  = [24, 30, 42];
const WALL_H  = [50, 61, 84];
const FURN    = [58, 66, 82];    // furniture metal
const FURN_D  = [40, 46, 60];
const FURN_H  = [76, 86, 104];
const SCREEN_OFF = [12, 15, 24];
const SCREEN_ON  = [88, 178, 255];
const ACCENT  = [64, 140, 255];  // arc-reactor blue
const GOLD    = [244, 211, 94];
const HAZARD  = [212, 160, 52];  // caution yellow, sparingly

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

// ── tile painters by semantic class ────────────────────────────────────────
// Art direction: Tony's workshop at a glance — brushed steel underfoot that
// RECEDES (agents walk on it), walls that carry lab infrastructure (conduit,
// backlit strips, grilles), equipment that reads as equipment (benches,
// consoles, crates, racks), monitors that show CODE (the agents' desk screens
// are the hero tiles), and two signature pieces (arc-ring charger, holo
// pylon). Steel stays quiet; emissives are rationed (≤2 accents per tile).

/** Steel floor plate: brushed streaks + engraved panel inlay with corner
 *  bolts. The inlay's inset shadow + 4 bolts make big floor areas read as
 *  machined plates, not flat noise — while staying QUIET under the agents. */
function paintFloor(t, rnd) {
  t.fill(FLOOR);
  // brushed streaks: 1px horizontal runs, sparse (3-4 per tile), never rows
  for (let i = 0; i < 4; i++) {
    const y = 2 + Math.floor(rnd() * 12);
    const x0 = Math.floor(rnd() * 8), x1 = x0 + 4 + Math.floor(rnd() * 6);
    t.hline(y, x0, Math.min(15, x1), FLOOR_D);
  }
  // engraved panel inlay (only on most tiles — some stay plain for variety)
  if (rnd() < 0.7) {
    t.rect(2, 2, 13, 13, INLAY);                  // the inset itself — darker
    t.rect(3, 3, 12, 12, FLOOR_D);               // inlay floor (slightly up)
    t.hline(2, 2, 13, FLOOR_H);                 // inlay top catch-light
    t.hline(13, 2, 13, [24, 31, 43]);           // inlay bottom shadow
    for (const [bx, by] of [[3, 3], [12, 3], [3, 12], [12, 12]]) t.set(bx, by, FLOOR_D);  // bolts
  }
  t.hline(15, 0, 15, FLOOR_D); t.vline(15, 0, 15, FLOOR_D);   // plate seams
  t.hline(0, 0, 15, FLOOR_H);
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

/** Lab wall: horizontal brushed panels + infrastructure per seed. Variants:
 *  conduit run (shadowed cable + brackets), backlit strip (a Stark-blue
 *  emissive line — lab lighting), or vent grille. Seams align vertically. */
function paintWall(t, rnd) {
  t.fill(WALL);
  t.hline(0, 0, 15, WALL_H);
  t.hline(14, 0, 15, WALL_D); t.hline(15, 0, 15, WALL_D);
  // horizontal panel seams (2 rows) — walls read as brushed sheets
  t.hline(5, 0, 15, WALL_D);
  t.hline(10, 0, 15, WALL_D);
  t.hline(6, 0, 15, WALL_H);
  t.hline(11, 0, 15, WALL_H);
  const v = rnd();
  if (v < 0.3) {
    // conduit run: dark cable crossing at bracket height with U-clamps
    const cy = 2 + Math.floor(rnd() * 2);
    t.hline(cy, 0, 15, [20, 25, 36]);
    t.hline(cy + 1, 0, 15, [14, 18, 27]);
    for (const bx of [2, 9]) { t.set(bx, cy - 1, WALL_H); t.set(bx, cy + 2, WALL_D); }  // brackets
  } else if (v < 0.55) {
    // backlit strip: emissive lab lighting line, low on the wall
    const sy = 11 + Math.floor(rnd() * 2);
    t.hline(sy, 1, 14, ACCENT);
    t.hline(sy + 1, 1, 14, [16, 35, 80]);
  } else if (v < 0.8) {
    // vent grille: louvered rectangle
    t.rect(4, 6, 11, 11, WALL_D);
    for (let y = 7; y <= 10; y += 2) t.hline(y, 5, 10, WALL);
    t.hline(6, 5, 10, WALL_H);
  }
  // occasional rivet column for panel texture
  if (rnd() < 0.4) { const rx = 3 + Math.floor(rnd() * 10); t.vline(rx, 2, 12, WALL_D); }
}

/** Wall-top cap: the ledge where wall meets floor — highlight edge + lip. */
function paintWallCap(t) {
  t.fill(WALL);
  t.hline(0, 0, 15, WALL_H);
  t.hline(1, 0, 15, WALL_H);
  t.hline(15, 0, 15, WALL_D);
  t.hline(14, 0, 15, WALL_D);
}

/** Workbench/furniture (transparent bg). Variants by seed: workbench (edge
 *  lip + scorch marks), instrument console (tiny multi-color readouts),
 *  tool cabinet (handle notches), or crate (cross-straps). */
function paintFurniture(t, rnd) {
  const pad = 1 + Math.floor(rnd() * 2);
  const kind = rnd();
  t.rect(pad, 2, 15 - pad, 14, FURN);
  t.rect(pad, 2, 15 - pad, 4, FURN_H);                          // top edge
  if (kind < 0.35) {
    // workbench: surface lip + scorch marks near a corner
    t.hline(5, pad + 1, 14 - pad, FURN_D);
    const sx = 4 + Math.floor(rnd() * 6);
    t.set(sx, 7, [70, 62, 58]); t.set(sx + 1, 7, [58, 52, 48]); t.set(sx, 8, [58, 52, 48]);
    t.set(13 - pad, 12, ACCENT);
  } else if (kind < 0.6) {
    // instrument console: 1px readout bars (two rows, seeded widths + hues)
    t.hline(6, pad + 2, 13 - pad, FURN_D);
    for (const [ry, hue] of [[8, ACCENT], [11, GOLD]]) {
      const w = 3 + Math.floor(rnd() * 6);
      t.hline(ry, pad + 2, pad + 1 + w, hue);
    }
  } else if (kind < 0.8) {
    // tool cabinet: vertical handle notches
    for (const hx of [pad + 3, pad + 8]) { t.vline(hx, 7, 12, FURN_D); t.set(hx, 7, FURN_H); }
    t.hline(13, pad + 2, 13 - pad, FURN_D);
  } else {
    // crate: cross-straps
    t.hline(8, pad + 1, 14 - pad, FURN_D);
    t.vline(pad + 5, 5, 13, FURN_D);
    t.set(pad + 2, 12, HAZARD);
  }
  t.hline(14, pad + 1, 15 - pad, FURN_D);
}

/** Server rack: bay rails + per-bay dual LEDs (blue/gold alternating via
 *  seed) + a fan-grille dot column. The lab's background muscle. */
function paintRack(t, rnd) {
  t.rect(3, 1, 12, 14, FURN_D);
  t.rect(3, 1, 12, 3, FURN);
  for (let y = 4; y <= 13; y += 3) {
    t.hline(y, 4, 11, FURN);
    t.hline(y + 1, 4, 11, FURN_D);
    const hot = rnd() < 0.5;
    t.set(5, y + 1, hot ? ACCENT : [40, 50, 66]);               // activity LED
    t.set(10, y + 1, hot ? GOLD : ACCENT);                      // paired LED (contrast)
  }
  for (let y = 5; y <= 13; y += 2) t.set(12, y, FURN);          // fan grille column
  t.vline(3, 1, 14, [28, 34, 46]);
}

/** Monitor — the hero tiles (the theme's monitor gids point here; agents'
 *  desk screens). ON: dark-navy screen with SEEDED cyan code-lines of
 *  varying width (like 1px lines of code), a brighter scanline sheen on the
 *  top row, small stand + bezel shadow. OFF: near-black + one dim standby
 *  LED so an off screen still reads as a screen. */
function paintScreen(t, on, rnd) {
  t.rect(1, 2, 14, 12, FURN_D);          // bezel
  t.rect(2, 3, 13, 11, SCREEN_OFF);      // screen base (dark navy)
  if (on) {
    const CODE = [88, 178, 255];
    const CODE2 = [244, 211, 94];
    // code lines: 1px rows of varying width, seeded — indented like source
    for (let y = 4; y <= 10; y++) {
      if (rnd() < 0.25) continue;                        // blank rows breathe
      const indent = 3 + Math.floor(rnd() * 2);
      const w = 2 + Math.floor(rnd() * 7);
      t.hline(y, indent, Math.min(13, indent + w), rnd() < 0.2 ? CODE2 : CODE);
    }
    t.hline(3, 2, 13, [140, 205, 255]);                 // top scanline sheen
    t.set(13, 3, ACCENT);                                // power corner-dot
  } else {
    t.hline(6, 3, 12, [20, 25, 38]);
    t.set(3, 11, [64, 84, 64]);                          // dim standby LED
  }
  t.rect(6, 13, 9, 14, FURN_D);          // stand
  t.hline(14, 5, 10, FURN_D);            // stand shadow
}

/** Charging station (coffee-machine stand-in): arc-ring pad — a glowing
 *  segmented ring around a dark dock, gold charge pips. The cafe's centrepiece. */
function paintCharger(t) {
  t.rect(2, 1, 13, 14, FURN);
  t.rect(3, 2, 12, 6, FURN_D);
  // arc ring: 4 segments with gaps — reads as an energy ring, not a box
  const R = ACCENT;
  t.hline(3, 5, 7, R); t.hline(3, 9, 11, R);                 // top arc
  t.hline(6, 5, 6, R); t.hline(6, 10, 11, R);                 // bottom arc
  t.vline(5, 4, 5, R); t.vline(5, 10, 11, R);                 // left arc
  t.vline(6, 4, 5, R); t.vline(6, 10, 11, R);                 // right arc
  t.set(7, 5, GOLD); t.set(8, 5, GOLD); t.set(7, 6, GOLD);    // charge pips (core)
  for (const x of [4, 8, 12]) t.set(x, 9, GOLD);
  t.hline(13, 3, 12, FURN_D);
}

/** Holo-pylon (plant stand-in): dark mast + a floating 3-step hologram cube
 *  in translucent gold — the lab's answer to the office fern. */
function paintPylon(t) {
  t.rect(5, 6, 10, 14, FURN_D);
  t.vline(5, 6, 14, [28, 34, 46]);
  t.rect(4, 3, 11, 5, FURN);
  t.hline(4, 5, 10, ACCENT);
  t.set(7, 4, GOLD); t.set(8, 4, GOLD);
  // floating hologram cube: 3 concentric squares, outermost translucent
  t.rect(6, 8, 10, 12, [244, 211, 94], 90);
  t.rect(7, 9, 9, 11, [244, 211, 94], 150);
  t.set(8, 10, [255, 244, 180], 220);
  t.rect(6, 15, 9, 15, FURN_D);          // base shadow
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

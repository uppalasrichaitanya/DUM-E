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
const FLOOR   = [40, 52, 70];    // steel plate
const FLOOR_D = [30, 39, 54];    // seam / darker plate
const FLOOR_H = [54, 68, 90];    // plate highlight
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
  rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  hline(y, x0, x1, c) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
}

// Deterministic per-gid variation so tiles are stable across regenerations.
function seeded(seed) {
  let s = seed * 2654435761 % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

// ── tile painters by semantic class ────────────────────────────────────────
/** Steel floor plate: subtle rivets + plate seam on the light side. */
function paintFloor(t, rnd) {
  t.fill(FLOOR);
  t.hline(15, 0, 15, FLOOR_D); t.vline(15, 0, 15, FLOOR_D);   // plate seams
  t.hline(0, 0, 15, FLOOR_H);
  for (const [rx, ry] of [[3, 3], [12, 4], [5, 11], [11, 12]]) {
    t.set(rx, ry, FLOOR_D);                                     // rivets
  }
  if (rnd() < 0.3) t.rect(6, 6, 9, 9, FLOOR_H);                 // worn patch
}

/** Hazard-trim floor: for doorway/transitional plates. */
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

/** Lab wall panel: dark panel with a top highlight and vertical seams. */
function paintWall(t, rnd) {
  t.fill(WALL);
  t.hline(0, 0, 15, WALL_H);
  t.hline(14, 0, 15, WALL_D); t.hline(15, 0, 15, WALL_D);
  const seam = 4 + Math.floor(rnd() * 8);
  t.vline(seam, 1, 13, WALL_D);
  t.vline((seam + 8) % 16, 1, 13, WALL_D);
  if (rnd() < 0.25) { t.rect(6, 5, 9, 7, WALL_D); t.set(7, 6, ACCENT); }  // status light
}

/** Wall-top cap: the ledge where wall meets floor. */
function paintWallCap(t) {
  t.fill(WALL);
  t.hline(0, 0, 15, WALL_H);
  t.hline(1, 0, 15, WALL_H);
  t.hline(15, 0, 15, WALL_D);
}

/** Workbench/furniture block (transparent bg): a rack box with vents + LED. */
function paintFurniture(t, rnd) {
  const pad = 1 + Math.floor(rnd() * 2);
  t.rect(pad, 2, 15 - pad, 14, FURN);
  t.rect(pad, 2, 15 - pad, 4, FURN_H);                          // top edge
  for (let y = 6; y <= 12; y += 2) t.hline(y, pad + 2, 13 - pad, FURN_D);  // vents
  t.set(13 - pad, 13, ACCENT);                                   // status LED
  t.hline(14, pad + 1, 15 - pad, FURN_D);
}

/** Server rack (tall furniture look): bays + blinking LEDs. */
function paintRack(t, rnd) {
  t.rect(3, 1, 12, 14, FURN_D);
  t.rect(3, 1, 12, 3, FURN);
  for (let y = 4; y <= 13; y += 3) {
    t.hline(y, 4, 11, FURN);
    t.set(5, y + 1, rnd() < 0.5 ? ACCENT : GOLD);                // bay LEDs
  }
  t.vline(3, 1, 14, [28, 34, 46]);
}

/** Monitor tile — the theme's monitor gids point here, so on/off matters:
 *  `on` gets the arc-blue glow, `off` a dark screen. */
function paintScreen(t, on) {
  t.rect(1, 2, 14, 12, FURN_D);          // bezel
  t.rect(2, 3, 13, 11, on ? SCREEN_ON : SCREEN_OFF);
  if (on) {
    t.hline(4, 3, 12, [140, 205, 255]);  // scanline sheen
    t.set(4, 5, [180, 220, 255]);
  } else {
    t.hline(4, 3, 12, [20, 25, 38]);
  }
  t.rect(6, 13, 9, 14, FURN_D);          // stand
  t.hline(14, 5, 10, FURN_D);
}

/** Coffee machine stand-in: charging station. */
function paintCharger(t) {
  t.rect(2, 1, 13, 14, FURN);
  t.rect(3, 2, 12, 6, FURN_D);
  t.rect(4, 3, 11, 5, ACCENT);
  for (const x of [4, 8, 12]) t.set(x, 9, GOLD);
  t.hline(13, 3, 12, FURN_D);
}

/** Plant stand-in: server pylon with a glowing top bar. */
function paintPylon(t) {
  t.rect(5, 6, 10, 14, FURN_D);
  t.vline(5, 6, 14, [28, 34, 46]);
  t.rect(4, 3, 11, 5, FURN);
  t.hline(4, 5, 10, ACCENT);
  t.set(7, 4, GOLD); t.set(8, 4, GOLD);
  t.rect(6, 15, 9, 15, FURN_D);
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
    else if (SCREEN_SET.has(local)) blit(local, (t) => paintScreen(t, SCREEN_SET.get(local) === 'on'));
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

// ── run ────────────────────────────────────────────────────────────────────
const wrote = [];
const emit = (name, buf) => {
  fs.writeFileSync(path.join(OUT, name), buf);
  wrote.push(`${name.padEnd(22)} ${(buf.length / 1024).toFixed(1)} KB`);
};
emit('lab-tileset.png', buildMain());
emit('lab-a5.png', buildA5());
emit('lab-interiors.png', buildInteriors());
console.log(wrote.join('\n'));

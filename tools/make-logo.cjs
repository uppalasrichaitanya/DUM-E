'use strict';
/**
 * DUM-E brand mark — the arm that saved Tony, presenting the fire extinguisher.
 *
 * THE SVG IS THE SOURCE OF TRUTH. Every raster is generated from the same
 * geometry, never traced back from a PNG. Adapted from the upstream mark
 * pipeline: same run-merged <rect>
 * approach, same rasteriser — new sprite, new palette.
 *
 * TWO-TIER ICON SYSTEM (real icon sets do this — one pose cannot read at
 * 16px AND at 1024px):
 *   FULL    — the articulated arm in its diagonal "reaching up to help"
 *             pose, fire extinguisher held high in the claw. Used ≥48px.
 *   COMPACT — the extinguisher clasped by two claw fingers, zoomed tight.
 *             Used at 16/32px where the full pose would smear.
 *
 * Writes, from one source:
 *   src/renderer/src/brand/logo.svg    source of truth (full mark, ink border)
 *   src/renderer/src/brand/logo.png   512 — in-app favicon + splash
 *   build/icon.svg / icon.png / icon.ico  + build/icon.iconset/ (10 pngs;
 *     macOS .icns: iconutil -c icns build/icon.iconset -o build/icon.icns)
 *
 *   node tools/make-logo.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const BRAND = path.join(ROOT, 'src/renderer/src/brand');
fs.mkdirSync(BRAND, { recursive: true });

// ── palette ───────────────────────────────────────────────────────────────
const GROUND = [38, 111, 214];   // #266FD6 — arc-reactor blue tile
const GOLD   = [244, 211, 94];   // #F4D35E — DUM-E gold accent (joints, bands)
const WHITE  = [250, 248, 244];  // glints
const INK    = [26, 19, 32];     // #1A1320 — the arm's silhouette
const EXT    = [214, 69, 65];    // #D64541 — extinguisher red
const EXT_D  = [150, 45, 42];   // extinguisher base cap

const BORDERS = { ink: [26, 19, 32], warm: [12, 56, 122] };

// Tile geometry — square rounded tile with a thick ink border (same family
// as every DUM-E surface: hard edge, no gradient).
const R_RADIUS = 144 / 800;
const R_STROKE = 26 / 800;
const FRAMES = { mark: 0, icon: 0 };

// ── sprites ────────────────────────────────────────────────────────────────
/** One rect per contiguous horizontal run: [x, y, len, color] — later runs
 *  overwrite earlier ones, so accents (pins, bands, glints) paint on top of
 *  the body runs listed before them. */

// FULL — 21×28 grid. Composition, bottom-left → top-right: base block →
// upper-arm staircase → elbow (gold pin) → forearm staircase → vertical claw
// with gold wrist pin → top hook reaching right → the extinguisher (red
// cylinder, gold band, ink handle) clasped high.
const FULL_RUNS = [
  // fire extinguisher (cols 17-19, the prize held high)
  [17, 1, 2, INK],            // top handle
  [17, 2, 2, INK],
  [17, 3, 3, EXT],            // body
  [17, 4, 3, EXT],
  [17, 5, 3, EXT],
  [17, 6, 3, GOLD],           // the gold band every extinguisher has
  [17, 7, 3, EXT],
  [17, 8, 3, EXT],
  [17, 9, 3, EXT],
  [17, 10, 3, EXT_D],         // base cap
  [17, 4, 1, WHITE],          // glint on the cylinder
  // claw: vertical block + top hook + under-finger clasping the extinguisher
  [12, 10, 3, INK],
  [12, 11, 3, INK],
  [12, 12, 3, INK],
  [12, 13, 3, INK],
  [12, 14, 3, INK],
  [12, 15, 3, INK],
  [13, 9, 4, INK],            // hook from above: reaches right, touches the cylinder
  [14, 10, 3, INK],           // under-finger: wraps the base cap from the side
  [13, 13, 1, GOLD],          // wrist pin
  // forearm: 45° staircase, 3px beam
  [11, 15, 3, INK],
  [10, 16, 3, INK],
  [9, 17, 3, INK],
  [8, 18, 3, INK],
  [11, 16, 1, WHITE],         // glint on the beam
  // elbow joint
  [6, 19, 3, INK],
  [6, 20, 3, INK],
  [6, 21, 3, INK],
  [7, 20, 1, GOLD],           // elbow pin
  // upper arm: staircase down-left
  [5, 21, 3, INK],
  [4, 22, 3, INK],
  [3, 23, 3, INK],
  [2, 24, 3, INK],
  // base block with rivets
  [1, 24, 6, INK],
  [1, 25, 6, INK],
  [1, 26, 6, INK],
  [1, 27, 6, INK],
  [2, 26, 1, GOLD],           // rivets
  [5, 26, 1, GOLD],
];

// COMPACT — 14×14 grid. The extinguisher PINCHED by the claw: the top fingers
// press into the cylinder's edges (overlapping them, a real grip), then
// release and the tips curl away — zoomed tight for the small sizes.
const COMPACT_RUNS = [
  [6, 0, 2, INK],             // handle
  [6, 1, 2, INK],
  [5, 2, 4, EXT],            // cylinder (chunky: 4px wide)
  [5, 3, 4, EXT],
  [5, 4, 4, EXT],
  [5, 5, 4, GOLD],           // band
  [5, 6, 4, EXT],
  [5, 7, 4, EXT],            // rows 7-8 are the pinch zone (fingers overlap)
  [5, 8, 4, EXT_D],          // base cap — resting in the open claw
  [5, 3, 1, WHITE],          // glint
  // the pinch: fingers press INTO the cylinder's side pixels (paint over)
  [4, 7, 2, INK], [8, 7, 2, INK],
  [4, 8, 2, INK], [8, 8, 2, INK],
  [3, 9, 2, INK], [9, 9, 2, INK],   // release — adjacent, no longer biting
  // tips curl away and down
  [2, 10, 2, INK], [10, 10, 2, INK],
  [2, 11, 2, INK], [10, 11, 2, INK],
  [2, 12, 2, INK], [10, 12, 2, INK],
  [6, 13, 2, GOLD],          // wrist pin below
];

function buildGrid(runs, gw, gh) {
  const cells = [];
  for (const [x, y, len, c] of runs) {
    for (let i = 0; i < len; i++) cells.push({ gx: x + i, gy: y, c });
  }
  const xs = cells.map((c) => c.gx), ys = cells.map((c) => c.gy);
  return {
    gw, gh, cells,
    x0: Math.min(...xs), x1: Math.max(...xs) + 1,
    y0: Math.min(...ys), y1: Math.max(...ys) + 1
  };
}

// ── layout ─────────────────────────────────────────────────────────────────
// Integer pixel scale (crisp!), then optical centering: horizontal geometric,
// vertical biased 1% up (icons read bottom-heavy if centered exactly).
function layout(N, grid, frame, fill, fit) {
  const margin = N * FRAMES[frame];
  const tile = { x: margin, y: margin, w: N - 2 * margin, h: N - 2 * margin };
  tile.r = tile.w * R_RADIUS;
  const stroke = tile.w * R_STROKE;
  const drawnW = grid.x1 - grid.x0, drawnH = grid.y1 - grid.y0;
  const byW = Math.round((tile.w * fill) / drawnW);
  const byH = Math.floor((tile.h * fit) / drawnH);
  const scale = Math.max(1, Math.min(byW, byH));
  return {
    tile, stroke, scale,
    ox: Math.round(tile.x + (tile.w - drawnW * scale) / 2 - grid.x0 * scale),
    oy: Math.round(tile.y + (tile.h - drawnH * scale) / 2 - tile.h * 0.01 - grid.y0 * scale)
  };
}

// ── SVG ───────────────────────────────────────────────────────────────────
function buildSvg(N, grid, frame, border, fill, fit) {
  const L = layout(N, grid, frame, fill, fit);
  const t = L.tile, s = L.stroke;
  const rx = t.x + s / 2, ry = t.y + s / 2, rw = t.w - s, rh = t.h - s, rr = t.r - s / 2;
  const body = grid.cells.map((c) => {
    const x = L.ox + c.gx * L.scale, y = L.oy + c.gy * L.scale;
    return `    <rect x="${x}" y="${y}" width="${L.scale}" height="${L.scale}" fill="${hex(c.c)}"/>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">
  <!-- DUM-E — the arm presenting the fire extinguisher. Generated by tools/make-logo.cjs; edit that, not this. -->
  <title>DUM-E</title>
  <defs>
    <clipPath id="tile">
      <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="${rr}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${hex(GROUND)}"/>
${body}
  </g>
  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="${rr}"
        fill="none" stroke="${hex(border)}" stroke-width="${s}" shape-rendering="geometricPrecision"/>
</svg>
`;
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// ── PNG ───────────────────────────────────────────────────────────────────
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

function encodePng(N, rgba) {
  const buf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const stride = N * 4 + 1;
  const raw = Buffer.alloc(N * stride);
  for (let y = 0; y < N; y++) {
    raw[y * stride] = 0;
    buf.copy(raw, y * stride + 1, y * N * 4, (y + 1) * N * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Signed distance to a rounded rect — negative inside. */
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r), qy = Math.abs(py - cy) - (h / 2 - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

const SS = 4;

function rasterise(N, grid, frame, border, fill, fit) {
  const L = layout(N, grid, frame, fill, fit);
  const t = L.tile, s = L.stroke;
  const rx = t.x + s / 2, ry = t.y + s / 2, rw = t.w - s, rh = t.h - s, rr = t.r - s / 2;

  const at = new Map(grid.cells.map((c) => [c.gy * grid.gw + c.gx, c.c]));
  const spriteAt = (px, py) => {
    const gx = Math.floor((px - L.ox) / L.scale), gy = Math.floor((py - L.oy) / L.scale);
    return at.get(gy * grid.gw + gx) ?? null;
  };

  const out = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let cov = 0, ink = 0, rSum = 0, gSum = 0, bSum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          const d = sdRoundRect(px, py, rx, ry, rw, rh, rr);
          if (d > s / 2) continue;
          cov++;
          if (d > -s / 2) { ink++; continue; }
          const c = spriteAt(px, py) ?? GROUND;
          rSum += c[0]; gSum += c[1]; bSum += c[2];
        }
      }
      if (!cov) continue;
      const i = (y * N + x) * 4;
      out[i] = Math.round((rSum + ink * border[0]) / cov);
      out[i + 1] = Math.round((gSum + ink * border[1]) / cov);
      out[i + 2] = Math.round((bSum + ink * border[2]) / cov);
      out[i + 3] = 255;
    }
  }
  return encodePng(N, out);
}

// ── ICO ───────────────────────────────────────────────────────────────────
/** ICO container of PNG entries (Vista+). 256px is encoded as width byte 0. */
function buildIco(pngs) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = [], bodies = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e); bodies.push(data);
    offset += data.length;
  }
  return Buffer.concat([dir, ...entries, ...bodies]);
}

// ── sprite registry + emission ─────────────────────────────────────────────
// Full pose at big sizes; the extinguisher-clasp crop where the pose would
// smear (16/32px favicons and taskbar-dust sizes).
const FULL = { grid: buildGrid(FULL_RUNS, 21, 28), fill: 0.72, fit: 0.94 };
const COMPACT = { grid: buildGrid(COMPACT_RUNS, 14, 14), fill: 0.85, fit: 0.95 };
const spriteFor = (size) => (size >= 48 ? FULL : COMPACT);

const wrote = [];
const write = (rel, buf) => {
  fs.writeFileSync(path.join(ROOT, rel), buf);
  wrote.push(`${rel.padEnd(40)} ${(buf.length / 1024).toFixed(1)} KB`);
};

write('src/renderer/src/brand/logo.svg', Buffer.from(buildSvg(1024, FULL.grid, 'mark', BORDERS.ink, FULL.fill, FULL.fit)));
write('src/renderer/src/brand/logo.png', rasterise(512, FULL.grid, 'mark', BORDERS.ink, FULL.fill, FULL.fit));

write('build/icon.svg', Buffer.from(buildSvg(1024, FULL.grid, 'mark', BORDERS.ink, FULL.fill, FULL.fit)));
write('build/icon.png', rasterise(1024, FULL.grid, 'mark', BORDERS.ink, FULL.fill, FULL.fit));
write('build/icon.ico', buildIco([16, 32, 48, 64, 128, 256].map((size) => {
  const sp = spriteFor(size);
  return { size, data: rasterise(size, sp.grid, 'mark', BORDERS.ink, sp.fill, sp.fit) };
})));

const setDir = path.join(ROOT, 'build/icon.iconset');
fs.rmSync(setDir, { recursive: true, force: true });
fs.mkdirSync(setDir, { recursive: true });
for (const [name, size] of [
  ['icon_16x16', 16], ['icon_16x16@2x', 32], ['icon_32x32', 32], ['icon_32x32@2x', 64],
  ['icon_128x128', 128], ['icon_128x128@2x', 256], ['icon_256x256', 256],
  ['icon_256x256@2x', 512], ['icon_512x512', 512], ['icon_512x512@2x', 1024]
]) {
  const sp = spriteFor(size);
  fs.writeFileSync(path.join(setDir, `${name}.png`), rasterise(size, sp.grid, 'mark', BORDERS.ink, sp.fill, sp.fit));
}
wrote.push('build/icon.iconset/            (10 pngs, mac: iconutil -c icns)');

console.log(wrote.join('\n'));

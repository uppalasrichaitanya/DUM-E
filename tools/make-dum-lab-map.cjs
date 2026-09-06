'use strict';
/**
 * dum-lab map generator — authors the Stark-workshop floor.
 *
 * THE STAMP APPROACH: office.tmj ships in this repo and its furniture
 * regions are proven (gid layouts + collision semantics render correctly
 * through the lab atlases). This generator reads office.tmj, extracts
 * complete regions — desk clumps, the CEO office, the cafe, the boardroom
 * table — and blits them onto a fresh 40×26 canvas, then paints the lab
 * identity on top: a server-rack wall along the back, a central holo-table
 * with pylons, lab-named fabrication bays, and the charging-bay cafe.
 *
 * SELF-TESTS (run on every generation; the tool fails if any assert breaks):
 *   1. BFS from `entrance` reaches every seat, cafe stand, and errand stand
 *      through the collision grid — no spot may be walled off.
 *   2. Every pc desk block matches the [365/366 over 381/382] monitor layout
 *      DeskScreen's offTopLeftGid=365 overlay expects.
 *   3. Spawn names honor TiledMapRenderer's walkable prefixes and every
 *      cafe seat sits on a collision-free tile.
 *
 * The lab ThemeConfig coordinates (seats/coffee/anchors/errands) are all
 * derived from the layout constants below — the tool prints them at the end
 * for transcription into themeRegistry.ts (slice 2).
 *
 *   node tools/make-dum-lab-map.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OFFICE = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/renderer/src/assets/maps/office.tmj'), 'utf8'));
const OUT = path.join(ROOT, 'src/renderer/src/assets/maps/dum-lab.tmj');

// ── canvas ──────────────────────────────────────────────────────────────────
const W = 40, H = 26;
const TILE = 24;

// Office layer shortcut + accessor (office is 34 wide).
const OL = {};
for (const l of OFFICE.layers) if (l.type === 'tilelayer') OL[l.name] = l.data;
const OW = OFFICE.width;
const oat = (name, x, y) => OL[name][y * OW + x] || 0;

// ── layout constants (the single source for the theme config) ───────────────
const LAYOUT = {
  // Stamps: [officeX0, officeY0, officeX1, officeY1, labX, labY]
  CEO_OFFICE:  { ox: 0, oy: 2, x1: 10, y1: 8, lx: 0, ly: 2 },     // god's workshop, top-left verbatim
  // cafe room from office x24 (past the last pc desk) so the stamp carries
  // only the cafe enclosure + its door gap; flushed against the right edge
  CAFE:        { ox: 24, oy: 11, x1: 33, y1: 21, lx: 30, ly: 14 }, // charging-bay room, bottom-right
  HOLO_TABLE:   { ox: 10, oy: 3, x1: 15, y1: 7, lx: 17, ly: 9 },   // boardroom table → the holo-table
  // pc desk blocks: office (1,11)-(3,14) is the pc-1 clump (monitor/desk/keyboard/chair)
  PC_STAMP:    { ox: 1, oy: 11, x1: 3, y1: 14 },
  pc: [
    { lx: 2,  ly: 9,  name: 'pc-1' },   // chair lands at (3,12)
    { lx: 6,  ly: 9,  name: 'pc-2' },   // (7,12)
    { lx: 10, ly: 9,  name: 'pc-3' },   // (11,12)
    { lx: 26, ly: 9,  name: 'pc-4' },   // (27,12)
    { lx: 30, ly: 9,  name: 'pc-5' },   // (31,12)
    { lx: 34, ly: 9,  name: 'pc-6' },   // (35,12)
  ],
  NAMED_STAMP: { ox: 1, oy: 16, x1: 3, y1: 19 },                  // office named-desk clump
  named: [
    { lx: 2,  ly: 17, name: 'desk-fabrication' },  // chair at (3,20)
    { lx: 6,  ly: 17, name: 'desk-testing' },      // (7,20)
    { lx: 10, ly: 17, name: 'desk-research' },    // (11,20)
    { lx: 14, ly: 17, name: 'desk-salvage' },     // (15,20)
  ],
  // Server-rack wall: painted in front of the top wall, gaps for windows.
  RACK_ROW_Y: 3,
  RACK_X0: 13, RACK_X1: 36,
  WINDOW_XS: [16, 23, 30],               // observation windows interrupt the racks
  // Pylons at the holo-table corners (coolant errand targets).
  PYLONS: [
    { x: 16, y: 9 }, { x: 24, y: 9 },
  ],
  entrance: { x: 20, y: 24 },
};

// Rack gids (atlas-1 RACK_SET locals 342,343,348,353,394 → globals +1).
const RACK_GIDS = [343, 344, 349, 354, 395];
// Pylon gids (PYLON_SET locals 410,430,431,450,451,466,467,469,470 → globals).
const PYLON_GID = 467, PYLON_GID2 = 468;
// Observation-window pair (office uses the big monitor gids as windows).
const WINDOW_GIDS = [343, 344];

// ── canvas layers ────────────────────────────────────────────────────────────
const mk = () => new Array(W * H).fill(0);
const layers = {
  floor: mk(), walls: mk(), 'furniture-below': mk(), 'furniture-above': mk(), collision: mk(),
};
const cat = (name, x, y) => layers[name][y * W + x] || 0;
const set = (name, x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) layers[name][y * W + x] = v; };

// ── paint helpers ───────────────────────────────────────────────────────────
/** Checker floor across the whole canvas (783/784 light, 799/800 dark — the
 *  same pairs the office floor uses, so both floors share one material). */
function paintFloor() {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const even = ((x + y) % 2) === 0;
      const dark = (y % 2) === 1;
      set('floor', x, y, dark ? (even ? 799 : 800) : (even ? 783 : 784));
    }
  }
}

/** Border walls — the office's proven rows: 514/522 (cap), 530/554 (upper),
 *  530/570 (lower), with 578-581 baseboard on the bottom and 533 on the
 *  right edge. Entrance gap punched after. */
function paintWalls() {
  for (let x = 0; x < W; x++) {
    set('walls', x, 0, x === 0 ? 514 : 522);
    set('walls', x, 1, x === 0 ? 530 : 554);
    set('walls', x, 2, x === 0 ? 530 : 570);
    set('walls', x, H - 1, x === 0 ? 578 : (x % 2 === 0 ? 579 : 580));
    set('collision', x, 0, 1); set('collision', x, 1, 1); set('collision', x, 2, 1);
    set('collision', x, H - 1, 1);
  }
  for (let y = 0; y < H; y++) {
    set('walls', 0, y, y <= 1 ? 514 : (y === 2 ? 530 : 530));
    set('walls', W - 1, y, 533);
    set('collision', 0, y, 1); set('collision', W - 1, y, 1);
  }
  // entrance gap in the bottom wall (3 wide)
  for (let x = LAYOUT.entrance.x - 1; x <= LAYOUT.entrance.x + 1; x++) {
    set('walls', x, H - 1, 0); set('collision', x, H - 1, 0);
  }
}

/** Blit an office region onto the canvas at (lx,ly): all five tile layers. */
function stamp(o) {
  for (let y = o.oy; y <= o.y1; y++) {
    for (let x = o.ox; x <= o.x1; x++) {
      const tx = o.lx + (x - o.ox), ty = o.ly + (y - o.oy);
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
      for (const name of ['floor', 'walls', 'furniture-below', 'furniture-above', 'collision']) {
        const v = oat(name, x, y);
        if (v) set(name, tx, ty, v); else if (name === 'collision') set(name, tx, ty, 0);
      }
    }
  }
}

/** The server-rack wall along the back (furniture-below, collision on), with
 *  observation windows at the given columns. */
function paintRackWall() {
  const y = LAYOUT.RACK_ROW_Y;
  for (let x = LAYOUT.RACK_X0; x <= LAYOUT.RACK_X1; x++) {
    set('furniture-below', x, y, RACK_GIDS[(x - LAYOUT.RACK_X0) % RACK_GIDS.length]);
    set('collision', x, y, 1);
  }
  for (const wx of LAYOUT.WINDOW_XS) {
    set('furniture-below', wx, y, 0); set('furniture-above', wx, y, WINDOW_GIDS[0]);
    set('furniture-below', wx + 1, y, 0); set('furniture-above', wx + 1, y, WINDOW_GIDS[1]);
    set('collision', wx, y, 1); set('collision', wx + 1, y, 1);
  }
}

/** Holo-table pylons at the corners. */
function paintPylons() {
  for (const p of LAYOUT.PYLONS) {
    set('furniture-above', p.x, p.y, PYLON_GID);
    set('furniture-above', p.x, p.y + 1, PYLON_GID2);
    set('collision', p.x, p.y, 1); set('collision', p.x, p.y + 1, 1);
  }
}

// ── spawn points + zones (px = tile × 24) ────────────────────────────────────
const px = (t) => t * TILE;
const spawnPoints = [];
const addSpawn = (name, x, y) =>
  spawnPoints.push({ id: 0, name, type: '', x: px(x), y: px(y), width: 0, height: 0, rotation: 0, visible: true, point: true });

const zones = [];
const addZone = (name, x, y, w, h) =>
  zones.push({ id: 0, name, type: '', x: px(x), y: px(y), width: px(w), height: px(h), rotation: 0, visible: true });

// ── build ────────────────────────────────────────────────────────────────────
paintFloor();
paintWalls();

// god's workshop (office CEO office verbatim, top-left)
stamp(LAYOUT.CEO_OFFICE);
addSpawn('desk-ceo', 3, 4);

// central holo-table (office boardroom table)
stamp(LAYOUT.HOLO_TABLE);

// pc desk arcs (left + right of the holo-table)
for (const p of LAYOUT.pc) {
  stamp({ ...LAYOUT.PC_STAMP, lx: p.lx, ly: p.ly });
  addSpawn(p.name, p.lx + 1, p.ly + 2);   // chair = block center, 3rd row
}

// named fabrication bays (bottom-left row) — chair sits at relative row 2
// (same as the pc stamp: office (2,18) is the chair for oy=16)
for (const d of LAYOUT.named) {
  stamp({ ...LAYOUT.NAMED_STAMP, lx: d.lx, ly: d.ly });
  addSpawn(d.name, d.lx + 1, d.ly + 2);
}

// charging-bay cafe (office cafe room verbatim, bottom-right, flush to edges)
stamp(LAYOUT.CAFE);
const cafeOff = { dx: LAYOUT.CAFE.lx - LAYOUT.CAFE.ox, dy: LAYOUT.CAFE.ly - LAYOUT.CAFE.oy };
// office cafe spawn coords, offset into lab space
for (const [name, ox, oy] of [
  ['cafe-seat-1', 27, 14], ['cafe-seat-2', 27, 16], ['cafe-seat-3', 28, 14], ['cafe-seat-4', 28, 16],
  ['cafe-stand-coffee', 26, 20], ['cafe-stand-vending', 29, 13],
]) {
  addSpawn(name, ox + cafeOff.dx, oy + cafeOff.dy);
}

// rack wall + pylons + entrance
paintRackWall();
paintPylons();
addSpawn('entrance', LAYOUT.entrance.x, LAYOUT.entrance.y);

// zones: the holo-table basin + the charging bay
addZone('boardroom', 17, 8, 6, 8);
addZone('cafeteria', 30, 14, 10, 11);

// ── errand spots (THE theme config source; stands BFS-checked below) ───────
// pylons read as coolant ports (droplet fx), windows as observation strips,
// the workshop window as god's vent-cigar stand. All stands must be
// collision-free and reachable — enforced by self-test 1.
const ERRANDS = [
  // coolant ports: stand directly below each pylon, face up at it
  { kind: 'water', stand: { x: LAYOUT.PYLONS[0].x, y: LAYOUT.PYLONS[0].y + 2 }, facing: 'up', fx: { x: LAYOUT.PYLONS[0].x, y: LAYOUT.PYLONS[0].y + 1 }, duration: 4.5 },
  { kind: 'water', stand: { x: LAYOUT.PYLONS[1].x, y: LAYOUT.PYLONS[1].y + 2 }, facing: 'up', fx: { x: LAYOUT.PYLONS[1].x, y: LAYOUT.PYLONS[1].y + 1 }, duration: 4.5 },
  { kind: 'window', stand: { x: LAYOUT.WINDOW_XS[0], y: 4 }, facing: 'up', fx: { x: LAYOUT.WINDOW_XS[0], y: 2 }, duration: 5 },
  { kind: 'window', stand: { x: LAYOUT.WINDOW_XS[2] + 1, y: 4 }, facing: 'up', fx: { x: LAYOUT.WINDOW_XS[2] + 1, y: 2 }, duration: 5 },
  // god's workshop: the window stand must sit INSIDE the office (x < 10)
  { kind: 'smoke', stand: { x: 6, y: 4 }, facing: 'up', fx: { x: 6, y: 2 }, duration: 18, godOnly: true },
  // charging bays read as dispensers
  { kind: 'dispenser', stand: { x: 31, y: 23 }, facing: 'up', fx: { x: 31, y: 22 }, duration: 3.5 },
];

// ── self-test 1: BFS reachability ────────────────────────────────────────────
function bfsReachable(startX, startY) {
  const seen = new Array(W * H).fill(false);
  const q = [[startX, startY]];
  seen[startY * W + startX] = true;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (seen[ny * W + nx]) continue;
      if (cat('collision', nx, ny)) continue;
      seen[ny * W + nx] = true;
      q.push([nx, ny]);
    }
  }
  return seen;
}

const reach = bfsReachable(LAYOUT.entrance.x, LAYOUT.entrance.y);
const unreachable = [];
for (const s of spawnPoints) {
  const tx = s.x / TILE, ty = s.y / TILE;
  if (!reach[ty * W + tx]) unreachable.push(`${s.name} @ ${tx},${ty}`);
}
// errand stands join the reachability contract
for (const e of ERRANDS) {
  if (!reach[e.stand.y * W + e.stand.x]) unreachable.push(`errand:${e.kind} @ ${e.stand.x},${e.stand.y}`);
  if (cat('collision', e.stand.x, e.stand.y)) unreachable.push(`errand:${e.kind} stand ON COLLISION @ ${e.stand.x},${e.stand.y}`);
}
if (unreachable.length) {
  console.error('SELF-TEST 1 FAILED — unreachable spawns:\n  ' + unreachable.join('\n  '));
  process.exit(1);
}

// ── self-test 2: monitor layout on every pc block ────────────────────────────
// DeskScreen overlays ON gids relative to the OFF block's top-left (365):
// [[367,0,0],[368,1,0],[383,0,1],[384,1,1]] — the map must paint
// 365,366 (top row) over 381,382 (bottom row) for each pc.
for (const p of LAYOUT.pc) {
  const x = p.lx + 1, y = p.ly;             // monitor top-left = block center, 1st row
  const ok =
    cat('furniture-above', x, y) === 365 && cat('furniture-above', x + 1, y) === 366 &&
    cat('furniture-above', x, y + 1) === 381 && cat('furniture-above', x + 1, y + 1) === 382;
  if (!ok) {
    console.error(`SELF-TEST 2 FAILED — pc monitor block at ${x},${y} does not match the 365/366/381/382 layout`);
    process.exit(1);
  }
}

// ── self-test 3: spawn prefixes + cafe walkability ──────────────────────────
const PREFIXES = ['desk-', 'pc-', 'warroom-', 'entrance'];
for (const s of spawnPoints) {
  const walkablePrefix = PREFIXES.some((p) => s.name.startsWith(p));
  if (!walkablePrefix && !s.name.startsWith('cafe-')) {
    console.error(`SELF-TEST 3 FAILED — spawn '${s.name}' matches no walkable prefix`);
    process.exit(1);
  }
  if (s.name.startsWith('cafe-') && cat('collision', s.x / TILE, s.y / TILE)) {
    console.error(`SELF-TEST 3 FAILED — cafe seat '${s.name}' sits on collision`);
    process.exit(1);
  }
}

// ── write the map ────────────────────────────────────────────────────────────
const map = {
  compressionlevel: -1, height: H, infinite: false,
  layers: [
    { data: layers.floor, height: H, id: 1, name: 'floor', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    { data: layers.walls, height: H, id: 2, name: 'walls', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    { data: layers['furniture-below'], height: H, id: 3, name: 'furniture-below', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    { data: layers['furniture-above'], height: H, id: 4, name: 'furniture-above', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    { data: layers.collision, height: H, id: 5, name: 'collision', opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 },
    { draworder: 'topdown', id: 6, name: 'spawn-points', objects: spawnPoints, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
    { draworder: 'topdown', id: 7, name: 'zones', objects: zones, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 },
  ],
  nextlayerid: 8, nextobjectid: 1, orientation: 'orthogonal', renderorder: 'right-down',
  tiledversion: '1.12.0', tileheight: TILE,
  tilesets: [
    { columns: 16, firstgid: 1, image: '../tilesets/lab-tileset.png', imageheight: 768, imagewidth: 384, margin: 0, name: 'office-tileset', spacing: 0, tilecount: 512, tileheight: TILE, tilewidth: TILE },
    { firstgid: 513, source: 'A5 Office Floors & Walls.tsx' },
    { firstgid: 1025, source: 'interiors.tsx' },
  ],
  tilewidth: TILE, type: 'map', version: '1.10', width: W,
};
fs.writeFileSync(OUT, JSON.stringify(map));
console.log(`dum-lab.tmj written: ${W}x${H} @ ${TILE}px, ${spawnPoints.length} spawns, ${zones.length} zones`);
console.log('self-tests: BFS reachability OK, pc monitor layout OK, spawn prefixes OK');

// ── theme-config coordinates for slice 2 (transcription source) ────────────
console.log('\n— ThemeConfig values —');
console.log('primarySeatNames:', JSON.stringify(['desk-ceo', ...LAYOUT.pc.map((p) => p.name), ...LAYOUT.named.map((d) => d.name)]));
console.log('cafeSeatNames:', JSON.stringify(['cafe-seat-1', 'cafe-seat-2', 'cafe-seat-3', 'cafe-seat-4']));
console.log('coffee:', JSON.stringify({
  trayTile: { x: 29 + cafeOff.dx, y: 15 + cafeOff.dy },
  trayStand: { x: 29 + cafeOff.dx, y: 16 + cafeOff.dy },
  machineStand: { x: 26 + cafeOff.dx, y: 20 + cafeOff.dy },
  sinkTile: { x: 28 + cafeOff.dx, y: 18 + cafeOff.dy },
  sinkStand: { x: 28 + cafeOff.dx, y: 20 + cafeOff.dy },
  maxCups: 4,
}));
console.log('anchors:', JSON.stringify({ calendar: { x: 4, y: 1 }, boards: { x: 19, y: 10 }, clock: { x: 2, y: 1 } }));
console.log('errandSpots:', JSON.stringify(ERRANDS.map((e) => ({ ...e, godOnly: e.godOnly ?? undefined }))));

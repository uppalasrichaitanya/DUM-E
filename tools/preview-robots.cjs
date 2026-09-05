'use strict';

// Dev-only preview of the procedural robot cast from portraitArt.ts.
//
// Transpiles portraitArt.ts (its only import is a type-only import of
// OfficeCharacterName from cast.ts, which the transpiler erases — so the
// module runs standalone; we patch require to be safe if that ever changes)
// and prints ASCII art so the sprite artist pass can be checked at 1× in a
// terminal. Not shipped, not imported by the app.
//
// Usage:
//   node tools/preview-robots.cjs              all 13 characters, scene front+back, stand frame
//   node tools/preview-robots.cjs dume         just DUM-E (accepts multiple names)
//   node tools/preview-robots.cjs dume ultron  DUM-E and Ultron
//   node tools/preview-robots.cjs --walk       also print step-L / step-R frames
//   node tools/preview-robots.cjs --bust       also print the 18×28 portrait bust
//   node tools/preview-robots.cjs --scanlines  color scanline-dimmed pixels as '~' (LYLA check)
//
// Legend:
//   space = transparent, '#' dark, '.' mid, '+' light, '~' dim (alpha < 255),
//   'B' blue, 'G' gold, 'R' red/warm, 'P' pink/purple, 'C' cyan/teal, 'W' bright core,
//   'O' outline

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const OFFICE_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'scene', 'office');

// ─── transpile + load portraitArt.ts (mirrors test/load-ts.cjs) ──────────────
function transpile(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      esModuleInterop: true
    },
    fileName: filename,
    reportDiagnostics: true
  });
  if (output.diagnostics?.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(output.diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (name) => name,
      getNewLine: () => '\n'
    }));
  }
  return output.outputText;
}

function loadPortraitArt() {
  const file = path.join(OFFICE_DIR, 'portraitArt.ts');
  const code = transpile(file);
  const mod = { exports: {} };
  // portraitArt.ts imports only `import type { OfficeCharacterName } from './cast'`
  // — type-only, erased by transpileModule. If a value import ever sneaks in,
  // hand the module a minimal cast.ts stub so it still loads.
  const stubRequire = (request) => {
    if (request === './cast') {
      return { OFFICE_CAST: [], CAST_BY_NAME: {}, DEFAULT_CHARACTER: 'doombot' };
    }
    return require(request);
  };
  const run = new Function('module', 'exports', 'require', '__filename', '__dirname', code);
  run(mod, mod.exports, stubRequire, file, OFFICE_DIR);
  return mod.exports;
}

const art = loadPortraitArt();

// ─── ANSI-stripping ASCII renderer with RGB buckets ─────────────────────────
// Grid-index coloring: sample a px, bucket by hue/lightness.
// Partial alpha: below ~200 reads as '~' (glow halos); a mostly-opaque
// hologram body (alpha 205) still shows its color. --scanlines reverts to
// marking every partial-alpha px '~' (LYLA translucency check).
function bucketOf(r, g, b, a, dimAll) {
  if (a === 0) return ' ';
  if (a < 255 && dimAll) return '~';
  if (a < 200) return '~'; // partial alpha — scanlines / glow halos (LYLA, hover)
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  if (sat < 22) { // achromatic-ish → metal grays
    if (max > 200) return '+';
    if (max > 68) return '.';
    return '#';
  }
  // dominant channel → color family
  if (r >= g && r > b + 8) {
    if (g > 0.62 * r) return 'G'; // gold/amber/warm-tan
    return 'R';
  }
  if (b >= r && b > g + 8) {
    if (g > 0.62 * b) return 'C'; // teal/cyan
    return 'B';
  }
  if (r >= g && b >= g && Math.abs(r - b) < 120) return 'P'; // pink/purple/magenta
  if (g >= r && g > b + 8) return 'A'; // green
  return max > 150 ? '+' : '.';
}

function renderBuf(buf, w, h) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row += bucketOf(buf[i], buf[i + 1], buf[i + 2], buf[i + 3], flags.has('--scanlines'));
    }
    lines.push(row);
  }
  return lines;
}

// ─── list of all 13 characters ───────────────────────────────────────────────
const ALL_NAMES = [
  'dume', 'herbie', 'butterfingers', 'doombot', 'sentinel',
  'rover', 'vision', 'ultron', 'ultronbot', 'modok',
  'veronica', 'edith', 'lyla'
];

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const names = args.filter((a) => !a.startsWith('--'));
const selected = names.length ? names.filter((n) => ALL_NAMES.includes(n)) : ALL_NAMES;
if (names.length && selected.length !== names.length) {
  const bad = names.filter((n) => !ALL_NAMES.includes(n));
  console.error(`Unknown character(s): ${bad.join(', ')}. Valid: ${ALL_NAMES.join(', ')}`);
  process.exit(1);
}

function printBlock(title, buf, w, h) {
  console.log(`── ${title} (${w}×${h}) ` + '─'.repeat(Math.max(0, 34 - title.length)));
  for (const line of renderBuf(buf, w, h)) console.log('|' + line + '|');
}

for (const name of selected) {
  console.log('');
  console.log('='.repeat(54));
  console.log('  ' + name.toUpperCase());
  console.log('='.repeat(54));

  if (flags.has('--bust')) {
    // 18×28 portrait bust — exported debug helper from portraitArt.ts
    if (typeof art.portraitBuf === 'function') {
      printBlock(`${name} bust`, art.portraitBuf(name), art.PORTRAIT_W, art.PORTRAIT_H);
    } else {
      console.log('(portraitBuf not exported — run without --bust)');
    }
  }

  const frames = art.sceneFrameBufs(name);
  const phases = flags.has('--walk') ? [0, 1, 2] : [0];
  for (const p of phases) {
    printBlock(`${name} front p${p}`, frames.front[p], art.SCENE_W, art.SCENE_H);
    printBlock(`${name} back  p${p}`, frames.back[p], art.SCENE_W, art.SCENE_H);
  }
}

console.log('');
console.log('legend: ( )transparent  # dark  . mid  + light  ~ dim-alpha  O outline  B blue  G gold  R red  P pink/purple  C cyan/teal  A green  W bright-core');

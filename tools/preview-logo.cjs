'use strict';
// ASCII preview of the brand sprites — the no-image-viewer debugging tool.
//   node tools/preview-logo.cjs
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, 'make-logo.cjs'), 'utf8');

// Pull the two run tables out of make-logo.cjs without executing it.
function extract(name) {
  const start = SRC.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`no ${name}`);
  const end = SRC.indexOf('];', start);
  return SRC.slice(start + `const ${name} = [`.length - 1, end + 1);
}

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const GOLD = [244, 211, 94], WHITE = [250, 248, 244], EXT = [214, 69, 65], EXT_D = [150, 45, 42], INK = [26, 19, 32];

function render(runsSrc, w, h, label) {
  const runs = eval(runsSrc.replace(/^const [A-Z_]+ =/, '')); // eslint-disable-line no-eval
  const grid = new Map();
  for (const [x, y, len, c] of runs) for (let i = 0; i < len; i++) grid.set(`${x + i},${y}`, c);
  console.log(`── ${label} (${w}×${h}) ──`);
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const c = grid.get(`${x},${y}`);
      if (!c) { line += '·'; continue; }
      if (c === GOLD) line += 'G';
      else if (c === WHITE) line += '+';
      else if (c === EXT || c === EXT_D) line += 'R';
      else if (c === INK) line += '#';
      else line += lum(c) > 128 ? 'o' : '#';
    }
    console.log(line);
  }
}

render(extract('FULL_RUNS'), 21, 28, 'FULL — arm presenting the extinguisher');
console.log();
render(extract('COMPACT_RUNS'), 14, 14, 'COMPACT — extinguisher in the claw');

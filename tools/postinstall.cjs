'use strict';
/**
 * Resilient postinstall for the native modules.
 *
 * electron-rebuild -f forces node-pty AND better-sqlite3 to rebuild from source
 * against Electron's headers. That needs the full MSVC toolchain (incl. the
 * Spectre-mitigated C++ libs, which the VS BuildTools install does NOT include
 * by default — MSB8040). But:
 *
 *  - node-pty 1.1.0 is N-API: it SHIPS prebuilt binaries (prebuilds/win32-x64)
 *    that work under Electron as-is. A from-source build is unnecessary.
 *  - better-sqlite3 has NO prebuilt for Electron's ABI, so IT genuinely needs
 *    the rebuild.
 *
 * So: rebuild only better-sqlite3 (small, builds fine with plain MSVC), skip
 * node-pty's (fall back to its prebuilds). If even that fails — no MSVC at all —
 * fail loudly with instructions instead of leaving a broken install silently.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  return res.status === 0;
}

const sqliteBuilt = () => {
  try { require.resolve('better-sqlite3'); return true; } catch { return false; }
};

// 1) better-sqlite3 → must really build against Electron headers.
let sqliteOk = false;
if (process.platform === 'win32') {
  // electron-rebuild only this module; node-pty rides its prebuilds.
  sqliteOk = run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3']);
} else {
  sqliteOk = run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3']);
}

// 2) node-pty: verify the prebuilds load instead of rebuilding from source.
const ptyDir = path.join(ROOT, 'node_modules', 'node-pty');
const prebuildOK = fs.existsSync(path.join(ptyDir, 'prebuilds', process.platform + '-' + process.arch, 'pty.node'));
if (!prebuildOK) {
  // No prebuild for this platform (e.g. darwin spawn-helper perms still apply):
  // fall back to a full rebuild.
  if (!run('npx', ['electron-rebuild', '-f', '-w', 'node-pty'])) {
    console.error('\n[node-pty] no prebuilds and source rebuild failed — terminals will not spawn.');
    console.error('          Install the platform build toolchain, then: npx electron-rebuild -f -w node-pty');
    process.exit(1);
  }
}

// 3) The Windows conpty guard (load-bearing: prevents an AttachConsole crash
//    cascading into whole-app crashes).
if (process.platform === 'win32') {
  if (!run('node', ['tools/patch-node-pty-conpty.cjs'])) process.exit(1);
}

// 4) posix: spawn-helper needs the exec bit.
if (process.platform !== 'win32') {
  if (!run('node', ['tools/ensure-pty-perms.cjs'])) process.exit(1);
}

if (!sqliteOk && !sqliteBuilt()) {
  console.error('\n[better-sqlite3] rebuild failed — the app will crash at startup (persist store).');
  console.error('               Install VS Build Tools C++ workload, then: npx electron-rebuild -f -w better-sqlite3');
  process.exit(1);
}
console.log('\n[postinstall] native modules ready (better-sqlite3 rebuilt, node-pty prebuilds verified)');

'use strict';
/**
 * Resilient postinstall for the native modules.
 *
 * The old `electron-rebuild -f` forced BOTH node-pty and better-sqlite3 to
 * build from source against Electron's headers. node-pty's conpty/winpty
 * projects need the Spectre-mitigated C++ libraries, which the default VS
 * BuildTools install lacks (MSB8040) — so a fresh clone could never finish
 * installing. But:
 *
 *  - node-pty 1.1.0 is N-API and SHIPS prebuilt binaries (prebuilds/win32-x64)
 *    that load under Electron as-is. A from-source build is unnecessary.
 *  - better-sqlite3 has no Electron prebuilt, so IT genuinely needs the
 *    rebuild (plain MSVC, no Spectre libs required).
 *
 * Strategy: run electron-rebuild scoped to better-sqlite3, ignore its
 * node-pty noise, then VERIFY both modules functionally by requiring them
 * under the actual Electron binary (ELECTRON_RUN_AS_NODE). The functional
 * check is the source of truth — exit codes and build logs both lie.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PLATFORM_KEY = `${process.platform}-${process.arch}`;

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  return res.status === 0;
}

/** Require both native modules inside the real Electron runtime. */
function verifyUnderElectron() {
  const distBin = process.platform === 'win32' ? 'dist\\electron.exe'
    : process.platform === 'darwin' ? 'dist/Electron.app/Contents/MacOS/Electron'
    : 'dist/electron';   // linux ships a lowercase bare binary
  const electronBin = path.join(ROOT, 'node_modules', 'electron', distBin);
  if (!fs.existsSync(electronBin)) {
    console.error('[postinstall] electron binary not found — run npm install first');
    return false;
  }
  const probe = `
    try {
      const db = require('better-sqlite3')(':memory:');
      db.exec('create table t(x)');
      const pty = require('node-pty');
      const p = pty.spawn(${JSON.stringify(process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/sh')}, [], { name: 'xterm', cols: 40, rows: 10 });
      let n = 0; p.onData(() => { if (++n >= 1) { p.kill(); process.exit(0); } });
      setTimeout(() => { console.error('[postinstall] pty produced no output'); p.kill(); process.exit(1); }, 10000);
    } catch (e) {
      console.error('[postinstall] native verify failed:', e.message);
      process.exit(1);
    }
  `;
  const res = spawnSync(electronBin, ['-e', probe], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    timeout: 60000
  });
  return res.status === 0;
}

// 1) Rebuild ONLY better-sqlite3 against Electron headers. electron-rebuild
//    may still chatter about (or attempt) node-pty — its exit status is not
//    trusted; the functional verify below is.
console.log('[postinstall] rebuilding better-sqlite3 for Electron …');
run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3']);

// 2) node-pty: if its prebuilds are missing for this platform, build them.
const ptyPrebuild = path.join(ROOT, 'node_modules', 'node-pty', 'prebuilds', PLATFORM_KEY, 'pty.node');
if (!fs.existsSync(ptyPrebuild)) {
  console.log('[postinstall] no node-pty prebuild for ' + PLATFORM_KEY + ' — building from source …');
  if (!run('npx', ['electron-rebuild', '-f', '-w', 'node-pty'])) {
    console.error('[postinstall] node-pty source build failed — terminals will not spawn.');
    process.exit(1);
  }
}

// 3) The Windows conpty guard (load-bearing: prevents an AttachConsole crash
//    cascading into whole-app crashes). posix: spawn-helper exec bit.
if (process.platform === 'win32') {
  if (!run('node', ['tools/patch-node-pty-conpty.cjs'])) process.exit(1);
} else {
  if (!run('node', ['tools/ensure-pty-perms.cjs'])) process.exit(1);
}

// 4) Functional gate: both modules must load AND work under Electron itself.
if (!verifyUnderElectron()) {
  console.error('\n[postinstall] native-module verification under Electron FAILED.');
  console.error('  - better-sqlite3: needs the VS Build Tools "Desktop development with C++" workload.');
  console.error('    Rebuild it with:  npx electron-rebuild -f -w better-sqlite3');
  console.error('  - node-pty: check prebuilds/win32-x64 exists, or build with:');
  console.error('    npx electron-rebuild -f -w node-pty   (needs the Spectre-mitigated C++ libs)');
  process.exit(1);
}
console.log('[postinstall] native modules verified under the Electron runtime ✔');

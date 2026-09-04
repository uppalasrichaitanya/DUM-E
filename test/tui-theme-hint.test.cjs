'use strict';

// OpenCode paints its own (dark) background regardless of the app theme. The
// spawn now hands every agent a COLORFGBG hint and writes a theme into
// OpenCode's per-agent config dir (tui.json/opencode.json, theme 'system', so
// its greys follow the detected background). Never into the user's ~/.config.
//
// The former crush half of this file died with the roster trim: installCrushConfig
// and its CRUSH_GLOBAL_CONFIG env are gone, and the config it inspected was the
// crush proxy-bridge sidecar's routing file — nothing left to assert for that
// engine. OpenCode's theme path is plugin-bridge-independent (installOpenCodePlugin
// writes tui.json/opencode.json unconditionally, no port binding involved), so it
// is asserted directly below.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-tui-theme-'));
}

test('opencode: theme lands in the per agent config dir as the system theme', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  const injection = await hive.ensureAgent(
    { id: 'oc-1', name: 'OpenCode', provider: 'opencode', cwd: home },
    { theme: 'light' }
  );
  const dir = injection.env.OPENCODE_CONFIG_DIR;
  assert.ok(dir, 'OPENCODE_CONFIG_DIR is set');
  assert.ok(dir.startsWith(path.join(home, 'hive', 'agents', 'oc-1')), 'per agent dir, never ~/.config');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'tui.json'), 'utf8')).theme, 'system');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'opencode.json'), 'utf8')).theme, 'system');
  assert.equal(injection.env.COLORFGBG, '0;15');
});

test('no theme passed: no COLORFGBG hint, but the config dir still gets the plugin', async (t) => {
  // Old behaviour for the env half (no hint without a theme choice), while the
  // plugin half keeps working — the bridge must never depend on a theme being set.
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  const injection = await hive.ensureAgent({ id: 'oc-2', name: 'OpenCode', provider: 'opencode', cwd: home });
  assert.equal(injection.env.COLORFGBG, undefined);
  const dir = injection.env.OPENCODE_CONFIG_DIR;
  assert.ok(dir, 'OPENCODE_CONFIG_DIR is set');
  assert.ok(fs.existsSync(path.join(dir, 'plugin', 'hive-bridge.js')), 'the bundled plugin is present');
  assert.ok(fs.existsSync(path.join(dir, 'plugins', 'hive-bridge.js')), 'written to BOTH dirs the docs have used');
});

/**
 * A transient proxy-bridge bind failure must not degrade a proxy-tier agent
 * (qwen) for its whole session. hive.ts gates the routing redirect behind
 * `if (port > 0)` ON PURPOSE; the missing pieces were a retry and a surface the
 * user actually sees. This drives startProxyBridge directly (private, stubbed
 * on the instance) so no real sidecar or sockets are involved.
 *
 * qwen is the roster's proxy-tier provider: it has no hook surface at all
 * (bridgeOf('qwen') = {kind:'proxy', api:'openai', baseUrlEnv:'OPENAI_BASE_URL',
 * inboxDelivery:'terminal'}), so its ONLY path to live status, cost and inbox
 * wake is the sidecar binding. The former crush fixtures died with the roster
 * trim; the retry ladder they exercised is provider-independent.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

function tmpHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'md-proxy-retry-')); }

function spawnQwen(hive, home) {
  return hive.ensureAgent({
    id: 'qwen-1',
    name: 'Qwen Worker',
    provider: 'qwen',
    cwd: home
  });
}

test('a bind that fails once and then succeeds leaves the agent fully proxied', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const events = [];
  const hive = new HiveManager(() => home, (ch, p) => { events.push([ch, p]); return true; });
  const ports = [0, 43210];
  let calls = 0;
  hive.startProxyBridge = async () => { calls++; return ports.shift() ?? 0; };

  const inj = await spawnQwen(hive, home);
  assert.equal(calls, 2, 'retried exactly once after the transient failure');
  assert.equal(inj.degraded, undefined);
  // The proxy tier routes by REDIRECTING the CLI's own base-URL env var at the
  // loopback sidecar (OPENAI_BASE_URL is qwen's baseUrlEnv).
  assert.equal(inj.env.OPENAI_BASE_URL, 'http://127.0.0.1:43210');
  assert.ok(!events.some(([ch]) => ch === 'hive:degraded'));
});

test('a bind that never succeeds is retried, then surfaced: spawn result, log.jsonl and the renderer', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const events = [];
  const hive = new HiveManager(() => home, (ch, p) => { events.push([ch, p]); return true; });
  let calls = 0;
  hive.startProxyBridge = async () => { calls++; return 0; };

  const inj = await spawnQwen(hive, home);
  assert.equal(calls, 3, 'three attempts before giving up');
  // Deliberate degradation: routing untouched, the CLI still runs.
  assert.equal(inj.env.OPENAI_BASE_URL, undefined,
    'a failed sidecar must never leave a stale loopback URL in the env');
  // ...but never silent.
  assert.match(inj.degraded, /without hive events/);
  assert.match(inj.degraded, /Qwen Worker/);
  const degradedEvt = events.find(([ch]) => ch === 'hive:degraded');
  assert.ok(degradedEvt, 'renderer told');
  assert.equal(degradedEvt[1].agentId, 'qwen-1');
  const log = fs.readFileSync(path.join(home, 'hive', 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const entry = log.find((e) => e.kind === 'proxy-degraded');
  assert.ok(entry, 'log.jsonl records the degradation');
  assert.equal(entry.agentId, 'qwen-1');
  assert.equal(entry.attempts, 3);
});

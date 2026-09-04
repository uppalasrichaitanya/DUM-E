'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  classifyEngineAvailability,
  engineBlocksOnboarding,
  engineAvailabilityBadge,
  engineAvailabilityMessage
} = loadTs('src/shared/engineAvailability.ts');
const { toolCatalog } = loadTs('src/shared/toolCatalog.ts');
const { AGENT_PROVIDER_PRESETS, canReceiveInbox } = loadTs('src/shared/agentProvider.ts');

// Build what `tools:status` returns for a machine where `found` lists the only
// binaries present. Mirrors the main-process handler's shape without electron.
function statusesFor(found) {
  return toolCatalog().map((spec) => ({
    ...spec,
    installCommand: spec.install.posix,
    found: !!spec.bin && found.includes(spec.bin),
    path: spec.bin && found.includes(spec.bin) ? `/usr/local/bin/${spec.bin}` : null
  }));
}

test('an installed engine is installed, whatever its installer story', () => {
  const s = statusesFor(['claude', 'qwen']);
  assert.equal(classifyEngineAvailability(s, 'claude').state, 'installed');
  assert.equal(classifyEngineAvailability(s, 'qwen').state, 'installed');
  assert.equal(classifyEngineAvailability(s, 'qwen').path, '/usr/local/bin/qwen');
});

test('a missing engine with an installer installs on first run and does not block', () => {
  const s = statusesFor([]);
  for (const id of ['claude', 'codex', 'opencode']) {
    const a = classifyEngineAvailability(s, id);
    assert.equal(a.state, 'installs-on-first-run', id);
    assert.ok(a.installCommand.length > 0, id);
    assert.equal(engineBlocksOnboarding(a), false, id);
  }
});

test('the repro: qwen is offered by the wizard but cannot install', () => {
  // qwen is the DEFAULT engine yet ships no installer (no npm package, no
  // native script — the user wires its OpenAI-compatible endpoint by hand).
  // The wizard must say so BEFORE the pick is committed instead of letting the
  // first spawn print a manual hint and never start the orchestrator.
  const s = statusesFor([]);
  const offered = AGENT_PROVIDER_PRESETS.filter((p) => canReceiveInbox(p.id)).map((p) => p.id);
  assert.ok(offered.includes('qwen'), 'qwen is on the picker');
  const a = classifyEngineAvailability(s, 'qwen');
  assert.equal(a.state, 'not-installable');
  assert.equal(engineBlocksOnboarding(a), true);
  assert.equal(engineAvailabilityBadge(a), 'NOT INSTALLED');
  const msg = engineAvailabilityMessage(a, 'Qwen');
  assert.match(msg, /not installed/);
  assert.match(msg, /check again/);
  assert.match(msg, /Claude Code/);
  assert.doesNotMatch(msg, /[–—-]/, 'no dashes in user facing prose');
});

test('no probe result means unknown, and unknown never blocks', () => {
  const a = classifyEngineAvailability(undefined, 'qwen');
  assert.equal(a.state, 'unknown');
  assert.equal(engineBlocksOnboarding(a), false);
  assert.equal(engineAvailabilityBadge(a), null);
  assert.equal(engineAvailabilityMessage(a, 'Qwen'), null);
  // a probe that ran but lacks the row behaves the same
  assert.equal(classifyEngineAvailability([], 'qwen').state, 'unknown');
});

test('only the dead end has a message', () => {
  const s = statusesFor(['claude']);
  assert.equal(engineAvailabilityMessage(classifyEngineAvailability(s, 'claude'), 'Claude Code'), null);
  assert.equal(engineAvailabilityMessage(classifyEngineAvailability(s, 'codex'), 'Codex'), null);
});

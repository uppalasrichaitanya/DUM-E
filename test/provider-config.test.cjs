'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  inferAgentProvider,
  isAgentProvider,
  providerPreset
} = loadTs('src/shared/agentProvider.ts');
const {
  buildSpawnCommand,
  decodeProviderModel,
  encodeProviderModel,
  modelProvidersForAgent,
  modelsForProvider
} = loadTs('src/renderer/src/store/config.ts');

const autoConfig = { defaultCommand: 'claude', autoMode: true };

test('qwen is the first-class inferred provider the roster now centers on', () => {
  assert.equal(isAgentProvider('qwen'), true);
  assert.equal(inferAgentProvider('qwen --yolo'), 'qwen');
  assert.equal(inferAgentProvider('/usr/local/bin/qwen --model qwen3-coder-plus'), 'qwen');
  const preset = providerPreset('qwen');
  assert.equal(preset.defaultCommand, 'qwen');
  assert.equal(preset.autoFlag, '--yolo');
  assert.equal(preset.supportsModel, true);
  assert.equal(preset.canReceiveInbox, true);
  assert.equal(preset.hiveAware, false);
  assert.equal(preset.initialPromptFlag, '-i');
  assert.equal(preset.recommendedOrchestratorModel, 'qwen3-coder-plus');
});

test('removed engines no longer infer to their own presets', () => {
  // grok/kimi/gemini/antigravity left the roster: their binaries now fall
  // through to 'custom', which spawns the command verbatim.
  for (const gone of ['grok', 'kimi', 'gemini', 'antigravity', 'crush', 'copilot', 'cursor']) {
    assert.equal(isAgentProvider(gone), false, gone);
    assert.equal(inferAgentProvider(gone), 'custom', gone);
  }
});

test('provider commands use matching models and equivalent bypass modes', () => {
  assert.equal(
    buildSpawnCommand(autoConfig, 'claude-sonnet-5', 'claude'),
    'claude --model claude-sonnet-5 --permission-mode bypassPermissions'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'gpt-5.6-sol', 'codex'),
    'codex --model gpt-5.6-sol -a never -s workspace-write'
  );
  // qwen's gemini-cli heritage: --yolo auto-approves all actions.
  assert.equal(
    buildSpawnCommand(autoConfig, 'qwen3-coder-plus', 'qwen'),
    'qwen --model qwen3-coder-plus --yolo'
  );
  // opencode has NO auto flag: its permission JSON is built at spawn instead
  // (OPENCODE_CONFIG_CONTENT in spawnAgentCore), so the command line stays clean.
  assert.equal(
    buildSpawnCommand(autoConfig, 'anthropic/claude-sonnet-4-5', 'opencode'),
    'opencode --model anthropic/claude-sonnet-4-5'
  );
});

test('model picker options stay provider-specific', () => {
  assert.equal(
    modelsForProvider('claude').find((model) => model.id === 'claude-opus-5')?.label,
    'Opus 5 · 1M'
  );
  assert.deepEqual(
    modelsForProvider('codex').map((model) => model.id),
    [undefined, 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
  );
  assert.deepEqual(
    modelsForProvider('qwen').map((model) => model.id),
    [undefined, 'qwen3-coder-plus', 'qwen3-coder', 'qwen-max']
  );
  assert.deepEqual(
    modelsForProvider('opencode').map((model) => model.id),
    [
      undefined,
      'anthropic/claude-sonnet-4-5',
      'anthropic/claude-haiku-4-5',
      'openai/gpt-5',
      'openai/gpt-5-mini',
      'openrouter/anthropic/claude-sonnet-4.5',
      'google/gemini-2.5-pro',
      'local/llama3'
    ]
  );
  assert.deepEqual(modelsForProvider('custom'), []);
});

test('Command Center model choices round-trip provider and model', () => {
  const encoded = encodeProviderModel('qwen', 'Qwen3 Coder Plus');
  assert.deepEqual(
    decodeProviderModel(encoded),
    { provider: 'qwen', model: 'Qwen3 Coder Plus' }
  );
  assert.deepEqual(
    decodeProviderModel(encodeProviderModel('codex')),
    { provider: 'codex', model: undefined }
  );
  assert.equal(decodeProviderModel('unknown:model'), null);
});

test('God only sees providers that can drain hive inbox messages', () => {
  // God-eligible = supportsModel && canReceiveInbox: custom is excluded on
  // both counts (no model picker, no inbox-drain path — mail would bounce).
  // claude/codex/qwen/opencode all drain: claude natively, codex via its hooks
  // bridge, qwen via the proxy bridge, opencode via its session.idle plugin.
  assert.deepEqual(
    modelProvidersForAgent(true).map((preset) => preset.id),
    ['claude', 'codex', 'qwen', 'opencode']
  );
  // The non-god picker differs only by custom, which supports no model.
  assert.deepEqual(
    modelProvidersForAgent(false).map((preset) => preset.id),
    ['claude', 'codex', 'qwen', 'opencode']
  );
});

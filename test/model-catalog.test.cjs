'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const catalog = require('../src/shared/modelCatalog.json');

const {
  ASSISTANT_MODEL,
  modelsForProvider,
  modelsForProviderAtVersion,
  runningAppVersion
} = loadTs('src/renderer/src/store/config.ts');

/** Every model the pickers offer under the trimmed DUM-E roster, as
 *  [id, label] pairs — the providers whose full list no other test pins
 *  (provider-config.test.cjs pins codex/qwen/opencode/custom). The roster was
 *  cut to claude/codex/qwen/opencode/custom, so the catalog carries exactly
 *  those keys; these literals are the record of what each picker ships. */
const SHIPPED = {
  claude: [
    ["claude-fable-5", "Fable 5"],
    ["claude-opus-5", "Opus 5 · 1M"],
    ["claude-opus-4-8", "Opus 4.8"],
    ["claude-opus-4-8[1m]", "Opus 4.8 · 1M"],
    ["claude-sonnet-5", "Sonnet 5"],
    ["claude-sonnet-4-6", "Sonnet 4.6"],
    ["claude-sonnet-4-6[1m]", "Sonnet 4.6 · 1M"],
    ["claude-haiku-4-5-20251001", "Haiku 4.5"]
  ]
};

/** A stand-in catalog: the real one is deliberately all-unbounded (the port had
 *  to be behaviour-identical), so the version bounds can only be exercised
 *  against models invented here. `modelsForProviderAtVersion` takes the provider
 *  map as its last argument for exactly this reason — the test drives the real
 *  filter, not a copy of it. */
const BOUNDED = {
  claude: [
    { id: 'unbounded', label: 'Unbounded', minAppVersion: null, maxAppVersion: null },
    { id: 'no-bound-keys', label: 'No bound keys at all' },
    { id: 'since-0.5.0', label: 'Ships in a later release', minAppVersion: '0.5.0', maxAppVersion: null },
    { id: 'since-0.4.5', label: 'Ships in this release', minAppVersion: '0.4.5', maxAppVersion: null },
    { id: 'until-0.4.4', label: 'Retired one release ago', minAppVersion: null, maxAppVersion: '0.4.4' },
    { id: 'until-0.4.5', label: 'Retired after this release', minAppVersion: null, maxAppVersion: '0.4.5' },
    { id: 'window', label: 'Only inside a window', minAppVersion: '0.4.0', maxAppVersion: '0.4.9' }
  ]
};

const ids = (models) => models.map((model) => model.id);

test('the pickers offer exactly the models that shipped before the catalog', () => {
  for (const [provider, expected] of Object.entries(SHIPPED)) {
    assert.deepEqual(
      modelsForProvider(provider).map((model) => [model.id, model.label]),
      expected,
      provider
    );
  }
});

test('the Claude list still offers the 1M-context assistant model', () => {
  // The hardcoded array built this entry out of the ASSISTANT_MODEL constant.
  // The catalog carries the id as a literal, so this is now the only thing
  // holding the picker entry and the constant together.
  assert.ok(ids(modelsForProvider('claude')).includes(ASSISTANT_MODEL));
});

test('the catalog is the schema config.ts expects', () => {
  // Exactly the roster keys, no strays: a removed engine left in the catalog
  // would make modelsForProvider answer for a provider no picker offers.
  assert.equal(catalog.version, 1);
  assert.deepEqual(
    Object.keys(catalog.providers).sort(),
    ['claude', 'codex', 'custom', 'opencode', 'qwen'].sort()
  );
});

test('a model is offered only by the app versions its bounds cover', () => {
  assert.deepEqual(ids(modelsForProviderAtVersion('claude', '0.4.5', BOUNDED)), [
    'unbounded',
    'no-bound-keys',
    'since-0.4.5',
    'until-0.4.5',
    'window'
  ]);
  assert.deepEqual(ids(modelsForProviderAtVersion('claude', '0.5.0', BOUNDED)), [
    'unbounded',
    'no-bound-keys',
    'since-0.5.0',
    'since-0.4.5'
  ]);
  assert.deepEqual(ids(modelsForProviderAtVersion('claude', '0.3.0', BOUNDED)), [
    'unbounded',
    'no-bound-keys',
    'until-0.4.4',
    'until-0.4.5'
  ]);
});

test('both bounds are inclusive of the release named in them', () => {
  assert.ok(ids(modelsForProviderAtVersion('claude', '0.4.5', BOUNDED)).includes('since-0.4.5'));
  assert.ok(ids(modelsForProviderAtVersion('claude', '0.4.5', BOUNDED)).includes('until-0.4.5'));
  assert.ok(!ids(modelsForProviderAtVersion('claude', '0.4.4', BOUNDED)).includes('since-0.4.5'));
  assert.ok(!ids(modelsForProviderAtVersion('claude', '0.4.6', BOUNDED)).includes('until-0.4.5'));
});

test('a version the filter cannot read hides nothing', () => {
  // A picker that silently loses every model is far worse than one that offers
  // a model the running build cannot use, so an unreadable version fails open.
  assert.deepEqual(ids(modelsForProviderAtVersion('claude', '', BOUNDED)), ids(BOUNDED.claude));
});

test('an unknown provider falls back to the Claude list, custom to nothing', () => {
  assert.deepEqual(modelsForProvider('not-a-provider'), modelsForProvider('claude'));
  assert.deepEqual(modelsForProvider('custom'), []);
});

test('the filter reads the version the app was built with', () => {
  // electron-vite defines __APP_VERSION__ from package.json at build time; the
  // renderer already reads it that way for the update badge.
  globalThis.__APP_VERSION__ = '1.2.3';
  try {
    assert.equal(runningAppVersion(), '1.2.3');
  } finally {
    delete globalThis.__APP_VERSION__;
  }
  assert.equal(runningAppVersion(), '');
});

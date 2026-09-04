'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { MAX_AGENT_TOKEN_CAP } = loadTs('src/shared/tokenCaps.ts');

// config.ts resolves its file through Electron's app.getPath(). Point that one
// dependency at a throwaway userData root so this test never touches the real
// application config.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-agent-cap-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { app: { getPath: () => userData } }
};

const { readConfig, setAgentTokenCap, writeConfig } = loadTs('src/main/config.ts');

test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

test('consecutive agent caps survive an interleaved config update', () => {
  // writeConfig expands registeredRepos through expandTilde at ingestion, and a
  // POSIX-shaped path is DRIVE-RELATIVE on Windows (isAbsolute says true, then
  // it resolves against the current drive) — so build the fixture through
  // path.resolve: the same absolute spelling in, the same absolute spelling out,
  // on every platform.
  const repo = path.resolve(os.tmpdir(), 'md-cap-repo-fixture');
  writeConfig({ agentTokenCaps: { existing: 50 } });

  setAgentTokenCap('jim', 100);
  writeConfig({ registeredRepos: [repo] });
  setAgentTokenCap('pam', 200);

  const config = readConfig();
  assert.deepEqual(config.agentTokenCaps, {
    existing: 50,
    jim: 100,
    pam: 200
  });
  assert.deepEqual(config.registeredRepos, [repo]);
});

test('setting and clearing caps use the latest persisted map', () => {
  writeConfig({ agentTokenCaps: { existing: 50, obsolete: 75 } });

  setAgentTokenCap('jim', 100);
  setAgentTokenCap('obsolete', undefined);
  setAgentTokenCap('pam', 200);

  assert.deepEqual(readConfig().agentTokenCaps, {
    existing: 50,
    jim: 100,
    pam: 200
  });
});

test('invalid agent-cap IPC values cannot reach persisted config', () => {
  const baseline = { existing: 50 };
  writeConfig({ agentTokenCaps: baseline });
  for (const [agentId, tokenCap] of [
    ['', 100],
    [null, 100],
    ['jim', null],
    ['jim', 0],
    ['jim', -1],
    ['jim', 1.5],
    ['jim', Number.NaN],
    ['jim', MAX_AGENT_TOKEN_CAP + 1]
  ]) {
    assert.throws(() => setAgentTokenCap(agentId, tokenCap), /invalid agent token cap/i);
  }
  assert.deepEqual(readConfig().agentTokenCaps, baseline);
});

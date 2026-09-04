'use strict';

/**
 * Every provider's `installCommand` is `npm install -g …`. On a machine with no
 * Node, the missing-CLI banner used to print that command and RUN it — so a fresh
 * user watched `npm: command not found` scroll past and concluded the app was
 * broken. The ladder classifies first and only ever runs something that can work.
 *
 * The DUM-E roster carries four installable engines: claude (npm + native),
 * codex (npm), opencode (npm + native choco/curl) — and qwen, which deliberately
 * ships NO installer (the user wires its OpenAI-compatible endpoint by hand), so
 * it must land on the manual-hint rung no matter what the machine has.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { chooseInstallRung, buildMissingCliScript } = loadTs('src/main/cliInstall.ts');
const { installInfoForProvider } = loadTs('src/shared/agentProvider.ts');

const script = (provider, npmAvailable, platform) =>
  buildMissingCliScript(provider, provider, npmAvailable, platform);

test('with npm present the ladder is unchanged — npm install, for every installable provider', () => {
  for (const provider of ['claude', 'codex', 'opencode']) {
    const info = installInfoForProvider(provider);
    const rung = chooseInstallRung(info, true);
    assert.equal(rung.kind, 'npm', provider);
    assert.equal(rung.command, info.command, provider);
    assert.equal(rung.nodeMissing, false, provider);
  }
});

test('with npm absent, claude and opencode use their native installers', () => {
  // Both vendors ship self-contained installers that need no node/npm at all.
  for (const provider of ['claude', 'opencode']) {
    const info = installInfoForProvider(provider);
    assert.ok(info.nativeCommand, `${provider} ships a native installer`);
    const rung = chooseInstallRung(info, false);
    assert.equal(rung.kind, 'native', provider);
    assert.equal(rung.nodeMissing, true, provider);
    assert.doesNotMatch(rung.command, /\bnpm\b/, `${provider}: the whole point is that npm is not there`);
  }
  // The platform-specific native forms must be the ones the banner would run.
  assert.match(installInfoForProvider('claude', 'win32').nativeCommand, /powershell/);
  assert.match(installInfoForProvider('opencode', 'win32').nativeCommand, /choco/);
  assert.match(installInfoForProvider('opencode', 'darwin').nativeCommand, /curl/);
});

test('with npm absent and no native installer, NOTHING is run', () => {
  // codex ships no node-free installer, so the no-node path must stop at the
  // manual hint rather than run a command that cannot succeed.
  const info = installInfoForProvider('codex');
  assert.equal(info.nativeCommand, undefined, 'fixture assumes codex has no native installer');
  const rung = chooseInstallRung(info, false);
  assert.equal(rung.kind, 'manual');
  assert.equal(rung.command, undefined, 'a command here would be the doomed `npm install -g`');
});

test('qwen has no installer at all, so every ladder ends at the manual hint', () => {
  // qwen is on the wizard's picker but installs by hand: no npm package rung,
  // no native rung. This is what engine-availability surfaces as not-installable.
  const info = installInfoForProvider('qwen');
  assert.equal(info.command, undefined, 'qwen is not an npm global package');
  assert.equal(info.nativeCommand, undefined, 'qwen ships no self-contained installer');
  assert.equal(chooseInstallRung(info, true).kind, 'manual', 'even WITH npm there is nothing to run');
  assert.equal(chooseInstallRung(info, false).kind, 'manual');
});

test('the no-node script explains the real problem instead of failing at it', () => {
  const out = script('codex', false);
  assert.match(out, /Node\.js is not installed/);
  assert.match(out, /nodejs\.org/, 'tell the user where to get it');
  assert.match(out, /Docs: https/, 'and keep the provider docs link');

  // The npm command may still be SHOWN (as the follow-up step) but must never be
  // an executed line: every executable line here is an `echo`.
  const executable = out.split('\n').filter((l) => l.trim() && !/^\s*echo\b/.test(l.trim()));
  assert.deepEqual(executable, [], `these would run on a machine with no node: ${executable}`);
});

test('the native rung actually runs, and says why it differs', () => {
  // The unix branch of buildMissingCliScript: one statement per line, so the
  // executed installer is a whole line of its own. The platform is passed
  // explicitly because the default is process.platform — on a Windows dev
  // machine that takes the single `&`-chained cmd.exe branch instead.
  const out = script('claude', false, 'darwin');
  assert.match(out, /no Node needed/);
  // The posix form, not the win32 default process.platform would pick.
  const native = installInfoForProvider('claude', 'darwin').nativeCommand;
  assert.ok(out.split('\n').includes(native), 'the installer must be an executed line, not only echoed');
});

test('with npm present nothing mentions a missing Node', () => {
  const out = script('claude', true, 'darwin');
  assert.doesNotMatch(out, /Node\.js is not installed/);
  assert.ok(out.split('\n').includes('npm install -g @anthropic-ai/claude-code'));
});

test('the Windows script stays a single quote-free cmd.exe line', () => {
  // It is wrapped verbatim in `cmd /d /s /c "<script>"` — one embedded double
  // quote ends the command line early and the rest executes as garbage.
  for (const provider of ['claude', 'codex']) {
    for (const npm of [true, false]) {
      const out = buildMissingCliScript(provider, provider, npm, 'win32');
      assert.ok(!out.includes('"'), `${provider}/${npm}: embedded quote`);
      assert.ok(!out.includes('\n'), `${provider}/${npm}: must be one line`);
    }
  }
  assert.match(buildMissingCliScript('claude', 'claude', false, 'win32'), /powershell/,
    'the native rung must be the PowerShell form on Windows, not the curl one');
  assert.match(buildMissingCliScript('opencode', 'opencode', false, 'win32'), /choco/,
    'opencode ships no install.ps1, so its Windows native rung is Chocolatey');
});

test('a hostile binary name cannot inject a command into the banner', () => {
  const out = script('claude', true).split('\n');
  const evil = buildMissingCliScript("x'; rm -rf /; echo '", 'claude', true).split('\n');
  assert.equal(evil.length, out.length, 'no extra statements');
  assert.ok(evil.some((l) => l.includes('xrm-rf')), 'sanitized to a bare identifier');
  assert.ok(!evil.some((l) => /rm -rf \//.test(l)));
});

'use strict';
// parseBundledNodeCmd — the bundled-node .cmd launcher decoder added during
// the first real mission (2026-09-08): qwen-code's Windows install spawns dead
// through the cmd.exe fallback (protocol truncated at first newline) because
// parseNpmCmdShim rightly rejects its non-npm shape. These tests pin the
// exact shapes found on the live machine, plus the refusal family.
//
// Loaded via the suite's shared loadTs helper (same as win-cmd-shim).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { parseBundledNodeCmd } = loadTs('src/main/pty.ts');

test('qwen-code\'s real launcher decodes (the live first-mission shape)', () => {
  // Verbatim from C:\Users\srich\AppData\Local\qwen-code\qwen-code\bin\qwen.cmd
  const content = [
    '@echo off',
    'setlocal',
    'set "ROOT=%~dp0.."',
    'set "QWEN_CODE_LAUNCHER_PATH=%ROOT%\\bin\\qwen.cmd"',
    '"%ROOT%\\node\\node.exe" "%ROOT%\\lib\\cli-entry.js" %*',
    'exit /b %ERRORLEVEL%',
    ''
  ].join('\r\n');
  const t = parseBundledNodeCmd('C:\\install\\qwen-code\\qwen-code\\bin\\qwen.cmd', content);
  assert.ok(t, 'must decode');
  assert.equal(t.interpreterPath, 'C:\\install\\qwen-code\\qwen-code\\node\\node.exe');
  assert.equal(t.scriptPath, 'C:\\install\\qwen-code\\qwen-code\\lib\\cli-entry.js');
});

test('outer stub with call chain is refused by the DECODER itself (one hop is decoded elsewhere, chains are not)', () => {
  // Verbatim outer: @echo off / call "<abs>" %*  — no set-vars, a `call` verb,
  // ONE quoted token → not the bundled shape → null (the SPAWN PATH follows
  // this hop before calling the decoder; the decoder stays pure).
  const content = '@echo off\r\ncall "C:\\Users\\x\\qwen-code\\bin\\qwen.cmd" %*\r\n';
  assert.equal(parseBundledNodeCmd('C:\\shims\\qwen.cmd', content), null);
});

test('the spawn path\'s one-hop stub following decodes outer qwen.cmd → inner launcher (live chain)', () => {
  // Verbatim OUTER stub (C:\Users\srich\AppData\Local\qwen-code\bin\qwen.cmd):
  //   @echo off
  //   call "C:\Users\srich\AppData\Local\qwen-code\qwen-code\bin\qwen.cmd" %*
  // The spawn path follows the call target, reads the INNER file, and decodes
  // THAT. This test replicates the follow + decode sequence with the real
  // inner content (verbatim from the live machine).
  const outer = '@echo off\r\ncall "C:\\Users\\srich\\AppData\\Local\\qwen-code\\qwen-code\\bin\\qwen.cmd" %*\r\n';
  // Decoder on the outer alone must refuse (no vars/exec of its own):
  assert.equal(parseBundledNodeCmd('C:\\Users\\srich\\AppData\\Local\\qwen-code\\bin\\qwen.cmd', outer), null);
  // The inner launcher (verbatim) decodes when handed the inner path:
  const inner = [
    '@echo off',
    'setlocal',
    'set "ROOT=%~dp0.."',
    'set "QWEN_CODE_LAUNCHER_PATH=%ROOT%\\bin\\qwen.cmd"',
    '"%ROOT%\\node\\node.exe" "%ROOT%\\lib\\cli-entry.js" %*',
    'exit /b %ERRORLEVEL%',
    ''
  ].join('\r\n');
  const t = parseBundledNodeCmd('C:\\Users\\srich\\AppData\\Local\\qwen-code\\qwen-code\\bin\\qwen.cmd', inner);
  assert.ok(t, 'inner launcher must decode');
  assert.equal(t.interpreterPath, 'C:\\Users\\srich\\AppData\\Local\\qwen-code\\qwen-code\\node\\node.exe');
  assert.equal(t.scriptPath, 'C:\\Users\\srich\\AppData\\Local\\qwen-code\\qwen-code\\lib\\cli-entry.js');
});

test('interpreter allowlist is enforced (python.exe refused)', () => {
  const content = 'set "ROOT=C:\\app"\r\n"%ROOT%\\python\\python.exe" "%ROOT%\\main.py" %*\r\n';
  assert.equal(parseBundledNodeCmd('C:\\shims\\app.cmd', content), null);
});

test('non-JS entry is refused (.exe target)', () => {
  const content = 'set "ROOT=C:\\app"\r\n"%ROOT%\\node\\node.exe" "%ROOT%\\bin\\tool.exe" %*\r\n';
  assert.equal(parseBundledNodeCmd('C:\\shims\\app.cmd', content), null);
});

test('unexpanded %VAR% survives → refused (unknown variable)', () => {
  const content = 'set "ROOT=C:\\app"\r\n"%MISSING%\\node.exe" "%ROOT%\\lib\\cli.js" %*\r\n';
  assert.equal(parseBundledNodeCmd('C:\\shims\\app.cmd', content), null);
});

test('extra tokens between interpreter and script → refused', () => {
  const content = 'set "ROOT=C:\\app"\r\n"%ROOT%\\node\\node.exe" --max-old-space=4096 "%ROOT%\\lib\\cli.js" %*\r\n';
  assert.equal(parseBundledNodeCmd('C:\\shims\\app.cmd', content), null);
});

test('garbage / empty / binary inputs → null, never throws', () => {
  assert.equal(parseBundledNodeCmd('', ''), null);
  assert.equal(parseBundledNodeCmd('C:\\a.cmd', 'total nonsense\r\nno exec'), null);
  assert.equal(parseBundledNodeCmd('C:\\a.cmd', 'x\0y'), null);
  assert.equal(parseBundledNodeCmd('C:\\a.cmd', null), null);
});

test('chained vars expand (LAUNCHER built from ROOT built from %~dp0)', () => {
  const content = [
    '@echo off',
    'setlocal',
    'set "ROOTDIR=C:\\apps\\tool"',
    'set "BIN=%ROOTDIR%\\bin"',
    '"%BIN%\\node.exe" "%ROOTDIR%\\lib\\main.js" %*',
    ''
  ].join('\r\n');
  const t = parseBundledNodeCmd('D:\\shims\\tool.cmd', content);
  assert.ok(t);
  assert.equal(t.interpreterPath, 'C:\\apps\\tool\\bin\\node.exe');
  assert.equal(t.scriptPath, 'C:\\apps\\tool\\lib\\main.js');
});

'use strict';
/**
 * Agent-provider registry tests. Self-contained, no test framework — run with
 * `node test/agent-provider.test.cjs` (mirrors test/kg-core.test.cjs). The
 * registry lives in TypeScript (src/shared/agentProvider.ts), so we transpile it
 * and its two dependency-free command-group siblings with the bundled `typescript`
 * compiler into a temp dir and require the result.
 *
 * The engine roster is deliberately small (DUM-E's supported set): qwen (the
 * default), claude, codex, opencode, custom. Every preset here is exercised for
 * the invariants a spawn actually leans on — binary inference, bridges, resume
 * and install stories — so a rebrand/roster change that quietly breaks one of
 * them fails here instead of at first spawn.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const SHARED = path.join(__dirname, '..', 'src', 'shared');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprov-'));
for (const name of ['claudeCommands', 'codexCommands', 'agentProvider']) {
  const src = fs.readFileSync(path.join(SHARED, `${name}.ts`), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  fs.writeFileSync(path.join(out, `${name}.js`), js, 'utf8');
}
const ap = require(path.join(out, 'agentProvider.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.log(`  ✗ ${name}\n     ${err && err.message}`); }
}

console.log('agent-provider registry tests');

test('the roster is exactly the five supported providers, all selectable', () => {
  // The trim from 13 to 5 is the product decision these tests guard: a preset
  // resurrected (or deleted) without touching this list means the roster
  // drifted from what the UI claims to offer.
  assert.deepEqual(
    ap.AGENT_PROVIDER_PRESETS.map((p) => p.id),
    ['claude', 'codex', 'qwen', 'opencode', 'custom']
  );
  for (const id of ['claude', 'codex', 'qwen', 'opencode', 'custom']) {
    assert.ok(ap.isAgentProvider(id), `isAgentProvider("${id}")`);
  }
  // Removed engines are no longer providers at all — a stale enum value flowing
  // in from an old config must not survive normalization.
  for (const gone of ['gemini', 'grok', 'kimi', 'crush', 'pi', 'copilot', 'cursor', 'antigravity']) {
    assert.equal(ap.isAgentProvider(gone), false, gone);
  }
});

test('inferAgentProvider maps each supported binary to itself', () => {
  // Binary inference is what the spawn path runs on every command line.
  assert.strictEqual(ap.inferAgentProvider('claude'), 'claude');
  assert.strictEqual(ap.inferAgentProvider('codex'), 'codex');
  assert.strictEqual(ap.inferAgentProvider('qwen'), 'qwen');
  assert.strictEqual(ap.inferAgentProvider('opencode'), 'opencode');
  // Path + extension stripped, flags ignored: 'C:\...\agy.exe' shapes arrive
  // from user-typed command strings.
  assert.strictEqual(ap.inferAgentProvider('/usr/local/bin/codex --model gpt-5.6-sol'), 'codex');
  assert.strictEqual(ap.inferAgentProvider('qwen.exe'), 'qwen');
  assert.strictEqual(ap.inferAgentProvider('opencode.cmd --model anthropic/claude-sonnet-4-5'), 'opencode');
});

test('an unknown binary infers custom; an empty command infers claude', () => {
  // The pre-trim roster mapped several exotic binaries to their own presets;
  // every one of them now lands on 'custom', which spawns verbatim.
  for (const gone of ['cursor-agent', 'gemini', 'grok', 'crush', 'copilot', 'agy', 'kimi']) {
    assert.strictEqual(ap.inferAgentProvider(gone), 'custom', gone);
  }
  // An empty command is the "nothing typed yet" state of the custom field.
  assert.strictEqual(ap.inferAgentProvider(''), 'claude');
  assert.strictEqual(ap.inferAgentProvider(undefined), 'claude');
});

test('isClaudeProvider gates the Claude-only identity injection', () => {
  assert.strictEqual(ap.isClaudeProvider('claude'), true);
  for (const p of ['codex', 'qwen', 'opencode', 'custom']) {
    assert.strictEqual(ap.isClaudeProvider(p), false, p);
  }
});

test('only claude is hiveAware (accepts --append-system-prompt/--settings)', () => {
  assert.strictEqual(ap.providerPreset('claude').hiveAware, true);
  for (const p of ['codex', 'qwen', 'opencode', 'custom']) {
    assert.strictEqual(ap.providerPreset(p).hiveAware, false, p);
  }
});

test('every provider except custom can receive hive inbox mail', () => {
  // canReceiveInbox is the god-eligibility gate: mail to a hookless provider
  // would bounce forever, so custom stays out.
  for (const p of ['claude', 'codex', 'qwen', 'opencode']) {
    assert.strictEqual(ap.canReceiveInbox(p), true, p);
  }
  assert.strictEqual(ap.canReceiveInbox('custom'), false, 'no drain path → mail bounces to the god');
});

test('claude and custom carry no bridge; the rest each declare one', () => {
  // claude uses its native --settings path; custom has no lifecycle surface.
  assert.strictEqual(ap.bridgeOf('claude'), undefined, 'claude needs no bridge');
  assert.strictEqual(ap.bridgeOf('custom'), undefined, 'custom has no bridge');
  // codex reuses the cth-hook shim via its legacy hookBridge, derived into the
  // structured descriptor by bridgeOf.
  assert.deepEqual(ap.bridgeOf('codex'), { kind: 'hooks', shim: 'codex' });
  // opencode's bundled session.idle plugin is modeled as a hooks bridge.
  assert.deepEqual(ap.bridgeOf('opencode'), { kind: 'hooks', shim: 'opencode' });
  // qwen has NO hook surface at all — it rides a loopback reverse proxy that
  // synthesizes the same HIVE_SOCK payloads from observed LLM traffic.
  assert.deepEqual(ap.bridgeOf('qwen'), {
    kind: 'proxy', api: 'openai', baseUrlEnv: 'OPENAI_BASE_URL', inboxDelivery: 'terminal'
  });
});

test('resume stories: claude by flag, codex by subcommand, qwen/opencode fresh', () => {
  assert.strictEqual(ap.providerPreset('claude').resumeFlag, '--resume');
  assert.strictEqual(ap.providerPreset('claude').resumeSubcommand, undefined);
  const codex = ap.providerPreset('codex');
  assert.strictEqual(codex.resumeFlag, undefined, 'codex has no --resume flag');
  assert.strictEqual(codex.resumeSubcommand, 'resume', '`codex resume <id>` is the real surface');
  assert.strictEqual(ap.providerPreset('qwen').resumeFlag, undefined);
  assert.strictEqual(ap.providerPreset('opencode').resumeFlag, undefined);
});

test('qwen seeds via -i, opencode via --prompt, codex positionally', () => {
  // The hive identity+protocol has to ride in somewhere on every non-Claude
  // CLI; the preset says where, and a wrong flag is a spawn that dies on argv.
  assert.strictEqual(ap.providerPreset('qwen').initialPromptFlag, '-i');
  assert.strictEqual(ap.providerPreset('opencode').initialPromptFlag, '--prompt');
  const codex = ap.providerPreset('codex');
  assert.strictEqual(codex.initialPromptFlag, undefined, 'codex takes the prompt positionally');
  assert.strictEqual(codex.positionalInitialPrompt, true);
});

test('claude, codex and opencode ship installers; qwen and custom do not', () => {
  // The install ladder leans on these: an installCommand is the npm rung, a
  // nativeInstallCommand the node-free rung. qwen deliberately has NEITHER —
  // the wizard marks it not-installable and the user installs by hand.
  assert.strictEqual(ap.providerPreset('claude').installCommand, 'npm install -g @anthropic-ai/claude-code');
  assert.ok(ap.providerPreset('claude').nativeInstallCommand, 'claude ships a node-free installer');
  assert.strictEqual(ap.providerPreset('codex').installCommand, 'npm install -g @openai/codex');
  assert.strictEqual(ap.providerPreset('codex').nativeInstallCommand, undefined, 'codex has no native rung');
  assert.strictEqual(ap.providerPreset('opencode').installCommand, 'npm install -g opencode-ai@latest');
  assert.ok(ap.providerPreset('opencode').nativeInstallCommand, 'opencode ships choco/curl installers');
  assert.strictEqual(ap.providerPreset('qwen').installCommand, undefined, 'qwen installs by hand only');
  assert.strictEqual(ap.providerPreset('qwen').nativeInstallCommand, undefined);
  assert.strictEqual(ap.providerPreset('custom').installCommand, undefined, 'custom is whatever the user typed');
  assert.strictEqual(ap.providerPreset('custom').nativeInstallCommand, undefined);
});

test('auto flags: each provider splices its own skip-permissions posture', () => {
  assert.strictEqual(ap.autoModeFlagForProvider('claude'), '--permission-mode bypassPermissions');
  assert.strictEqual(ap.autoModeFlagForProvider('codex'), '-a never -s workspace-write');
  assert.strictEqual(ap.autoModeFlagForProvider('qwen'), '--yolo');
  // opencode has NO flag: its TUI exposes no skip-permissions token, so the
  // permission JSON is built at spawn instead (spawnAgentCore).
  assert.strictEqual(ap.autoModeFlagForProvider('opencode'), '');
  assert.strictEqual(ap.autoModeFlagForProvider('custom'), '');
});

test('default commands: four real binaries, custom empty', () => {
  assert.strictEqual(ap.providerPreset('claude').defaultCommand, 'claude');
  assert.strictEqual(ap.providerPreset('codex').defaultCommand, 'codex');
  assert.strictEqual(ap.providerPreset('qwen').defaultCommand, 'qwen');
  assert.strictEqual(ap.providerPreset('opencode').defaultCommand, 'opencode');
  assert.strictEqual(ap.providerPreset('custom').defaultCommand, '', 'the command field is the whole interface');
});

test('recommended orchestrator models: qwen and opencode disagree on purpose', () => {
  // qwen names its long-context coder; opencode deliberately has NONE (a BYOK
  // slug would resolve only for a user with that key — see the preset's comment).
  assert.strictEqual(ap.providerPreset('qwen').recommendedOrchestratorModel, 'qwen3-coder-plus');
  assert.strictEqual(ap.providerPreset('opencode').recommendedOrchestratorModel, undefined);
});

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll agent-provider tests passed');

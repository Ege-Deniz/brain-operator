#!/usr/bin/env node
/* Brain Operator — Cold-install Bootstrap Simulator (v0.6.7)
 *
 * Run: `node .obsidian/plugins/brain-ask/tests/cold-install-sim.js`
 *
 * Simulates the BootstrapModal.scaffold() flow without needing Obsidian
 * open. Creates a temp directory, runs the scaffold logic against it,
 * and verifies every file lands at the expected path with non-empty
 * content. Exits 0 on success, non-zero on failure.
 *
 * What this DOES verify:
 *   - All files in the governed starter scaffold create correctly (count asserted dynamically)
 *   - File paths match what the auto-trigger marker check looks for
 *     (CLAUDE.md, AGENTS.md, wiki/index.md, .claude/skills/brain-evolve/SKILL.md)
 *   - Idempotency: re-running scaffold doesn't re-write existing files
 *   - Non-empty bodies: every file has at least 50 chars (no truncation)
 *   - Context-governance presence: context-routing, scratch, and quarantined legacy skills
 *
 * What this does NOT verify:
 *   - Obsidian's actual UI/modal flow (needs Electron)
 *   - The plugin's auto-trigger via brainVaultIsBootstrapped() in a
 *     real vault (needs Obsidian's vault adapter)
 *   - That a real `claude` subprocess can answer "What's in my wiki?"
 *
 * For full runtime verification, follow BOOTSTRAP-COLD-INSTALL-CHECKLIST.md
 * in a real Obsidian session. This script is the logic-level gate that
 * runs in CI / pre-commit.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const REQUIRED_MARKERS = [
  'CLAUDE.md',
  'AGENTS.md',
  'wiki/index.md',
  '.claude/skills/brain-evolve/SKILL.md',
];

let passed = 0;
let failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

function fail(msg) { console.error('FATAL: ' + msg); process.exit(2); }

// ---- Load runtime starter through main.js test hooks ----
// This intentionally exercises the same transform BootstrapModal uses. The
// raw BRAIN_STARTER_VAULT constant is historical input now; the product
// contract is getGovernedStarterVault().
const _origLoad = Module._load;
Module._load = function (request) {
  if (request === 'obsidian') {
    class Stub {
      constructor() {}
      registerEvent() {}
      registerDomEvent() {}
      registerObsidianProtocolHandler() {}
      addCommand() {}
      addRibbonIcon() {}
      addStatusBarItem() { return { addClass(){}, setText(){}, addEventListener(){}, style:{} }; }
      addSettingTab() {}
      loadData() { return {}; }
      saveData() {}
    }
    const noop = function() {};
    return {
      Plugin: Stub,
      Modal: Stub,
      PluginSettingTab: Stub,
      Setting: Stub,
      Notice: noop,
    };
  }
  return _origLoad.apply(this, arguments);
};

const live = require(path.join(__dirname, '..', 'main.js')).testHooks;
if (!live || typeof live.getGovernedStarterVault !== 'function') {
  fail('getGovernedStarterVault test hook not found in main.js');
}

const vaultObj = live.getGovernedStarterVault();

const fileCount = Object.keys(vaultObj).length;
console.log(`\nLoaded governed starter scaffold — ${fileCount} files`);

// ---- Simulate scaffold into a temp dir ----
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-coldinstall-'));
console.log(`Scaffolding into: ${tmpRoot}\n`);

const writeResults = { created: 0, skipped: 0, errors: 0 };
function scaffold(targetRoot, starter) {
  for (const [rel, content] of Object.entries(starter)) {
    const full = path.join(targetRoot, rel);
    try {
      if (fs.existsSync(full)) { writeResults.skipped++; continue; }
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      writeResults.created++;
    } catch (e) {
      writeResults.errors++;
      console.error(`  scaffold error on ${rel}: ${e.message}`);
    }
  }
}

console.log('--- Pass 1: empty vault scaffold ---');
scaffold(tmpRoot, vaultObj);
assert(writeResults.created === fileCount, `${fileCount} files created`,
  `actual: ${writeResults.created}`);
assert(writeResults.skipped === 0, '0 files skipped on first run');
assert(writeResults.errors === 0, '0 errors');

// ---- Verify markers exist (matches brainVaultIsBootstrapped() check) ----
console.log('\n--- Markers (auto-trigger guard) ---');
for (const marker of REQUIRED_MARKERS) {
  const exists = fs.existsSync(path.join(tmpRoot, marker));
  assert(exists, `marker exists: ${marker}`);
}

// ---- Idempotency: re-run, expect 0 writes ----
console.log('\n--- Pass 2: idempotency (re-run on populated vault) ---');
writeResults.created = 0;
writeResults.skipped = 0;
writeResults.errors = 0;
scaffold(tmpRoot, vaultObj);
assert(writeResults.created === 0, 'idempotent: 0 new files created on re-run');
assert(writeResults.skipped === fileCount, `idempotent: ${fileCount} files skipped`);

// ---- Non-empty / placeholder checks ----
console.log('\n--- Content sanity ---');
let smallestSize = Infinity;
let smallestPath = '';
for (const rel of Object.keys(vaultObj)) {
  const stat = fs.statSync(path.join(tmpRoot, rel));
  if (stat.size < smallestSize) { smallestSize = stat.size; smallestPath = rel; }
}
assert(smallestSize >= 50, `smallest file ≥ 50 bytes (${smallestPath} = ${smallestSize}B)`);

const indexMd = fs.readFileSync(path.join(tmpRoot, 'wiki/index.md'), 'utf8');
assert(indexMd.length > 100, 'wiki/index.md non-trivial');

const claudeMd = fs.readFileSync(path.join(tmpRoot, 'CLAUDE.md'), 'utf8');
assert(/How To Help, Not Steer/.test(claudeMd), 'CLAUDE.md includes responsive helper modes');
assert(/context-routing\.md/.test(claudeMd), 'CLAUDE.md points to context-routing policy');
assert(/start outside the vault/i.test(claudeMd), 'CLAUDE.md encodes aperture default');

// AGENTS.md is deliberately thin: read CLAUDE.md and context-routing, but
// do not recreate a parallel operating system or force log/handoff context.
const agentsMd = fs.readFileSync(path.join(tmpRoot, 'AGENTS.md'), 'utf8');
assert(/Read `CLAUDE\.md` first/.test(agentsMd), 'AGENTS.md points to CLAUDE.md');
assert(/context-routing\.md/.test(agentsMd), 'AGENTS.md points to context-routing');
assert(!/Agent Handoff Log\.md/.test(agentsMd), 'AGENTS.md does not force old handoff-log preload');

const evolveSkill = fs.readFileSync(path.join(tmpRoot, '.claude/skills/brain-evolve/SKILL.md'), 'utf8');
assert(/status: historical/.test(evolveSkill), 'brain-evolve starter skill is historical');
assert(/triggers: \[\]/.test(evolveSkill), 'brain-evolve starter skill has no triggers');
assert(/quarantined/i.test(evolveSkill), 'brain-evolve starter skill has quarantine warning');

assert(fs.existsSync(path.join(tmpRoot, 'wiki/_common/context-routing.md')),
  'context-routing.md scaffolded');
assert(fs.existsSync(path.join(tmpRoot, 'wiki/_scratch/README.md')),
  '_scratch README scaffolded');
assert(!fs.existsSync(path.join(tmpRoot, 'wiki/_common/operating-mode.md')),
  'operating-mode.md not scaffolded');
assert(!fs.existsSync(path.join(tmpRoot, 'wiki/_proposals/queue.md')),
  '_proposals queue not scaffolded');

// ---- Personalization audit (v0.5.3 commitment) ----
console.log('\n--- Depersonalization audit ---');
let personalLeaks = 0;
for (const [rel, content] of Object.entries(vaultObj)) {
  // The starter content should NOT contain the original author's name
  // or vault-specific paths. Anyone installing should see generic copy.
  if (/Ege Deniz/.test(content)) {
    failed++;
    console.log(`  ✗ ${rel}: contains "Ege Deniz"`);
    personalLeaks++;
  }
  if (/\/Users\/egedeniz/.test(content)) {
    failed++;
    console.log(`  ✗ ${rel}: contains hardcoded /Users/egedeniz path`);
    personalLeaks++;
  }
}
assert(personalLeaks === 0, `no personal-name leaks in scaffold content (${personalLeaks} found)`);

// ---- Cleanup ----
console.log('\n--- Cleanup ---');
fs.rmSync(tmpRoot, { recursive: true, force: true });
assert(!fs.existsSync(tmpRoot), 'temp dir removed');

// ---- Summary ----
console.log('\n' + '='.repeat(50));
console.log(`${passed} passed, ${failed} failed`);
console.log('='.repeat(50));
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
/* Brain Operator — Cold-install Bootstrap Simulator (v0.5.3)
 *
 * Run: `node .obsidian/plugins/brain-ask/tests/cold-install-sim.js`
 *
 * Simulates the BootstrapModal.scaffold() flow without needing Obsidian
 * open. Creates a temp directory, runs the scaffold logic against it,
 * and verifies every file lands at the expected path with non-empty
 * content. Exits 0 on success, non-zero on failure.
 *
 * What this DOES verify:
 *   - All files in BRAIN_STARTER_VAULT extract correctly (count asserted dynamically)
 *   - File paths match what the auto-trigger marker check looks for
 *     (CLAUDE.md, AGENTS.md, wiki/index.md, .claude/skills/brain-evolve/SKILL.md)
 *   - Idempotency: re-running scaffold doesn't re-write existing files
 *   - Non-empty bodies: every file has at least 50 chars (no truncation)
 *   - Placeholder presence: CLAUDE.md still has {{NAME}}/{{ROLE}}/{{STACK}}
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

const MAIN_JS_PATH = path.join(__dirname, '..', 'main.js');
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

// ---- Extract BRAIN_STARTER_VAULT JSON literal from main.js ----
const src = fs.readFileSync(MAIN_JS_PATH, 'utf8');
const match = src.match(/const BRAIN_STARTER_VAULT = (\{[\s\S]*?\});\n/);
if (!match) fail('BRAIN_STARTER_VAULT not found in main.js');

let vaultObj;
try {
  // The literal is a JS object expression with string keys + string values.
  // Most string values use single-line escaped JSON; safe to eval as JS.
  // We use Function constructor in a no-network sandbox; this file is dev-only.
  vaultObj = new Function(`return ${match[1]}`)();
} catch (e) {
  fail('Failed to parse BRAIN_STARTER_VAULT: ' + e.message);
}

const fileCount = Object.keys(vaultObj).length;
console.log(`\nExtracted BRAIN_STARTER_VAULT — ${fileCount} files`);

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

const claudeMd = fs.readFileSync(path.join(tmpRoot, 'CLAUDE.md'), 'utf8');
assert(claudeMd.includes('{{NAME}}'), 'CLAUDE.md has {{NAME}} placeholder');
assert(claudeMd.includes('{{ROLE}}'), 'CLAUDE.md has {{ROLE}} placeholder');
assert(claudeMd.includes('{{STACK}}'), 'CLAUDE.md has {{STACK}} placeholder');

const indexMd = fs.readFileSync(path.join(tmpRoot, 'wiki/index.md'), 'utf8');
assert(indexMd.length > 100, 'wiki/index.md non-trivial');

// AGENTS.md must instruct the running agent to read the handoff log — that
// instruction is the cross-CLI wedge. If it ever gets stripped from the
// starter, the plugin's "Codex inherits Claude's last move" claim breaks
// silently. Pin the contract here.
const agentsMd = fs.readFileSync(path.join(tmpRoot, 'AGENTS.md'), 'utf8');
assert(/Agent Handoff Log\.md/.test(agentsMd),
  'AGENTS.md references wiki/operating/Agent Handoff Log.md');
assert(/last 3 entries/i.test(agentsMd) || /last\s+\d+\s+entries/i.test(agentsMd),
  'AGENTS.md tells the agent how many recent entries to load');

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

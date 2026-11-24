#!/usr/bin/env node
/* Brain Operator — regenerate examples/starter-vault/ from the shipped scaffold.
 *
 *   node tools/sync-starter-examples.js          rewrite the directory
 *   node tools/sync-starter-examples.js --check  exit non-zero if it drifted
 *
 * Why this exists: through v0.7.0, examples/starter-vault/ was a hand-copied
 * snapshot that stopped tracking getGovernedStarterVault(). It kept shipping
 * operating-mode.md, _proposals/queue.md, and the full brain-evolve /
 * brain-ship skills WITH LIVE TRIGGERS for three releases after the plugin
 * itself stopped scaffolding them — so anyone reading the repo saw the cage
 * the plugin had already removed. The directory is now generated, and
 * cold-install-sim.js runs --check so the drift cannot recur.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

// Minimal Obsidian shim — main.js requires it at import time.
const _origLoad = Module._load;
Module._load = function (request) {
  if (request === 'obsidian') {
    class Stub {
      constructor() {}
      registerEvent() {} registerDomEvent() {} registerObsidianProtocolHandler() {}
      addCommand() {} addRibbonIcon() {}
      addStatusBarItem() { return { addClass(){}, setText(){}, addEventListener(){}, style:{} }; }
      addSettingTab() {} loadData() { return {}; } saveData() {}
    }
    return { Plugin: Stub, Modal: Stub, PluginSettingTab: Stub, Setting: Stub, Notice: function () {} };
  }
  return _origLoad.apply(this, arguments);
};

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'examples', 'starter-vault');
const HEADER = [
  '<!-- GENERATED FILE — do not edit by hand.',
  '     Source: getGovernedStarterVault() in main.js',
  '     Regenerate: node tools/sync-starter-examples.js -->',
  '',
].join('\n');

function scaffold() {
  const { testHooks } = require(path.join(REPO, 'main.js'));
  return testHooks.getGovernedStarterVault();
}

function listExisting(dir, base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listExisting(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function expectedContent(rel, body) {
  // Markdown carries the generated banner; anything else is written verbatim.
  return rel.endsWith('.md') ? HEADER + body : body;
}

function main() {
  const check = process.argv.includes('--check');
  const files = scaffold();
  const expected = new Map();
  for (const [rel, body] of Object.entries(files)) {
    expected.set(rel, expectedContent(rel, body));
  }

  const existing = listExisting(OUT);
  const problems = [];

  for (const rel of existing) {
    if (!expected.has(rel)) problems.push(`stale file not in the scaffold: ${rel}`);
  }
  for (const [rel, body] of expected) {
    const abs = path.join(OUT, rel);
    if (!fs.existsSync(abs)) { problems.push(`missing: ${rel}`); continue; }
    if (fs.readFileSync(abs, 'utf8') !== body) problems.push(`content drifted: ${rel}`);
  }

  if (check) {
    if (problems.length) {
      console.error('examples/starter-vault/ has drifted from getGovernedStarterVault():');
      for (const p of problems) console.error(`  - ${p}`);
      console.error('\nRun: node tools/sync-starter-examples.js');
      process.exit(1);
    }
    console.log(`examples/starter-vault/ matches the scaffold (${expected.size} files).`);
    return;
  }

  for (const rel of existing) {
    if (!expected.has(rel)) fs.rmSync(path.join(OUT, rel), { force: true });
  }
  for (const [rel, body] of expected) {
    const abs = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  // Drop directories the scaffold no longer produces.
  const prune = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const abs = path.join(dir, entry.name);
      prune(abs);
      if (fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    }
  };
  prune(OUT);
  console.log(`Regenerated examples/starter-vault/ (${expected.size} files).`);
}

main();

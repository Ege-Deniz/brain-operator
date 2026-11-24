#!/usr/bin/env node
/* Brain Operator — run every suite.
 *
 *   node tests/run-all.js
 *
 * Four suites, no dependencies, no runner. Exits non-zero if any fails.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['parser-tests.js',      'parsers, schemas, routing, scope, state, prompt'],
  ['cold-install-sim.js',  'first-launch scaffold on a temp vault'],
  ['apply-guard-e2e.js',   'Apply dirty-worktree guard against real git'],
  ['observatory-smoke.js', 'Observatory renders on empty/real/malformed data'],
  ['workbench-e2e.js',     'multi-provider, git worktrees, parallel threads, HTTP/SSE'],
];

let failedSuites = 0;
const summary = [];

for (const [file, what] of SUITES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) passed, (\d+) failed/);
  const ok = r.status === 0;
  if (!ok) {
    failedSuites++;
    process.stdout.write(out);
  }
  summary.push({ file, what, ok, counts: m ? `${m[1]}/${Number(m[1]) + Number(m[2])}` : '—' });
}

console.log('\n' + '='.repeat(64));
for (const s of summary) {
  console.log(`  ${s.ok ? '✓' : '✗'} ${s.file.padEnd(22)} ${s.counts.padStart(8)}   ${s.what}`);
}
console.log('='.repeat(64));
console.log(failedSuites === 0 ? 'all suites green' : `${failedSuites} suite(s) failed`);
process.exit(failedSuites === 0 ? 0 : 1);

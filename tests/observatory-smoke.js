#!/usr/bin/env node
/* Brain Operator — Observatory smoke test
 *
 * Run: `node tests/observatory-smoke.js`
 *
 * observatory/index.html is opened over file:// with no server and no
 * network. There is no build step and no framework, so this extracts the
 * page's inline script, runs it against a minimal DOM stub, and asserts
 * what it rendered.
 *
 * What this catches:
 *   - runtime errors on empty, real, and malformed archives
 *   - the /* __BRAIN_RECEIPTS_INJECT__ *\/ marker main.js substitutes going missing
 *   - unescaped query text reaching the DOM
 *   - any external host or network call sneaking into a page that must
 *     work offline
 *
 * v0.7.0 shipped an Observatory that was never committed at all; this is
 * the gate that keeps the page real.
 */

'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const PAGE = path.join(__dirname, '..', 'observatory', 'index.html');
const html = fs.readFileSync(PAGE, 'utf8');

const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no inline script found'); process.exit(1); }
const code = m[1];

if (!code.includes('/* __BRAIN_RECEIPTS_INJECT__ */')) {
  console.error('FAIL: injection marker missing from the script'); process.exit(1);
}

function makeEl(id) {
  const el = {
    id, _text: '', _html: '', hidden: false, children: [],
    style: { setProperty(){}, },
    attrs: {},
    set textContent(v){ this._text = String(v); },
    get textContent(){ return this._text; },
    set innerHTML(v){ this._html = String(v); },
    get innerHTML(){ return this._html; },
    setAttribute(k,v){ this.attrs[k]=String(v); },
    getAttribute(k){ return this.attrs[k]; },
  };
  return el;
}

function run(receipts, label) {
  const els = {};
  const doc = { getElementById: (id) => (els[id] = els[id] || makeEl(id)) };
  const ctx = { window: { __BRAIN_RECEIPTS__: receipts }, document: doc, console };
  ctx.window.document = doc;
  vm.createContext(ctx);
  // Emulate main.js's replacement of the marker.
  const injected = code.replace('/* __BRAIN_RECEIPTS_INJECT__ */',
    'window.__BRAIN_RECEIPTS__ = ' + JSON.stringify(receipts) + ';');
  try {
    vm.runInContext(injected, ctx, { filename: 'observatory-inline.js' });
  } catch (e) {
    console.error(`FAIL [${label}]: ${e.message}`);
    process.exit(1);
  }
  return els;
}

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

console.log('\nsample fallback (no archived runs)');
let e = run([], 'sample');
ok(e.sampleBanner.hidden === false, 'sample banner is shown when the archive is empty');
ok(/7 runs/.test(e.runCount.textContent), 'run count reflects the sample set');
ok(/\d+/.test(e.gaugeValue.innerHTML), 'gauge renders a numeric mean');
ok(e.trendSvg.innerHTML.includes('trendLine'), 'trend line is drawn');
ok(e.agentRows.innerHTML.includes('claude') && e.agentRows.innerHTML.includes('codex'),
   'agent leaderboard lists both agents');
ok(e.phantomRows.innerHTML.includes('Course Catalogue'), 'phantom refs are tallied');
ok(e.unreadRows.innerHTML.includes('Current State'), 'cited-but-unread pages are tallied');
ok(e.logRows.innerHTML.includes('80'), 'run log shows the scope cell');
ok(e.gaugeTicks.innerHTML.includes('<line'), 'dial ticks render');

console.log('\nreal archive');
e = run([
  { agent:'claude', mode:'ask', createdAt:'2026-07-28T10:00:00Z', query:'real question',
    scope:{total:1716,inScope:80,excluded:1636}, read:['a.md'], cited:['a.md'], missing:[],
    faithfulness:{score:100,label:'grounded',groundedCitations:1,ungroundedCitations:0,phantomRefs:0} },
], 'real');
ok(!e.sampleBanner, 'sample banner is never unhidden when real runs exist');
ok(/1 run\b/.test(e.runCount.textContent), 'run count is singular for one run');
ok(e.gaugeValue.innerHTML.includes('100'), 'gauge shows the real mean');
ok(e.logRows.innerHTML.includes('real question'), 'run log shows the real query');

console.log('\nhostile / degenerate input');
e = run([
  {}, null, { agent:'claude', faithfulness:{score:null}, cited:[], read:[], missing:[] },
  { agent:'x', createdAt:'not-a-date', query:'<img src=x onerror=alert(1)>', read:null, cited:null, missing:null },
], 'hostile');
ok(true, 'malformed records do not throw');
ok(!e.logRows.innerHTML.includes('<img src=x'), 'query text is HTML-escaped in the run log');
ok(e.logRows.innerHTML.includes('&lt;img'), 'escaping produces entities, not raw markup');
ok(e.gaugeValue.innerHTML === '—' || /\d/.test(e.gaugeValue.innerHTML), 'gauge handles all-null scores');

console.log('\nno external requests');
const externals = html.match(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
const allowed = externals.filter(u => !/w3\.org/.test(u) && !/obsidian\.md/.test(u) && !/claude\.com/.test(u));
ok(allowed.length === 0, 'no external hosts referenced (found: ' + (allowed.join(', ') || 'none') + ')');
ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|import\s*\(/.test(code), 'script makes no network calls');

console.log('\n' + '='.repeat(50));
console.log(`${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/* Brain Operator — temp-git Apply guard e2e
 *
 * Run: `node .obsidian/plugins/brain-ask/tests/apply-guard-e2e.js`
 *
 * This is a small filesystem-level guardrail test for the Safe Apply
 * contract: Apply must fail closed when a git worktree is already dirty
 * outside the target allowlist.
 */

"use strict";

const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { dirtyScopeViolations } = require("../schemas");

let passed = 0;
let failed = 0;

function assert(condition, name, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function git(root, args) {
  return cp.execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: Object.assign({}, process.env, { LC_ALL: "C", LANG: "C" }),
  });
}

function diffNameOnly(root) {
  return git(root, ["diff", "--name-only", "HEAD"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "brain-apply-guard-"));

try {
  console.log(`\nTemp repo: ${root}`);
  git(root, ["init"]);
  git(root, ["config", "user.email", "brain-operator@example.test"]);
  git(root, ["config", "user.name", "Brain Operator Test"]);

  writeFile(root, "wiki/index.md", "# Index\n");
  writeFile(root, "CLAUDE.md", "# Project instructions\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);

  console.log("\n--- Dirty out-of-scope preflight ---");
  writeFile(root, "CLAUDE.md", "# Project instructions\n\nDirty outside apply scope.\n");
  let dirty = diffNameOnly(root);
  let violations = dirtyScopeViolations(dirty, ["wiki/index.md"]);
  assert(dirty.includes("CLAUDE.md"), "git sees out-of-scope dirty file");
  assert(violations.length === 1 && violations[0] === "CLAUDE.md",
    "dirtyScopeViolations blocks dirty file outside allowlist");

  console.log("\n--- Dirty in-scope preflight ---");
  git(root, ["checkout", "--", "CLAUDE.md"]);
  writeFile(root, "wiki/index.md", "# Index\n\nDirty inside apply scope.\n");
  dirty = diffNameOnly(root);
  violations = dirtyScopeViolations(dirty, ["wiki/index.md"]);
  assert(dirty.includes("wiki/index.md"), "git sees in-scope dirty file");
  assert(violations.length === 0, "dirtyScopeViolations allows dirty file inside allowlist");

  console.log("\n--- Newly changed out-of-scope path model ---");
  const before = new Set(diffNameOnly(root));
  writeFile(root, "CLAUDE.md", "# Project instructions\n\nChanged during apply outside scope.\n");
  dirty = diffNameOnly(root);
  const newlyChanged = dirty.filter((rel) => !before.has(rel));
  violations = dirtyScopeViolations(newlyChanged, ["wiki/index.md"]);
  assert(newlyChanged.includes("CLAUDE.md"), "newly changed path detected after apply model");
  assert(violations.length === 1 && violations[0] === "CLAUDE.md",
    "post-apply model flags newly changed out-of-scope path");
} catch (error) {
  failed++;
  console.log(`  ✗ uncaught: ${error.message}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("\n" + "=".repeat(50));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(50));
process.exit(failed === 0 ? 0 : 1);

#!/usr/bin/env node
"use strict";

/* Brain Operator CLI — Local Multi-Agent Workbench (v0.9.0)
 *
 * Usage:
 *   brain-operator [serve] [workspace] [--port 4141] [--no-open]
 *   brain-operator doctor [workspace]
 *   brain-operator threads [workspace]
 *   brain-operator worktrees [workspace]
 *   brain-operator run "<prompt>" [--workspace dir] [--provider claude|codex|gemini|sim]
 *                                 [--model m] [--thread id] [--worktree] [--mode read-only|edit]
 */

const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const core = require("../workbench/core");
const providers = require("../workbench/providers");
const worktrees = require("../workbench/worktrees");
const { WorkbenchEngine } = require("../workbench/engine");
const { startWorkbenchServer } = require("../workbench/server");

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { flags.help = true; continue; }
    if (a === "-v" || a === "--version") { flags.version = true; continue; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--") && !["no-open", "worktree", "json"].includes(key)) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd"
    : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = cp.spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch { /* ignore */ }
}

function printHelp(version) {
  console.log(`
Brain Operator v${version} — Local Multi-Agent Workbench

Usage:
  brain-operator [serve] [workspace] [--port 4141] [--host 127.0.0.1] [--no-open]
  brain-operator doctor [workspace]
  brain-operator threads [workspace]
  brain-operator worktrees [workspace]
  brain-operator run "<prompt>" [options]

Run options:
  --workspace <dir>       Target repo or Obsidian vault (default: cwd)
  --provider <name>       claude | codex | gemini | sim
  --model <name>          Optional model override
  --thread <id>           Resume an existing thread id
  --worktree              Run inside a fresh isolated git worktree
  --mode <mode>           read-only (default) | worktree | direct
  --json                  Output final turn + trace as JSON

Examples:
  brain-operator serve ~/Documents/GitHub/my-repo
  brain-operator doctor
  brain-operator run "Summarize architecture" --provider claude
  brain-operator run "Add tests for auth" --provider codex --worktree
`);
}

async function cmdDoctor(workspacePath) {
  const abs = path.resolve(workspacePath || process.cwd());
  const provs = providers.detectProviders({ includeAuth: true });
  const gitBin = core.detectGitBinary();
  const ghBin = core.detectBinary("gh");
  const ctx = fs.existsSync(abs) ? core.inspectWorkspaceContext(abs, {}) : null;

  console.log("\nBrain Operator Doctor\n" + "=".repeat(56));
  console.log("\nProviders:");
  for (const id of ["claude", "codex", "gemini"]) {
    const p = provs[id];
    const mark = p.available ? "✓" : "·";
    const info = p.available
      ? `${p.binPath}${p.version ? ` (${p.version})` : ""}${p.auth ? ` · ${p.auth.detail}` : ""}`
      : "not found";
    console.log(`  ${mark} ${id.padEnd(8)} ${info}`);
  }
  console.log("\nTools:");
  console.log(`  ${gitBin ? "✓" : "✗"} ${"git".padEnd(8)} ${gitBin || "not found"}`);
  console.log(`  ${ghBin ? "✓" : "·"} ${"gh".padEnd(8)} ${ghBin || "not found (optional)"}`);

  if (ctx) {
    console.log(`\nWorkspace: ${abs}`);
    console.log(`  git:       ${ctx.git.isGitRepo ? `${ctx.git.branch} @ ${ctx.git.headSha} (${ctx.git.dirtyCount} dirty)` : "not a git repo"}`);
    console.log(`  profile:   ${ctx.profile ? ctx.profile.label : ctx.pendingProfile ? `${ctx.pendingProfile.label} (detected, unconfirmed)` : "none (general repo)"}`);
    console.log(`  catalog:   ${ctx.scope.inScope} in scope of ${ctx.scope.total} markdown notes (${ctx.scope.excluded} withheld)`);
    if (ctx.activeProjects.length) {
      console.log(`  active:    ${ctx.activeProjects.join(", ")}`);
    }
    const wts = worktrees.listWorktrees(abs);
    const managed = wts.filter((w) => w.isManaged);
    console.log(`  worktrees: ${managed.length} active Brain Operator worktree(s)`);
  }
  console.log("");
}

async function cmdThreads(workspacePath) {
  const abs = path.resolve(workspacePath || process.cwd());
  const engine = new WorkbenchEngine();
  const ws = engine.registerWorkspace(abs);
  const list = engine.listThreads(ws.id);
  console.log(`\nThreads in ${ws.name} (${list.length})\n` + "=".repeat(56));
  if (!list.length) {
    console.log("  No threads yet. Run `brain-operator serve` or `brain-operator run \"...\"`.\n");
    return;
  }
  for (const t of list) {
    const score = t.lastFaithfulness && t.lastFaithfulness.score != null ? `faithfulness ${t.lastFaithfulness.score}/100` : "no citations";
    const branch = t.worktree ? ` · ${t.worktree.branch}` : "";
    console.log(`  ${t.id}  [${t.provider}${branch}]  ${t.title}`);
    console.log(`    ${t.turnCount} turn(s) · ${score} · updated ${t.updatedAt}`);
  }
  console.log("");
}

async function cmdWorktrees(workspacePath) {
  const abs = path.resolve(workspacePath || process.cwd());
  const list = worktrees.listWorktrees(abs);
  console.log(`\nWorktrees for ${abs}\n` + "=".repeat(56));
  if (!list.length) {
    console.log("  Not a git repository or no worktrees found.\n");
    return;
  }
  for (const w of list) {
    const tag = w.isMain ? "[main]" : w.isManaged ? "[brain-operator]" : "[external]";
    console.log(`  ${tag.padEnd(16)} ${w.branch} @ ${w.head || "?"} · ${w.dirtyCount} dirty · +${w.ahead} ahead`);
    console.log(`    ${w.path}`);
  }
  console.log("");
}

async function cmdRun(prompt, flags) {
  if (!prompt) {
    console.error("Error: prompt is required. Example: brain-operator run \"Explain the architecture\"");
    process.exit(1);
  }
  const abs = path.resolve(flags.workspace || process.cwd());
  const engine = new WorkbenchEngine();
  const ws = engine.registerWorkspace(abs);
  const useWorktree = Boolean(flags.worktree) || flags.mode === "worktree";
  const mode = useWorktree ? "worktree" : (flags.mode === "edit" ? "direct" : (flags.mode || "read-only"));

  let threadId = flags.thread;
  if (!threadId) {
    const created = engine.createThread({
      workspaceId: ws.id,
      provider: flags.provider,
      model: flags.model,
      mode,
      useWorktree,
    });
    threadId = created.id;
  }

  if (!flags.json) {
    engine.on("run:event", ({ event }) => {
      if (event.type === "delta" && event.text) process.stdout.write(event.text);
      else if (event.type === "tool") process.stderr.write(`  [${event.name}] ${event.detail || ""}\n`);
    });
  }

  const { completion } = engine.sendTurn(threadId, {
    prompt,
    provider: flags.provider,
    model: flags.model,
    mode,
  });

  const turn = await completion;
  if (flags.json) {
    console.log(JSON.stringify({ threadId, turn }, null, 2));
  } else {
    console.log("\n\n" + "-".repeat(56));
    const f = turn.trace && turn.trace.faithfulness;
    const scoreStr = f && f.score != null ? `${f.score}/100 (${f.label})` : "n/a (no citations)";
    console.log(`thread:       ${threadId}`);
    console.log(`provider:     ${turn.provider} · ${turn.model}`);
    console.log(`faithfulness: ${scoreStr}`);
    console.log(`trace:        read ${turn.trace.read.length} · cited ${turn.trace.cited.length} · missing ${turn.trace.missing.length}`);
    if (turn.editedFiles && turn.editedFiles.length) {
      console.log(`edited:       ${turn.editedFiles.join(", ")}`);
    }
    if (turn.error) console.error(`error:        ${turn.error}`);
  }
  process.exit(turn.error ? 1 : 0);
}

async function cmdServe(workspacePath, flags) {
  const abs = path.resolve(workspacePath || process.cwd());
  const host = flags.host || "127.0.0.1";
  const port = flags.port !== undefined ? Number(flags.port) : 4141;

  const instance = await startWorkbenchServer({
    host,
    port,
    initialWorkspace: fs.existsSync(abs) ? abs : undefined,
  });

  console.log(`\nBrain Operator Workbench v${instance.engine.getVersion()}`);
  console.log(`  URL:       ${instance.url}`);
  console.log(`  Workspace: ${abs}`);
  console.log(`  Press Ctrl+C to stop.\n`);

  if (!flags["no-open"]) openBrowser(instance.url);

  const stop = async () => {
    console.log("\nShutting down Brain Operator Workbench…");
    await instance.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

async function main() {
  const pkg = require("../package.json");
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.version) { console.log(pkg.version); return; }
  if (flags.help) { printHelp(pkg.version); return; }

  const cmd = positional[0] || "serve";
  if (cmd === "serve") {
    await cmdServe(positional[1], flags);
  } else if (cmd === "doctor") {
    await cmdDoctor(positional[1]);
  } else if (cmd === "threads") {
    await cmdThreads(positional[1]);
  } else if (cmd === "worktrees") {
    await cmdWorktrees(positional[1]);
  } else if (cmd === "run") {
    await cmdRun(positional.slice(1).join(" "), flags);
  } else if (fs.existsSync(path.resolve(cmd)) && fs.statSync(path.resolve(cmd)).isDirectory()) {
    await cmdServe(cmd, flags);
  } else {
    console.error(`Unknown command: ${cmd}`);
    printHelp(pkg.version);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Brain Operator CLI error:", err && err.message ? err.message : err);
  process.exit(1);
});

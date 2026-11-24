#!/usr/bin/env node
/* Brain Operator — Workbench end-to-end test suite (v0.9.0)
 *
 * Run: `node tests/workbench-e2e.js`
 *
 * Zero external dependencies. Exercises:
 *   1. Multi-provider CLI arg specs (Claude, Codex, Gemini) + stream-json parsing
 *   2. Cross-provider handoff fencing
 *   3. Real git worktree isolation, parallel concurrent threads, diff, secret guard,
 *      safe merge-back, conflict abort, and path-traversal refusal
 *   4. Vault scoping + Answer Trace + Retrieval Faithfulness + shared runs.jsonl
 *   5. Live local HTTP + SSE server, REST endpoints, Origin CSRF guard,
 *      and Workbench UI syntax/offline verification
 */

"use strict";

const cp = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const vm = require("vm");

const core = require("../workbench/core");
const providers = require("../workbench/providers");
const worktrees = require("../workbench/worktrees");
const { WorkbenchEngine } = require("../workbench/engine");
const { startWorkbenchServer } = require("../workbench/server");

let passed = 0;
let failed = 0;

function assert(cond, name, detail) {
  if (cond) {
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

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

function httpReq(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: (opts && opts.method) || "GET",
      headers: Object.assign({ "Content-Type": "application/json" }, (opts && opts.headers) || {}),
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-json */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (opts && opts.body) req.write(typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

async function main() {
  // ===== 1. Provider spawn specs & stream-json parsing =====
  console.log("\nmulti-provider adapters (Claude, Codex, Gemini)");
  {
    const claudeRo = providers.buildProviderSpawnSpec("claude", {
      binPath: "/fake/claude",
      cwd: "/tmp/repo",
      mode: "read-only",
      userMessage: "hello",
      systemPrompt: "sys",
      model: "sonnet",
    });
    assert(claudeRo.args.includes("--permission-mode") && claudeRo.args.includes("plan"),
      "Claude read-only enforces --permission-mode plan");
    assert(claudeRo.args.includes("--allowedTools") && claudeRo.args.includes("Read,Grep,Glob"),
      "Claude read-only restricts allowedTools");
    assert(claudeRo.args.includes("--session-id"), "Claude fresh turn passes --session-id");

    const claudeResume = providers.buildProviderSpawnSpec("claude", {
      binPath: "/fake/claude",
      cwd: "/tmp/repo",
      mode: "worktree",
      userMessage: "continue",
      resumeSessionId: "sess-1234",
    });
    assert(claudeResume.args.includes("--resume") && claudeResume.args.includes("sess-1234"),
      "Claude resume passes explicit thread session id");
    assert(claudeResume.args.includes("acceptEdits") && !claudeResume.args.includes("--allowedTools"),
      "Claude worktree mode unlocks acceptEdits without read-only tool cap");

    const codexFresh = providers.buildProviderSpawnSpec("codex", {
      binPath: "/fake/codex",
      cwd: "/tmp/repo",
      mode: "worktree",
      userMessage: "edit file",
      model: "gpt-5.3-codex",
    });
    assert(codexFresh.args[0] === "exec" && codexFresh.args.includes("--json") && codexFresh.args.includes("workspace-write"),
      "Codex worktree uses exec --json --sandbox workspace-write");

    const codexResume = providers.buildProviderSpawnSpec("codex", {
      binPath: "/fake/codex",
      cwd: "/tmp/repo",
      mode: "read-only",
      userMessage: "follow up",
      resumeSessionId: "codex-thr-99",
    });
    assert(codexResume.args[0] === "exec" && codexResume.args[1] === "resume" && codexResume.args[2] === "codex-thr-99",
      "Codex resume uses exec resume <sessionId>");

    const geminiSpec = providers.buildProviderSpawnSpec("gemini", {
      binPath: "/fake/gemini",
      cwd: "/tmp/repo",
      mode: "read-only",
      userMessage: "inspect",
      model: "gemini-2.5-pro",
    });
    assert(geminiSpec.args.includes("--skip-trust") && geminiSpec.args.includes("stream-json") && geminiSpec.args.includes("--approval-mode") && geminiSpec.args.includes("plan"),
      "Gemini read-only uses --skip-trust -o stream-json --approval-mode plan");

    // Stream event parsing across all 3 CLIs
    const cEv = providers.parseProviderEvent("claude", {
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/tmp/repo/wiki/A.md" } }] },
    }, "/tmp/repo");
    assert(cEv.length === 1 && cEv[0].name === "Read" && cEv[0].filePath === "wiki/A.md",
      "Claude Read tool_use normalizes vault-relative path");

    const xInit = providers.parseProviderEvent("codex", { type: "thread.started", thread_id: "cx-1" }, "/tmp/repo");
    const xEdit = providers.parseProviderEvent("codex", {
      type: "item.completed",
      item: { id: "i1", type: "file_change", changes: [{ kind: "update", path: "/tmp/repo/src/app.js" }] },
    }, "/tmp/repo");
    assert(xInit[0].type === "init" && xInit[0].sessionId === "cx-1", "Codex thread.started captures sessionId");
    assert(xEdit[0].name === "Edit" && xEdit[0].filePath === "src/app.js", "Codex file_change normalizes Edit path");

    const gDelta = providers.parseProviderEvent("gemini", {
      type: "message", role: "assistant", content: "hi there", delta: true,
    }, "/tmp/repo");
    const gTool = providers.parseProviderEvent("gemini", {
      type: "tool_use", tool_id: "g1", tool_name: "read_file", parameters: { path: "/tmp/repo/README.md" },
    }, "/tmp/repo");
    assert(gDelta[0].type === "delta" && gDelta[0].text === "hi there", "Gemini delta message normalizes");
    assert(gTool[0].name === "Read" && gTool[0].filePath === "README.md", "Gemini read_file normalizes to Read");

    const handoff = providers.buildCrossProviderHandoff([
      { provider: "claude", model: "sonnet", prompt: "What is X?", answer: "X is Y.", trace: { read: ["wiki/X.md"], faithfulness: { score: 100 } } },
    ], "gemini");
    assert(handoff.includes("brain-operator.thread-handoff") && handoff.includes("untrusted-data") && handoff.includes("gemini"),
      "Cross-provider handoff is structured, fenced, and marked untrusted-data");
  }

  // ===== 2. Workbench UI syntax + offline hygiene =====
  console.log("\nworkbench UI syntax & offline contract");
  {
    const uiHtml = fs.readFileSync(path.join(__dirname, "..", "workbench", "ui", "index.html"), "utf8");
    const scriptMatch = uiHtml.match(/<script>\n([\s\S]*?)<\/script>/);
    assert(Boolean(scriptMatch), "workbench/ui/index.html contains inline script");
    if (scriptMatch) {
      let syntaxOk = true;
      let errMsg = "";
      try { new vm.Script(scriptMatch[1], { filename: "workbench-ui.js" }); }
      catch (e) { syntaxOk = false; errMsg = e.message; }
      assert(syntaxOk, "workbench UI inline JavaScript parses with zero syntax errors", errMsg);
    }
    const extHosts = (uiHtml.match(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || [])
      .filter((u) => !/w3\.org/.test(u) && !/127\.0\.0\.1|localhost/.test(u));
    assert(extHosts.length === 0, "workbench UI makes zero external CDN/host requests", extHosts.join(", "));
  }

  // ===== 3. Real git worktrees, parallel runs, merge-back, conflicts & HTTP/SSE =====
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "brain-workbench-e2e-"));
  const repoRoot = path.join(tmpBase, "vault-repo");
  const fakeHome = path.join(tmpBase, "bo-home");
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(fakeHome, { recursive: true });

  let srv = null;
  try {
    console.log("\nreal git worktrees, parallel runs & merge lifecycle");
    git(repoRoot, ["init"]);
    git(repoRoot, ["config", "user.email", "test@brain-operator.local"]);
    git(repoRoot, ["config", "user.name", "Brain Operator Test"]);

    writeFile(repoRoot, "CLAUDE.md", "# Vault Contract\n");
    writeFile(repoRoot, "wiki/_common/context-routing.md", "# Routing\n");
    writeFile(repoRoot, "wiki/index.md", "# Index\n");
    writeFile(repoRoot, "wiki/log.md", "# Log\n");
    writeFile(repoRoot, "wiki/operating/Current State.md", "# Current State\n- `01_Projects/live-app/`\n");
    writeFile(repoRoot, "wiki/concepts/Architecture.md", "---\ntitle: Architecture\nstatus: active\n---\nCore design.\n");
    writeFile(repoRoot, "01_Projects/live-app/plan.md", "# Live App Plan\n");
    writeFile(repoRoot, "01_Projects/old-app/notes.md", "# Inactive Project\n");
    writeFile(repoRoot, "04_Archive/legacy.md", "# Archived\n");
    writeFile(repoRoot, "raw/source.md", "# Raw source\n");
    writeFile(repoRoot, "shared.txt", "line 1\n");

    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-m", "initial vault"]);

    // Context inspection — read-only, zero files created
    const ctx = core.inspectWorkspaceContext(repoRoot, {});
    assert(ctx.profile && ctx.profile.id === "brain-operator", "inspectWorkspaceContext detects brain-operator profile");
    assert(ctx.activeProjects.includes("live-app"), "active projects parsed from Current State.md");
    assert(ctx.scope.excluded >= 4 && ctx.scope.inScope < ctx.scope.total,
      `vault scoping withholds archive/raw/inactive projects (${ctx.scope.inScope}/${ctx.scope.total} in scope)`);
    assert(!fs.existsSync(path.join(repoRoot, ".brain-operator")),
      "read-only inspectWorkspaceContext writes nothing to disk");

    // Engine + two concurrent isolated worktree threads
    const engine = new WorkbenchEngine({ homeDir: fakeHome, initialWorkspace: repoRoot });
    const ws = engine.listWorkspaces()[0];
    assert(ws && ws.isGitRepo, "engine registered workspace with git info");

    const t1 = engine.createThread({ workspaceId: ws.id, title: "Feature Alpha", provider: "sim", mode: "worktree" });
    const t2 = engine.createThread({ workspaceId: ws.id, title: "Feature Beta", provider: "sim", mode: "worktree" });
    assert(t1.worktree && t2.worktree && t1.worktree.path !== t2.worktree.path,
      "two parallel threads get distinct isolated git worktrees");

    // Confirm root git status is STILL clean because .brain-operator/.gitignore ignores internal state
    const rootStatus = git(repoRoot, ["status", "--porcelain"]).trim();
    assert(rootStatus === "", "base repo git status stays 100% clean (.brain-operator self-ignored)", rootStatus);

    // Run BOTH threads concurrently!
    const r1 = engine.sendTurn(t1.id, { prompt: "Inspect architecture and write file alpha-out.md", provider: "sim", mode: "worktree" });
    const r2 = engine.sendTurn(t2.id, { prompt: "Inspect architecture and write file beta-out.md", provider: "sim", mode: "worktree" });
    assert(engine.activeRuns.size === 2, "two agent runs execute simultaneously in activeRuns");

    const [turn1, turn2] = await Promise.all([r1.completion, r2.completion]);
    assert(!turn1.error && !turn2.error, "both parallel turns completed without error");
    assert(turn1.trace.faithfulness.score === 100, `turn1 faithfulness grounded (${turn1.trace.faithfulness.score}/100)`);
    assert(fs.existsSync(path.join(t1.worktree.path, "alpha-out.md")) && !fs.existsSync(path.join(repoRoot, "alpha-out.md")),
      "thread 1 edit isolated inside worktree 1 (base checkout untouched)");
    assert(fs.existsSync(path.join(t2.worktree.path, "beta-out.md")) && !fs.existsSync(path.join(t1.worktree.path, "beta-out.md")),
      "thread 2 edit isolated inside worktree 2 (worktree 1 untouched)");

    // Shared runs.jsonl & handoffs.jsonl compatibility
    const obs = engine.getObservatory(ws.id);
    assert(obs.metrics.totalRuns === 2 && obs.metrics.meanFaithfulness === 100,
      "runs archived to shared .brain-operator/runs.jsonl and aggregated in Observatory");

    // Secret scan guardrail refuses committing a token
    const fakeToken = "ghp_" + "1234567890".repeat(3) + "123456";
    writeFile(t1.worktree.path, "leak.txt", `token=${fakeToken}\n`);
    const blocked = engine.commitThreadWorktree(t1.id, "oops leak");
    assert(blocked.ok === false && blocked.secretBlocked === true, "secret scan blocks committing likely GitHub token");
    fs.unlinkSync(path.join(t1.worktree.path, "leak.txt"));

    // Clean commit + safe merge of both worktrees into base branch
    const c1 = engine.commitThreadWorktree(t1.id, "feat: add alpha-out");
    assert(c1.ok === true && Boolean(c1.sha), "worktree 1 commits cleanly");
    const m1 = engine.mergeThreadWorktree(t1.id, { cleanup: true });
    assert(m1.ok === true && m1.cleaned === true, "worktree 1 merges into base and cleans up");
    assert(fs.existsSync(path.join(repoRoot, "alpha-out.md")), "alpha-out.md landed on base branch after merge");

    // Thread 2 merge with auto-commitMessage
    const m2 = engine.mergeThreadWorktree(t2.id, { commitMessage: "feat: add beta-out", cleanup: true });
    assert(m2.ok === true && fs.existsSync(path.join(repoRoot, "beta-out.md")),
      "worktree 2 commits and merges cleanly alongside thread 1");

    // Conflict protection: conflicting edit aborts merge cleanly
    const tConflict = engine.createThread({ workspaceId: ws.id, title: "Conflict Test", provider: "sim", mode: "worktree" });
    writeFile(tConflict.worktree.path, "shared.txt", "worktree version\n");
    engine.commitThreadWorktree(tConflict.id, "wt change");
    writeFile(repoRoot, "shared.txt", "main version\n");
    git(repoRoot, ["add", "shared.txt"]);
    git(repoRoot, ["commit", "-m", "main change"]);

    const conflictRes = engine.mergeThreadWorktree(tConflict.id, { cleanup: true });
    assert(conflictRes.ok === false && conflictRes.conflict === true, "merge conflict detected and rejected");
    assert(!fs.existsSync(path.join(repoRoot, ".git", "MERGE_HEAD")), "conflicting merge aborted cleanly (no MERGE_HEAD left)");

    // Path traversal guard on removeWorktree
    const traversal = worktrees.removeWorktree(repoRoot, repoRoot, "main", { force: true });
    assert(traversal.ok === false, "removeWorktree refuses path outside .brain-operator/worktrees/");

    // Discard conflicting worktree cleanly
    const discarded = engine.discardThreadWorktree(tConflict.id);
    assert(discarded.ok === true, "discardThreadWorktree removes worktree and branch cleanly");

    // Fork thread preserves turns and triggers continuity handoff on next turn
    const forked = engine.forkThread(t1.id, { title: "Alpha Fork" });
    assert(forked.turnCount === 1 && forked.parentThreadId === t1.id, "forkThread clones prior turns and links parentThreadId");
    const forkTurn = await engine.sendTurn(forked.id, { prompt: "Follow-up on forked thread", provider: "sim", mode: "read-only" }).completion;
    assert(forkTurn.trace.warnings.some((w) => /handoff/i.test(w)), "forked thread bridges prior context via fenced handoff");

    // ===== 4. Live HTTP + SSE Server =====
    console.log("\nlocal HTTP + SSE workbench server");
    srv = await startWorkbenchServer({ host: "127.0.0.1", port: 0, engine });
    const base = srv.url;

    const uiRes = await httpReq(`${base}/`);
    assert(uiRes.status === 200 && uiRes.text.includes("Brain Operator"), "GET / serves Workbench UI");

    const health = await httpReq(`${base}/api/health`);
    assert(health.status === 200 && health.json && health.json.ok === true, "GET /api/health returns ok");

    const forbidden = await httpReq(`${base}/api/bootstrap`, { headers: { Origin: "https://evil.example" } });
    assert(forbidden.status === 403, "Origin guard rejects cross-origin requests with 403");

    const rebind = await httpReq(`${base}/api/bootstrap`, { headers: { Host: "evil.rebind.test:4141" } });
    assert(rebind.status === 403, "Host header guard blocks DNS rebinding with 403");

    const crossSite = await httpReq(`${base}/api/bootstrap`, { headers: { "Sec-Fetch-Site": "cross-site" } });
    assert(crossSite.status === 403, "Sec-Fetch-Site guard blocks cross-site browser requests with 403");

    const boot = await httpReq(`${base}/api/bootstrap`);
    assert(boot.status === 200 && boot.json.workspaces.length === 1 && boot.json.threads.length >= 3,
      "GET /api/bootstrap returns workspaces, providers, and threads");

    // Open live SSE stream, trigger a turn over HTTP, verify SSE receives run:started + run:event + run:completed
    const sseEvents = [];
    const sseDone = new Promise((resolve, reject) => {
      const u = new URL(`${base}/api/events`);
      const req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname }, (res) => {
        let buf = "";
        res.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          const frames = buf.split("\n\n");
          buf = frames.pop();
          for (const frame of frames) {
            const evM = frame.match(/^event:\s*(.+)$/m);
            if (evM) sseEvents.push(evM[1].trim());
            if (evM && evM[1].trim() === "run:completed") {
              req.destroy();
              resolve();
            }
          }
        });
      });
      req.on("error", (err) => {
        if (sseEvents.includes("run:completed")) resolve();
        else reject(err);
      });
      setTimeout(() => { req.destroy(); resolve(); }, 4000);
    });

    // Small delay so SSE listener attaches
    await new Promise((r) => setTimeout(r, 60));
    const createdHttp = await httpReq(`${base}/api/threads`, {
      method: "POST",
      body: { workspaceId: ws.id, title: "SSE Stream Test", provider: "sim", mode: "read-only" },
    });
    assert(createdHttp.status === 201 && createdHttp.json.thread.id, "POST /api/threads creates thread");

    const sentHttp = await httpReq(`${base}/api/threads/${createdHttp.json.thread.id}/turns`, {
      method: "POST",
      body: { prompt: "Check [[Architecture]] over SSE", provider: "sim", mode: "read-only" },
    });
    assert(sentHttp.status === 202 && sentHttp.json.runId, "POST /api/threads/:id/turns starts async streaming run");

    await sseDone;
    assert(sseEvents.includes("hello") && sseEvents.includes("run:started") && sseEvents.includes("run:event") && sseEvents.includes("run:completed"),
      `SSE received full lifecycle (${sseEvents.join(", ")})`);

    const detail = await httpReq(`${base}/api/threads/${createdHttp.json.thread.id}`);
    assert(detail.status === 200 && detail.json.turns.length === 1, "GET /api/threads/:id returns persisted turn");

    const receipt = await httpReq(`${base}/api/threads/${createdHttp.json.thread.id}/turns/${detail.json.turns[0].id}/receipt?format=markdown`);
    assert(receipt.status === 200 && receipt.text.includes("# Agent Receipt"), "GET receipt endpoint exports Markdown Agent Receipt");
  } catch (err) {
    failed++;
    console.log(`  ✗ uncaught: ${err && err.stack ? err.stack : err}`);
  } finally {
    if (srv) await srv.close();
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }

  console.log("\n" + "=".repeat(50));
  console.log(`${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));
  process.exit(failed === 0 ? 0 : 1);
}

main();

"use strict";

/* Brain Operator — Concurrent Multi-Thread Orchestration Engine
 *
 * Coordinates parallel agent runs across workspaces, providers (Claude,
 * Codex, Gemini, Sim), and isolated git worktrees. Every turn produces an
 * inspectable Answer Trace + Retrieval Faithfulness score and streams live
 * events to subscribers (HTTP SSE, CLI, or tests).
 */

const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const core = require("./core");
const providers = require("./providers");
const worktrees = require("./worktrees");
const { WorkbenchStore } = require("./store");

const PKG = (() => {
  try { return require("../package.json"); } catch { return { version: "0.9.0" }; }
})();

function deriveThreadTitle(prompt) {
  const clean = core.cleanText(prompt || "", 72);
  if (!clean) return "Untitled thread";
  if (clean.length <= 54) return clean;
  return clean.slice(0, 51).replace(/\s+\S*$/, "") + "…";
}

class WorkbenchEngine extends EventEmitter {
  constructor(opts) {
    super();
    this.store = new WorkbenchStore({ homeDir: opts && opts.homeDir });
    this.activeRuns = new Map(); // threadId -> ActiveRun
    this._providerCache = null;
    this._providerCacheAt = 0;

    if (opts && opts.initialWorkspace) {
      this.registerWorkspace(opts.initialWorkspace);
    }
  }

  getVersion() {
    return PKG.version || "0.9.0";
  }

  getProviders(forceRefresh) {
    const now = Date.now();
    if (!forceRefresh && this._providerCache && now - this._providerCacheAt < 30000) {
      return this._providerCache;
    }
    this._providerCache = providers.detectProviders({ includeAuth: true });
    this._providerCacheAt = now;
    return this._providerCache;
  }

  registerWorkspace(dirPath, opts) {
    const ws = this.store.registerWorkspace(dirPath, opts);
    this.emit("workspace:updated", { workspace: this.enrichWorkspace(ws) });
    return this.enrichWorkspace(ws);
  }

  removeWorkspace(workspaceId) {
    const ok = this.store.removeWorkspace(workspaceId);
    if (ok) this.emit("workspace:removed", { workspaceId });
    return ok;
  }

  enrichWorkspace(ws) {
    if (!ws) return null;
    const repo = worktrees.getRepoInfo(ws.path);
    const threads = this.store.listThreads(ws.path);
    let runningCount = 0;
    for (const run of this.activeRuns.values()) {
      if (run.workspaceId === ws.id) runningCount += 1;
    }
    return Object.assign({}, ws, {
      isGitRepo: repo.isGitRepo,
      branch: repo.branch,
      headSha: repo.headSha,
      dirtyCount: repo.dirtyCount,
      threadCount: threads.length,
      runningCount,
    });
  }

  listWorkspaces() {
    return this.store.listWorkspaces().map((w) => this.enrichWorkspace(w));
  }

  resolveWorkspace(workspaceId) {
    const ws = workspaceId
      ? this.store.getWorkspace(workspaceId)
      : this.store.listWorkspaces()[0];
    if (!ws) throw new Error(`Workspace not found: ${workspaceId || "(none registered)"}`);
    return ws;
  }

  getWorkspaceContext(workspaceId) {
    const ws = this.resolveWorkspace(workspaceId);
    const ctx = core.inspectWorkspaceContext(ws.path, { vaultProfile: ws.vaultProfile });
    const wts = worktrees.listWorktrees(ws.path);
    const handoffs = this.store.readRecentHandoffs(ws.path, 15);
    return {
      workspace: this.enrichWorkspace(ws),
      isVault: ctx.isVault,
      profile: ctx.profile,
      pendingProfile: ctx.pendingProfile,
      activeProjects: ctx.activeProjects,
      scope: ctx.scope,
      git: ctx.git,
      worktrees: wts,
      handoffs,
    };
  }

  getObservatory(workspaceId) {
    const ws = this.resolveWorkspace(workspaceId);
    const runs = this.store.readRunArchive(ws.path);
    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      metrics: core.computeObservatoryMetrics(runs),
    };
  }

  // ---- Thread lifecycle ----

  _decorateThread(ws, thread) {
    if (!thread) return null;
    const active = this.activeRuns.get(thread.id);
    const wtAlive = Boolean(thread.worktree && thread.worktree.path && fs.existsSync(thread.worktree.path));
    return Object.assign({}, thread, {
      workspaceId: ws.id,
      workspaceName: ws.name,
      status: active ? "running" : (thread.lastError ? "error" : "idle"),
      worktreeActive: wtAlive,
      activeRun: active ? this._serializeActiveRun(active) : null,
    });
  }

  _serializeActiveRun(run) {
    return {
      runId: run.runId,
      threadId: run.threadId,
      provider: run.provider,
      model: run.model,
      mode: run.mode,
      prompt: run.prompt,
      startedAt: run.startedAt,
      statusText: run.statusText,
      answerBuffer: run.answerBuffer,
      toolCalls: run.toolCalls,
    };
  }

  listThreads(workspaceId) {
    const ws = this.resolveWorkspace(workspaceId);
    return this.store.listThreads(ws.path).map((t) => this._decorateThread(ws, t));
  }

  listAllThreads() {
    const out = [];
    for (const ws of this.store.listWorkspaces()) {
      for (const t of this.store.listThreads(ws.path)) {
        out.push(this._decorateThread(ws, t));
      }
    }
    return out.sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (b.status === "running" && a.status !== "running") return 1;
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  }

  findThreadAcrossWorkspaces(threadId) {
    for (const ws of this.store.listWorkspaces()) {
      const t = this.store.getThread(ws.path, threadId);
      if (t) return { ws, thread: t };
    }
    return null;
  }

  getThreadDetail(threadId) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const turns = this.store.readTurns(found.ws.path, threadId);
    return {
      thread: this._decorateThread(found.ws, found.thread),
      turns,
    };
  }

  createThread(opts) {
    const o = opts || {};
    const ws = this.resolveWorkspace(o.workspaceId);
    const provider = o.provider || this.pickDefaultProvider();
    const mode = o.mode || (o.useWorktree ? "worktree" : "read-only");
    const id = "thr_" + crypto.randomBytes(6).toString("hex");
    const now = new Date().toISOString();

    let wt = null;
    if (mode === "worktree" || o.useWorktree) {
      wt = worktrees.createWorktree(ws.path, {
        name: o.title || id,
        threadId: id,
        baseRef: o.baseRef,
      });
    }

    const thread = {
      id,
      workspaceId: ws.id,
      title: core.cleanText(o.title || "New thread", 100) || "New thread",
      autoTitled: !o.title,
      provider,
      model: o.model ? core.cleanText(o.model, 80) : "",
      mode: wt ? "worktree" : mode,
      worktree: wt,
      providerSessions: {},
      pinned: false,
      archived: false,
      turnCount: 0,
      lastFaithfulness: null,
      lastError: null,
      parentThreadId: o.parentThreadId || null,
      createdAt: now,
      updatedAt: now,
    };

    this.store.upsertThread(ws.path, thread);
    const decorated = this._decorateThread(ws, thread);
    this.emit("thread:created", { thread: decorated });
    return decorated;
  }

  pickDefaultProvider() {
    const provs = this.getProviders(false);
    if (provs.claude && provs.claude.available) return "claude";
    if (provs.gemini && provs.gemini.available) return "gemini";
    if (provs.codex && provs.codex.available) return "codex";
    return "sim";
  }

  updateThread(threadId, patch) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const t = Object.assign({}, found.thread);
    if (patch.title !== undefined) {
      t.title = core.cleanText(patch.title, 100) || t.title;
      t.autoTitled = false;
    }
    if (patch.provider !== undefined && providers.PROVIDER_DEFS[patch.provider]) {
      t.provider = patch.provider;
    }
    if (patch.model !== undefined) t.model = core.cleanText(patch.model, 80);
    if (patch.mode !== undefined && ["read-only", "worktree", "direct"].includes(patch.mode)) {
      t.mode = patch.mode;
    }
    if (patch.pinned !== undefined) t.pinned = Boolean(patch.pinned);
    if (patch.archived !== undefined) t.archived = Boolean(patch.archived);
    t.updatedAt = new Date().toISOString();
    this.store.upsertThread(found.ws.path, t);
    const decorated = this._decorateThread(found.ws, t);
    this.emit("thread:updated", { thread: decorated });
    return decorated;
  }

  deleteThread(threadId, opts) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) return false;
    if (this.activeRuns.has(threadId)) this.cancelRun(threadId);
    if (found.thread.worktree && found.thread.worktree.path && fs.existsSync(found.thread.worktree.path) && !(opts && opts.keepWorktree)) {
      worktrees.removeWorktree(found.ws.path, found.thread.worktree.path, found.thread.worktree.branch, { force: true, deleteBranch: true });
    }
    const ok = this.store.deleteThread(found.ws.path, threadId);
    if (ok) this.emit("thread:deleted", { threadId, workspaceId: found.ws.id });
    return ok;
  }

  attachWorktree(threadId, opts) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const t = Object.assign({}, found.thread);
    if (t.worktree && t.worktree.path && fs.existsSync(t.worktree.path)) {
      return this._decorateThread(found.ws, t);
    }
    const wt = worktrees.createWorktree(found.ws.path, {
      name: t.title || t.id,
      threadId: t.id,
      baseRef: opts && opts.baseRef,
    });
    t.worktree = wt;
    t.mode = "worktree";
    t.updatedAt = new Date().toISOString();
    this.store.upsertThread(found.ws.path, t);
    const decorated = this._decorateThread(found.ws, t);
    this.emit("thread:updated", { thread: decorated });
    this.emit("worktree:changed", { workspaceId: found.ws.id, threadId: t.id });
    return decorated;
  }

  forkThread(threadId, opts) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const priorTurns = this.store.readTurns(found.ws.path, threadId);
    const o = opts || {};
    const title = core.cleanText(o.title || `${found.thread.title} (fork)`, 100);

    const forked = this.createThread({
      workspaceId: found.ws.id,
      title,
      provider: o.provider || found.thread.provider,
      model: o.model !== undefined ? o.model : found.thread.model,
      mode: o.useWorktree ? "worktree" : (o.mode || found.thread.mode),
      useWorktree: Boolean(o.useWorktree),
      baseRef: o.baseRef || (found.thread.worktree && found.thread.worktree.branch) || undefined,
      parentThreadId: threadId,
    });

    // Copy turn history so the forked thread carries context via cross-provider/fork handoff
    // without mutating the parent provider session id.
    const raw = this.store.getThread(found.ws.path, forked.id);
    if (priorTurns.length) {
      this.store.writeTurns(found.ws.path, forked.id, priorTurns);
      raw.turnCount = priorTurns.length;
      raw.lastFaithfulness = found.thread.lastFaithfulness;
      raw.providerSessions = {}; // Force fresh provider session with handoff so parent session stays untouched
      this.store.upsertThread(found.ws.path, raw);
    }
    const decorated = this._decorateThread(found.ws, raw);
    this.emit("thread:updated", { thread: decorated });
    return decorated;
  }

  // ---- Turn execution (concurrent across threads) ----

  sendTurn(threadId, opts) {
    const o = opts || {};
    const prompt = String(o.prompt || "").trim();
    if (!prompt) throw new Error("Prompt is required.");

    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    if (this.activeRuns.has(threadId)) {
      throw new Error("Thread already has an active run. Wait or cancel it first.");
    }

    const ws = found.ws;
    let thread = Object.assign({}, found.thread);
    const provider = o.provider || thread.provider || this.pickDefaultProvider();
    if (!providers.PROVIDER_DEFS[provider]) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const requestedMode = o.mode || thread.mode || "read-only";
    // Auto-create worktree if user switches composer to worktree mode and none exists yet
    if (requestedMode === "worktree" && (!thread.worktree || !fs.existsSync(thread.worktree.path))) {
      const wt = worktrees.createWorktree(ws.path, { name: thread.title || thread.id, threadId: thread.id });
      thread.worktree = wt;
    }

    const effectiveCwd = (requestedMode === "worktree" && thread.worktree && fs.existsSync(thread.worktree.path))
      ? thread.worktree.path
      : ws.path;

    const model = o.model !== undefined ? core.cleanText(o.model, 80) : (thread.model || "");
    const priorTurns = this.store.readTurns(ws.path, threadId);
    const priorProvider = priorTurns.length ? priorTurns[priorTurns.length - 1].provider : null;
    const providerSessions = Object.assign({}, thread.providerSessions || {});
    const nativeSessionId = providerSessions[provider] || null;
    const switchingProvider = Boolean(priorTurns.length > 0 && (priorProvider !== provider || !nativeSessionId));

    // Context governance + retrieval scoping
    const ctx = core.inspectWorkspaceContext(effectiveCwd, { vaultProfile: ws.vaultProfile });
    const askRoute = core.classifyAskRoute(prompt);
    const traceWarnings = [];
    let surfaced = [];
    let catalogBlock = { total: ctx.scope.inScope, included: 0, omitted: ctx.scope.inScope, mode: "list", text: "" };

    let systemPrompt = core.buildSystemPrompt({
      workspacePath: effectiveCwd,
      mode: requestedMode,
      branch: thread.worktree && thread.worktree.branch,
      askRoute,
      isVault: ctx.isVault,
    });

    if (core.shouldIncludeRecentHandoffs(askRoute) && priorTurns.length === 0) {
      const recentHandoffs = this.store.readRecentHandoffs(ws.path, 3);
      const handoffCtx = core.recentHandoffsAsContext(recentHandoffs);
      if (handoffCtx) systemPrompt += "\n" + handoffCtx;
    } else if (!core.shouldIncludeRecentHandoffs(askRoute)) {
      traceWarnings.push(`recent handoffs suppressed for ${askRoute.mode} route`);
    }

    let userMessage = `<!-- brain-operator-route: ${askRoute.mode}; provider: ${provider}; mode: ${requestedMode} -->\n`;

    if (switchingProvider && priorTurns.length > 0) {
      userMessage += providers.buildCrossProviderHandoff(priorTurns, provider) + "\n";
      traceWarnings.push(
        priorProvider && priorProvider !== provider
          ? `cross-provider handoff: ${priorProvider} -> ${provider} (${priorTurns.length} prior turn${priorTurns.length === 1 ? "" : "s"})`
          : `thread continuity handoff (${priorTurns.length} prior turn${priorTurns.length === 1 ? "" : "s"})`,
      );
    }

    userMessage += prompt;

    if (!nativeSessionId && askRoute.includeCatalog && ctx.scopedEntries.length > 0) {
      if (ctx.scope.excluded > 0) {
        traceWarnings.push(
          `scope: ${ctx.scope.inScope} of ${ctx.scope.total} notes eligible; ${ctx.scope.excluded} withheld from default context`,
        );
      }
      if (ctx.activeProjects.length) {
        traceWarnings.push(`active projects per Current State: ${ctx.activeProjects.join(", ")}`);
      }
      surfaced = core.surfaceRelevantPages(prompt, ctx.scopedEntries, askRoute, { limit: 5 });
      const surfacedBlock = core.buildSurfacedPromptBlock(surfaced);
      if (surfaced.length) traceWarnings.push(`surfaced ${surfaced.length} relevant page(s) as pointers`);

      catalogBlock = core.buildCatalogPromptBlock(ctx.scopedEntries, core.DEFAULT_CATALOG_LIMIT);
      const catalogXml =
        `\n\n<!-- workspace catalog (${catalogBlock.total} in-scope notes; ${catalogBlock.included} listed, ${catalogBlock.omitted} not listed) -->\n` +
        `<catalog total="${catalogBlock.total}" included="${catalogBlock.included}" omitted="${catalogBlock.omitted}" mode="${catalogBlock.mode}">\n${catalogBlock.text}\n</catalog>`;
      userMessage += (surfacedBlock ? `\n\n${surfacedBlock}` : "") + catalogXml;
    } else if (!nativeSessionId && !askRoute.includeCatalog) {
      traceWarnings.push(`catalog suppressed for ${askRoute.mode} route`);
    }

    const spec = providers.buildProviderSpawnSpec(provider, {
      cwd: effectiveCwd,
      mode: requestedMode,
      model,
      systemPrompt,
      userMessage,
      rawPrompt: prompt,
      resumeSessionId: switchingProvider ? "" : (nativeSessionId || ""),
      maxTurns: o.maxTurns,
    });

    // Update thread metadata immediately
    if (thread.autoTitled && priorTurns.length === 0) {
      thread.title = deriveThreadTitle(prompt);
      thread.autoTitled = false;
    }
    thread.provider = provider;
    thread.model = model;
    thread.mode = requestedMode;
    thread.lastError = null;
    thread.updatedAt = new Date().toISOString();
    this.store.upsertThread(ws.path, thread);

    const runId = "run_" + crypto.randomBytes(6).toString("hex");
    const startedAt = Date.now();
    const activeRun = {
      runId,
      threadId,
      workspaceId: ws.id,
      provider,
      model: model || provider,
      mode: requestedMode,
      prompt,
      startedAt: new Date(startedAt).toISOString(),
      startedAtMs: startedAt,
      statusText: `starting ${provider}…`,
      answerBuffer: "",
      hadDeltas: false,
      toolCalls: [],
      readPaths: new Set(),
      editedPaths: new Set(),
      searchedQueries: [],
      sessionId: spec.sessionId || null,
      costUsd: null,
      numTurns: null,
      errorMessage: null,
      cancelled: false,
      handle: null,
    };

    this.activeRuns.set(threadId, activeRun);
    this.emit("run:started", {
      threadId,
      workspaceId: ws.id,
      run: this._serializeActiveRun(activeRun),
      thread: this._decorateThread(ws, thread),
    });

    const onEvent = (ev) => {
      if (!ev || !ev.type) return;
      if (ev.type === "init") {
        if (ev.sessionId) activeRun.sessionId = ev.sessionId;
        if (ev.model) activeRun.model = ev.model;
        activeRun.statusText = `running · ${activeRun.model}`;
      } else if (ev.type === "delta" && ev.text) {
        activeRun.hadDeltas = true;
        activeRun.answerBuffer += ev.text;
      } else if (ev.type === "assistant_text" && ev.text) {
        if (!activeRun.hadDeltas) activeRun.answerBuffer += ev.text;
      } else if (ev.type === "tool") {
        const existing = activeRun.toolCalls.find((x) => x.id === ev.id);
        if (existing) {
          existing.status = ev.status || existing.status;
          if (ev.detail) existing.detail = ev.detail;
        } else {
          activeRun.toolCalls.push(ev);
        }
        if (ev.name === "Read" && ev.filePath) activeRun.readPaths.add(ev.filePath);
        if (ev.name === "Edit" && ev.filePath) activeRun.editedPaths.add(ev.filePath);
        if ((ev.name === "Grep" || ev.name === "Glob") && ev.query) {
          activeRun.searchedQueries.push({ kind: ev.name, query: ev.query });
        }
        activeRun.statusText = `${ev.name}${ev.detail ? ` · ${ev.detail.slice(0, 60)}` : ""}`;
      } else if (ev.type === "tool_result" && ev.id) {
        const existing = activeRun.toolCalls.find((x) => x.id === ev.id);
        if (existing) existing.status = ev.status || "completed";
      } else if (ev.type === "status" && ev.text) {
        activeRun.statusText = ev.text;
      } else if (ev.type === "result") {
        if (ev.sessionId) activeRun.sessionId = ev.sessionId;
        if (ev.isError) {
          activeRun.errorMessage = activeRun.errorMessage || core.cleanText(ev.text || "", 500) || "Provider reported an error";
        } else if (ev.text && !activeRun.answerBuffer) {
          activeRun.answerBuffer = ev.text;
        }
        if (ev.costUsd != null) activeRun.costUsd = ev.costUsd;
        if (ev.numTurns != null) activeRun.numTurns = ev.numTurns;
        activeRun.statusText = ev.isError ? "error" : "completed";
      } else if (ev.type === "error") {
        activeRun.errorMessage = ev.message || "Provider error";
        activeRun.statusText = "error";
      }

      this.emit("run:event", {
        threadId,
        workspaceId: ws.id,
        runId,
        event: ev,
        statusText: activeRun.statusText,
      });
    };

    const handle = providers.spawnProviderRun(spec, onEvent);
    activeRun.handle = handle;

    const completion = handle.done.then((exitInfo) => {
      const durationMs = Date.now() - startedAt;
      for (const tc of activeRun.toolCalls) {
        if (tc.status === "running") tc.status = activeRun.cancelled ? "cancelled" : "completed";
      }

      const failed = Boolean(
        activeRun.errorMessage ||
        (!activeRun.cancelled && exitInfo && exitInfo.code !== 0 && exitInfo.code !== null),
      );
      if (failed && !activeRun.errorMessage) {
        const stderrHint = core.cleanText((exitInfo && exitInfo.stderr) || "", 400);
        activeRun.errorMessage = `${provider} exited with code ${exitInfo.code}${stderrHint ? `: ${stderrHint}` : ""}`;
      }

      // Refresh catalog on completion to resolve [[wikilink]] citations accurately
      const postCatalog = core.scanWorkspaceCatalog(effectiveCwd, { includeFrontmatter: false });
      const { cited, missing } = core.resolveCitationsFromText(activeRun.answerBuffer, postCatalog);

      const trace = core.buildAgentTrace({
        runId,
        agent: provider,
        mode: requestedMode === "read-only" ? "ask" : requestedMode,
        query: prompt,
        catalog: {
          total: catalogBlock.total,
          included: catalogBlock.included,
          omitted: catalogBlock.omitted,
        },
        surfaced,
        searched: activeRun.searchedQueries,
        read: Array.from(activeRun.readPaths),
        cited,
        missing,
        warnings: traceWarnings,
      });
      // Attach scope metadata for Observatory parity with v0.8.0
      trace.scope = ctx.scope;

      const turn = {
        id: "trn_" + crypto.randomBytes(6).toString("hex"),
        runId,
        threadId,
        provider,
        model: activeRun.model,
        mode: requestedMode,
        prompt,
        answer: activeRun.answerBuffer,
        toolCalls: activeRun.toolCalls,
        editedFiles: Array.from(activeRun.editedPaths),
        trace,
        sessionId: activeRun.sessionId,
        costUsd: activeRun.costUsd,
        numTurns: activeRun.numTurns,
        durationMs,
        cancelled: activeRun.cancelled,
        error: activeRun.errorMessage,
        createdAt: activeRun.startedAt,
        completedAt: new Date().toISOString(),
      };

      this.store.appendTurn(ws.path, threadId, turn);

      // Refresh thread metadata from disk so concurrent renames/pins are preserved
      const latest = this.store.getThread(ws.path, threadId) || thread;
      latest.turnCount = (latest.turnCount || 0) + 1;
      latest.updatedAt = turn.completedAt;
      latest.lastError = turn.error || null;
      if (activeRun.sessionId && !turn.cancelled) {
        latest.providerSessions = Object.assign({}, latest.providerSessions || {}, {
          [provider]: activeRun.sessionId,
        });
      }
      if (trace.faithfulness && trace.faithfulness.score !== null) {
        latest.lastFaithfulness = trace.faithfulness;
      }
      this.store.upsertThread(ws.path, latest);

      if (!turn.cancelled && !turn.error) {
        this.store.appendRunRecord(ws.path, trace);
        this.store.appendHandoff(ws.path, {
          agent: provider,
          mode: requestedMode === "read-only" ? "ask" : requestedMode,
          session_id: activeRun.sessionId || runId,
          thread_id: threadId,
          duration_ms: durationMs,
          targets: Array.from(new Set([...activeRun.editedPaths, ...activeRun.readPaths])).slice(0, 8),
          summary: `${latest.title}: ${trace.read.length} read, ${trace.cited.length} cited, ${trace.missing.length} missing` +
            (activeRun.editedPaths.size ? `, ${activeRun.editedPaths.size} edited` : ""),
          next_step: trace.missing.length
            ? "Review phantom references in the Answer Trace."
            : null,
        });
      }

      this.activeRuns.delete(threadId);
      const decorated = this._decorateThread(ws, latest);
      const eventName = turn.cancelled ? "run:cancelled" : turn.error ? "run:error" : "run:completed";
      this.emit(eventName, { threadId, workspaceId: ws.id, runId, turn, thread: decorated });
      return turn;
    });

    return { runId, threadId, completion };
  }

  cancelRun(threadId) {
    const active = this.activeRuns.get(threadId);
    if (!active) return false;
    active.cancelled = true;
    active.statusText = "cancelling…";
    try { active.handle && active.handle.cancel(); } catch { /* ignore */ }
    return true;
  }

  // ---- Diff / Worktree actions ----

  getThreadDiff(threadId) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const wt = found.thread.worktree;
    const targetPath = (wt && wt.path && fs.existsSync(wt.path)) ? wt.path : found.ws.path;
    const baseRef = wt ? wt.baseBranch : null;
    const diff = worktrees.getWorktreeDiff(targetPath, baseRef);
    return Object.assign({}, diff, {
      isWorktree: Boolean(wt && wt.path && fs.existsSync(wt.path)),
      worktree: wt || null,
      targetPath,
    });
  }

  commitThreadWorktree(threadId, message, opts) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const wt = found.thread.worktree;
    const targetPath = (wt && wt.path && fs.existsSync(wt.path)) ? wt.path : found.ws.path;
    const res = worktrees.commitWorktree(targetPath, message, opts);
    if (res.ok) this.emit("worktree:changed", { workspaceId: found.ws.id, threadId });
    return res;
  }

  mergeThreadWorktree(threadId, opts) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const wt = found.thread.worktree;
    if (!wt) return { ok: false, error: "This thread is not running in an isolated worktree." };
    const res = worktrees.mergeWorktree(found.ws.path, wt, opts);
    if (res.ok && res.cleaned) {
      const updated = Object.assign({}, found.thread, {
        worktree: null,
        mode: "read-only",
        updatedAt: new Date().toISOString(),
      });
      this.store.upsertThread(found.ws.path, updated);
      this.emit("thread:updated", { thread: this._decorateThread(found.ws, updated) });
    }
    if (res.ok) this.emit("worktree:changed", { workspaceId: found.ws.id, threadId });
    return res;
  }

  discardThreadWorktree(threadId) {
    const found = this.findThreadAcrossWorkspaces(threadId);
    if (!found) throw new Error(`Thread not found: ${threadId}`);
    const wt = found.thread.worktree;
    if (!wt) return { ok: false, error: "Thread has no attached worktree." };
    if (this.activeRuns.has(threadId)) this.cancelRun(threadId);
    const res = worktrees.removeWorktree(found.ws.path, wt.path, wt.branch, { force: true, deleteBranch: true });
    if (res.ok) {
      const updated = Object.assign({}, found.thread, {
        worktree: null,
        mode: "read-only",
        updatedAt: new Date().toISOString(),
      });
      this.store.upsertThread(found.ws.path, updated);
      this.emit("thread:updated", { thread: this._decorateThread(found.ws, updated) });
      this.emit("worktree:changed", { workspaceId: found.ws.id, threadId });
    }
    return res;
  }

  exportTurnReceipt(threadId, turnId, format) {
    const detail = this.getThreadDetail(threadId);
    const turn = detail.turns.find((t) => t.id === turnId || t.runId === turnId) || detail.turns[detail.turns.length - 1];
    if (!turn) throw new Error("Turn not found.");
    const receipt = core.buildAgentReceipt({
      receiptId: `receipt-${turn.runId}`,
      trace: turn.trace,
      changedFiles: turn.editedFiles || [],
      allowedPaths: [],
      verification: {
        status: turn.error ? "error" : turn.cancelled ? "cancelled" : "verified",
        warnings: (turn.trace && turn.trace.warnings) || [],
      },
      handoff: {
        summary: `${detail.thread.title} (${turn.provider}/${turn.model})`,
        nextStep: turn.trace && turn.trace.missing && turn.trace.missing.length
          ? "Check phantom references in trace."
          : "",
      },
      status: turn.error ? "failed" : turn.cancelled ? "cancelled" : "completed",
      createdAt: turn.completedAt || turn.createdAt,
    });
    if (format === "markdown" || format === "md") {
      return { contentType: "text/markdown; charset=utf-8", body: core.renderAgentReceiptMarkdown(receipt) };
    }
    return { contentType: "application/json; charset=utf-8", body: core.renderAgentReceiptJson(receipt) };
  }

  bootstrap() {
    const workspaces = this.listWorkspaces();
    const cfg = this.store.loadGlobalConfig();
    const activeWorkspaceId = (cfg.activeWorkspaceId && workspaces.some((w) => w.id === cfg.activeWorkspaceId))
      ? cfg.activeWorkspaceId
      : (workspaces[0] ? workspaces[0].id : null);
    return {
      version: this.getVersion(),
      providers: this.getProviders(false),
      workspaces,
      activeWorkspaceId,
      threads: this.listAllThreads(),
    };
  }

  shutdown() {
    for (const threadId of Array.from(this.activeRuns.keys())) {
      this.cancelRun(threadId);
    }
  }
}

module.exports = {
  WorkbenchEngine,
  deriveThreadTitle,
};

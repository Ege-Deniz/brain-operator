"use strict";

/* Brain Operator — Workbench Persistence Store
 *
 * Global registry: ~/.brain-operator/workbench.json (overridable via BRAIN_OPERATOR_HOME)
 * Per-workspace state: <workspace>/.brain-operator/
 *   - .gitignore            (ignores everything inside .brain-operator/)
 *   - threads.json          (thread metadata index, atomic temp+rename)
 *   - threads/<id>.jsonl    (append-only turn log with full traces)
 *   - runs.jsonl            (shared Observatory archive — 100% Obsidian compatible)
 *   - handoffs.jsonl        (shared cross-CLI handoff log — 100% Obsidian compatible)
 *
 * Read operations never create files on disk.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const core = require("./core");

const RUN_ARCHIVE_MAX = 500;
const RUN_ARCHIVE_SLACK = 100;

function globalHomeDir(override) {
  return path.resolve(override || process.env.BRAIN_OPERATOR_HOME || path.join(os.homedir(), core.BRAIN_STATE_DIR));
}

function atomicWriteJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function workspaceIdForPath(absPath) {
  return "ws_" + crypto.createHash("sha256").update(path.resolve(absPath)).digest("hex").slice(0, 12);
}

class WorkbenchStore {
  constructor(opts) {
    this.homeDir = globalHomeDir(opts && opts.homeDir);
    this.configPath = path.join(this.homeDir, "workbench.json");
  }

  loadGlobalConfig() {
    const cfg = readJsonSafe(this.configPath, null);
    if (!cfg || typeof cfg !== "object") {
      return {
        version: 1,
        workspaces: [],
        activeWorkspaceId: null,
        defaults: { provider: "claude", mode: "read-only" },
      };
    }
    if (!Array.isArray(cfg.workspaces)) cfg.workspaces = [];
    if (!cfg.defaults || typeof cfg.defaults !== "object") {
      cfg.defaults = { provider: "claude", mode: "read-only" };
    }
    return cfg;
  }

  saveGlobalConfig(cfg) {
    atomicWriteJson(this.configPath, cfg);
  }

  listWorkspaces() {
    const cfg = this.loadGlobalConfig();
    return cfg.workspaces.filter((w) => w && w.path && fs.existsSync(w.path));
  }

  registerWorkspace(dirPath, opts) {
    const abs = path.resolve(String(dirPath || ""));
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`Workspace directory does not exist: ${abs}`);
    }
    const cfg = this.loadGlobalConfig();
    const id = workspaceIdForPath(abs);
    const now = new Date().toISOString();
    const existing = cfg.workspaces.find((w) => w.id === id || path.resolve(w.path) === abs);
    if (existing) {
      existing.lastOpenedAt = now;
      if (opts && opts.name) existing.name = core.cleanText(opts.name, 100);
      if (opts && opts.vaultProfile !== undefined) existing.vaultProfile = opts.vaultProfile;
      cfg.activeWorkspaceId = existing.id;
      this.saveGlobalConfig(cfg);
      return existing;
    }
    const entry = {
      id,
      name: core.cleanText((opts && opts.name) || path.basename(abs) || abs, 100),
      path: abs,
      vaultProfile: (opts && opts.vaultProfile) || "",
      addedAt: now,
      lastOpenedAt: now,
    };
    cfg.workspaces.unshift(entry);
    cfg.activeWorkspaceId = entry.id;
    this.saveGlobalConfig(cfg);
    return entry;
  }

  removeWorkspace(workspaceId) {
    const cfg = this.loadGlobalConfig();
    const before = cfg.workspaces.length;
    cfg.workspaces = cfg.workspaces.filter((w) => w.id !== workspaceId);
    if (cfg.activeWorkspaceId === workspaceId) {
      cfg.activeWorkspaceId = cfg.workspaces[0] ? cfg.workspaces[0].id : null;
    }
    this.saveGlobalConfig(cfg);
    return cfg.workspaces.length < before;
  }

  getWorkspace(workspaceId) {
    const cfg = this.loadGlobalConfig();
    return cfg.workspaces.find((w) => w.id === workspaceId) || null;
  }

  // ---- Per-workspace threads ----

  _threadsIndexPath(workspaceRoot) {
    return path.join(workspaceRoot, core.THREADS_INDEX_PATH);
  }

  _threadTurnsPath(workspaceRoot, threadId) {
    const safe = String(threadId || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!safe) throw new Error("Invalid thread id");
    return path.join(workspaceRoot, core.THREADS_DIR_REL, `${safe}.jsonl`);
  }

  listThreads(workspaceRoot) {
    const idx = readJsonSafe(this._threadsIndexPath(workspaceRoot), null);
    const list = idx && Array.isArray(idx.threads) ? idx.threads : [];
    return list.slice().sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  }

  getThread(workspaceRoot, threadId) {
    return this.listThreads(workspaceRoot).find((t) => t.id === threadId) || null;
  }

  saveThreads(workspaceRoot, threads) {
    core.ensureBrainStateDirOnDisk(workspaceRoot);
    atomicWriteJson(this._threadsIndexPath(workspaceRoot), {
      schema: "brain-operator.threads",
      version: 1,
      updatedAt: new Date().toISOString(),
      threads,
    });
  }

  upsertThread(workspaceRoot, thread) {
    const list = this.listThreads(workspaceRoot);
    const idx = list.findIndex((t) => t.id === thread.id);
    if (idx >= 0) list[idx] = thread;
    else list.unshift(thread);
    this.saveThreads(workspaceRoot, list);
    return thread;
  }

  deleteThread(workspaceRoot, threadId) {
    const list = this.listThreads(workspaceRoot);
    const next = list.filter((t) => t.id !== threadId);
    if (next.length === list.length) return false;
    this.saveThreads(workspaceRoot, next);
    const turnsPath = this._threadTurnsPath(workspaceRoot, threadId);
    try { if (fs.existsSync(turnsPath)) fs.unlinkSync(turnsPath); } catch { /* ignore */ }
    return true;
  }

  readTurns(workspaceRoot, threadId) {
    const turnsPath = this._threadTurnsPath(workspaceRoot, threadId);
    if (!fs.existsSync(turnsPath)) return [];
    try {
      return core.parseJsonl(fs.readFileSync(turnsPath, "utf8"));
    } catch {
      return [];
    }
  }

  appendTurn(workspaceRoot, threadId, turn) {
    core.ensureBrainStateDirOnDisk(workspaceRoot);
    const turnsPath = this._threadTurnsPath(workspaceRoot, threadId);
    fs.mkdirSync(path.dirname(turnsPath), { recursive: true });
    fs.appendFileSync(turnsPath, JSON.stringify(turn) + "\n", "utf8");
    return turn;
  }

  writeTurns(workspaceRoot, threadId, turns) {
    core.ensureBrainStateDirOnDisk(workspaceRoot);
    const turnsPath = this._threadTurnsPath(workspaceRoot, threadId);
    fs.mkdirSync(path.dirname(turnsPath), { recursive: true });
    const body = (Array.isArray(turns) ? turns : []).map((t) => JSON.stringify(t) + "\n").join("");
    const tmp = `${turnsPath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, body, "utf8");
    fs.renameSync(tmp, turnsPath);
  }

  // ---- Shared Obsidian-compatible runs.jsonl & handoffs.jsonl ----

  readRunArchive(workspaceRoot) {
    const p = path.join(workspaceRoot, core.RUN_ARCHIVE_PATH);
    if (!fs.existsSync(p)) return [];
    try {
      return core.parseJsonl(fs.readFileSync(p, "utf8"));
    } catch {
      return [];
    }
  }

  appendRunRecord(workspaceRoot, trace) {
    try {
      core.ensureBrainStateDirOnDisk(workspaceRoot);
      const p = path.join(workspaceRoot, core.RUN_ARCHIVE_PATH);
      fs.appendFileSync(p, JSON.stringify(trace) + "\n", "utf8");
      const all = this.readRunArchive(workspaceRoot);
      if (all.length > RUN_ARCHIVE_MAX + RUN_ARCHIVE_SLACK) {
        const trimmed = all.slice(-RUN_ARCHIVE_MAX).map((r) => JSON.stringify(r) + "\n").join("");
        fs.writeFileSync(p, trimmed, "utf8");
      }
    } catch {
      // best-effort archive
    }
  }

  readRecentHandoffs(workspaceRoot, limit) {
    const p = path.join(workspaceRoot, core.HANDOFF_LOG_PATH);
    if (!fs.existsSync(p)) return [];
    try {
      const entries = core.parseJsonl(fs.readFileSync(p, "utf8"));
      return entries.slice(-Math.max(1, limit || 10)).reverse();
    } catch {
      return [];
    }
  }

  appendHandoff(workspaceRoot, payload) {
    try {
      core.ensureBrainStateDirOnDisk(workspaceRoot);
      const p = path.join(workspaceRoot, core.HANDOFF_LOG_PATH);
      const ts = new Date();
      const record = {
        timestamp: core.formatTimestamp(ts),
        createdAt: ts.toISOString(),
        agent: core.sanitizeField(payload.agent || "claude"),
        mode: core.sanitizeField(payload.mode || "ask"),
      };
      if (payload.session_id) record.session_id = core.sanitizeField(payload.session_id);
      if (payload.thread_id) record.thread_id = core.sanitizeField(payload.thread_id);
      if (payload.duration_ms != null) record.duration = `${(payload.duration_ms / 1000).toFixed(1)}s`;
      if (Array.isArray(payload.targets) && payload.targets.length) {
        record.targets = payload.targets.map(core.sanitizeField).filter(Boolean);
      }
      if (payload.summary) record.summary = core.sanitizeField(payload.summary);
      if (payload.next_step) record.next_step = core.sanitizeField(payload.next_step);
      fs.appendFileSync(p, JSON.stringify(record) + "\n", "utf8");
    } catch {
      // best-effort handoff log
    }
  }
}

module.exports = {
  WorkbenchStore,
  workspaceIdForPath,
  globalHomeDir,
};

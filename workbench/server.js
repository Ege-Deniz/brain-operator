"use strict";

/* Brain Operator — Local HTTP + SSE Workbench Server
 *
 * Zero dependencies. Strictly binds to 127.0.0.1 by default.
 * Serves the Workbench SPA at `/` and real-time multi-thread APIs under `/api/*`.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { WorkbenchEngine } = require("./engine");

const UI_HTML_PATH = path.join(__dirname, "ui", "index.html");
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, contentType, body) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body exceeds 2 MB limit."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) { resolve({}); return; }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin);
}

function isLocalHostHeader(hostHeader) {
  if (!hostHeader) return true;
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(String(hostHeader).trim());
}

function createWorkbenchServer(opts) {
  const o = opts || {};
  const engine = o.engine || new WorkbenchEngine({
    homeDir: o.homeDir,
    initialWorkspace: o.initialWorkspace,
  });

  const sseClients = new Set();
  const broadcast = (event, data) => {
    if (sseClients.size === 0) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(frame); } catch { sseClients.delete(res); }
    }
  };

  const forwardEvents = [
    "workspace:updated",
    "workspace:removed",
    "thread:created",
    "thread:updated",
    "thread:deleted",
    "run:started",
    "run:event",
    "run:completed",
    "run:cancelled",
    "run:error",
    "worktree:changed",
  ];
  for (const name of forwardEvents) {
    engine.on(name, (payload) => broadcast(name, payload));
  }

  const heartbeat = setInterval(() => {
    for (const res of sseClients) {
      try { res.write(": ping\n\n"); } catch { sseClients.delete(res); }
    }
  }, 20000);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  const server = http.createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      const hostHeader = req.headers.host;
      const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
      if (!isLocalOrigin(origin) || !isLocalHostHeader(hostHeader) || secFetchSite === "cross-site") {
        sendJson(res, 403, { error: "Forbidden cross-origin or non-local host request." });
        return;
      }

      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const pathname = parsedUrl.pathname;
      const method = (req.method || "GET").toUpperCase();

      // ---- Static UI ----
      if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
        if (!fs.existsSync(UI_HTML_PATH)) {
          sendText(res, 500, "text/plain; charset=utf-8", "Workbench UI file missing.");
          return;
        }
        const html = fs.readFileSync(UI_HTML_PATH, "utf8");
        sendText(res, 200, "text/html; charset=utf-8", html);
        return;
      }

      // ---- Health ----
      if (method === "GET" && pathname === "/api/health") {
        sendJson(res, 200, { ok: true, version: engine.getVersion(), activeRuns: engine.activeRuns.size });
        return;
      }

      // ---- SSE Live Stream ----
      if (method === "GET" && pathname === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(`event: hello\ndata: ${JSON.stringify({ version: engine.getVersion(), activeRuns: engine.activeRuns.size })}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      // ---- Bootstrap & Providers ----
      if (method === "GET" && pathname === "/api/bootstrap") {
        sendJson(res, 200, engine.bootstrap());
        return;
      }

      if (method === "GET" && pathname === "/api/providers") {
        const refresh = parsedUrl.searchParams.get("refresh") === "1";
        sendJson(res, 200, { providers: engine.getProviders(refresh) });
        return;
      }

      // ---- Workspaces ----
      if (method === "GET" && pathname === "/api/workspaces") {
        sendJson(res, 200, { workspaces: engine.listWorkspaces() });
        return;
      }

      if (method === "POST" && pathname === "/api/workspaces") {
        const body = await readJsonBody(req);
        if (!body.path) { sendJson(res, 400, { error: "path is required" }); return; }
        const ws = engine.registerWorkspace(body.path, { name: body.name, vaultProfile: body.vaultProfile });
        sendJson(res, 201, { workspace: ws });
        return;
      }

      let m;
      if ((m = pathname.match(/^\/api\/workspaces\/([^/]+)$/))) {
        const wsId = decodeURIComponent(m[1]);
        if (method === "DELETE") {
          const ok = engine.removeWorkspace(wsId);
          sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: "Workspace not found" });
          return;
        }
      }

      if (method === "GET" && (m = pathname.match(/^\/api\/workspaces\/([^/]+)\/context$/))) {
        const wsId = decodeURIComponent(m[1]);
        sendJson(res, 200, engine.getWorkspaceContext(wsId));
        return;
      }

      if (method === "GET" && (m = pathname.match(/^\/api\/workspaces\/([^/]+)\/observatory$/))) {
        const wsId = decodeURIComponent(m[1]);
        sendJson(res, 200, engine.getObservatory(wsId));
        return;
      }

      // ---- Threads ----
      if (method === "GET" && pathname === "/api/threads") {
        const wsId = parsedUrl.searchParams.get("workspaceId");
        const threads = wsId ? engine.listThreads(wsId) : engine.listAllThreads();
        sendJson(res, 200, { threads });
        return;
      }

      if (method === "POST" && pathname === "/api/threads") {
        const body = await readJsonBody(req);
        const thread = engine.createThread(body);
        sendJson(res, 201, { thread });
        return;
      }

      if ((m = pathname.match(/^\/api\/threads\/([^/]+)$/))) {
        const threadId = decodeURIComponent(m[1]);
        if (method === "GET") {
          sendJson(res, 200, engine.getThreadDetail(threadId));
          return;
        }
        if (method === "PATCH") {
          const body = await readJsonBody(req);
          const thread = engine.updateThread(threadId, body);
          sendJson(res, 200, { thread });
          return;
        }
        if (method === "DELETE") {
          const ok = engine.deleteThread(threadId);
          sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: "Thread not found" });
          return;
        }
      }

      if (method === "POST" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/turns$/))) {
        const threadId = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        const started = engine.sendTurn(threadId, body);
        sendJson(res, 202, { runId: started.runId, threadId: started.threadId });
        return;
      }

      if (method === "POST" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/cancel$/))) {
        const threadId = decodeURIComponent(m[1]);
        const cancelled = engine.cancelRun(threadId);
        sendJson(res, 200, { ok: cancelled });
        return;
      }

      if (method === "POST" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/fork$/))) {
        const threadId = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        const thread = engine.forkThread(threadId, body);
        sendJson(res, 201, { thread });
        return;
      }

      if (method === "POST" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/worktree$/))) {
        const threadId = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        const thread = engine.attachWorktree(threadId, body);
        sendJson(res, 200, { thread });
        return;
      }

      if (method === "GET" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/diff$/))) {
        const threadId = decodeURIComponent(m[1]);
        sendJson(res, 200, engine.getThreadDiff(threadId));
        return;
      }

      if (method === "POST" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/commit$/))) {
        const threadId = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        const result = engine.commitThreadWorktree(threadId, body.message, { allowSecrets: Boolean(body.allowSecrets) });
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (method === "POST" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/merge$/))) {
        const threadId = decodeURIComponent(m[1]);
        const body = await readJsonBody(req);
        const result = engine.mergeThreadWorktree(threadId, body);
        sendJson(res, result.ok ? 200 : 409, result);
        return;
      }

      if (method === "POST" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/discard$/))) {
        const threadId = decodeURIComponent(m[1]);
        const result = engine.discardThreadWorktree(threadId);
        sendJson(res, result.ok ? 200 : 400, result);
        return;
      }

      if (method === "GET" && (m = pathname.match(/^\/api\/threads\/([^/]+)\/turns\/([^/]+)\/receipt$/))) {
        const threadId = decodeURIComponent(m[1]);
        const turnId = decodeURIComponent(m[2]);
        const fmt = parsedUrl.searchParams.get("format") || "json";
        const out = engine.exportTurnReceipt(threadId, turnId, fmt);
        sendText(res, 200, out.contentType, out.body);
        return;
      }

      sendJson(res, 404, { error: `Not found: ${method} ${pathname}` });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      const status = /not found/i.test(msg) ? 404 : 400;
      sendJson(res, status, { error: msg });
    }
  });

  server.on("close", () => {
    clearInterval(heartbeat);
    for (const res of sseClients) {
      try { res.end(); } catch { /* ignore */ }
    }
    sseClients.clear();
  });

  return { server, engine };
}

function startWorkbenchServer(opts) {
  const o = opts || {};
  const host = o.host || "127.0.0.1";
  const port = Number.isFinite(Number(o.port)) ? Number(o.port) : 4141;
  const { server, engine } = createWorkbenchServer(o);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const addr = server.address();
      const actualPort = addr && typeof addr === "object" ? addr.port : port;
      const url = `http://${host}:${actualPort}`;
      resolve({
        server,
        engine,
        host,
        port: actualPort,
        url,
        close: () => new Promise((r) => {
          engine.shutdown();
          server.close(() => r());
        }),
      });
    });
  });
}

module.exports = {
  createWorkbenchServer,
  startWorkbenchServer,
};

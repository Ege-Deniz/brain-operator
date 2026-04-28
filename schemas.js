"use strict";

const SCHEMA_VERSION = 1;
const TRACE_SCHEMA = "brain-operator.agent-trace";
const RECEIPT_SCHEMA = "brain-operator.agent-receipt";
const DEFAULT_CATALOG_LIMIT = 250;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, maxLen) {
  if (value == null) return "";
  const max = maxLen || 1000;
  return String(value).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function uniqueStrings(values, limit) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const s = cleanText(value, 1000);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function normalizeSearches(values) {
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value === "string") {
      const query = cleanText(value, 500);
      if (query) out.push({ kind: "unknown", query });
      continue;
    }
    if (value && typeof value === "object") {
      const kind = cleanText(value.kind || "unknown", 80) || "unknown";
      const query = cleanText(value.query || value.pattern || "", 500);
      if (query) out.push({ kind, query });
    }
  }
  return out;
}

function capCatalogEntries(entries, maxEntries) {
  const list = Array.isArray(entries) ? entries : [];
  const limit = Math.max(0, Number.isFinite(Number(maxEntries)) ? Number(maxEntries) : DEFAULT_CATALOG_LIMIT);
  const capped = list.slice(0, limit);
  return {
    entries: capped,
    total: list.length,
    included: capped.length,
    omitted: Math.max(0, list.length - capped.length),
  };
}

function buildCatalogPromptBlock(entries, maxEntries) {
  const capped = capCatalogEntries(entries, maxEntries);
  const text = capped.entries
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && entry.meta) return `${entry.path}  ${entry.meta}`;
      return entry && entry.path ? entry.path : "";
    })
    .filter(Boolean)
    .join("\n");
  return { ...capped, text };
}

function buildAgentTrace(input) {
  const trace = input || {};
  const catalogInput = trace.catalog || {};
  const total = Number.isFinite(Number(catalogInput.total))
    ? Number(catalogInput.total)
    : Number(trace.catalogCount || 0);
  const included = Number.isFinite(Number(catalogInput.included))
    ? Number(catalogInput.included)
    : total;
  const omitted = Number.isFinite(Number(catalogInput.omitted))
    ? Number(catalogInput.omitted)
    : Math.max(0, total - included);
  return {
    schema: TRACE_SCHEMA,
    version: SCHEMA_VERSION,
    runId: cleanText(trace.runId || `trace-${Date.now()}`, 120),
    agent: cleanText(trace.agent || "claude", 80),
    mode: cleanText(trace.mode || "ask", 80),
    query: cleanText(trace.query || "", 2000),
    catalog: { total, included, omitted },
    searched: normalizeSearches(trace.searched),
    read: uniqueStrings(trace.read, 200),
    cited: uniqueStrings(trace.cited, 200),
    missing: uniqueStrings(trace.missing, 200),
    warnings: uniqueStrings(trace.warnings, 50),
    createdAt: cleanText(trace.createdAt || nowIso(), 80),
  };
}

function markdownList(values, fallback) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return `- ${fallback || "none"}`;
  return list.map((value) => `- ${String(value)}`).join("\n");
}

function renderAgentTraceMarkdown(traceInput) {
  const trace = buildAgentTrace(traceInput);
  const searched = trace.searched.length
    ? trace.searched.map((item) => `- ${item.kind}: ${item.query}`).join("\n")
    : "- none";
  return [
    "# Agent Trace",
    "",
    `- schema: ${trace.schema}@${trace.version}`,
    `- runId: ${trace.runId}`,
    `- agent: ${trace.agent}`,
    `- mode: ${trace.mode}`,
    `- createdAt: ${trace.createdAt}`,
    `- catalog: ${trace.catalog.total} total, ${trace.catalog.included} included, ${trace.catalog.omitted} omitted`,
    "",
    "## Query",
    trace.query || "(empty)",
    "",
    "## Searched",
    searched,
    "",
    "## Read",
    markdownList(trace.read, "none"),
    "",
    "## Cited",
    markdownList(trace.cited, "none"),
    "",
    "## Missing",
    markdownList(trace.missing, "none"),
    "",
    "## Warnings",
    markdownList(trace.warnings, "none"),
    "",
  ].join("\n");
}

function renderAgentTraceJson(traceInput) {
  return JSON.stringify(buildAgentTrace(traceInput), null, 2);
}

function buildAgentReceipt(input) {
  const receipt = input || {};
  return {
    schema: RECEIPT_SCHEMA,
    version: SCHEMA_VERSION,
    receiptId: cleanText(receipt.receiptId || `receipt-${Date.now()}`, 120),
    trace: buildAgentTrace(receipt.trace || {}),
    changedFiles: uniqueStrings(receipt.changedFiles, 200),
    allowedPaths: uniqueStrings(receipt.allowedPaths, 200),
    testsRun: Array.isArray(receipt.testsRun)
      ? receipt.testsRun.map((test) => ({
          command: cleanText(test && test.command, 500),
          exitCode: Number.isFinite(Number(test && test.exitCode)) ? Number(test.exitCode) : null,
          summary: cleanText(test && test.summary, 500),
        })).filter((test) => test.command || test.summary)
      : [],
    verification: receipt.verification && typeof receipt.verification === "object"
      ? {
          status: cleanText(receipt.verification.status || "unknown", 80) || "unknown",
          warnings: uniqueStrings(receipt.verification.warnings, 50),
        }
      : { status: "unknown", warnings: [] },
    handoff: receipt.handoff && typeof receipt.handoff === "object"
      ? {
          summary: cleanText(receipt.handoff.summary, 1000),
          nextStep: cleanText(receipt.handoff.nextStep || receipt.handoff.next_step, 1000),
        }
      : { summary: "", nextStep: "" },
    status: cleanText(receipt.status || "unknown", 80) || "unknown",
    createdAt: cleanText(receipt.createdAt || nowIso(), 80),
  };
}

function renderAgentReceiptMarkdown(receiptInput) {
  const receipt = buildAgentReceipt(receiptInput);
  const tests = receipt.testsRun.length
    ? receipt.testsRun.map((test) => `- ${test.command || test.summary}${test.exitCode == null ? "" : ` (exit ${test.exitCode})`}`).join("\n")
    : "- none";
  return [
    "# Agent Receipt",
    "",
    `- schema: ${receipt.schema}@${receipt.version}`,
    `- receiptId: ${receipt.receiptId}`,
    `- status: ${receipt.status}`,
    `- createdAt: ${receipt.createdAt}`,
    "",
    "## Trace",
    `- runId: ${receipt.trace.runId}`,
    `- agent: ${receipt.trace.agent}`,
    `- mode: ${receipt.trace.mode}`,
    `- missing refs: ${receipt.trace.missing.length}`,
    "",
    "## Changed Files",
    markdownList(receipt.changedFiles, "none"),
    "",
    "## Allowed Paths",
    markdownList(receipt.allowedPaths, "none"),
    "",
    "## Tests",
    tests,
    "",
    "## Verification",
    `- status: ${receipt.verification.status}`,
    markdownList(receipt.verification.warnings, "no warnings"),
    "",
    "## Handoff",
    `- summary: ${receipt.handoff.summary || "none"}`,
    `- next: ${receipt.handoff.nextStep || "none"}`,
    "",
    "## Trace Markdown",
    "",
    renderAgentTraceMarkdown(receipt.trace),
  ].join("\n");
}

function renderAgentReceiptJson(receiptInput) {
  return JSON.stringify(buildAgentReceipt(receiptInput), null, 2);
}

function parseHandoffEntries(blockText) {
  if (!blockText) return [];
  const content = String(blockText).trim();
  if (!content) return [];
  const chunks = content.split(/\r?\n(?=## \[)/).map((chunk) => chunk.trim()).filter(Boolean);
  const entries = [];
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const header = lines.shift() || "";
    const headerMatch = header.match(/^## \[([^\]]+)\]\s+(.+?)\s+·\s+(.+)$/);
    const entry = headerMatch
      ? {
          timestamp: cleanText(headerMatch[1], 80),
          agent: cleanText(headerMatch[2], 80),
          mode: cleanText(headerMatch[3], 80),
        }
      : { unparsed: true, raw: cleanText(chunk, 2000) };
    for (const line of lines) {
      const match = line.match(/^-\s+([A-Za-z0-9_]+):\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      const value = cleanText(match[2], 2000);
      if (key === "targets") entry.targets = value ? value.split(",").map((s) => cleanText(s, 500)).filter(Boolean) : [];
      else if (key === "scope_break") entry.scope_break = /^yes$/i.test(value);
      else entry[key] = value;
    }
    entries.push(entry);
  }
  return entries;
}

function dirtyScopeViolations(dirtyPaths, allowedPaths) {
  const allowed = new Set(uniqueStrings(allowedPaths, 500));
  return uniqueStrings(dirtyPaths, 1000).filter((path) => !allowed.has(path));
}

function getAskPermissionMode(_settings) {
  return "plan";
}

function safeParseStreamJsonLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return { ok: false, empty: true };
  try {
    return { ok: true, event: JSON.parse(trimmed) };
  } catch (error) {
    return {
      ok: false,
      error: `parse error: ${error.message}`,
      snippet: trimmed.slice(0, 200),
    };
  }
}

module.exports = {
  SCHEMA_VERSION,
  TRACE_SCHEMA,
  RECEIPT_SCHEMA,
  DEFAULT_CATALOG_LIMIT,
  buildAgentTrace,
  renderAgentTraceMarkdown,
  renderAgentTraceJson,
  buildAgentReceipt,
  renderAgentReceiptMarkdown,
  renderAgentReceiptJson,
  capCatalogEntries,
  buildCatalogPromptBlock,
  parseHandoffEntries,
  dirtyScopeViolations,
  getAskPermissionMode,
  safeParseStreamJsonLine,
};

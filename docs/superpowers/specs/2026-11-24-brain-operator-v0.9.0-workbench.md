# Brain Operator v0.9.0 — "The Workbench"

- **Date:** 2026-11-24
- **Status:** implemented and verified
- **Branch:** `v0.9.0-workbench`

## Why this exists

Brain Operator v0.1–v0.8 proved a real wedge — vault-contract retrieval scoping,
Answer Trace, Retrieval Faithfulness (0–100), fenced cross-CLI handoffs, Safe Apply,
and the offline Observatory — but stayed trapped inside blocking Obsidian modals:
one run at a time, one `lastSessionId`, Claude-only, no isolated git worktrees.

After a year of working with local coding agents, the actual workflow that matches
how builders work is **T3 Code / Orca**: a multi-thread, multi-provider local
control plane where parallel agents work simultaneously in isolated git worktrees,
you inspect live diffs and receipts, and you merge or discard cleanly.

**Brain Operator v0.9.0 ("The Workbench")** brings that orchestration architecture
to Brain Operator without losing its soul: zero npm runtime dependencies, zero API
keys (bring your own local CLI subscriptions), warm amber-phosphor instrument UI,
vault-contract context governance, and deterministic Retrieval Faithfulness on every turn.

## Architecture

| Component | Path | Role |
|---|---|---|
| CLI entry point | `bin/brain-operator.js` | `serve`, `doctor`, `threads`, `worktrees`, `run` |
| Shared pure core | `workbench/core.js` | Disk catalog scan, vault profiles, scope gate, route classifier, surfacing, faithfulness, secret scan, Observatory aggregation |
| Multi-provider layer | `workbench/providers.js` | Unified streaming adapters for Claude Code, Codex CLI, Gemini CLI, and `sim`; fenced cross-provider handoffs |
| Git worktree orchestrator | `workbench/worktrees.js` | Isolated `.brain-operator/worktrees/<slug>` on `bo/<slug>`, unified diff + untracked preview, secret scan, safe commit/merge-back, conflict abort |
| State store | `workbench/store.js` | Global `~/.brain-operator/workbench.json` + per-workspace `.brain-operator/threads.json`, `threads/<id>.jsonl`, shared `runs.jsonl` & `handoffs.jsonl` |
| Run engine | `workbench/engine.js` | Concurrent `activeRuns` across threads, mid-thread provider switching, fork, cancel, receipt export |
| Local HTTP + SSE server | `workbench/server.js` | `127.0.0.1` loopback server, Origin CSRF guard, REST API, live SSE multiplexer |
| Workbench UI | `workbench/ui/index.html` | 3-pane warm instrument studio (Threads · Fleet & Worktrees · Live Observatory · Diff/Trace/Context Inspector · `⌘K` palette) |
| Obsidian plugin bridge | `main.js` + `styles.css` | Multi-thread picker with explicit per-thread `sessionId` resume + one-click `Open Workbench ↗` |

## Safety invariants

1. **Zero root-repo pollution:** `.brain-operator/.gitignore` contains `*`, keeping `git status` clean without modifying the user's tracked `.gitignore`.
2. **Read-only inspect writes nothing:** `doctor` and `inspectWorkspaceContext` never create `.brain-operator/`.
3. **Fail-closed worktree merge:** Refuses dirty base checkout, refuses likely secrets, and always runs `git merge --abort` on conflict so the main branch is never left half-merged.
4. **Path-traversal guard:** `removeWorktree` refuses any path outside `.brain-operator/worktrees/`.
5. **Localhost-only server:** Binds to `127.0.0.1` by default and rejects non-local `Origin` headers with `403`.
6. **Obsidian compatibility preserved:** `main.js` remains a self-contained single-file plugin with zero local `require("./...")` calls and full `examples/starter-vault/` parity.

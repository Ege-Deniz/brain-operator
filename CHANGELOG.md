# Changelog

All notable changes to Brain Operator. The README keeps only the latest release; older entries live here.

## v0.9.0

**The Workbench.** Brain Operator grows from a single-modal Obsidian plugin into a local-first, zero-dependency multi-agent orchestration workbench (in the mold of T3 Code and Orca) — while keeping its signature wedge: vault-contract retrieval scoping, deterministic Retrieval Faithfulness, Answer Trace, Safe Apply, and the warm amber-phosphor Observatory.

### Standalone Multi-Agent Workbench (`bin/brain-operator.js` + `workbench/`)

- **First-class CLI & local HTTP/SSE server.** Run `node bin/brain-operator.js serve [workspace]` (or `npm start` / `npx brain-operator`) to launch the 3-pane local Workbench over any git repository or Obsidian vault on `127.0.0.1:4141`. Zero npm runtime dependencies, zero API keys, zero external network requests.
- **Parallel concurrent threads.** Run multiple agent threads simultaneously across workspaces with real-time Server-Sent Events streaming, live tool call timelines, inline Answer Trace strips, thread forking, pinning, search, archiving, and a `⌘K` command palette.
- **Multi-provider CLI orchestration — Claude Code, Codex CLI, and Gemini CLI are all driven, not just observed.** Unified streaming adapter layer normalizes Claude (`--print --output-format stream-json`), Codex (`codex exec --json` / `codex exec resume`), and Gemini (`gemini -p "" -o stream-json --approval-mode ...`) into one live event stream, Answer Trace, and Faithfulness score.
- **Mid-thread provider switching with fenced handoffs.** Start a thread on Claude Code and switch the next turn to Codex or Gemini (or fork a thread) — Brain Operator automatically compiles prior turns into a fenced, untrusted-data `brain-operator.thread-handoff` block so continuity travels safely across providers.
- **Isolated git worktrees per thread (Orca mode).** Spin up isolated `.brain-operator/worktrees/<slug>` checkouts on `bo/<slug>` branches so multiple agents edit code or notes in parallel without file collisions. Includes a live unified Diff inspector, secret-scan preflight, scoped commit, safe merge-back (fail-closed on dirty base checkout, automatic `git merge --abort` on conflict), and clean teardown.
- **Self-ignoring runtime state.** `.brain-operator/.gitignore` keeps `git status` clean without modifying the user's tracked root `.gitignore`. Read-only `doctor` and context checks write nothing to disk.
- **Live Fleet & Observatory views.** Mission-control Fleet grid shows every active thread and git worktree side-by-side; the embedded Observatory charts faithfulness over time and compares Claude vs. Codex vs. Gemini from the shared `.brain-operator/runs.jsonl` archive.

### Obsidian plugin upgrades (`main.js` + `styles.css`)

- **Multi-thread picker & explicit per-thread resume.** `OperatorModal` now surfaces recent distinct threads (via `buildThreadList`) and `AskModal` accepts an explicit `sessionId` (`this.targetSessionId`), so selecting any earlier thread resumes that exact session instead of only `settings.lastSessionId`.
- **Direct Workbench bridge.** New `Open Workbench` command, Operator header button, Home card, Quick dispatcher entry, and `obsidian://brain-operator?mode=workbench` URI route launch or open the local Workbench straight from Obsidian.
- **Safety panel copy cleanup.** Removed the stale "Ship per-row" mention left over after v0.8.0 deleted Ship.

### Tests

- Added `tests/workbench-e2e.js` covering multi-provider CLI specs & stream-json parsing, cross-provider handoffs, UI JS syntax & offline contract, real parallel git worktrees, secret-scan commit guard, safe merge-back & conflict abort, path-traversal protection, and live HTTP + SSE streaming.
- Added multi-thread picker & explicit `sessionId` resume coverage to `tests/parser-tests.js`.
- Wired all 5 suites into `node tests/run-all.js` (`npm test`).

## v0.8.0

The brain fits. Every retrieval constant was calibrated against the bundled 19-file starter vault. Measured against a real one — 1,716 indexed notes with a 49-page knowledge core — the numbers were wrong by more than an order of magnitude, and the plugin had drifted away from the vault contract it claims to enforce.

### Retrieval is scoped by the vault's own contract

- **The catalog is no longer `getMarkdownFiles()`.** Archive, `_scratch/`, `output/`, `tmp/`, `raw/`, `log.md`, and `index.md` are withheld from *default* context — a direct transcription of `context-routing.md`'s "do not load index, log, a whole folder, or the archive by default". Grep and Glob still reach every one of them, which is exactly the deliberate search the contract permits.
- **`Current State.md` decides which projects are live.** The contract says folder membership does not make something current, so the scope gate parses that page for `01_Projects/<folder>` references and withholds the rest. **Fails open**: a missing, unreadable, or project-free status page means no project filtering at all, because a status page nobody has written yet must never silently hide work.
- **Ranking is freshness-weighted.** `active` earns a boost; `scratch`/`speculative`, `historical`/`evidence`, and `archived` are progressively demoted. Absent status is **neutral, not a penalty** — only 7 of 49 live pages carry the field, so penalising unstated pages would have demoted 86% of the knowledge layer. Demoted material stays reachable; it just cannot outrank live knowledge at comparable relevance.
- **Above the cap, the prompt gets a folder map instead of a truncated list.** A sliced list reads as the whole vault while being an arbitrary sample.
- **New `scope` cell in the Answer Trace** reports what was withheld and why, so an exclusion is never silent.
- **Measured:** 1,716 indexed → 80 eligible, and the catalog now fits in list mode with nothing omitted.

### Vault profiles — scope works for vaults nobody scaffolded

The first cut of the above transcribed **one vault's** routing contract, so it only described that vault. Measured against other layouts it withheld **0%** of anything — the release's headline feature was a no-op for everyone but its author.

- **Conventions are data, not code.** A profile maps folder patterns to semantic roles (`archive`, `scratch`, `output`, `source`, `index`, `log`, `template`) plus an optional status page and project root. Ships with **Brain Operator scaffold**, **PARA**, and **Zettelkasten / daily notes**. Everything downstream — the scope pass, the ranker, the faithfulness math — is unchanged and never learns a new concept.
- **Detection requires evidence and a clear winner.** Two or more independent signature hits, no tie. A vault with no recognisable convention gets **no guess**, which is a better answer than a confident wrong one.
- **Guess, then confirm — never guess, then apply.** A proposal screen shows exactly what would be withheld, grouped by reason with example paths, and changes nothing until approved. Same contract as Apply: preview, then confirm. The one exception is the scaffold profile, which auto-applies because the plugin *wrote* that layout — that is not a guess about someone else's folders.
- **Silence is reported.** If a layout is detected but unconfirmed, or no profile applies, the Answer Trace and the Operator say so. A silent no-op is indistinguishable from a broken feature.
- **Profiles that declare no status page keep the active-project gate off** rather than approximating it against a page that does not exist.
- **Settings → Vault profile** shows the live withheld count, offers a preview, and lets you pick or clear a profile at any time.
- **Regression the fixtures caught:** an early signature matched PARA's `1 Projects/` against the scaffold's `01_Projects/` and confidently misidentified PARA vaults. Signatures are now independent evidence rather than alternative spellings of one pattern, and a fixture asserts the two stay apart.

### Plugin state leaves the wiki

- **Ask performs zero writes to the knowledge layer.** Through v0.7.0 every Ask appended to `wiki/operating/Agent Handoff Log.md` — an unrequested write, into a folder the contract reserves for a single current-state page, under a generated header that linked `[[Decision Log]]` and `[[Operating Cadence]]` after both had been deleted.
- **State moves to `.brain-operator/` in the vault root.** Obsidian does not index dot-folders, so it never enters the catalog, the graph, or search — but it is still inside the repo, so an agent can read it. `handoffs.jsonl` for cross-CLI continuity, `runs.jsonl` for the Observatory archive. Both are added to the vault `.gitignore`.
- **JSONL, not Markdown.** `JSON.stringify` cannot emit a raw newline inside a string, so one record is structurally one line and hostile free text cannot forge a second entry. A damaged line costs one record instead of the file.
- **The run archive also leaves the plugin folder**, where a plugin update would have erased the user's history.
- **Legacy logs migrate on first read.** The original page is left in place: the plugin put it in the wiki without asking, so deleting it without asking would repeat the mistake.

### The Observatory actually ships

- **v0.7.0's headline feature was never committed.** `git log --all -- observatory` is empty; the command exited on "template not found", and receipt persistence sat behind `if (fs.existsSync(obsDir))` against a directory that did not exist — so **no Ask had ever archived a run**.
- **`observatory/index.html` now exists**: a dial for mean faithfulness, a per-run trend, a Claude vs Codex table, drift hotspots (cited-but-unread and phantom refs), and a run log carrying the scope cell. Amber phosphor on charcoal, serif for voice, monospace for every number.
- **Self-contained by contract.** Opened over `file://` with no server and no network: zero external requests, local font stacks, inline SVG grain, hand-built charts.

### The cage, and the instructions to rebuild it

- **Ship is deleted** (−663 lines), along with its command, Home card, and Quick entry. It had been "paused pending rewrite" since v0.6.7 while `wiki-workflows.md` listed Brain Ship under "Removed Workflows". `obsidian://…?mode=ship` now notices and opens the Operator.
- **The retired skills are no longer scaffolded at all** — not even as the "historical" stubs v0.6.7 introduced. A stub is still a file the next agent can read and revive.
- **The bigger find: v0.6.7 removed the cage's pages but kept shipping the documents that teach users to recreate them.** The scaffolded README, QUICKSTART, and Second Brain concept page still described `operating-mode.md` priority bands, `_proposals/queue.md`, Project Triage, Decision Log, and a Day 7 step that cron-scheduled `brain-evolve` and `brain-ship`. All three are rewritten. Cold-install now scans every scaffolded file for retired-system terms.
- **`BRAIN_SCAFFOLD_MARKERS` no longer requires `.claude/skills/brain-evolve/SKILL.md`.** Any vault that took the contract seriously and deleted the retired skills read as un-bootstrapped forever. Markers are now `CLAUDE.md` + `context-routing.md`.
- **`examples/starter-vault/` is generated**, not hand-copied. It had drifted three releases behind, still shipping the proposal queue and both skills *with live triggers*. `tools/sync-starter-examples.js` regenerates it and cold-install runs `--check`.
- **The cage left the binary, not just the scaffold.** `main.js` embedded a 58 KB single-line blob of 20 starter files, layered with a removal set and an override map — 10 dropped, 7 replaced, 5 added, so **93% of the payload was shipped, parsed, and thrown away**. The dead part included the full `brain-evolve` and `brain-ship` skills *with live triggers*: excluded by path, but present in the artifact, which is precisely why they needed excluding. It is now one flat table of the 15 files that actually get written. `main.js` **344 KB → 288 KB**, longest line **58,437 → 404 chars**, and scaffold output verified byte-for-byte identical across all 15 files. A hygiene suite asserts the blob machinery is gone, that no line is a minified payload, and that the retired trigger phrases appear nowhere in the shipped file.

### Operator and prompt

- **The system prompt learned the current vocabulary**: the closed category set, all five status values and what each binds, that a missing status does not prove freshness, that only `Current State.md` says what is live, that `raw/` is immutable, that `_scratch/` is never auto-loaded, and that Query/Ingest/Lint/File Back are user-invoked and never scheduled.
- **The Operator opens with what the brain considers live** — notes in context, the active projects named by Current State, and the last run's faithfulness score.
- **Version strings come from the manifest.** The Home subtitle read "technical preview v0.6.6" against a 0.7.0 manifest for two releases.

### Tests

`node tests/run-all.js` runs all four suites. Totals: parser **260/260** (was 154), cold-install **27/27**, apply-guard e2e **6/6**, and a new Observatory smoke suite **19/19** that runs the page's script against a DOM stub on empty, real, and malformed archives.

## v0.7.0

The Operator. Brain Operator stops being a set of modes you browse and becomes one operator you point: it holds everything, is instantly ready, works on what you are doing now, and never acts on its own.

- **Operator front door.** A single entry (ribbon, command, and `obsidian://brain-operator?mode=operator`). It lays your last state on the table as an offer, last session from the continuity log, what changed in git, and the thread's files via surfacing, beside an open "what are you working on?" input. Resume that thread, or start fresh with no gravity from the past. Engine you point: it never assumes you are continuing and never acts on its own.
- **Observatory.** A local-first dashboard over your runs: a retrieval-faithfulness gauge, a per-run trend, a Claude vs Codex leaderboard, drift hotspots (pages cited but unread, or referenced but missing), and a run log. Warm Brain Operator identity (amber, JetBrains Mono, Fraunces), not a generic SaaS dashboard.
- **Real data, no server, no keys.** Every Ask now persists its trace to a local archive, and "Open Observatory" inlines your real runs into a self-contained offline page that opens with one click. Falls back to a sample set until you have run an Ask. The archive holds real vault paths and queries, so it is gitignored and never committed.
- **Composes the prior two releases.** v0.6.8 proactive surfacing and v0.6.9 faithfulness are now capabilities the Operator and Observatory are built from, not standalone features.
- **Verification.** Plugin loads clean, parser suite 154/154 with no regression; the Observatory real-data loop verified end to end (the served fetch path and the offline inline path both render real receipts). Live in-Obsidian render of the Operator modal is pending a reload.

## v0.6.9

Retrieval Faithfulness Score — the ownable number. Brain Operator already showed *what* an agent retrieved; v0.6.9 scores *how honestly* it cited.

- **A deterministic faithfulness score on every run.** Of every `[[link]]` the answer made, what share resolved to a real note AND the agent actually opened this run? `grounded / (cited + missing)`. Cited-but-unread = citation from memory/thin air; an unresolved `[[link]]` = a phantom reference. Both drag the score down. 100 = every citation was read this run; null = the answer cited nothing.
- **No LLM, no keys, no infra.** Computed locally from data the Answer Trace already captures (`cited` / `read` / `missing` / `surfaced`). No judge model, no API key, no network — it runs on the trace you already produce.
- **Headline number + breakdown.** The score is the lead cell in the Answer Trace, with grounded / cited-but-unread / phantom counts, plus a `faithfulness` object in the `agent-trace` schema and Markdown/JSON exports. Computed retroactively for any receipt.
- **Why it matters.** This is the metric the incumbents skip — OpenTelemetry's GenAI conventions don't cover retrieval faithfulness or "what the agent missed." The `missing`/`cited`/`read` capture makes "did the agent cite what it actually read" measurable for local agents.
- **Audit.** Multi-reviewer pass (code + security): no critical/high findings, and all prior v0.6.7-backlog items verified closed. Hardened the surfaced block (`cleanText` on interpolated path/reason), deduped query link-targets, fixed catalog-count reporting when the full dump is off, and guarded the vault-relative path conversion the faithfulness intersection depends on.
- **Tests.** A new faithfulness suite covers full grounding, cited-but-unread drag, phantom-ref drag, only-phantom → 0, no-citations → NA, surfaced recall, and retroactive trace compute. Totals: parser **154/154**, cold-install **26/26**, apply-guard e2e **6/6**.

## v0.6.8

Proactive surfacing — the symmetric half of v0.6.7's context governance. v0.6.7 taught Ask when to **suppress** the vault (aperture/tradeoff); v0.6.8 teaches it when to **surface**, so the user stops naming pages by hand.

- **Ask surfaces the most relevant pages as ranked pointers.** On context-allowed routes (knowledge, vault, execution-prep, receipts), Brain Operator scores the catalog locally — title/tag/path term overlap plus a small recency boost and a strong `[[wikilink]]` signal — and injects the top few pages as cited pointers *before* the flat catalog. Progressive disclosure: high-signal pointers first, full list as fallback.
- **Two gates keep surfacing honest.** Route gate: aperture/tradeoff surface nothing, so the v0.6.7 suppression contract holds with no new asymmetry. Relevance gate: a query with no real match surfaces nothing, so noise never reaches the prompt.
- **Pointers ground, they don't steer.** The surfaced block is explicitly framed as context, not direction ("NOT a priority list, backlog, or direction"). Surfacing restores connectedness; it does not re-introduce the silent steering v0.6.7 removed.
- **Surfacing is inspectable.** A new `surfaced` cell in the Answer Trace, plus a `surfaced` field in the `agent-trace` schema and Markdown/JSON exports, shows exactly which pages were offered and why — proactive retrieval is now as debuggable as the rest of the run.
- **Deterministic by design.** No embeddings, no network: pure local ranking that runs even when the full-catalog dump is disabled.
- **Tests.** A new proactive-surfacing suite covers the route gate, relevance gate, entity/recency ranking, limit, prompt-block framing, and trace round-trip. Totals: parser **143/143**, cold-install **26/26**, apply-guard e2e **6/6**.

## v0.6.7

Context-governance pass. Shifts Brain Operator from raw persistent memory toward governed memory.

- **Ask routes context before retrieval.** The system prompt now classifies Ask runs into aperture, tradeoff, execution-prep, receipts, vault lookup, or knowledge mode.
- **Catalog and recent-handoff injection are suppressed for ideation and tradeoff routes.** "What should I build?" and choice-shaping questions no longer receive the full vault catalog or last-session context as a hidden framing menu.
- **Context Audit replaces the old Evolve prompt.** It now audits freshness, aperture, permission, stale control planes, and executable surfaces that can bypass the new policy. It no longer reads `operating-mode.md` or proposal queues as priority truth.
- **Ship is paused.** The legacy proposal queue flow now opens a quarantine notice and points users to Ask/Execution-Prep for chosen tasks.
- **Starter scaffold is governed by default.** New vaults get `context-routing.md`, `_scratch/`, `Current State.md`, and quarantined historical stubs for `brain-evolve` / `brain-ship`; the old `operating-mode.md` and `_proposals/` queue are not created.
- **Tests cover routing and starter hygiene.** Parser tests now assert ideation/tradeoff catalog + handoff suppression and governed-starter exclusion of the retired queue/control plane.

## v0.6.6

Multi-reviewer hardening pass. Closes three live failure modes the v0.6.5 review surfaced.

- **`<finding>` fence breakout closed.** The Apply system prompt fences untrusted finding text inside `<finding><text>…</text></finding>`. A finding whose body contained `</text></finding>` could escape that fence and inject instructions into the trusted region. A new `encodeXmlText` helper entity-encodes `<`, `>`, and `&` before interpolation, so the closing tag literally cannot appear inside the fenced text.
- **Stdin EPIPE no longer crashes the renderer.** When the spawned `claude` process dies between spawn and stdin write, Node emits an asynchronous `'error'` event on the writable stdin. Without a listener, the renderer process throws an uncaught exception that takes down the modal. Brain Operator now registers a no-op `'error'` listener at all four spawn sites (Ask, Evolve, Ship, generic `streamSubprocess`) before writing.
- **Cancel no longer leaks the elapsed-time interval.** Pressing Escape during a long Ask/Evolve/Ship run sent SIGTERM but never cleared the 1-second `setInterval` driving the elapsed-seconds badge — when the close handler did not fire (process already gone), the interval ticked forever in the renderer. The interval-stop closure is now stored on the modal as `_stopTick`, and `cancelChild()` calls it before `kill()`.
- **Tests pass unchanged.** Test totals stay at parser **117/117**, cold-install **18/18**, apply-guard e2e **6/6**.

## v0.6.5

Auth-probe hotfix and shell-safety hardening for the same call site. Without this fix, every Ask / Trace / Evolve / Ship / Decide / File-Back / GitHub Connect modal renders "Claude Code is not authenticated" against current Claude Code CLI installs, even when `claude auth status` reports the user is logged in.

- **Drops `--output-format json` from the auth probe.** Claude Code CLI 2.1.121 rejects that flag on `auth status` and exits non-zero, which the previous probe interpreted as an authentication failure. Bare `claude auth status` already returns JSON, so the flag is unnecessary.
- **Reads the right field.** The CLI returns `{loggedIn: true, ...}`, but the gate previously checked `auth.authenticated === false`. The probe now normalizes both fields to the same boolean, and the gate accepts either — so older and newer CLI shapes both pass.
- **Falls back to text matching.** If the CLI returns human-readable output instead of JSON (older or future builds), the probe matches `logged in` / `authenticated` / `signed in` so a benign output-shape change does not lock authenticated users out.
- **`execFileSync` for both probe call sites.** `checkClaudeAuth` and `codexVersion` no longer interpolate the user-controlled `claudeBinPath` / `codexBinPath` into a shell string. A `$(…)` or backtick in either path can no longer break out of the shell quote and execute arbitrary commands during preflight. The remaining `cp.spawn` paths already use the array-arg form and never went through a shell.
- **Tests pass unchanged.** Test totals stay at parser **117/117**, cold-install **18/18**, apply-guard e2e **6/6**.

## v0.6.4

Obsidian bundle hotfix. Closes the real loader failure after v0.6.3.

- **Single-file runtime bundle.** Inlined the AgentTrace/AgentReceipt schema helpers into `main.js`; Obsidian's plugin loader does not resolve `require("./schemas")` relative to the plugin folder.
- **Verified through Obsidian runtime.** Relaunched Obsidian with a local DevTools port and confirmed `app.plugins.plugins["brain-ask"]` is loaded and all nine `brain-ask:*` commands are registered.
- **Regression guard.** Parser tests now assert `main.js` does not contain the forbidden local schema require. Test totals: parser **117/117**, cold-install **18/18**, apply-guard e2e **6/6**.

## v0.6.3

Load hotfix for Obsidian installs where the optional `SuggestModal` API is unavailable at plugin import time.

- **Quick dispatcher fallback.** `QuickModeModal` now falls back to a plain modal picker instead of extending an undefined Obsidian class and aborting plugin load.
- **Load diagnostics.** If `onload()` fails after import, Brain Operator writes `.obsidian/plugins/brain-ask/load-error.log` with the stack trace and shows a focused failure notice.
- **Regression test.** Parser tests now intentionally omit `SuggestModal` from the Obsidian shim. Test totals remain parser **116/116**, cold-install **18/18**, apply-guard e2e **6/6**.

## v0.6.2

GitHub Connect. Closes the setup gap where users still had to manually wire a vault to GitHub after scaffolding it.

- **New GitHub Connect mode.** Added a Home card, command palette command, URI route, Quick dispatcher entry, and Agent Pulse Git-tab button.
- **Guarded repo automation.** When `gh` is installed and authenticated, Brain Operator can initialize local git, add safe `.gitignore` entries, create or reuse a GitHub repo, add `origin`, make a backup commit, and push the current branch.
- **Private by default.** New repos default to private. Public is available, but explicit.
- **No silent auth.** The plugin does not store GitHub credentials and does not attempt hidden OAuth. If `gh` is unauthenticated, GitHub Connect copies the exact `gh auth login --hostname github.com --git-protocol https --web` command and waits for user-approved login.
- **Secret preflight.** Before creating/pushing, the modal scans text files for common token/private-key patterns and refuses to push likely secrets.
- **Remote parsing tests.** Parser tests now cover repo-name normalization, owner validation, full-name construction, and `https`/SSH GitHub remote parsing. Test totals: parser **116/116**, cold-install **18/18**, apply-guard e2e **6/6**.

## v0.6.1

Home modal cleanup. No new features, no behavior change.

- **Cozy Desk launcher row removed.** The Home modal had a parked "cozy desk dashboard: open in new window ↗" row that pointed at a retired surface (`01_Projects/future-ideas/cozy-desk-webgl-concept/`). Stripped the launcher row, the `openCozyDesk` method, the `COZY_DESK_VAULT_PATH` constant, and the obsolete header/trailer comments from `main.js`.
- **Per-card version chips dropped.** Each Home grid card had a `v0.2`/`v0.3`/`v0.4` chip next to the label. Read like internal noise on a public Home — and implied Ask was "older" than Ship, which is the opposite of true. One global version sits in the subtitle now.
- **Ask-resume subtitle softened.** Was `continue 8b4856fa…` (raw hex slice from `lastSessionId`). Now reads `continue last session`. Disabled state when no session exists is unchanged.
- **Redundant "no writes" badges trimmed.** Evolve and Ship card subtitles repeated "no writes". The Safety panel above already states the read-only default. Card copy is now: Evolve → "audit for contradictions, stale claims, orphans"; Ship → "classify queued proposals by autonomy level".
- **Subtitle string updated.** Now reads "agent devtools for Claude + Codex on a shared vault · technical preview v0.6.1".
- **CSS strip.** Removed ~620 lines of dead Cozy Desk modal CSS from `styles.css` (2120 → 1530 lines): the `.brain-ask-home-cozy-row/label/link` launcher block (~33 lines) plus the `.brain-ask-cozy-modal` operator-surface block (~590 lines) including all `cozy-scene`, `cozy-crt`, `cozy-lamp`, `cozy-dolphin`, `cozy-glass`, `cozy-steam`, `cozy-sticky`, `cozy-walkman`, `cozy-brand-strip` selectors and their reduced-motion / compact-screen `@media` queries. Verified `main.js` no longer references any `.brain-ask-cozy-*` or `.cozy-*` class.
- **Test surface unchanged.** v0.6.1 is pure UI/CSS cleanup — `parser-tests.js` (110/110), `cold-install-sim.js` (18/18), and `apply-guard-e2e.js` (6/6) continue to pass without modification.

## v0.6.0

Agent DevTools foundation.

- **AgentTrace schema.** Ask now builds a stable trace with `runId`, `agent`, `mode`, `query`, `catalog`, `searched`, `read`, `cited`, `missing`, `warnings`, and `createdAt`.
- **AgentReceipt schema.** Ask and Apply can export portable Markdown/JSON receipts for PRs, issues, Slack, or wiki records.
- **Trace export actions.** Answer Trace now has `Export Trace as Markdown`, `Export Trace as JSON`, and `Copy Agent Receipt`.
- **Ask is hard read-only.** Ask/Trace always spawn Claude with `--permission-mode plan` and `Read,Grep,Glob`, regardless of the write-mode setting.
- **Handoffs are fenced as untrusted JSON.** Prior sessions are parsed into structured fields and injected as `agent-handoff-json`, not raw markdown instructions.
- **Safe Apply blocks dirty out-of-scope files.** Apply refuses to run when the git worktree is already dirty outside the target allowlist.
- **Catalog prompt cap.** Large vaults no longer inject the whole markdown catalog; the trace reports included/omitted counts.
- **Temp-git Apply e2e.** A new filesystem test verifies the dirty-file guard and post-apply scope model.
- **Test totals at v0.6.0.** `parser-tests.js` 110/110, `cold-install-sim.js` 18/18, `apply-guard-e2e.js` 6/6.

## v0.5.8

Senior-pass review fixes — closing the wedge gap, hardening cost-safety, and adding drift detection to the test suite.

- **AGENTS.md scaffolded.** First-launch starter now writes `AGENTS.md` alongside `CLAUDE.md`, explicitly instructing Codex (and any other AGENTS-aware CLI) to read `wiki/operating/Agent Handoff Log.md` and load the last 3 entries before answering. Closes the v0.5.7 gap where the cross-CLI handoff was one-directional in practice — Claude wrote the log via the plugin, but Codex had no instruction to read it. Cold-install simulator now asserts `AGENTS.md` exists and references the handoff log path; bundled file count: 19 → 20.
- **`--max-turns` parity across every Claude spawn.** v0.5.6 added the cap to Ask only; v0.5.8 adds it to Evolve, Ship, Apply-plan, and Apply-execute spawns. Closes the remaining cost-safety hole the audit flagged: any of the three non-Ask paths could previously loop indefinitely on Grep/Read and silently burn subscription quota.
- **`findProjectDir` no longer leaks other vaults' Claude sessions.** When the path-mangling match for the current vault failed, the old fallback returned the most-recently-modified `~/.claude/projects/*` directory — surfacing other projects' session history in this vault's Pulse view. Now returns `null` and renders an honest empty state.
- **TOCTTOU on first-time handoff log creation closed.** A module-level promise chain serializes concurrent `appendHandoffEntry` calls within the running Obsidian instance, so two modal-close handlers firing within milliseconds can no longer both pass the `adapter.exists` check and double-write the YAML header.
- **Status bar listeners use `registerDomEvent`.** Plugin-managed lifetime; no dangling click handlers across disable→enable cycles.
- **Tests now import live helpers from main.js.** A minimal Obsidian shim (`Module._load` interceptor) lets `parser-tests.js` `require('../main.js')` and exercise `parsePlanJsonShape`, `formatHandoffEntry`, `_sanitizeHandoffField`, and `recentHandoffsAsContext` directly. Twelve new live-import test cases catch any drift between the contract regex tests and the live implementation. Test totals: parser **89/89** (was 77/77) + cold-install **18/18** (was 15/15).
- **Manifest description tightened** to fit Obsidian's plugin-browser truncation; CHANGELOG split out of the README.

## v0.5.7

Multi-agent handoff layer — the wedge that earns the new positioning.

- **Agent Handoff Log.** Every Brain Operator session (Ask, Evolve, Ship, Apply) appends a structured entry to `wiki/operating/Agent Handoff Log.md` on completion: agent, mode, session_id, files touched, scope-break flag, summary, optional next-step cue. Lazy-created on first write — no scaffold change.
- **Cross-agent context preload.** Every session start reads the last 3 handoff entries and injects them into the system prompt as read-only context.
- **Wedge framing.** Researched the multi-agent space (Letta, Mem0, Zep, Cognee, tick-md, Agent-MCP, mcp_agent_mail, LangGraph supervisor, CrewAI). Every competitor requires the agent to opt-in via MCP/SDK. Brain Operator already passively reads `~/.claude/projects/.../*.jsonl` and `~/.codex/sessions` — neither CLI knows we exist.

## v0.5.6

Cost-safety + Apply-flow parser hardening from the day-2 audit.

- **`--max-turns` cap on Ask.** Default 12 (configurable via `askMaxTurns` setting). Most legitimate Asks finish in 4-6 turns; 12 is the generous ceiling. Closes the largest cost-safety hole flagged in the day-2 plugin audit.
- **Apply-plan parser schema-validated.** `parsePlan()` now prefers a fenced `plan-json` block validated against an explicit schema (targets array of 1-3 paths ending `.md` or containing `/`; ambiguity in {yes,no}; risk in {low,medium,high}). Falls back to legacy `TARGETS:` line format if no JSON block emitted.
- **15 new tests** for `parsePlanJsonShape`. Tests: 61 passed.

## v0.5.5

Bundled-vault depersonalization + audit-driven cleanup.

- **Bundled starter README rewritten.** The `BRAIN_STARTER_VAULT` constant embedded a starter README that still claimed six modes and name-dropped the maintainer 13 times. All gone.
- **Last residual `Ege` reference removed from Evolve system prompt** at `main.js:1716`.
- **Status-bar emoji removed** (was `🧠 brain operator`, now `brain · op`).
- **README roadmap table updated** to reflect honest version history.
- **Verified safe (no fix needed):** `data.json` is correctly gitignored AND not tracked in git. `DEFAULT_SETTINGS.permissionMode` defaults to `acceptEdits`.

## v0.5.4

Apply-flow polish + a real bug fix surfaced by live use.

- **Fixed: "Could not run `git diff` after apply" on macOS.** Obsidian's Electron renderer launches with a stripped PATH that omits `/opt/homebrew/bin`. The plugin now resolves the git binary explicitly at startup.
- **Apply flow shortened from 3 clicks to 2.** Plan now auto-runs when the Apply modal opens.
- **Pulse git status/log uses the same resolver.**

## v0.5.3

Depersonalization + spec correction.

- **Removed personalization.** System prompts no longer name a specific person; the plugin reads the user's identity from `CLAUDE.md` User Context. Pulse modal's Claude-session matcher derives from the actual vault path.
- **Session-id resume verification.** When you Ask in resume mode, the plugin verifies Claude returned the same `session_id` you requested.
- **Trimmed mode count to four working modes** (Ask · Evolve · Ship · Pulse). Decide and File Back removed from the Home grid.
- **Manifest description rewritten** to lead with Answer Trace.

## v0.5.2

Reliability and first-use polish across all subprocess-driven modes.

- **Preflight check.** Ask / Evolve / Ship verify the agent CLI is installed and authenticated before opening the input.
- **Elapsed-time badge.** Live `· 12s` pill renders next to the status while the subprocess runs.
- **Bounded stderr buffer** at 64KB sliding window.
- **Final-line flush** on stream close.
- **Surfaced parse errors** via `console.warn` instead of silent drop.

## v0.5.1

- **Auto-trigger guard.** First-launch scaffold modal only auto-pops on a *truly empty* vault.
- **Adaptive modal copy** for non-empty vaults.
- **Vault emptiness guard tests.**

## v0.5.0

- **BootstrapModal** — first-launch scaffold of starter files. Plugin alone is enough to create a brain.

## v0.4.5

Single ribbon, URI handler, right-click menus, file menu, status bar, Quick dispatcher, hover affordances.

## v0.4.1

Ship — queue triage with autonomy classification + recommended pick.

## v0.4

Structured Evolve JSON contract + two-step Apply with `target_paths` allowlist enforcement.

## v0.3

Codex detection, Agent Pulse timeline, Evolve dry-run audit, safer default permission mode.

## v0.2

Ask + inline Answer Trace + CLI subprocess + session resume.

# Changelog

All notable changes to Brain Operator. The README keeps only the latest release; older entries live here.

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

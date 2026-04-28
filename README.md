![Brain Operator — local-first handoff layer for AI developers running Claude Code and Codex over Obsidian vaults](docs/banner.png)

# Brain Operator

> **Status:** Technical Preview · v0.6.0
>
> Agent DevTools for local AI developers running Claude Code, Codex, and similar agents over markdown vaults/repos. Brain Operator makes agent work inspectable: what it searched, read, cited, missed, changed, and handed to the next agent.

Not "chat with notes." That category is crowded. Brain Operator's job is to make local agent runs debuggable, resumable, and safer to ship.

## What's new in v0.6.0

This release implements the Agent DevTools foundation:

- **AgentTrace schema.** Ask now builds a stable trace with `runId`, `agent`, `mode`, `query`, `catalog`, `searched`, `read`, `cited`, `missing`, `warnings`, and `createdAt`.
- **AgentReceipt schema.** Ask and Apply can export portable Markdown/JSON receipts for PRs, issues, Slack, or wiki records.
- **Trace export actions.** Answer Trace now has `Export Trace as Markdown`, `Export Trace as JSON`, and `Copy Agent Receipt`.
- **Ask is hard read-only.** Ask/Trace always spawn Claude with `--permission-mode plan` and `Read,Grep,Glob`, regardless of the write-mode setting.
- **Handoffs are fenced as untrusted JSON.** Prior sessions are parsed into structured fields and injected as `agent-handoff-json`, not raw markdown instructions.
- **Safe Apply blocks dirty out-of-scope files.** Apply refuses to run when the git worktree is already dirty outside the target allowlist.
- **Catalog prompt cap.** Large vaults no longer inject the whole markdown catalog; the trace reports included/omitted counts.
- **Temp-git Apply e2e.** A new filesystem test verifies the dirty-file guard and post-apply scope model.

Test status as of v0.6.0: `parser-tests.js` has **110/110** passing assertions, `cold-install-sim.js` has **18/18**, and `apply-guard-e2e.js` has **6/6**.

Older release notes live in [CHANGELOG.md](./CHANGELOG.md).

Built for developers and AI builders who use Obsidian as a local agent workbench, not just a note archive.

## What it actually does

A fresh install in an empty vault → one click → working second brain. From scratch, in 60 seconds.

The plugin scaffolds a structured vault (skills, wiki, `CLAUDE.md`, sample pages) on first launch, then operates that structure via the agent CLI you already run. No API key. Your subscription, your vault, your subprocess.

## The wedge

Other Obsidian AI plugins return an answer. Brain Operator returns the answer plus the run artifact:

```
catalog: 89 notes, 250 included, 0 omitted
searched: 4 Grep/Glob calls
read: 12 files
cited: 7 resolved [[wiki-links]]
missing: 1 phantom reference
receipt: Markdown + JSON
```

You can debug retrieval drift the way you debug code. The missing-ref cell and Agent Receipt are the product wedge.

## What this catches that normal AI chat misses

- The answer cited a `[[Page]]` that does not exist.
- The agent searched broadly but read the wrong files.
- The vault catalog was too large and part of it was omitted from the prompt.
- A previous agent handoff contains hostile or instruction-like text.
- Apply would run while unrelated files are already dirty.
- Apply changed a file outside the declared target allowlist.
- A teammate needs the receipt, not a vague "Claude said it worked" summary.

## Modes

| Mode | What it does | Status |
|------|--------------|--------|
| **Ask** | Vault-aware Q&A with Answer Trace and Agent Receipt export | Shipped |
| **Evolve** | Audit for stale claims, phantom links, goal-adjacent gaps. Ranks by leverage. Queues proposals. | Dry-run shipped; Apply is guarded and opt-in |
| **Ship** | Reads the proposal queue, classifies Level 0/1/2, surfaces commands or drafts | Triage shipped |
| **Agent Pulse** | Timeline of recent Claude + Codex sessions, generated images, automations, git state | Shipped; read-only |

**Roadmap (under consideration, not promised):** Decide (read/write Decision Log with flip criteria), File Back (file the current conversation as a wiki page). Both intentionally cut from v0.5.x to keep the plugin honest about what works today.

## Install

### Prerequisites
- [Obsidian](https://obsidian.md) (free)
- [Claude Code](https://claude.com/code) installed and logged in: `npm i -g @anthropic-ai/claude-code` then `claude login`. One-time.

### Plugin install (3 minutes)
1. Drop this folder into `<your-vault>/.obsidian/plugins/brain-ask/`
2. Obsidian → Settings → Community plugins → enable **Brain Operator**
3. **First launch in an empty vault**: a modal pops asking *"Scaffold a Brain in this vault?"* → click **Scaffold Brain** → 20 files written (skills, wiki seed, CLAUDE.md template, AGENTS.md cross-CLI forwarder, QUICKSTART, sample concept page).
4. Open `CLAUDE.md` → replace `{{NAME}}`, `{{ROLE}}`, `{{STACK}}` with your real values. ~30 seconds.
5. Run **Ask**: *"What's in my wiki right now?"* — verifies the operator works.

That's it. No separate repo to clone. No manual skill installation. No structure to learn before you can use it.

> If you want to inspect the 20 starter files before installing, run the plugin once on a throwaway empty vault — the BootstrapModal previews the file list before scaffolding. (A standalone public starter-vault repo is on the v1.0 milestone; until then the canonical source is the `BRAIN_STARTER_VAULT` constant inside `main.js`.)

## Safety Model

Brain Operator never silently rewrites your vault.

- **Ask** and **Trace** are read-only — `--permission-mode plan` enforced.
- **Evolve** runs read-only by default. Apply mode is opt-in per run, requires explicit confirmation, and is constrained by a `target_paths` allowlist declared before execution.
- **Ship** classifies proposals; per-row execution is two-step (plan → confirm → write).
- Apply refuses to start if `git diff --name-only HEAD` shows dirty files outside the Apply target allowlist.
- Every write run ends with `git diff --name-only HEAD`. If any newly modified path falls outside the declared allowlist, a red warning surfaces before the run is marked complete.
- Agent handoffs are stored as plain markdown for humans, but injected into future prompts only as fenced JSON with explicit "untrusted data" labels.
- Agent Receipts can be copied as Markdown or JSON so a run can be reviewed outside Obsidian.
- Brain Operator writes runtime handoffs to `wiki/operating/Agent Handoff Log.md`. Wiki-domain operations still update `wiki/log.md` when the underlying brain workflow does so.
- Default permission mode is `acceptEdits`, not `bypassPermissions`. Bypass is kept as an advanced toggle, labeled private-only.
- If a copied `data.json` contains `bypassPermissions` without an explicit private opt-in flag, Brain Operator resets it to `acceptEdits` on load.
- `data.json` is gitignored (contains binary paths + last session ID, never credentials).
- Agent Pulse and the Bootstrap flow do not spawn any LLM call — pure filesystem and `git` reads.

The mental model: Claude Code has agency, but the plugin makes that agency **visible, scoped, and reversible**.

## Current Limitations

This is a Technical Preview. Honest about what's not done:

- **Evolve→Apply** has logic, parser, and temp-git guard coverage. Treat first runs on your own vault as exploratory until you've verified the SCOPE BREAK warning fires correctly on a deliberately-bad apply in real Obsidian.
- **Ship per-row execution** is unbuilt. Current Ship mode is read-only triage + copy-able terminal commands. Per-row execution remains on the roadmap.
- **Decide and File Back** are NOT shipped. Removed from the Home grid in v0.5.3. They appear in the Roadmap line only as "under consideration, not promised."
- **Cold-install in a fresh empty vault** is logic-verified (18/18 cold-install simulator passing) but not yet runtime-verified in a real Obsidian session. That's the last manual gate before public release.
- **Codex parity.** Both agents already share `AGENTS.md` / `CLAUDE.md` (the cross-CLI standard). The Agent Handoff Log and Pulse work for both. But the plugin only spawns Claude Code subprocesses today; Codex is observed (Pulse), not driven. Native Codex spawn is a roadmap item.
- **Single Obsidian vault.** No multi-vault sync, no remote sync, no real-time collaboration. The cross-CLI handoff is across sessions, not concurrent agents on the same vault.
- **First-class CLI is not extracted yet.** The schemas are now reusable, but Obsidian remains the only UI.

## How it works

```
Obsidian plugin
  ├─ schemas.js       -> AgentTrace, AgentReceipt, catalog caps, handoff parsing
  ├─ BootstrapModal   ─→ first-launch scaffold of 20 starter files (v0.5.0)
  ├─ HomeModal        ─→ mode launcher with status badges
  ├─ AskModal         ─→ spawns claude with vault-aware preamble + tools
  ├─ EvolveModal      ─→ spawns claude with --permission-mode plan (read-only)
  ├─ ShipModal        ─→ proposal queue triage with structured ship-json output
  ├─ AgentPulseModal  ─→ pure filesystem reads (Claude + Codex sessions, git, images)
  ├─ QuickModeModal   ─→ fuzzy mode dispatcher (SuggestModal)
  └─ BrainAskSettingTab — claude/codex paths, permission mode, evolve pages

claude invocation:
  --print --output-format stream-json --verbose
  --include-partial-messages
  --permission-mode plan             [Ask/Evolve/Ship/Apply-plan]
  --permission-mode acceptEdits      [Apply-execute only]
  --allowedTools Read,Grep,Glob        [read-only flows]
  --allowedTools Read,Edit             [Apply-execute only]
  --append-system-prompt "<vault conventions>"
  --session-id <uuid>  [or --resume <last>]

stream-json events → modal:
  • live tool stream (Read / Grep / Glob / Edit)
  • progressive answer (token deltas via --include-partial-messages)
  • Answer Trace panel after completion
  • Agent Receipt export as Markdown / JSON
  • structured fenced blocks (evolve-json, ship-json) parsed for card UI
```

No API key. Uses Claude Code's existing OAuth. Claude's native tools do retrieval — the plugin injects the vault catalog + conventions as a system prompt and observes what Claude actually does via tool-use events.

## The Answer Trace

Five cells shown after every Ask:

- **catalog** — total markdown notes plus prompt-included / omitted counts
- **searched** — actual `Grep` / `Glob` calls with their query strings
- **read** — files Claude actually opened (clickable → opens the note in Obsidian)
- **cited** — `[[wiki-links]]` in the answer that resolved to real notes
- **missing refs** — `[[wiki-links]]` that don't resolve (typos, or proposed stubs)

Each trace has three export actions:

- **Export Trace as Markdown** — human-readable run artifact.
- **Export Trace as JSON** — stable `brain-operator.agent-trace@1` payload.
- **Copy Agent Receipt** — `brain-operator.agent-receipt@1` with trace, verification, handoff, and changed-file fields.

This turns AI retrieval from a black box into a debuggable process. The thing Claude-in-terminal cannot give you ergonomically.

## Surfaces (where you invoke modes)

- **Ribbon** (left rail) — single brain-circuit icon → Home modal
- **Command palette** (`Cmd+P`) — every mode registered as a command
- **Quick dispatcher** — fuzzy mode picker via SuggestModal; bind a hotkey for fastest access
- **Status bar** — "Brain" entry, click → Home
- **Right-click selected text** → "Ask about <selection>" pre-fills AskModal
- **Right-click any markdown note** → "Ask about [[note]]" + "Open Home"
- **URI handler** — `obsidian://brain-operator?mode=ask` (or evolve / ship / pulse / home / fileback). Lets external pages or shell commands fire plugin modes.

## Settings reference

**Core**
- **Claude CLI path** — auto-detected on load; **Detect** + **Check auth** buttons
- **Codex CLI path** — auto-detected on load; **Detect** + **Version** buttons
- **Permission mode** — `acceptEdits` (default), `plan`, `default`, or `bypassPermissions` (advanced / private only)
- **Allowed tools** — comma-separated. Default `Read,Grep,Glob`.
- **Model override** — blank uses your Claude Code default
- **MCP config path** — advanced; wire to `obsidian-local-rest-api` via `mcp-tools`

**Ask**
- Retrieval depth, max note chars, include catalog in prompt, catalog prompt limit, stream token deltas, show tool events.

**Evolve**
- Key operating pages — comma-separated vault-relative paths Evolve reads first.

**Agent Pulse**
- Recent items per lane.

## Bundled skills

The Bootstrap flow installs three Claude Code skills into `.claude/skills/`:

- **`brain-evolve`** — 7-step audit loop, gap detection table, leverage-ranked proposals
- **`brain-ship`** — Level 0/1/2 classifier, execution loop, ready-to-ship surfacing
- **`karpathy-guidelines`** — 4 brakes against LLM coding pitfalls (think before coding, simplicity first, surgical changes, goal-driven execution). [Source.](https://github.com/forrestchang/andrej-karpathy-skills)

The plugin doesn't directly invoke these — Claude Code auto-loads any `SKILL.md` in `.claude/skills/`. You can add your own skills by dropping new folders there; they'll be available next session.

## Brain conventions enforced via system prompt

- Wiki-links basename-only: `[[Page Name]]`
- PARA split: `01_Projects/` = action, `wiki/` = LLM-owned knowledge, `raw/` = immutable sources
- Frontmatter: `title`, `category`, `tags` (lowercase-hyphenated), `sources`, `created`, `updated` (ISO 8601 YYYY-MM-DD)
- Log format: `## [YYYY-MM-DD] verb | Subject` with verbs `ingest/query/lint/update/create/decide/score/kill/evolve/ship`
- Hard bans: no emoji in wiki, no cringe/hype, no hallucinated packages, direct professional tone

## Coexists with

- `obsidian-local-rest-api` — consumable via `--mcp-config` for MCP-based retrieval (advanced)
- `mcp-tools` — Brain Operator handles **prompt injection + trace + bootstrap**, not vault API
- `obsidian-git`, `obsidian-excalidraw-plugin` — no conflict
- Any Claude Code skills you have installed locally — auto-loaded alongside the bundled three

## Roadmap

- **v0.2** ✅ Ask + inline Answer Trace + CLI subprocess + session resume
- **v0.3** ✅ Codex detection, Agent Pulse timeline, Evolve dry-run audit, safer default permission mode
- **v0.4** ✅ Structured Evolve JSON contract + two-step Apply with target_paths allowlist enforcement (apply path unverified live)
- **v0.4.1** ✅ Ship — queue triage with autonomy classification + recommended pick
- **v0.4.5** ✅ Single ribbon, URI handler, right-click menus, file menu, status bar, Quick dispatcher, hover affordances
- **v0.5.0** ✅ **BootstrapModal** — first-launch scaffold of 19 starter files. Plugin alone is now enough to create a brain.
- **v0.5.1** ✅ Auto-trigger guard (only pops on truly empty vaults), adaptive modal copy for non-empty vaults, vault-emptiness contract tests.
- **v0.5.2** ✅ Preflight CLI auth check, elapsed-time badge, bounded stderr buffer, surfaced parse errors.
- **v0.5.3** ✅ Depersonalization (system prompts no longer name a specific user), session-id resume verification, mode count trimmed to four working modes (Decide and File Back removed).
- **v0.5.4** ✅ Apply-flow polish (auto-plan, single primary button), git binary resolver for Apple Silicon Homebrew, **pre-flight git gate** (Apply refuses to run if git verification can't be set up), close-state guards on async DOM writes, locale-independent `not-a-repo` detection.
- **v0.5.5** ✅ Bundled starter README depersonalized, last Evolve-prompt Ege reference removed, status-bar emoji removed, README roadmap refreshed.
- **v0.5.6** ✅ `--max-turns` cap on Ask (default 12), Apply-plan parser schema-validated with `plan-json` block, 15 new tests (61/61 passing total).
- **v0.5.7** ✅ **Agent Handoff Log** — every session writes a structured entry; every session start reads the last 3 and injects them as cross-CLI context. Honest install copy on the dashboard (no fictional `bo serve`/Docker/brew). Manifest description rewritten to the locked frame ("audit + handoff layer for Claude + Codex").
- **v0.5.8** ✅ `AGENTS.md` scaffold, `--max-turns` parity, Pulse vault scoping, handoff append lock, live-helper drift tests.
- **v0.6.0** ✅ AgentTrace / AgentReceipt schemas, trace export actions, Ask forced read-only, fenced untrusted handoff context, catalog prompt cap, dirty out-of-scope Apply preflight, temp-git Apply e2e.
- **next** Extract public plugin repo, extract starter vault repo, runtime cold-install pass, README screenshots/demo GIF, native Codex spawn only if users ask for it.
- **v1.0** Polish + Obsidian community plugin marketplace submission

## License

MIT. Bundled `karpathy-guidelines` skill is also MIT (forrestchang/andrej-karpathy-skills).

## Credits

Built by Ege Deniz. Bundled skills:
- `brain-evolve` and `brain-ship` — original work, generic-rewritten for distribution
- `karpathy-guidelines` — inspired by [Andrej Karpathy's observations on LLM coding pitfalls](https://x.com/karpathy/status/2015883857489522876), packaged by [forrestchang](https://github.com/forrestchang/andrej-karpathy-skills)

If you ship a brain that compounds, post about it. The architecture only proves out at scale if multiple brains run on it.

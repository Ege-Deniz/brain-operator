# Brain Operator v0.8.0 — "The brain fits"

- **Date:** 2026-07-28
- **Status:** approved, ready for implementation
- **Branch:** `v0.8.0-brain-fits`

## Problem

Every retrieval constant in Brain Operator was calibrated against the bundled
19-file starter vault. The vault it actually runs on has 1,716 Obsidian-indexed
markdown files, of which **49** are live wiki knowledge. The plugin also drifted
away from the vault contract it claims to enforce, and v0.7.0 shipped a headline
feature whose files were never committed.

### Verified findings

| # | Finding | Evidence |
|---|---------|----------|
| 1 | Observatory was never committed | `git log --all -- observatory` is empty; `main.js` bails at the `fs.existsSync(obsDir)` guard, so the command errors and **no run has ever been archived** |
| 2 | Retrieval is mis-calibrated by ~35x | 1,716 indexed files vs. a 250-entry catalog cap; the ranker scores `04_Archive/` (497), `output/` (308) and `01_Projects/` (812) equally against 49 live wiki pages |
| 3 | A fully-built brain reads as un-bootstrapped | `BRAIN_SCAFFOLD_MARKERS` requires `.claude/skills/brain-evolve/SKILL.md`, which the vault deliberately deleted |
| 4 | The plugin writes to the vault unasked | Every Ask appends to `wiki/operating/Agent Handoff Log.md`, whose header links `[[Decision Log]]` / `[[Operating Cadence]]` — deleted pages. Violates both "one current-state page" and "Write only with permission" |
| 5 | The retired cage still ships | `examples/starter-vault/` contains `operating-mode.md`, `_proposals/queue.md`, `ready-to-ship.md`, `Project Triage.md`, `Decision Log.md`, `Operating Cadence.md`, and `brain-evolve` / `brain-ship` skills **with live triggers** — contradicting `getGovernedStarterVault()` |
| 6 | Dead weight and version drift | `ShipModal` (~660 lines) registered only to show a "paused" notice; Home subtitle reads `v0.6.6` against a `0.7.0` manifest |
| 7 | **The scaffold still teaches the cage** *(found during implementation)* | v0.6.7 removed the cage's *pages* but kept scaffolding `README.md`, `QUICKSTART.md`, and `wiki/concepts/Second Brain.md`, which walk the user through recreating `operating-mode.md` priority bands, `_proposals/queue.md`, Project Triage, and Decision Log — including a Day 7 step that cron-schedules `brain-evolve` and `brain-ship`. Every new vault was being handed the instructions to rebuild what the plugin had stopped building |

### Governing constraint

The reference vault is **not modified** by this work, and the plugin is **not run**
against it. The vault is read as a specification; it is never a target.

## Design

### 1. Retrieval reads the vault's own contract

`buildCatalog()` returns `app.vault.getMarkdownFiles()` unfiltered. It gains a
**scope filter** transcribed from `wiki/_common/context-routing.md` ("Do not load
`wiki/index.md`, `wiki/log.md`, a whole folder, or the archive by default"):

Excluded from default context: `04_Archive/`, `wiki/_archive_*/`,
`wiki/_scratch/`, `output/`, `tmp/`, `raw/`, `wiki/log.md`, `wiki/index.md`.

Exclusion removes a path from *default* context only. Grep and Glob still reach
every excluded file, which is precisely the deliberate-search behaviour the
contract permits.

**Current State is the authority on live projects.** The contract says
"Folder membership does not make something current. For live status, consult
only `wiki/operating/Current State.md`." So the scope gate parses that page for
`01_Projects/<folder>` references and withholds every project folder it does not
name. **Fails open** — a missing, unreadable, or project-free status page means
no project filtering at all, because a status page nobody has written yet must
never silently hide the user's work.

*Correction from the approved design:* this rule was not in the original plan. It
emerged from measuring the filter against the real vault, where `01_Projects/`
was 812 of 863 surviving files and swamped the 45-page wiki core.

**Status-weighted ranking.** `scoreCatalogEntryForQuery` multiplies by a weight
read from `status` frontmatter:

| status | weight | rationale |
|---|---|---|
| `active` | 1.15 | declared current — a mild boost |
| *(absent)* | 1.0 | neutral |
| `speculative`, `scratch` | 0.5 | thinking material, never binding |
| `evidence`, `historical` | 0.25 | once useful, not current authority |
| `archived` | 0.1 | preserved history, never binding |

*Correction from the approved design:* absent status was originally specified at
0.85. Measurement killed it — only **7 of 49** live wiki pages carry a `status`
field, so penalising unstated pages would have demoted 86% of the knowledge
layer. The contract says a missing status "does not prove freshness"; it does not
say it proves staleness. Absent is therefore neutral and `active` earns the
boost instead. A side benefit: the default weight of 1.0 leaves the existing
surfacing threshold semantics untouched.

An archived page can still surface on an overwhelming term match, but never
outranks live knowledge at comparable relevance.

**Folder-map fallback.** The cap now applies to the scoped set. If that set still
exceeds `catalogPromptLimit`, inject a per-folder count map instead of a
truncated path list — the agent learns the shape of the vault without a wall of
arbitrary paths.

**New `scope` trace cell:** total / in-scope / excluded, with exclusion reasons.
Same inspectability standard as every other cell.

**Measured result** (read-only dry run over the real vault's file list):

```
raw indexed markdown : 1716
in default context   :   80
withheld             : 1636   inactive project 783 · archive 539 · build output 308
                              scratch 2 · immutable source 2 · log 1 · index 1
in scope by area     : wiki/ 45 · 01_Projects/ 29 · docs/ 3 · root 2 · Excalidraw/ 1
catalog prompt mode  : list (80 listed / 80 in scope — nothing omitted)
```

The catalog stops being a truncated 250-of-1716 slice and becomes the whole
eligible set.

### 2. Ask stops writing to the knowledge layer

`HANDOFF_LOG_PATH` moves from `wiki/operating/Agent Handoff Log.md` to
**`.brain-operator/handoffs.jsonl`** in the vault root.

A dot-folder is the deliberate choice: Obsidian does not index it, so it never
enters the knowledge graph or the catalog, and `wiki/operating/` keeps its single
page — but it remains *inside the repo*, so both Claude and Codex can read it.
That preserves the cross-CLI handoff wedge (the only reason the log was in-vault)
without the contract violation.

JSONL rather than Markdown: the log is machine state, not a human wiki page, and
line-delimited records remove the `## [` fragmentation hazard that
`_sanitizeHandoffField` exists to work around. Sanitisation is retained anyway —
the untrusted-data fencing in `recentHandoffsAsContext` is unchanged.

Result: Ask performs **zero writes** to the knowledge layer, making the README's
existing safety claim literally true.

### 3. De-cage

Deleted outright:

- `ShipModal`, the `ship-proposals` command, its URI route, and Quick entry.
- `.claude/skills/brain-evolve/` and `brain-ship/` stubs from the scaffold.
  `wiki-workflows.md` already lists both under "Removed Workflows"; shipping
  quarantined stubs re-imports what the brain removed.
- `BRAIN_SCAFFOLD_MARKERS` becomes `['CLAUDE.md', 'wiki/_common/context-routing.md']`
  — files a governed brain actually keeps.

`examples/starter-vault/` is **regenerated from `getGovernedStarterVault()`** by
`tools/sync-starter-examples.js`, and cold-install runs `--check` so the two stay
byte-identical. The drift that let the retired cage sit in the repo for three
releases cannot recur.

**Added during implementation (finding 7):** the scaffolded `README.md`,
`QUICKSTART.md`, and `wiki/concepts/Second Brain.md` are rewritten around the
governed model. Cold-install now scans *every* scaffolded file for retired-system
terms (`operating-mode`, `_proposals`, `brain-evolve`, `brain-ship`,
`Project Triage`, `Decision Log`, `Operating Cadence`, `Income Plan`,
`priority band`, `schedule create`) and fails if any appears. Removing the pages
while shipping the instructions to rebuild them is not governance.

### 4. Observatory, actually shipped

Create `observatory/index.html`: self-contained, no external requests (a strict
offline `file://` page), rendering a faithfulness gauge, per-run trend, Claude vs.
Codex leaderboard, drift hotspots, and a run log. Amber / JetBrains Mono /
Fraunces identity via system-font fallbacks, since no font can be fetched.

The receipts archive moves from `__dirname/observatory/receipts.json` to
**`.brain-operator/runs.jsonl`**. Writing run history into the plugin folder means
a plugin update erases it; the vault-root dot-folder survives updates and sits
beside the handoff log. The `fs.existsSync(obsDir)` guard that silently disabled
all persistence is removed and the directory is created on demand.

Both `.brain-operator/` files are gitignored in the scaffolded vault: they hold
real vault paths and query text.

### 5. Operator sharpens

- Ribbon opens **Operator**, not Home. Home demotes to a command-palette entry.
- Operator reads continuity from `.brain-operator/handoffs.jsonl`, and its
  "files for this thread" list uses the **scoped** surfacing from §1.
- All version strings derive from `manifest.json`. No hand-maintained copy.

### 6. System prompt catches up

`buildSystemPrompt` learns the vocabulary the vault now enforces:

- The seven categories: `career | projects | education | life | finance | operating | concepts`.
- The five status values and what each binds (table in §1).
- `wiki-workflows.md` — Query, Ingest, Lint, File Back are **user-invoked only**,
  never conversation modes and never scheduled.
- `_scratch/` is never auto-loaded.
- `raw/` is immutable; never modify a source document.

The aperture/tradeoff suppression from v0.6.7 is unchanged — it already matches
`context-routing.md`'s Creative Aperture section.

### 7. Verification

The 154 existing parser assertions must pass, less those covering deleted Ship
behaviour. New coverage:

- scope filter includes/excludes the right paths
- status weighting orders `active` above `archived` at equal term relevance
- folder-map fallback triggers above the cap
- `getGovernedStarterVault()` matches `examples/starter-vault/` exactly
- Ask writes nothing under `wiki/` (asserted against a temp vault)
- handoff and receipts resolve under `.brain-operator/`

Cold-install (26) and apply-guard e2e (6) must stay green.

## Explicitly out of scope

- Any modification to the reference vault, or running the plugin against it.
- Native Codex spawn. Codex stays observed, not driven.
- Rewriting Ship as an execution-prep mode. It is deleted, not replaced.
- Multi-vault support, sync, or an extracted CLI.

## Risks

| Risk | Mitigation |
|---|---|
| Scope filter hides a page the user wanted | Exclusions are reported in the new `scope` trace cell; Grep/Glob still reach everything |
| Existing users lose handoff history at `wiki/operating/Agent Handoff Log.md` | One-time migration on load: read the old Markdown log, convert to JSONL, leave the original file untouched for the user to delete |
| Deleting Ship breaks a saved hotkey | Documented in CHANGELOG under a "Removed" heading |
| Observatory HTML grows unmaintainable inline | Keep it a single static template with one injection point; all logic reads `window.__BRAIN_RECEIPTS__` |

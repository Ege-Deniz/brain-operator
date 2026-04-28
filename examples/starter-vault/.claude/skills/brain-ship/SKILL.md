---
name: brain-ship
description: Execution layer for an Obsidian second-brain wiki. Reads wiki/_proposals/queue.md, classifies proposals by autonomy level, and ships the single highest-priority artifact per run. Wiki pages and skill files are created immediately (Level 0). Content drafts are written to 01_Projects/drafts/ (Level 1). Decisions requiring credentials or UI are converted to exact shell commands in wiki/_proposals/ready-to-ship.md (Level 2). Runs on a schedule or on demand. The goal is consistent shipped output toward the user's stated leverage targets — not batch churn.
triggers:
  - "ship proposals"
  - "execute the queue"
  - "brain ship"
  - "run brain-ship"
  - "ship the ideas"
  - "execute ideas"
  - "bring ideas to life"
  - "stop just planning"
  - "execute the brain"
---

# brain-ship

The execution layer. brain-evolve finds gaps and queues proposals. brain-ship ships them.

The contract: one run = one concrete artifact shipped end-to-end. If a proposal is active-cycle work, brain-ship either executes it or converts it into an exact, copy-pasteable command. If it is valid but not current-cycle work, it becomes `deferred`.

The other contract: do not confuse fresh ideas with leverage. If an existing artifact has an obvious next move that compounds it into reputation, money, or lower friction, ship that follow-through before opening a new lane.

## The problem it solves

brain-evolve audits, detects gaps, proposes improvements — and stops. Without brain-ship, proposals accumulate in `wiki/_proposals/queue.md` indefinitely. Ideas that could take 30 minutes to execute sit for weeks as text. brain-ship closes the loop: proposals go in, shipped artifacts come out.

## Autonomy levels

Every proposal gets classified before execution:

| Level | Type | Action | Examples |
|-------|------|--------|---------|
| **0 — Auto** | Wiki page creation/update, skill file creation, knowledge gap fill | Execute immediately, no confirmation | "Create Three.js page", "update Vision and Goals", "add Reading List" |
| **1 — Draft** | Content for external publishing | Write draft to `01_Projects/drafts/`. Mark `drafted`. | LinkedIn post, blog article, tweet thread, reel script |
| **2 — Surface** | Requires credentials, UI, or binary decision | Write exact steps to `ready-to-ship.md`. Mark `ready`. | Push to GitHub, post on social, make/private a repo |

## The execution loop

### Step 1 — Read the queue

**Read `wiki/_common/operating-mode.md` first.** This is the single source of truth for priority bands, active lanes, and the Follow-Through Rule. Do not apply inline priority logic — defer to that file entirely. If it is missing, stop and create it before continuing.

Then read the operating layer:

- `wiki/operating/Project Triage.md` — to avoid shipping work from paused or contracted projects
- `wiki/operating/Decision Log.md` — to detect decisions that must be surfaced before shipping
- `wiki/operating/Income Plan.md` — to prioritize first-dollar work when no active deadline overrides it (skip if no income lane)
- `wiki/operating/Operating Cadence.md` — to keep the run aligned with the current weekly rhythm

Then read `wiki/_proposals/queue.md`. Extract all rows where `status` is `queued`. Ignore `shipped`, `ready`, and `deferred`.

Sort using the priority bands from `_common/operating-mode.md`. Within each band, sort by Leverage. Select the top **single** proposal for this run.

### Step 2 — Classify each proposal

For the selected proposal, assign autonomy level based on keywords:

- **Level 0 triggers**: "create wiki page", "concept page", "tracking page", "new page", "update section", "align language", "fix contradiction", "add cross-reference", "fill gap"
- **Level 1 triggers**: "draft post", "write announcement", "LinkedIn", "blog", "reel script", "tweet", "article", "content"
- **Level 2 triggers**: "push", "publish live", "post on", "install", "GitHub UI", "make public", "make private", "pin repo", "decide", "resolve", "choose between"

If ambiguous: Level 2 (always safer to surface than to assume).

If the selected proposal is valid but outside the active operating mode declared in `_common/operating-mode.md`, mark it `deferred`, log the reason, and stop.

### Step 3 — Execute Level 0 (auto, no confirmation)

If the selected proposal is Level 0:

1. Read relevant goal pages to understand context (per `_common/operating-mode.md`).
2. If the proposal involves external facts or citations, load a research-capable skill (e.g. `research-ops`, `exa-search`) **before** authoring the page.
3. Create or update the wiki page following CLAUDE.md conventions exactly:
   - Complete frontmatter: `title`, `category`, `tags` (lowercase-hyphenated), `sources`, `created` (YYYY-MM-DD), `updated` (YYYY-MM-DD)
   - At least one `[[wiki link]]` to a goal page
   - `## See Also` section
4. Update `wiki/index.md`: add bullet in correct category section.
5. Update proposal row in `wiki/_proposals/queue.md`: status → `shipped`.
6. Append to `wiki/log.md`:
   ```
   ## [YYYY-MM-DD] ship | <page name> — brain-ship Level 0 auto-executed
   <one line: what was created/updated and why>
   ```

### Step 4 — Execute Level 1 (write drafts)

If the selected proposal is Level 1:

1. If you have a content-writing skill installed (e.g. `article-writing`, `content-engine`), load it before drafting.
2. Write to `01_Projects/drafts/YYYY-MM-DD-<slug>.md`:
   ```markdown
   ---
   type: draft
   proposal: <proposal title>
   platform: linkedin | blog | instagram | x
   status: needs-review
   created: YYYY-MM-DD
   ---
   # <Title>

   <Full draft content — not a skeleton. Opinionated, in the user's voice. Ready to post with minimal editing.>

   ---
   *Draft by brain-ship. Review before posting.*
   ```
3. Draft quality bar:
   - Sounds like the user (read CLAUDE.md User Context for tone cues)
   - Has a hook in the first line
   - Is specific — references actual projects, real numbers, real tech
   - Is complete — not a template with [FILL IN] placeholders
4. Update proposal row: status → `drafted`.
5. Log it.

### Step 5 — Execute Level 2 (surface with exact commands)

If the selected proposal is Level 2:

1. If the proposal involves a public repo push, deploy, or public ship step, run a Shipping Security Check first:
   - Scan the working tree for common secret patterns
   - Check for `.env*`, private-key, certificate, or credential files
   - If the repo has a package manifest and lockfile, run a package-manager audit
   - Inspect public config for risky exposure: rewrites, image allowlists, middleware, auth callbacks, debug routes
   - Unresolved secrets or unresolved high/critical dependency issues mean the artifact is **not** ready; log the blocker instead of marking it `ready`
2. Append to `wiki/_proposals/ready-to-ship.md` (create file if missing):
   ```markdown
   ## [YYYY-MM-DD] <proposal title>
   **Why this matters**: <one line from the proposal>
   **Recommendation**: <what brain-ship would choose and why — never "you decide", always take a position>

   **To execute**:
   ```bash
   <exact copy-paste command — fill in real paths/values>
   ```
   Or if UI: <numbered steps, specific clicks>

   ---
   ```
3. Update proposal row: status → `ready`.
4. Log it.

### Step 6 — Close the loop

After the selected proposal is processed:

1. Rewrite the proposal status in `wiki/_proposals/queue.md` (`shipped` / `drafted` / `ready` / `deferred`).
2. Append summary to `wiki/log.md`:
   ```
   ## [YYYY-MM-DD] ship | brain-ship run — 1 artifact
   - Artifact: <what shipped>
   - Mode: Level 0 auto / Level 1 draft / Level 2 surface / deferred
   - Next artifact: <single next item from the queue>
   - Lesson: <one sentence on what classification worked or failed>
   ```
3. Append one lesson to the Lessons section at the bottom of this file.

## Integration with brain-evolve

```
brain-evolve (audit — weekly or on demand)
  → detects gaps across wiki
  → ranks by leverage
  → queues proposals in wiki/_proposals/queue.md

brain-ship (execution — Mondays or on demand)
  → reads queue
  → Level 0: ships immediately (wiki pages, knowledge gaps filled)
  → Level 1: drafts created in 01_Projects/drafts/
  → Level 2: exact commands in ready-to-ship.md
  → queue statuses updated, log written
  → wiki grows every week without manual execution
```

Call order: brain-evolve first, then brain-ship. Or call brain-ship standalone any time the queue has items.

## Scheduling

```bash
schedule create --cron "0 9 * * 1" --command "run brain-ship"
# Runs every Monday at 09:00

schedule create --cron "0 8 * * 1" --command "evolve brain"
# Runs 1 hour before brain-ship so the queue is fresh
```

## Execution guardrails

- Never delete wiki pages
- Never push to GitHub or post externally — always Level 2
- Never modify `raw/` or `CLAUDE.md`
- Never modify `created` frontmatter dates
- Ship exactly one artifact per run unless the user explicitly asks for batch execution
- If a Level 0 page creation would exceed ~300 lines, split into two proposals
- Every run MUST append one lesson line — non-negotiable
- Mark anything that creates more ideas than implementation as `deferred`
- Public shipping requires a lightweight security pass first: secret scan, dependency audit when a lockfile exists, and quick config review
- If `Project Triage.md` marks a project `paused`, do not execute its proposal unless the user explicitly reactivates it
- If `Decision Log.md` has an overdue open decision that blocks the proposal, surface the decision before shipping

## What "shipped" actually means

| Item type | Shipped = |
|-----------|-----------|
| Wiki page | File exists, linked from index, logged |
| Content draft | File in `01_Projects/drafts/`, complete and opinionated |
| Level 2 surface | Entry in `ready-to-ship.md` with exact command |
| Skill file | `.claude/skills/<name>/SKILL.md` created |

---

## Lessons

<!-- Append one line per run. Format: "- YYYY-MM-DD: <lesson>" -->
- Skill installed. First runs will calibrate Level 0/1/2 classification accuracy. Expect at least one mis-classification in the first three runs.

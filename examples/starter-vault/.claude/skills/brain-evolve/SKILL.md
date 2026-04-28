---
name: brain-evolve
description: Self-improving audit loop for an Obsidian second-brain wiki. Scans against stated goals, finds gaps, proposes fills, executes the top-leverage ones, and logs what was learned. Reads the user's priority bands and active lanes from wiki/_common/operating-mode.md so prioritization stays user-defined rather than skill-defined. Use when the user says "evolve the brain", "find gaps", "what's missing", "improve the wiki", "audit my brain", or any variant of "make the brain work on itself". Runs on-demand or on a schedule. Becomes smarter over time by logging its own hit/miss rate in the Lessons section below.
triggers:
  - "evolve the brain"
  - "find gaps"
  - "what's missing in the wiki"
  - "improve the brain"
  - "run brain-evolve"
  - "brain audit"
  - "brainstorm what to ship next"
---

# brain-evolve

A self-improving audit loop for your second-brain wiki. You curate, the skill compounds.

The premise: a wiki that the LLM maintains but never *criticizes itself* slowly decays into a pile of stale pages. This skill is the counter-force. It reads your goal pages, scans the wiki for gaps against those goals, ranks the gaps by leverage, fills the top ones, and writes down what it learned so the next run does better.

The second job is connection-making. When one artifact ships, the skill should ask what it unlocks next: profile updates, public distribution, monetization experiments, private workflow upgrades, or a daily-life friction reduction that becomes easier because the artifact now exists.

## When to run

- **On demand** — you ask
- **Weekly** — schedule a regular health check (see §9)
- **After major ingests** — once new `raw/` content lands
- **When the log goes quiet** — if the last 3 log entries are all from one category, something is neglected
- **Before high-pressure deadlines** — anything where staleness becomes expensive

## The seven-step loop

### 1. Orient — read the goal pages

Always read these first. They define "what leverage means" for this brain:

- `wiki/_common/operating-mode.md` — **read this first**. Single source of truth for priority bands, active lanes, and the Follow-Through Rule. Do not use inline priority logic from this SKILL.md — defer to that file. If it is missing, create it before proceeding (use the starter template that ships with this vault).
- `wiki/operating/Project Triage.md` — active, paused, contracted, and waiting project state
- `wiki/operating/Decision Log.md` — open decisions, deadlines, and revisit criteria
- `wiki/operating/Income Plan.md` — first-dollar targets, offer assumptions, and income scoreboard (skip if user has no income lane)
- `wiki/operating/Operating Cadence.md` — default weekly rhythm and scorecard
- `wiki/projects/Live Artifacts.md` — registry of all shipped public artifacts and their follow-through status. Required input for the Follow-Through Scan in Step 3.
- `wiki/index.md` — coverage map
- `wiki/log.md` — last ~15 entries for momentum signals

The user's `CLAUDE.md` `User Context` section also tells you which lanes are active and which to skip. Honor it — do not turn the run into an audit of a lane the user explicitly de-prioritized.

If a goal page is missing, that's gap #1. Stop, create it from a template, then resume.

### 2. Scan — build the coverage picture

Walk `wiki/**/*.md`. For each page, extract:

- `title`, `category`, `tags`, `updated`, `status` (if present)
- Outbound `[[wiki links]]`
- Inbound links (reverse index)
- Section headers

**If Obsidian is open**, use `obsidian-cli` (community plugin) for higher-accuracy data:
```bash
obsidian backlinks file="<page name>"   # accurate inbound link count
obsidian tags sort=count counts          # tag frequency across vault
obsidian search query="pending"          # find stuck action items instantly
```

**If Obsidian is closed**, fall back to manual grep of `[[wiki links]]` across all files.

Build three in-memory structures:

- **Concept graph** — nodes = pages, edges = wiki links
- **Stale list** — pages whose `updated` is > 30 days old AND are linked from a goal page
- **Orphan list** — pages with zero inbound links (use `obsidian backlinks` for accuracy; grep fallback overestimates orphans)
- **Active-lane list** — pages tied to immediate deadlines, blocked shipments, or active priority bands per `_common/operating-mode.md`

### 3. Detect gaps — gap classes

Apply each detector. Each gap is a `{class, severity, target, fix}` tuple.

| Class | Detector | Severity |
|-------|----------|----------|
| **Phantom link** | `[[Page]]` referenced but file doesn't exist | High if referenced from goal page, else Medium |
| **Orphan** | Page exists but nothing links to it | Low alone, Medium if concept belongs to an active project |
| **Stale goal-adjacent** | Page linked from a goal page, `updated` > 30d, no status change in log | High |
| **Status without action** | Page has a `Status` or "pending" section where items haven't moved in 7+ days | High |
| **Unlinked leverage** | A shipped artifact exists, but no downstream follow-through is linked: distribution, profile update, monetization angle, or workflow/system payoff | High |
| **Follow-Through Scan** | Read `wiki/projects/Live Artifacts.md`. For each row where `Status` is `live` or `shipped`, check `wiki/_proposals/queue.md` for an open follow-through proposal. If none exists, auto-propose one using the Follow-Through Rule from `_common/operating-mode.md`. This runs on every audit — not just when gaps are found. | High |
| **Stuck decision** | Read `wiki/operating/Decision Log.md`. Any open decision whose `Deadline` is today or in the past becomes a stuck-decision gap. If the model can resolve it from existing evidence, propose a recommendation; if not, surface the exact question. | High |
| **Project without kill rule** | Read `wiki/operating/Project Triage.md`. Any active, support, or contracted project with no review date or kill/revisit rule becomes a triage gap. | Medium |
| **Missing concept** | Term appears >= 3 times across pages with no own page | Medium |
| **Contradiction** | Same claim stated differently across pages (dates, numbers, targets) | High |

Run these detectors on **active-lane pages first**, where "active lane" is whatever `wiki/_common/operating-mode.md` declares.

### 4. Rank — leverage × effort

First assign each gap to a priority band defined in `wiki/_common/operating-mode.md`. Never let a lower band outrank a higher band.

Then, within each band, compute a **leverage score**:

```
leverage = (goal_proximity * severity) / effort
```

- `goal_proximity`: 3 if gap is on a goal page, 2 if one hop away, 1 if two hops, 0 otherwise
- `severity`: from the table above (High=3, Med=2, Low=1)
- `effort`: 1 (edit existing page), 2 (new page, research needed), 3 (multi-page refactor)

If one move clearly advances multiple active priorities at once, treat `effort` as one band lower.

Take the top 3 by band, then leverage. Those become the execution queue.

### 5. Execute — fill the top gaps

For each queued gap:

- **Edit-in-place fixes** (stale pages, phantom links, contradictions) → do them directly, no permission needed
- **New page creation** (missing concepts, new analyses) → draft the page, show the first 20 lines, get go/no-go
- **Cross-wiki refactor** (restructuring, splitting) → write a proposal doc under `wiki/_proposals/` and link it from the log, do NOT execute without explicit approval

Every change follows the conventions in `CLAUDE.md` (frontmatter, wiki links, tone, etc.).

### 6. Propose — the idea queue

Beyond gap-filling, produce 3-5 **forward-looking proposals** only if they directly support an active lane. Examples:

- "You have project X scaffolded but not pushed. Push Tuesday, draft launch post Friday."
- "Lane Y has no progress page — create one to track which experiments landed."
- "No `Reading List` page exists. You cite books in conversation but they never file."
- "A repo is public but not yet tied to LinkedIn, profile pins, portfolio references, or an income experiment. Queue the strongest connected next move instead of another fresh idea."

Default rule:

- Do queue automations, monetizable tools/templates/services, blocked builder publishing steps, and daily-life improvements that save immediate time
- Do queue follow-through moves that connect one shipped artifact to the next relevant goal: reputation, monetization, workflow, or distribution
- Mark pure brainstorming and unowned ideas as `deferred`

Proposals go into `wiki/_proposals/queue.md` (create if missing). Each proposal: title, why, effort, leverage score, status (`queued` / `ready` / `deferred` / `shipped`).

### 7. Log & learn — update self

Append to `wiki/log.md`:

```markdown
## [YYYY-MM-DD] evolve | Brain audit — N gaps fixed, M proposals queued
- Fixed: <list>
- Queued: <list>
- Deferred: <list with reason>
- Lesson: <one sentence — what heuristic worked or failed>
```

Then append to the **Lessons** section at the bottom of this SKILL.md file. Each lesson is a one-liner that refines the next run's detection or ranking:

- "YYYY-MM-DD: Stale-goal-adjacent detector had 3 false positives — status pages that are *supposed* to be stable. Added exception for pages tagged `stable-reference`."
- "YYYY-MM-DD: Orphan detector flagged 6 pages; 5 were intentional leaves. Down-weight orphans in sub-trees with < 4 pages total."

The skill becomes its own historical record. Over time its ranking gets sharper because it eats its own output.

## 8. Anti-patterns

- **Filling gaps that nobody asked for.** If a gap is Low severity and not goal-adjacent, note it in proposals, don't execute.
- **Creating pages the user has to maintain.** Every new page adds load. Only create if inbound links will exist within one week.
- **Running without reading the log first.** Momentum signals matter. Don't propose a new tool if the last 5 log entries say "shipping feels hard."
- **Batch mode on first run.** On the first invocation, fix ONE gap, propose THREE, log, stop. Let the user see the pattern before going autonomous.
- **Silent execution of refactors.** Multi-page changes always go through `_proposals/` first.
- **Letting a deprioritized lane steal the run.** If `CLAUDE.md` or `_common/operating-mode.md` says lane X is paused or support-only, do not turn the run into an audit of lane X just because gaps exist there.

## 9. Scheduling

To make this run weekly, add a cron entry or use the scheduling skill of your choice. Example with the [`schedule`](https://github.com/anthropics/claude-skills) skill:

```bash
schedule create --cron "0 9 * * 1" --command "run brain-evolve"
# Mondays at 09:00
```

Or hook into Obsidian's startup events via the Brain Operator plugin.

## 10. Integration with other skills

This skill does not replace:

- `obsidian-markdown` — for authoring
- `find-skills` / `skill-create` — for building new skills (brain-evolve may *propose* calling these)
- Any general-purpose research / review skills you have installed

brain-evolve is the *conductor*. It decides what matters for this brain; specialized skills decide how to execute research or review work. If you have an extension capability stack (e.g. `everything-claude-code`), brain-evolve should route through the matching playbook before authoring research-heavy or code-adjacent pages.

## 11. Execution guardrails

- Never delete a page without explicit approval
- Never edit `raw/` (immutable per `CLAUDE.md`)
- Never modify frontmatter `created` dates
- Always update `updated` when editing
- Always run the index + log update after any wiki change
- If more than 10 gaps are found on a single run, execute only the top 3 and report the rest — do not flood
- If an active-lane gap exists, do not spend the run on backlog polish

## 12. Self-improvement contract

After every run, this file's **Lessons** section MUST get one new line, even if the lesson is "ranking worked, no changes." No run exits without writing a lesson — that's how the skill stays honest.

---

## Lessons

<!-- Append one line per run. Format: "- YYYY-MM-DD: <lesson>" -->
- Skill installed. The first 3 runs will produce noisy rankings until thresholds calibrate. Treat them as exploration, not as final priority order.

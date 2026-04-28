# Quickstart — Your First Seven Days

A day-by-day playbook to take this empty starter from "freshly cloned" to "actually useful." None of these are mandatory. They are the minimum-viable rituals that turn a structured filesystem into a brain that compounds.

## Day 1 — Personalize and orient

1. Open `CLAUDE.md`. Replace `{{NAME}}`, `{{ROLE}}`, and `{{STACK}}` with your real values. Skim the workflows section so you know what the LLM is supposed to do.
2. Open `wiki/_common/operating-mode.md`. The starter ships with three generic priority bands. Either keep them or rewrite them so they reflect your real lanes (e.g. "money-making over learning", "research over publication").
3. In Obsidian, run the Brain Operator command `Ask`. Ask it: *"What's in my wiki right now?"* It will read `index.md` and confirm the wiki is empty. That's normal.

## Day 2 — Drop your first source

1. Pick one article, paper, or PDF you genuinely want to remember. Save it to `raw/`.
2. In Obsidian, run `Ask` with: *"Process the new source in raw/. Discuss the takeaways before filing."*
3. The LLM will read it, propose a wiki page, and ask which category to file it under. Approve.
4. After it files, run `Ask` again: *"Show me the index."* You should see one entry. The wiki is now non-empty.

## Day 3 — Ask a question that exercises the wiki

1. Run `Ask` with a question about the topic you just ingested: *"What's the strongest argument for X based on what I've filed?"*
2. The LLM will return an answer plus an Answer Trace showing which pages it considered, used, and cited.
3. If the answer surfaced new analysis, run `File Back` to save it as a wiki page. Two pages now.

## Day 4 — Run your first audit

1. Run `Evolve`. The LLM will report you have only 2 pages — too few for meaningful gap detection. That's fine.
2. It will propose 3 forward-looking page ideas based on your User Context. Pick one. The LLM creates the page from scratch (research-backed if it has a research skill, otherwise from your prior conversations).

## Day 5 — Set up the operating layer

1. Open `wiki/operating/Project Triage.md`. List your top 3 active projects, status (active/paused/contracted), and a kill rule for each.
2. Open `wiki/operating/Decision Log.md`. Record one open decision you've been putting off. Set a deadline.
3. Run `Ask`: *"What should I work on this week?"* The LLM will read the operating layer + recent log entries and recommend.

## Day 6 — First Ship

1. Run `Ship`. The LLM reads `_proposals/queue.md`, classifies each proposal, and either executes (Level 0), drafts (Level 1), or surfaces a command (Level 2).
2. If queue is empty: run `Evolve` first to populate it, then `Ship`.

## Day 7 — Schedule and step back

1. Set up the weekly cadence:
   ```bash
   schedule create --cron "0 8 * * 1" --command "evolve brain"
   schedule create --cron "0 9 * * 1" --command "run brain-ship"
   ```
   (Or hook into the Brain Operator plugin's schedule settings.)
2. Skim `wiki/log.md`. Seven days of operations. The wiki has structure now.
3. Stop reading this file. Open the brain whenever you have a thought. The compounding starts here.

## Anti-patterns

- **Filing ten pages on day one.** The brain is supposed to compound naturally. Forced batches produce stale pages by week two.
- **Skipping the User Context section.** Without it the LLM hedges, the tone drifts, and you'll feel like you're talking to a generic assistant instead of an operator.
- **Never running Evolve.** The wiki ages. Without periodic audit, stale claims compound.
- **Treating brain-ship's drafts as final.** Always review Level 1 drafts before posting. The LLM doesn't know your audience as well as you do.

## When something feels wrong

- Operator drifts from your tone → strengthen the User Context section in `CLAUDE.md`
- Operator files in the wrong category → add a one-liner to the User Context: "always file X under Y"
- Operator is too cautious → relax the priority bands in `_common/operating-mode.md`
- Operator doesn't understand a domain → drop more raw sources for that domain and run Ingest, don't try to teach it via prompt

The brain is a long game. Most of the value compounds in months, not days.

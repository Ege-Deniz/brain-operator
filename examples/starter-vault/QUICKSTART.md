<!-- GENERATED FILE — do not edit by hand.
     Source: getGovernedStarterVault() in main.js
     Regenerate: node tools/sync-starter-examples.js -->
# Quickstart

Enough to make the vault useful. There is no seven-day programme and nothing to schedule — a brain that runs on its own is the failure mode this starter is shaped to avoid.

## 1. Make it yours

Open `CLAUDE.md` and replace `{{NAME}}`, `{{ROLE}}`, and `{{STACK}}`. Read `wiki/_common/context-routing.md` once so you know what the agent will and will not do on its own.

Then run **Operator** and ask: *"What's in my wiki right now?"* On a fresh vault the honest answer is "almost nothing" — that is the baseline.

## 2. File something real

Put one article, paper, or PDF you actually want to remember into `raw/`.

Ask: *"Read the new source in raw/ and show me what's worth keeping before filing anything."* You will get a summary and a proposed destination. Nothing is written until you approve it.

## 3. Ask something the vault can answer

Ask a question about what you just filed. You get the answer plus an Answer Trace: which pages were offered, which were read, which were cited, and a faithfulness score for how well the citations match what was actually opened.

If the score is low, the retrieval is wrong — not your question. That is the point of showing it.

## 4. Keep Current State honest

`wiki/operating/Current State.md` is the only page that says what is live. Brain Operator reads it to decide which project folders are worth surfacing, so a stale entry costs you relevance.

Update it when a binding fact changes. Delete resolved items instead of letting it grow into a dashboard.

## 5. Let it stay small

Add pages when you have something worth keeping. A wiki that grows on a schedule fills with pages nobody wrote on purpose.

## Habits worth keeping

- Ask direction questions **before** filing anything about them. Once an idea is a page, it starts steering.
- Put unfinished thinking in `wiki/_scratch/`. It is never loaded by default.
- When an answer cites something surprising, open the Answer Trace and check whether it was read or invented.
- Archive instead of deleting. Archived pages stay searchable but stop counting as current.

## When something feels off

- Answers drift toward old projects → check `Current State.md` and the `status` frontmatter on the pages being surfaced.
- Ideation feels recycled → that is what aperture routing exists to prevent; ask the direction question directly rather than asking the vault what to build.
- Retrieval misses an obvious page → open the Answer Trace and look at the scope line to see whether it was withheld and why.

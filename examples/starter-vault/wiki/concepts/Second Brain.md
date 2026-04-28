---
title: Second Brain
category: concepts
tags: [second-brain, knowledge-management, meta]
sources: []
created: 2026-04-25
updated: 2026-04-25
---

# Second Brain

A working definition for this vault: a *second brain* is a structured filesystem an LLM can read, write, and audit, that compounds over time without you having to maintain it manually.

This is a sample page. You can keep, edit, or delete it.

## Why filesystem-first

Most "second brain" tools are databases hidden behind opinionated UIs (Notion, Reflect, Tana, etc). They're nice. They also lock your knowledge into someone else's schema and make it hard to grant an LLM read/write access without going through their API.

A markdown wiki is the opposite: every page is plain text, every link resolves locally, and any LLM with shell access can ingest it at full fidelity.

The trade-off: no UI sugar, no built-in collaboration, no view configurability. For a personal brain, those losses are worth the durability of plain text + the ability to point any future tool at the same files.

## What "compounding" means here

Three loops:

1. **Ingest loop** — sources land in `raw/`, the LLM summarizes them into wiki pages, cross-links emerge automatically.
2. **Audit loop** — `brain-evolve` periodically scans for stale claims, phantom links, and unfilled goal-adjacent gaps. The wiki self-heals.
3. **Ship loop** — `brain-ship` reads queued proposals and either executes them, drafts them, or surfaces exact next-action commands. Ideas don't accumulate as text.

The brain compounds when all three loops run on a cadence.

## What this is not

- A chat wrapper. Chat is volatile. The brain is durable.
- A note-taking app. Note-taking is for capture; the brain is for synthesis.
- A research assistant. The brain is the long-running counterpart to ad-hoc research; it remembers.

## See Also

- [[../_common/operating-mode]] — how the brain prioritizes
- [[../operating/Operating Cadence]] — the weekly rhythm
- [[../../CLAUDE]] — the conventions

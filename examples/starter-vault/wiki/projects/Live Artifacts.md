---
title: Live Artifacts
category: projects
tags: [artifacts, live, registry]
sources: []
created: 2026-04-25
updated: 2026-04-25
---

# Live Artifacts

Registry of every public, shipped artifact. `brain-evolve`'s Follow-Through Scan reads this file on every audit — anything in the `live` or `shipped` row without a queued follow-through becomes an automatic gap.

## Format

| Artifact | URL | Status | Shipped on | Follow-through | Notes |
|----------|-----|--------|------------|----------------|-------|
| <name> | <url> | live / shipped / paused / killed | YYYY-MM-DD | <queued proposal id from queue.md, or "none — gap"> | <one-line context> |

## Current

| Artifact | URL | Status | Shipped on | Follow-through | Notes |
|----------|-----|--------|------------|----------------|-------|
| *(empty)* | | | | | |

## See Also

- [[../_common/operating-mode]]
- [[../operating/Project Triage]]
- [[../_proposals/queue]]

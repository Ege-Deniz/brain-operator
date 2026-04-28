---
title: Project Triage
category: operating
tags: [projects, triage, status]
sources: []
created: 2026-04-25
updated: 2026-04-25
---

# Project Triage

Active state of every project. The brain ranks proposals against this — paused projects don't get shipped from.

## Format

| Project | Status | Next move | Review by | Kill rule |
|---------|--------|-----------|-----------|-----------|
| <name> | active / support / paused / contracted / killed | <single concrete action> | YYYY-MM-DD | <condition that flips this project off> |

Statuses:
- **active** — current cycle, gets execution time
- **support** — gets attention only when explicitly invoked
- **paused** — not running but not killed; review by the date in column 4
- **contracted** — running in reduced scope
- **killed** — archived; remove from this table when archive is confirmed

## Current

| Project | Status | Next move | Review by | Kill rule |
|---------|--------|-----------|-----------|-----------|
| *(empty)* | | | | |

> Add your top 3-5 active projects above. The brain will refuse to ship work from a project marked `paused` unless you explicitly reactivate it.

## Recently killed

<!-- Move killed/archived projects here with the kill date and one-line reason. -->

## See Also

- [[../_common/operating-mode]]
- [[Operating Cadence]]
- [[Live Artifacts]]

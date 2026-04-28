---
title: Proposal Queue
category: operating
tags: [queue, proposals]
sources: []
created: 2026-04-25
updated: 2026-04-25
---

# Proposal Queue

Every proposal `brain-evolve` generates lands here. Every run of `brain-ship` reads from here.

## Format

Proposals are H2 sections. Each has:

```markdown
## <Proposal Title>
- **id**: P-001
- **why**: <one line — what problem this solves or what leverage this unlocks>
- **effort**: 1 (edit existing page) | 2 (new page, research needed) | 3 (multi-page refactor)
- **leverage**: <number 1-9, computed by brain-evolve>
- **band**: <which priority band from operating-mode.md>
- **target_paths**: [`wiki/path/to/file.md`]
- **status**: queued | ready | deferred | shipped | drafted

<Optional: 2-3 sentences of context the executor needs to ship this without re-reading the whole brain.>
```

Statuses:

- `queued` — ready to be picked up by brain-ship
- `ready` — Level 2 surfaced; exact command lives in `ready-to-ship.md`
- `deferred` — valid but outside current operating mode
- `shipped` — Level 0 done, page exists in wiki
- `drafted` — Level 1 done, draft exists in `01_Projects/drafts/`

---

## (queue is empty)

Run `Evolve` to populate it.

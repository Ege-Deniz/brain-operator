---
title: Operating Mode
category: operating
tags: [operating-mode, priority, lanes]
sources: []
created: 2026-04-25
updated: 2026-04-25
---

# Operating Mode

The single source of truth for how the brain ranks work. Both `brain-evolve` and `brain-ship` read this file before any other operating page.

Customize this. The priority bands and lanes below are generic placeholders. Rewrite them to match what actually drives your weeks.

## Priority bands

Higher band always outranks lower band, regardless of leverage scores within bands.

1. **Active deadline** — anything with a hard external deadline within 14 days
2. **Blocked shipment** — anything that would already be public except for a single missing step
3. **Income / leverage** — work that compounds reputation, money, or distribution
4. **Daily-life systems** — friction reduction that pays off every day
5. **Infrastructure polish** — wiki structure, skill upgrades, tooling improvements
6. **Exploration** — research, learning, ideation without an immediate output

> **Customize**: replace these with your real bands. Rule of thumb: 4-6 bands max, each phrased as a noun-phrase, in clear strict order.

## Active lanes

The lanes the brain currently operates in. Lanes outside this list are paused or support-only — proposals on them get `deferred` until the lane is reactivated.

- *(none defined yet — list yours here, e.g. "AI builder identity", "side-project monetization", "thesis", "fitness floor")*

> **Customize**: list 2-5 active lanes. Anything past 5 means you're spread too thin; the brain will surface that as an Evolve gap.

## The Follow-Through Rule

Every shipped artifact in `wiki/projects/Live Artifacts.md` MUST have a queued follow-through proposal in `wiki/_proposals/queue.md`. If it doesn't, that's an automatic gap on every audit.

The follow-through is whichever of these compounds best on the artifact:

- **Reputation** — LinkedIn / X / portfolio post that surfaces it
- **Distribution** — a place to drop the link where the right audience already gathers
- **Monetization** — turning it into a product, template, or paid offer
- **Workflow** — using it as a building block for the next bigger artifact

## Balanced-Split override

When two priority bands are tied (e.g. an active deadline AND blocked shipment that compete for time), use the Balanced Split: run one slice from each in alternation, never let one displace the other entirely.

> **Customize**: define the tie-breakers that matter for you. Otherwise the brain will optimize for whatever band has more proposals queued, which is rarely the right answer.

## See Also

- [[../operating/Project Triage]]
- [[../operating/Decision Log]]
- [[../operating/Income Plan]]
- [[../operating/Operating Cadence]]

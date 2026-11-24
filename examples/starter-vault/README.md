<!-- GENERATED FILE — do not edit by hand.
     Source: getGovernedStarterVault() in main.js
     Regenerate: node tools/sync-starter-examples.js -->
# Brain Operator — Starter Vault

A minimal Obsidian vault set up the way Brain Operator expects: a knowledge layer, a routing policy, and nothing that runs on its own.

This is a filing system with a contract, not an operating system. It remembers and retrieves. It does not choose your projects, rank your work, or turn conversations into permanent context without being asked.

## What you need

- [Obsidian](https://obsidian.md) (free)
- [Claude Code](https://claude.com/claude-code), installed and authenticated once with `claude login`
- The Brain Operator plugin enabled in Obsidian

No API key. The plugin spawns Claude Code as a subprocess using your existing subscription.

## Layout

```text
raw/                 immutable sources — read, never modified
wiki/                distilled knowledge
  operating/         one current-state page
  _common/           routing policy and optional maintenance workflows
  _scratch/          temporary thinking; never loaded by default
01_Projects/         working artifacts, active only when Current State says so
02_Areas/            ongoing responsibilities
03_Resources/        durable reference
04_Archive/          inactive material, kept as evidence
CLAUDE.md            the runtime contract
```

Folder membership does not make something current. For live status there is exactly one source: `wiki/operating/Current State.md`.

## The contract

1. Your present message outranks everything stored.
2. Retrieval is narrow. Pages are read when a request needs them.
3. Ideation starts outside the vault, not from past pages.
4. Nothing is written back without your approval.
5. History is evidence, never a standing instruction.

The full policy is `wiki/_common/context-routing.md`. Optional maintenance operations — Query, Ingest, Lint, File Back — are in `wiki/_common/wiki-workflows.md`, and they run only when you ask.

## Start here

See [QUICKSTART.md](QUICKSTART.md). Fill in `CLAUDE.md`, drop one source in `raw/`, ask one question.

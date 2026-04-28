# Brain Operator — Starter Vault

A pre-baked Obsidian vault that turns the Brain Operator plugin into a working second brain in five minutes.

Fill in three placeholders in `CLAUDE.md` and you have a wiki that:

- **Compounds** — every conversation can file new pages, cross-link concepts, and update the index automatically.
- **Self-audits** — `brain-evolve` runs a 7-step audit on demand or on a schedule, finding stale claims, phantom links, and unfilled goal-adjacent gaps.
- **Self-ships** — `brain-ship` reads `wiki/_proposals/queue.md`, classifies each proposal by autonomy level, and either executes it (Level 0), drafts it (Level 1), or surfaces an exact command (Level 2).
- **Stays opinionated** — the LLM has a written set of conventions in `CLAUDE.md` and refuses to drift.

It is not a chat wrapper. It is an operator that reads, writes, and audits a structured filesystem.

## What you need

- [Obsidian](https://obsidian.md) (free)
- [Claude Code](https://claude.com/claude-code) installed and authenticated (one-time `claude login`)
- The Brain Operator plugin enabled in Obsidian

No API key. The plugin spawns Claude Code as a subprocess using your existing subscription.

## How this vault was created

If you're reading this, the vault was likely scaffolded by the Brain Operator plugin's first-run BootstrapModal — 19 starter files written to an empty vault in one click.

If you're setting up manually:

1. Open an empty Obsidian vault.
2. Drop the plugin folder into `<vault>/.obsidian/plugins/brain-ask/`.
3. Settings → Community plugins → enable Brain Operator.
4. The Bootstrap modal pops; click Scaffold Brain.
5. Open `CLAUDE.md` and fill the three placeholders at the bottom (`{{NAME}}`, `{{ROLE}}`, `{{STACK}}`).

## First seven days

See [QUICKSTART.md](QUICKSTART.md) for a day-by-day walkthrough — drop one source, ask one question, file one wiki page. By day seven you have a wiki that's already useful.

## Architecture (mental model)

```
raw/                     # Sources you drop in. Immutable. The LLM reads, never modifies.
wiki/                    # LLM-generated. Summaries, concepts, decisions, projects.
  ├── index.md           # Catalog. Updated on every operation.
  ├── log.md             # Chronological record of every operation.
  ├── _common/           # Shared operating mode (priority bands, lanes).
  ├── _proposals/        # Queue of proposals brain-evolve generates.
  ├── operating/         # OS-layer pages: decisions, cadence, triage, income.
  └── {career,projects,concepts,...}  # Your actual knowledge, organized by category.
01_Projects/             # PARA-style action layer (you manage; LLM cross-references).
02_Areas/
03_Resources/
04_Archive/
.claude/skills/          # The two operator skills: brain-evolve, brain-ship.
CLAUDE.md                # The conventions the LLM follows. The single source of truth.
```

Three layers:

1. **Raw sources** (`raw/`) — articles, slides, PDFs, web clippings. The LLM reads, never modifies.
2. **The wiki** (`wiki/`) — markdown the LLM owns entirely. Summaries, entities, concepts, syntheses.
3. **The conventions** (`CLAUDE.md`) — co-evolved by you and the LLM. This is the schema.

The wiki compounds. Every operation updates the index, appends to the log, and cross-links via Obsidian `[[wiki links]]`.

## What the operator can do

Four working modes:

| Mode | What it does | Writes? |
|------|--------------|---------|
| **Ask** | Answers from the wiki and returns an Answer Trace — the retrieval graph showing catalog · searched · read · cited · missing. | No (read-only) |
| **Evolve** | Runs the 7-step audit — finds gaps, ranks by leverage, queues proposals. Apply mode is opt-in per run. | Yes (with explicit confirm + target-path allowlist) |
| **Ship** | Reads the proposal queue, classifies Level 0/1/2, executes or drafts or surfaces an exact command. | Yes (Level 0 only; Level 2 surfaces commands you run manually) |
| **Agent Pulse** | Read-only timeline of recent Claude + Codex sessions, generated images, automations, git state. | No (pure filesystem reads, no LLM call) |

**Trace** is not a separate mode — it's the artifact every Ask returns. Decide and File Back appear in the conventions as workflows the LLM follows during conversation, but they're not exposed as plugin commands in this version.

All write modes use a target-paths allowlist; the operator can only edit files in the paths it declared, and every run ends with a `git diff` allowlist check.

## Customizing the operator

The two skills in `.claude/skills/` are the brain. You can:

- **Edit them** — they are markdown. Change the priority bands in `wiki/_common/operating-mode.md`. Change what gets ranked highest.
- **Add new skills** — drop a new skill folder under `.claude/skills/`. The Brain Operator plugin will pick it up.
- **Replace them** — write your own. The plugin doesn't care what skills exist; it just spawns Claude Code with the vault context.

Don't fork unless you want to maintain your own version. Most users won't need to.

## License

MIT — see [LICENSE](LICENSE). The skills, conventions, and templates are free to copy, modify, and ship.

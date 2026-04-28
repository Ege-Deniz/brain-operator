# {{NAME}} — Second Brain Wiki

A persistent, compounding personal knowledge base maintained by an LLM. You curate sources, direct analysis, and ask questions. The LLM does the summarizing, cross-referencing, filing, and bookkeeping.

This file is the schema the LLM follows. Co-evolve it as your operating model changes.

## Architecture

```
raw/                 # Immutable source documents — LLM reads, never modifies
  └── assets/        # Downloaded images and attachments
wiki/                # LLM-generated and maintained pages
  ├── index.md       # Content catalog — updated on every operation
  ├── log.md         # Chronological record of all operations
  ├── _common/       # Shared operating mode and conventions
  ├── _proposals/    # Queue of proposals brain-evolve generates
  ├── operating/     # OS-layer pages: decisions, cadence, triage, income
  ├── career/        # Skills, tech stack, career trajectory, opportunities
  ├── projects/      # Project deep-dives, decisions, progress notes
  ├── education/     # Courses, concepts, exam prep, academic knowledge
  ├── life/          # Habits, health, routines, personal growth, mindset
  ├── finance/       # Income strategies, budgeting, money goals
  └── concepts/      # Cross-cutting ideas, frameworks, mental models
01_Projects/         # Active project dashboards (you manage, action-oriented)
02_Areas/            # Ongoing areas of responsibility
03_Resources/        # Reference material
04_Archive/          # Completed / inactive items
```

**Three layers:**
1. **Raw sources** (`raw/`): Articles, slides, PDFs, web clippings, notes. Immutable — the source of truth.
2. **The wiki** (`wiki/`): LLM-generated markdown. Summaries, entity pages, concept pages, comparisons, syntheses. The LLM owns this layer entirely.
3. **This schema** (`CLAUDE.md`): Conventions and workflows governing LLM behavior. Co-evolved by you and the LLM.

The PARA folders (`01_Projects/` etc.) remain for action-oriented planning. The wiki is the knowledge layer — it cross-references projects but lives separately.

## Page Format

Every wiki page uses this structure:

```markdown
---
title: Page Title
category: career | projects | education | life | finance | operating | concepts
tags: [lowercase, hyphenated, tags]
sources: [source filenames or URLs]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Page Title

Content here. Use [[Wiki Links]] for cross-references.

## See Also
- [[Related Page]]
```

## Workflows

### Ingest

When you add a new source to `raw/` and ask to process it:

1. Read the source completely.
2. Discuss key takeaways — what's important, what to emphasize.
3. Create or update wiki pages in the appropriate subdirectory.
4. Update all related pages across the wiki (entity pages, concept pages, cross-references).
5. Update `wiki/index.md` with new/changed pages.
6. Append an entry to `wiki/log.md`.

A single source may touch 5-15 wiki pages. Always update the index and log.

### Query

When you ask a question:

1. Read `wiki/index.md` to find relevant pages.
2. Read those pages and synthesize an answer with `[[wiki links]]` as citations.
3. If the answer produces valuable new knowledge, offer to file it as a new wiki page.
4. Good queries compound — file analyses, comparisons, and insights back into the wiki.

### Lint

Periodic health-check of the wiki. Look for:

- Contradictions between pages
- Stale claims superseded by newer sources
- Orphan pages with no inbound links
- Concepts mentioned but lacking their own page
- Missing cross-references
- Data gaps that a web search could fill
- Questions worth investigating next

<!-- v0.5.6: File Back and Decide workflow sections removed.
     The plugin does not expose these as commands; they were misleading
     starter conventions. The Decision Log file remains in wiki/operating/
     for manual use. Trace is the artifact every Ask returns, not a mode. -->

### Score

When reviewing a week, project, or income lane:

1. Read `wiki/operating/Operating Cadence.md`, `wiki/operating/Project Triage.md`, and `wiki/operating/Income Plan.md`.
2. Update only metrics that change behavior. Define your own; don't create vanity metrics.
3. If scoring exposes a gap, queue one executable proposal in `wiki/_proposals/queue.md`.

### Kill

When a project, idea, or workflow absorbs attention without leverage:

1. Read `wiki/operating/Project Triage.md` and the relevant project page.
2. Compare the project against your active priority bands (defined in `wiki/_common/operating-mode.md`).
3. If the project should pause, mark it `paused` or `contracted` with a review date.
4. If it should be killed or archived, ask before deleting or moving anything.
5. Log the reasoning in `wiki/operating/Decision Log.md` if it changes the active operating model.

## Conventions

- **Linking**: Use Obsidian `[[wiki links]]` for all cross-references. Obsidian resolves by shortest path, so subdirectories don't break links.
- **Scope**: One concept/entity/topic per page. Split if a page grows beyond ~300 lines.
- **Updates over duplicates**: Always update existing pages rather than creating duplicates.
- **Tables**: Use for comparisons and structured data.
- **Dates**: ISO 8601 (YYYY-MM-DD). Convert relative dates to absolute when writing.
- **Tone**: Direct, professional, no emoji in wiki pages. No cringe or cheesy language. (Override in your own User Context if you prefer otherwise.)
- **Sources**: When referencing raw sources, use `[[raw/filename]]`. When referencing URLs, include them inline.
- **Frontmatter tags**: Lowercase, hyphenated (e.g., `full-stack`, `exam-prep`).
- **Images**: If a source has images, download them to `raw/assets/` and reference as `![[raw/assets/filename]]`.

## Index Format (wiki/index.md)

Organized by category. Each entry: `- [[Page Name]] — one-line summary (N sources)`.

## Log Format (wiki/log.md)

Each entry starts with: `## [YYYY-MM-DD] verb | Subject`

Verbs: `ingest`, `query`, `lint`, `update`, `create`, `decide`, `score`, `kill`, `evolve`, `ship`.

Example: `## [2026-04-13] ingest | Article on RAG vs Knowledge Graphs`

---

## User Context

Fill in these three placeholders so the LLM knows who it's working for. Edit any time.

- **Name**: {{NAME}}
- **Role**: {{ROLE}}  *(e.g. "senior software engineer", "PhD student in CS", "founder of a small SaaS")*
- **Stack / domain**: {{STACK}}  *(e.g. "TypeScript, React, Postgres", "PyTorch + JAX, mostly research code", "no-code, design, marketing")*

You can extend this section with anything else that should bias the LLM's filing and tone:

- **Active priorities** — what lane gets the most weight right now
- **Design taste / writing tone** — minimalist? academic? conversational? emoji-yes or emoji-no?
- **Never** — things the LLM should never do (hallucinate packages, use cringe phrasing, file academic notes when you said builder-only, etc.)
- **Workflow** — how you and the LLM iterate (e.g. "LLM works to perfection → I review → feedback → iterate")

The more you write here, the less drift you'll see.

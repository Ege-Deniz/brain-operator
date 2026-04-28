# raw/

Drop sources here: articles, PDFs, slides, screenshots, web clippings, voice memos.

The LLM reads this folder but **never modifies it**. `raw/` is the immutable source of truth — your brain's evidence layer.

## Conventions

- Use clear filenames: `YYYY-MM-DD-source-name.ext` works well.
- For images that belong to a specific source, drop them in `raw/assets/` and reference them from wiki pages as `![[raw/assets/image.png]]`.
- If you delete from `raw/`, also remove the references from `wiki/` (or run `Lint` and let the brain flag the dangling links).

## When you add a new source

In Obsidian, run `Ask`: *"Process the new source in raw/<filename>. Discuss the takeaways before filing."*

The brain will read it, propose wiki pages, and ask before writing.

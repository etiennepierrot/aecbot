# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AECBot collects the French presidential program **"L'Avenir en commun"** (La France insoumise /
Jean-Luc Mélenchon, 2027) from `melenchon2027.fr` — WordPress pages + PDF booklets — and turns it
into a corpus importable into a Custom GPT and into a Claude skill.

The repo has three clearly separated top-level concerns:

- **`pipeline/`** — the actual code: 4 ordered Python scripts, a read-only update checker, and 2
  one-off repair/debug utilities. This is the only directory you'd normally edit by hand.
- **`data/`** — raw and intermediate data the pipeline produces (WP scrape, downloaded PDFs,
  per-PDF text extraction, manifests). Treat as **data, not code**.
- **`artifacts/`** — final, consumable deliverables built from `data/`: the Custom GPT knowledge
  files (`gpt/`), the simpler direct-WP-only GPT import (`gpt_wp_only_*.md`), and a versioned
  copy of the Claude skill package (`skills/avenir-en-commun/`) that bundles this corpus.

**Never hand-edit a generated file** — anything under `data/` (`markdown/*`, `pdf_markdown/*`,
`index.csv`, `inventaire_complet.json`, `pdf_manifest.json`, `extraction_manifest.json`) or the
generated parts of `artifacts/` (`gpt/AEC_*.md`, `gpt_manifest.json`, `gpt_wp_only_*.md`,
`skills/avenir-en-commun/references/*`). Re-run the producing script instead, so the manifests
stay consistent with the files they describe.

## Pipeline and commands

Four independent Python scripts, run in order from the **repo root** (`aecbot/`), reading from and
writing to `data/` and `artifacts/` as fixed relative subpaths:

```bash
python3 -m pip install -r pipeline/requirements.txt   # requests, beautifulsoup4, markdownify (fitz/PyMuPDF needed too, not pinned)

python3 pipeline/collecte_wp.py      # 1. scrape WP pages+posts under /programme/ -> data/markdown/,
                                      #    data/index.csv, data/inventaire_complet.json,
                                      #    artifacts/gpt_wp_only_0X.md
python3 pipeline/download_pdfs.py    # 2. download every PDF media attachment -> data/pdfs/, data/pdf_manifest.json
python3 pipeline/extract_pdf.py      # 3. extract PDF text per page (PyMuPDF) -> data/pdf_markdown/, data/extraction_manifest.json
python3 pipeline/build_corpus.py     # 4. classify + dedupe + chunk extracted docs -> artifacts/gpt/AEC_*.md, artifacts/gpt_manifest.json
```

`pipeline/fix_programme.py` and `pipeline/test_column.py` are one-off repair/debug utilities for a
single known-bad PDF (title containing "PROGRAMME SITE 2025", e.g. `15699_A5-PROGRAMME-SITE.pdf`)
whose text extracts better as two side-by-side columns than as a single flow; `fix_programme.py`
backs up the original extraction to `*.original.md` before overwriting it. Run these only for that
specific document, after `extract_pdf.py`, before `build_corpus.py`.

`build_corpus.py` useful flags:
- `--data-root data` (default) — where `extraction_manifest.json` and the extracted markdown live
- `--out-root artifacts` (default) — where `gpt/` and `gpt_manifest.json` are written
- `--max-kib 450` — max size per generated knowledge file (splits large PDFs at `## Page N` boundaries)
- `--include-archives` — include the NFP 2024 contract (excluded by default; it's a *different*
  program, not an AEC edition)
- `--include-other` — include press kits / unclassified docs (excluded by default)

There is no lint/test command — correctness here means re-running the pipeline and checking the
manifests (counts of included/excluded/error/duplicate) described below.

Before re-running the full pipeline (which re-downloads 265 MB of PDFs), check whether there's
actually anything new: `python3 pipeline/check_updates.py` compares the live site to the committed
`data/index.csv` / `data/pdf_manifest.json` by id + modified date, read-only, no writes. Exit code
`0` = nothing new, `1` = new/changed content found, `2` = no committed manifests to compare against yet.

## Pipeline architecture (why the files are organized this way)

Four stages, each stamping metadata forward into the next stage's manifest, keyed by the WordPress
media/post `id`:

1. **`collecte_wp.py`** calls the WP REST API (`/wp-json/wp/v2/pages`, `/posts`), keeps only items
   whose URL starts with `/programme/` and whose rendered text is >100 chars, converts HTML→Markdown,
   and writes one file per doc to `data/markdown/`. Also repackages everything kept into
   `artifacts/gpt_wp_only_01.md`/`02.md` (≤300k chars/file) for *direct* Custom GPT import — this
   is a separate, simpler artifact from the `artifacts/gpt/AEC_*.md` files produced later in step 4.
2. **`download_pdfs.py`** pulls every `application/pdf` media item from `/wp-json/wp/v2/media`,
   prefixes each filename with its WP id to avoid collisions, and records `data/pdf_manifest.json`.
3. **`extract_pdf.py`** runs PyMuPDF (`fitz`) over every PDF in `pdf_manifest.json`, emitting one
   `data/pdf_markdown/<stem>.md` with explicit `## Page N` headers per page, and appends extraction
   status (`ok`/`empty`/`error`) to `data/extraction_manifest.json`.
4. **`build_corpus.py`** reads `data/extraction_manifest.json`, classifies each document by
   filename/URL heuristics into one of six categories, drops exact duplicates (SHA-256 of
   whitespace-normalized body) and documents excluded by default (`archive`, `other`), then packs
   the rest into size-capped `artifacts/gpt/AEC_<category>_NN.md` files (splitting only at
   `## Page N` boundaries so a page is never cut mid-text), and writes `artifacts/gpt_manifest.json`
   with full provenance per document (`included`, `reason` if excluded, which knowledge
   file(s)/part it landed in).

### Document categories (`build_corpus.py: CATEGORY`/`classify`)

Classification is filename/URL-based and intentionally documentary, not semantic:
- `programme` → the general program PDF (`A5-PROGRAMME-SITE`, `programme-abrege`)
- `livret` → thematic booklets (`Livret_UP_*`, `ASS-LIVRET-*`)
- `plan` → thematic/investment plans (`Plan_UP_*`, `PLAN-EUROPE_*`)
- `recent` → anything under a `/2026/` upload path
- `archive` → the 2024 NFP ("Front Populaire") contract — a different coalition's program, **excluded
  by default**
- `other` → press kits, open letters, anything unclassified — **excluded by default**

`artifacts/gpt/AEC_00_LIRE_AVANT_IMPORT.md` (regenerated by `build_corpus.py`, don't hand-edit) is
the documentary ground rules for anyone (human or model) consuming the `gpt/AEC_*.md` files — it is
the most important single file to read before answering questions from this corpus:
- The general program is a **provisional** reference; check for a newer edition before citing it.
- Always distinguish programme général / livrets / plans / 2026 publications / archives.
- The `modified` date is a WordPress edit timestamp — **not** evidence of drafting or adoption date.
- Always cite title + source URL + PDF page marker (`## Page N`).
- Never invent a measure or quote; flag contradictions between editions.
- NFP archives and press kits/unclassified docs are excluded unless the corresponding `--include-*`
  flag was used.
- Filename-based classification is indicative only — check `gpt_manifest.json` before relying on it.

## The Claude skill package (`artifacts/skills/avenir-en-commun/`)

This is a versioned copy of the skill Claude actually loads from `~/.claude/skills/avenir-en-commun/`
to answer questions about the program with sourced citations. Two different things live inside it:

- `SKILL.md` and `scripts/` (`search_aec.py`, `check_manifest.py`) are **hand-authored** — the
  skill's instructions and its query tools. Edit them directly, here or at the installed location.
- `references/` is **generated** — a copy of `artifacts/gpt/AEC_*.md` + `artifacts/gpt_manifest.json`.
  Don't hand-edit it; regenerate it by re-copying after rebuilding the corpus.

The repo copy and the installed copy are **not automatically synced**. After rebuilding the corpus
(`build_corpus.py`) or editing `SKILL.md`/`scripts/`, resync both directions as needed:

```bash
# repo -> installed (after editing SKILL.md or scripts/ here)
cp -R artifacts/skills/avenir-en-commun/. ~/.claude/skills/avenir-en-commun/

# installed -> repo, then refresh references/ from the rebuilt corpus (after build_corpus.py)
cp -R artifacts/gpt/. artifacts/skills/avenir-en-commun/references/
cp artifacts/gpt_manifest.json artifacts/skills/avenir-en-commun/references/gpt_manifest.json
```

## Known caveats (carried over from the scripts' own comments)

- The WP API scrape doesn't guarantee full booklet/measure coverage and can miss JS-rendered content
  — always sanity-check `data/index.csv` rather than assuming completeness.
- `data/pdf_markdown/15699_A5-PROGRAMME-SITE.md` has a `.original.md` backup sitting next to it from
  the column-fix re-extraction; the non-`.original` version is the one actually referenced by the
  manifests.
- `artifacts/gpt_manifest.json` is the authoritative provenance record — it says, per source
  document, whether it was included, why it was excluded if not, and exactly which
  `artifacts/gpt/AEC_*.md` file/part contains it.
- `data/pdfs/` (265 Mo) is gitignored — regenerate it with `python3 pipeline/download_pdfs.py`
  rather than expecting it after a fresh clone.

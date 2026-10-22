#!/usr/bin/env python3
"""Cherche un motif dans le corpus AEC bundlé et résout chaque résultat vers son
document source (titre, URL) et sa page PDF, pour éviter de remonter le fichier
à la main à chaque citation."""
import argparse
import re
from pathlib import Path

REFS = Path(__file__).resolve().parent.parent / "references"
DOC_RE = re.compile(r"^# DOCUMENT : (.+)$")
URL_RE = re.compile(r"^URL source : (.+)$")
PAGE_RE = re.compile(r"^## Page (\d+)$")


def index_file(lines):
    """Liste (num_ligne, titre_vu, url_vue, page_vue) — None si rien de nouveau à cette ligne."""
    markers = []
    for i, line in enumerate(lines, start=1):
        title = url = page = None
        m = DOC_RE.match(line)
        if m:
            title = m.group(1)
        m = URL_RE.match(line)
        if m:
            url = m.group(1)
        m = PAGE_RE.match(line)
        if m:
            page = m.group(1)
        markers.append((i, title, url, page))
    return markers


def resolve(markers, line_no):
    title = url = page = None
    for i, t, u, p in markers:
        if i > line_no:
            break
        if t is not None:
            title, url, page = t, None, None  # nouveau document : on repart à zéro
        if u is not None:
            url = u
        if p is not None:
            page = p
    return title, url, page


def main():
    ap = argparse.ArgumentParser(
        description="Cherche dans le corpus Avenir en commun bundlé et affiche source + page pour chaque résultat."
    )
    ap.add_argument("pattern", help="motif regex à chercher (insensible à la casse)")
    ap.add_argument("--max", type=int, default=20, help="nombre maximal de résultats (défaut 20)")
    ap.add_argument(
        "--category",
        choices=["programme", "livrets", "plans", "publications_2026", "all"],
        default="all",
        help="limiter la recherche à une catégorie de fichiers (défaut: all)",
    )
    args = ap.parse_args()

    regex = re.compile(args.pattern, re.IGNORECASE)

    pattern_map = {
        "programme": "AEC_01_programme_*.md",
        "livrets": "AEC_02_livrets_*.md",
        "plans": "AEC_03_plans_*.md",
        "publications_2026": "AEC_04_publications_2026_*.md",
        "all": "AEC_0[1-4]*.md",
    }
    files = sorted(REFS.glob(pattern_map[args.category]))

    hits = 0
    for path in files:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        markers = None
        for i, line in enumerate(lines, start=1):
            if regex.search(line):
                if markers is None:
                    markers = index_file(lines)
                title, url, page = resolve(markers, i)
                hits += 1
                print(f"[{path.name}:{i}] {line.strip()[:160]}")
                print(f"    Document : {title}")
                print(f"    URL      : {url}")
                print(f"    Page PDF : {'## Page ' + page if page else '(non trouvée avant ce point)'}")
                print()
                if hits >= args.max:
                    print(f"... limite de {args.max} résultats atteinte, affinez la recherche (--category, motif plus précis).")
                    return
    if hits == 0:
        print("Aucun résultat dans le corpus bundlé pour ce motif. Ne pas inventer de réponse : dire explicitement que ce n'est pas trouvé dans le corpus.")


if __name__ == "__main__":
    main()

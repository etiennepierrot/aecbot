#!/usr/bin/env python3
"""Interroge gpt_manifest.json (référence de provenance faisant autorité) pour un
document par titre (sous-chaîne) ou par id WordPress : statut d'inclusion, raison
d'exclusion éventuelle, catégorie, et fichier(s) de connaissance où il a atterri."""
import argparse
import json
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent.parent / "references" / "gpt_manifest.json"


def main():
    ap = argparse.ArgumentParser(
        description="Cherche un document dans gpt_manifest.json par titre (sous-chaîne, insensible à la casse) ou id WP."
    )
    ap.add_argument("query", help="sous-chaîne de titre ou id WordPress numérique")
    args = ap.parse_args()

    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    docs = data.get("documents", [])
    q = args.query.lower()
    matches = [d for d in docs if q in d.get("title", "").lower() or str(d.get("id")) == args.query]

    if not matches:
        print("Aucun document correspondant dans gpt_manifest.json.")
        return

    for d in matches:
        print(f"ID {d['id']} — {d['title']}")
        print(f"  Catégorie      : {d.get('category')}")
        included = d.get("included")
        line = f"  Inclus         : {included}"
        if not included and d.get("reason"):
            line += f" (raison: {d['reason']})"
        print(line)
        print(f"  URL source     : {d.get('url')}")
        print(f"  Modifié (WP)   : {d.get('modified')}  (date d'édition WordPress, pas de rédaction/adoption)")
        for kf in d.get("knowledge_files", []):
            print(f"  Fichier savoir : {kf['file']} (partie {kf['part']}/{kf['parts']})")
        print()


if __name__ == "__main__":
    main()

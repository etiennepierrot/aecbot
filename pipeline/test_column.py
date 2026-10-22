import json
from pathlib import Path

import fitz

docs = json.loads(
    Path("data/extraction_manifest.json").read_text(
        encoding="utf-8"
    )
)

doc = next(
    d for d in docs
    if "PROGRAMME SITE 2025" in d["title"].upper()
)

pdf_path = Path(doc["file"])


def extract_columns(page):
    width = page.rect.width
    height = page.rect.height

    # Découpage vertical au milieu de la page.
    left = fitz.Rect(0, 0, width / 2, height)
    right = fitz.Rect(width / 2, 0, width, height)

    left_text = page.get_text(
        "text",
        clip=left,
        sort=True
    )

    right_text = page.get_text(
        "text",
        clip=right,
        sort=True
    )

    return left_text.strip(), right_text.strip()


with fitz.open(pdf_path) as pdf:
    for page_number in [20, 35, 50]:
        page = pdf[page_number - 1]

        left, right = extract_columns(page)

        print(f"\n{'=' * 25} PAGE {page_number} {'=' * 25}")

        print("\n--- COLONNE GAUCHE ---\n")
        print(left[:1800])

        print("\n--- COLONNE DROITE ---\n")
        print(right[:1800])
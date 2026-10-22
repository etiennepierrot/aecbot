import json
from pathlib import Path

import fitz

ROOT = Path("data")

docs = json.loads(
    (ROOT / "extraction_manifest.json").read_text(encoding="utf-8")
)

doc = next(
    d for d in docs
    if "PROGRAMME SITE 2025" in d["title"].upper()
)

source = Path(doc["file"])
destination = Path(doc["markdown"])

# Sauvegarde de l'ancienne extraction.
backup = destination.with_suffix(".original.md")

if not backup.exists():
    backup.write_text(
        destination.read_text(encoding="utf-8"),
        encoding="utf-8"
    )

pages = []

with fitz.open(source) as pdf:
    for number, page in enumerate(pdf, start=1):
        width = page.rect.width
        height = page.rect.height

        left = fitz.Rect(0, 0, width / 2, height)
        right = fitz.Rect(width / 2, 0, width, height)

        left_text = page.get_text(
            "text",
            clip=left,
            sort=True
        ).strip()

        right_text = page.get_text(
            "text",
            clip=right,
            sort=True
        ).strip()

        content = "\n\n".join(
            part for part in [left_text, right_text] if part
        )

        pages.append(f"## Page {number}\n\n{content}")

markdown = f"""# {doc['title']}

Source : {doc['url']}
Date de modification : {doc.get('modified', 'inconnue')}
Nombre de pages : {len(pages)}

---

{chr(10).join(pages)}
"""

destination.write_text(markdown, encoding="utf-8")

print(f"Programme réextrait : {destination}")
print(f"Pages : {len(pages)}")
print(f"Caractères : {len(markdown)}")
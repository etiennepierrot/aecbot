import json
import re
from pathlib import Path

import fitz

ROOT = Path("corpus_aecbot")
MANIFEST = ROOT / "pdf_manifest.json"
OUTPUT = ROOT / "pdf_markdown"

OUTPUT.mkdir(parents=True, exist_ok=True)

documents = json.loads(MANIFEST.read_text(encoding="utf-8"))

results = []

for doc in documents:
    pdf_path = Path(doc["file"])
    output_path = OUTPUT / (pdf_path.stem + ".md")

    print(f"Extraction : {pdf_path.name}")

    try:
        with fitz.open(pdf_path) as pdf:
            pages = []

            for page_number, page in enumerate(pdf, start=1):
                text = page.get_text("text", sort=True).strip()

                if text:
                    pages.append(
                        f"## Page {page_number}\n\n{text}"
                    )

            content = "\n\n".join(pages)
            page_count = len(pdf)

        title = re.sub(
            r"<[^>]+>", "",
            doc["title"]
        )

        markdown = f"""# {title}

Source : {doc["url"]}
Date de modification : {doc.get("modified", "inconnue")}
Nombre de pages : {page_count}

---

{content}
"""

        output_path.write_text(markdown, encoding="utf-8")

        results.append({
            **doc,
            "markdown": str(output_path),
            "pages": page_count,
            "characters": len(content),
            "status": "ok" if content else "empty"
        })

    except Exception as error:
        print(f"ERREUR : {error}")

        results.append({
            **doc,
            "status": "error",
            "error": str(error)
        })

(ROOT / "extraction_manifest.json").write_text(
    json.dumps(results, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print("\nExtraction terminée")

print("PDF traités :", len(results))
print("PDF sans texte :", sum(r["status"] == "empty" for r in results))
print("Erreurs :", sum(r["status"] == "error" for r in results))
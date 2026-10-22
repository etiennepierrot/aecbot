import json
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import urlparse, unquote

BASE = "https://melenchon2027.fr/wp-json/wp/v2/media"
OUTPUT = Path("corpus_aecbot/pdfs")
OUTPUT.mkdir(parents=True, exist_ok=True)

manifest = []
page = 1

while True:
    url = f"{BASE}?per_page=100&page={page}"

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "AECBot/0.1"}
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            items = json.load(response)

    except urllib.error.HTTPError as e:
        if e.code == 400:
            break
        raise

    if not items:
        break

    for item in items:
        if item.get("mime_type") != "application/pdf":
            continue

        source_url = item["source_url"]

        filename = unquote(
            Path(urlparse(source_url).path).name
        )

        # Préfixe avec l'ID WordPress pour éviter
        # les collisions de noms de fichiers.
        filename = f'{item["id"]}_{filename}'

        destination = OUTPUT / filename

        if not destination.exists():
            print(f"Téléchargement : {filename}")

            req = urllib.request.Request(
                source_url,
                headers={"User-Agent": "AECBot/0.1"}
            )

            with urllib.request.urlopen(req, timeout=60) as response:
                data = response.read()

            if not data.startswith(b"%PDF-"):
                raise ValueError(f"Fichier non PDF : {source_url}")

            destination.write_bytes(data)

        manifest.append({
            "id": item["id"],
            "title": item["title"]["rendered"],
            "url": source_url,
            "modified": item.get("modified"),
            "file": str(destination)
        })

    page += 1

manifest_path = OUTPUT.parent / "pdf_manifest.json"

manifest_path.write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"\n{len(manifest)} PDF inventoriés")
print(f"Manifest : {manifest_path}")
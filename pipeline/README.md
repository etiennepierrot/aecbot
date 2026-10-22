# pipeline/

Le code du projet : 4 scripts à lancer dans l'ordre pour reconstruire le corpus depuis zéro, plus 2
utilitaires ponctuels. Tout lit et écrit dans `../data/` et `../artifacts/` avec des chemins relatifs
fixes — **ces scripts doivent être lancés depuis la racine du repo**, jamais depuis `pipeline/`.

Pour l'architecture détaillée (format des manifests, logique de classification/dédup, règles de
non-édition des fichiers générés), voir le [CLAUDE.md](../CLAUDE.md) à la racine.

## Installation

```bash
python3 -m pip install -r pipeline/requirements.txt
```

Installe `requests`, `beautifulsoup4`, `markdownify`. `extract_pdf.py`, `fix_programme.py` et
`test_column.py` ont aussi besoin de **PyMuPDF** (`pip install pymupdf`, module `fitz`) — non listé
dans `requirements.txt`.

## Les 4 scripts du pipeline, dans l'ordre

Chacun ne fonctionne qu'une fois le précédent terminé (il lit sa sortie).

### 1. `collecte_wp.py`
Scrape les pages et articles publics de l'API WordPress `melenchon2027.fr`, ne garde que ceux dont
l'URL commence par `/programme/` et dont le texte dépasse 100 caractères, convertit le HTML en
Markdown.

```bash
python3 pipeline/collecte_wp.py
```

Écrit : `data/markdown/` (1 fichier par page), `data/index.csv` (pages incluses/exclues),
`data/inventaire_complet.json` (réponse API brute, y compris exclu), `artifacts/gpt_wp_only_0X.md`
(regroupement direct pour import Custom GPT, ≤300k caractères/fichier).

### 2. `download_pdfs.py`
Télécharge tous les médias PDF référencés par l'API WordPress (`/wp-json/wp/v2/media`), en préfixant
chaque nom de fichier par son id WordPress pour éviter les collisions.

```bash
python3 pipeline/download_pdfs.py
```

Écrit : `data/pdfs/` (PDF bruts — 265 Mo, gitignoré), `data/pdf_manifest.json` (liste + métadonnées).

### 3. `extract_pdf.py`
Extrait le texte de chaque PDF listé dans `pdf_manifest.json`, page par page, avec PyMuPDF.

```bash
python3 pipeline/extract_pdf.py
```

Écrit : `data/pdf_markdown/<nom>.md` (texte, repères `## Page N` par page),
`data/extraction_manifest.json` (statut `ok`/`empty`/`error` par PDF).

### 4. `build_corpus.py`
Classe chaque document (programme / livret / plan / récent / archive / autre) par heuristique sur
le nom de fichier et l'URL, élimine les doublons stricts (hash du texte normalisé) et les
catégories exclues par défaut, puis découpe le tout en fichiers de connaissance de taille plafonnée
pour import Custom GPT.

```bash
python3 pipeline/build_corpus.py
```

Écrit : `artifacts/gpt/AEC_<categorie>_NN.md` + `artifacts/gpt/AEC_00_LIRE_AVANT_IMPORT.md`,
`artifacts/gpt_manifest.json` (provenance complète : inclus ou non, raison si exclu, fichier(s) de
destination).

Options utiles :
| Flag | Défaut | Effet |
|---|---|---|
| `--data-root` | `data` | dossier source (lit `extraction_manifest.json`) |
| `--out-root` | `artifacts` | dossier de sortie (`gpt/`, `gpt_manifest.json`) |
| `--max-kib` | `450` | taille max par fichier de connaissance (découpe aux limites `## Page N`) |
| `--include-archives` | off | inclut l'archive NFP 2024 (exclue par défaut : autre programme) |
| `--include-other` | off | inclut dossiers de presse / documents non classés (exclus par défaut) |

## Utilitaires ponctuels

Pas des étapes du pipeline standard — à lancer uniquement pour corriger un PDF connu dont le texte
s'extrait mal en une seule colonne (`15699_A5-PROGRAMME-SITE.pdf`, détecté par le titre contenant
"PROGRAMME SITE 2025"). Toujours après `extract_pdf.py`, avant `build_corpus.py`.

- **`test_column.py`** — affiche l'extraction en deux colonnes pour quelques pages de test (20, 35,
  50), sans rien écrire, pour vérifier que le découpage en colonnes donne un meilleur résultat avant
  de l'appliquer.
- **`fix_programme.py`** — ré-extrait ce PDF en deux colonnes (gauche/droite) et écrase
  `data/pdf_markdown/15699_A5-PROGRAMME-SITE.md`, après avoir sauvegardé l'original en
  `.original.md`.

```bash
python3 pipeline/test_column.py     # vérification visuelle, aucune écriture
python3 pipeline/fix_programme.py   # applique la ré-extraction en 2 colonnes
```

## Vérifier s'il y a du nouveau contenu avant de relancer

`check_updates.py` compare le site en ligne aux manifests déjà committés (`data/index.csv`,
`data/pdf_manifest.json`) par id + date de modification — sans rien télécharger ni écrire. Utile
pour savoir si ça vaut le coup de relancer tout le pipeline (téléchargement de 265 Mo de PDFs
compris) sans avoir à le faire pour vérifier.

```bash
python3 pipeline/check_updates.py
```

Affiche les pages/articles et PDF nouveaux ou modifiés depuis la dernière collecte. Code de sortie
`0` si rien de nouveau, `1` si du contenu a changé (utilisable en script/cron), `2` si les manifests
de référence n'existent pas encore (lancer d'abord le pipeline complet une première fois).

## Tout relancer depuis zéro

```bash
python3 -m pip install -r pipeline/requirements.txt pymupdf
python3 pipeline/collecte_wp.py
python3 pipeline/download_pdfs.py
python3 pipeline/extract_pdf.py
python3 pipeline/fix_programme.py    # uniquement pour le PDF du programme général
python3 pipeline/build_corpus.py
```

Aucune commande de lint/test : la vérification se fait en relisant les manifests (comptages
inclus/exclus/erreurs/doublons dans `artifacts/gpt_manifest.json` et `data/extraction_manifest.json`).

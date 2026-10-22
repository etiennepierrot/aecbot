# AECBot — pipeline de collecte du programme "Avenir en Commun"

Collecte et met en forme le programme présidentiel **"L'Avenir en commun"** (La France insoumise /
Jean-Luc Mélenchon, 2027) depuis `melenchon2027.fr` : pages WordPress sous `/programme/` + PDFs
(livrets thématiques, plans sectoriels, programme général). Produit un corpus prêt à importer dans
un Custom GPT et dans un skill Claude.

Trois dossiers racine, séparés par rôle (voir [CLAUDE.md](CLAUDE.md) pour le détail complet) :
- **`pipeline/`** — le code : les 4 scripts du pipeline + 2 utilitaires ponctuels (détail de chaque
  script et instructions d'usage dans [pipeline/README.md](pipeline/README.md)).
- **`data/`** — les données brutes et intermédiaires produites par le pipeline.
- **`artifacts/`** — les livrables finaux construits à partir de `data/` : le corpus pour Custom
  GPT (`gpt/`), l'import GPT direct (`gpt_wp_only_*.md`), et une copie versionnée du skill
  Claude (`skills/avenir-en-commun/`).

Ne jamais éditer un fichier généré (dans `data/` ou dans les parties générées d'`artifacts/`) à la
main : toujours ré-exécuter le script producteur.

## Pipeline

Quatre étapes indépendantes, à lancer dans l'ordre depuis la racine du repo :

```bash
python3 -m pip install -r pipeline/requirements.txt   # requests, beautifulsoup4, markdownify (+ fitz/PyMuPDF, non pinné)

python3 pipeline/collecte_wp.py      # 1. scrape pages+articles WP /programme/   -> data/markdown/, data/index.csv, data/inventaire_complet.json, artifacts/gpt_wp_only_0X.md
python3 pipeline/download_pdfs.py    # 2. télécharge tous les PDF en pièce jointe -> data/pdfs/, data/pdf_manifest.json
python3 pipeline/extract_pdf.py      # 3. extrait le texte des PDF page par page -> data/pdf_markdown/, data/extraction_manifest.json
python3 pipeline/build_corpus.py     # 4. classe + déduplique + découpe            -> artifacts/gpt/AEC_*.md, artifacts/gpt_manifest.json
```

Avant de relancer tout ça (265 Mo de PDFs à retélécharger), `python3 pipeline/check_updates.py`
compare le site en ligne aux manifests déjà committés et dit s'il y a du nouveau contenu, sans rien
télécharger ni écrire — voir [pipeline/README.md](pipeline/README.md) pour le détail.

`pipeline/fix_programme.py` et `pipeline/test_column.py` sont des utilitaires ponctuels de
réparation/debug pour un seul PDF connu pour mal s'extraire en une seule colonne
(`15699_A5-PROGRAMME-SITE.pdf`) ; à lancer seulement pour ce document, après `extract_pdf.py` et
avant `build_corpus.py`.

**Limites connues** : le scraping WP ne garantit pas la couverture complète des livrets et peut
manquer du contenu rendu en JavaScript — toujours vérifier `data/index.csv`. Les dates `modified`
sont des timestamps d'édition WordPress, pas des dates de rédaction/adoption officielles.

## Arborescence

```
aecbot/
├── README.md
├── CLAUDE.md                    conventions détaillées (pipeline, data, artifacts, skill)
│
├── pipeline/                    le code — seul dossier à éditer normalement
│   ├── requirements.txt
│   ├── collecte_wp.py            étape 1 — scrape WordPress
│   ├── download_pdfs.py          étape 2 — téléchargement des PDF
│   ├── extract_pdf.py            étape 3 — extraction texte des PDF
│   ├── build_corpus.py           étape 4 — classement/dédup/découpage final
│   ├── fix_programme.py          utilitaire ponctuel : ré-extraction en 2 colonnes d'un PDF
│   └── test_column.py            utilitaire ponctuel : debug de la détection de colonnes
│
├── data/                        données brutes + intermédiaires — ne jamais éditer à la main
│   ├── index.csv                 inventaire des pages WP incluses/exclues (111 lignes)
│   ├── inventaire_complet.json   réponse brute de l'API WP (y compris contenu exclu, 2,2 Mo)
│   ├── markdown/                 1 fichier Markdown par page/article WP retenu (69 fichiers)
│   ├── pdf_manifest.json         liste des PDF téléchargés + métadonnées WP
│   ├── pdfs/                     PDF bruts téléchargés — 75 fichiers, 265 Mo
│   │                             ⚠️ gitignoré : régénérable via `python3 pipeline/download_pdfs.py`
│   ├── extraction_manifest.json  statut d'extraction (ok/empty/error) par PDF
│   └── pdf_markdown/             texte extrait par PDF, pages balisées `## Page N` (76 fichiers :
│                                 75 extractions + 1 backup `.original.md`, voir caveat ci-dessous)
│
└── artifacts/                   livrables finaux — ne jamais éditer les parties générées à la main
    ├── gpt_manifest.json         provenance complète par document : inclus ou non, raison si
    │                             exclu, fichier(s) de destination — à consulter avant de se fier
    │                             à la classification par nom de fichier
    ├── gpt_wp_only_01.md         pages WP seules, regroupées pour import GPT direct (280 Ko)
    ├── gpt_wp_only_02.md         suite du précédent si > 300k caractères (220 Ko)
    ├── gpt/                      corpus complet, prêt à importer dans un Custom GPT (10 fichiers,
    │                             3,4 Mo) : AEC_00_LIRE_AVANT_IMPORT.md (règles de lecture, à lire
    │                             en premier) + AEC_{01_programme,02_livrets,03_plans,
    │                             04_publications_2026}_NN.md
    └── skills/avenir-en-commun/  copie versionnée du skill Claude installé (~/.claude/skills/) :
        ├── SKILL.md               instructions du skill — à la main
        ├── scripts/               search_aec.py, check_manifest.py — outils de requête, à la main
        └── references/            copie de gpt/ + gpt_manifest.json — généré, à resynchroniser
                                    après un rebuild (voir CLAUDE.md pour les commandes de sync)
```

### Ce qui est exclu par défaut (voir `artifacts/gpt_manifest.json`)

`build_corpus.py` exclut par défaut, documenté par document avec sa raison exacte dans
`gpt_manifest.json` :
- l'**archive NFP 2024** (programme d'une autre coalition, pas une édition de l'AEC) — réactivable
  avec `--include-archives` ;
- les **dossiers de presse et documents non classés** (4 dossiers de presse + 1 lettre) —
  réactivables avec `--include-other` ;
- **8 PDF strictement en double** (même contenu, uploadés deux fois sous deux ids WordPress
  différents) ;
- **1 PDF dont l'extraction n'est pas exploitable** (programme abrégé FALC).

Rien de tout cela n'a besoin d'être nettoyé à la main : c'est déjà filtré hors de `artifacts/gpt/`
et la raison de chaque exclusion est tracée dans `artifacts/gpt_manifest.json`.

### Caveat connu : `15699_A5-PROGRAMME-SITE.original.md`

Ce fichier dans `data/pdf_markdown/` est une sauvegarde de l'extraction d'origine, créée par
`fix_programme.py` avant de ré-extraire ce PDF en deux colonnes. C'est la version **sans** le
suffixe `.original` qui est effectivement référencée par les manifests et utilisée dans
`artifacts/gpt/`.

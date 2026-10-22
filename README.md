# AECBot — pipeline de collecte du programme "Avenir en Commun"

Collecte et met en forme le programme présidentiel **"L'Avenir en commun"** (La France insoumise /
Jean-Luc Mélenchon, 2027) depuis `melenchon2027.fr` : pages WordPress sous `/programme/` + PDFs
(livrets thématiques, plans sectoriels, programme général). Produit un corpus prêt à importer dans
un Custom GPT.

Ce dossier (`aecbot/`) contient les **scripts** du pipeline. `corpus_aecbot/` contient les
**données** — brutes et générées — qu'ils produisent ; voir son propre
[CLAUDE.md](corpus_aecbot/CLAUDE.md) pour le détail des conventions de cette donnée (ne jamais
éditer un fichier généré à la main, toujours ré-exécuter le script producteur).

## Pipeline

Quatre étapes indépendantes, à lancer dans l'ordre depuis `aecbot/` :

```bash
python3 -m pip install -r requirements.txt   # requests, beautifulsoup4, markdownify (+ fitz/PyMuPDF, non pinné)

python3 collecte_wp.py      # 1. scrape pages+articles WP /programme/   -> markdown/, index.csv, inventaire_complet.json, GPT_programme_0X.md
python3 download_pdfs.py    # 2. télécharge tous les PDF en pièce jointe -> pdfs/, pdf_manifest.json
python3 extract_pdf.py      # 3. extrait le texte des PDF page par page -> pdf_markdown/, extraction_manifest.json
python3 build_corpus.py     # 4. classe + déduplique + découpe            -> gpt/AEC_*.md, gpt_manifest.json
```

`fix_programme.py` et `test_column.py` sont des utilitaires ponctuels de réparation/debug pour un
seul PDF connu pour mal s'extraire en une seule colonne (`15699_A5-PROGRAMME-SITE.pdf`) ; à lancer
seulement pour ce document, après `extract_pdf.py` et avant `build_corpus.py`.

**Limites connues** : le scraping WP ne garantit pas la couverture complète des livrets et peut
manquer du contenu rendu en JavaScript — toujours vérifier `index.csv`. Les dates `modified` sont
des timestamps d'édition WordPress, pas des dates de rédaction/adoption officielles.

## Arborescence

```
aecbot/
├── README.md                    ce fichier
├── requirements.txt             dépendances Python du pipeline
├── collecte_wp.py                étape 1 — scrape WordPress
├── download_pdfs.py              étape 2 — téléchargement des PDF
├── extract_pdf.py                étape 3 — extraction texte des PDF
├── build_corpus.py               étape 4 — classement/dédup/découpage final
├── fix_programme.py              utilitaire ponctuel : ré-extraction en 2 colonnes d'un PDF
├── test_column.py                utilitaire ponctuel : debug de la détection de colonnes
└── corpus_aecbot/                 toutes les données, brutes et générées (voir son CLAUDE.md)
    ├── CLAUDE.md                 conventions de ce dossier de données
    ├── index.csv                 inventaire des pages WP incluses/exclues (111 lignes)
    ├── inventaire_complet.json   réponse brute de l'API WP (y compris contenu exclu, 2,2 Mo)
    ├── GPT_programme_01.md       pages WP seules, regroupées pour import GPT direct (280 Ko)
    ├── GPT_programme_02.md       suite du précédent si > 300k caractères (220 Ko)
    ├── markdown/                 1 fichier Markdown par page/article WP retenu (69 fichiers)
    ├── pdf_manifest.json         liste des PDF téléchargés + métadonnées WP
    ├── pdfs/                     PDF bruts téléchargés — 75 fichiers, 265 Mo
    │                             ⚠️ gitignoré : régénérable via `python3 download_pdfs.py`
    ├── extraction_manifest.json  statut d'extraction (ok/empty/error) par PDF
    ├── pdf_markdown/             texte extrait par PDF, pages balisées `## Page N` (76 fichiers :
    │                             75 extractions + 1 backup `.original.md`, voir caveat ci-dessous)
    ├── gpt_manifest.json         provenance complète par document : inclus ou non, raison si
    │                             exclu, fichier(s) de destination — fichier à consulter avant de
    │                             se fier à la classification par nom de fichier
    └── gpt/                      livrable final, prêt à importer dans un Custom GPT (10 fichiers,
                                   3,4 Mo) : AEC_00_LIRE_AVANT_IMPORT.md (règles de lecture, à lire
                                   en premier) + AEC_{01_programme,02_livrets,03_plans,
                                   04_publications_2026}_NN.md
```

### Ce qui est exclu par défaut (voir `gpt_manifest.json`)

`build_corpus.py` exclut par défaut, documenté par document avec sa raison exacte dans
`gpt_manifest.json` :
- l'**archive NFP 2024** (programme d'une autre coalition, pas une édition de l'AEC) — réactivable
  avec `--include-archives` ;
- les **dossiers de presse et documents non classés** (4 dossiers de presse + 1 lettre) —
  réactivables avec `--include-other` ;
- **8 PDF strictement en double** (même contenu, uploadés deux fois sous deux ids WordPress
  différents) ;
- **1 PDF dont l'extraction n'est pas exploitable** (programme abrégé FALC).

Rien de tout cela n'a besoin d'être nettoyé à la main : c'est déjà filtré hors de `gpt/` et la
raison de chaque exclusion est tracée dans `gpt_manifest.json`.

### Caveat connu : `15699_A5-PROGRAMME-SITE.original.md`

Ce fichier dans `pdf_markdown/` est une sauvegarde de l'extraction d'origine, créée par
`fix_programme.py` avant de ré-extraire ce PDF en deux colonnes. C'est la version **sans** le
suffixe `.original` qui est effectivement référencée par les manifests et utilisée dans `gpt/`.

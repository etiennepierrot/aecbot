#!/usr/bin/env python3
"""Compare le site melenchon2027.fr en ligne aux manifests déjà committés
(data/index.csv pour les pages/articles, data/pdf_manifest.json pour les PDF)
et signale le contenu *programmatique* nouveau ou modifié depuis la dernière
collecte : pages sous /programme/ (même filtre que collecte_wp.py) + PDF
(livrets, plans, programme). Les pages hors programme (agenda, actus de
campagne...) sont ignorées.

Ne télécharge et n'écrit rien : seulement des appels API légers (id + date de
modification, sans le contenu), pour savoir si ça vaut le coup de relancer le
pipeline complet sans avoir à le faire pour vérifier.

Usage : python3 pipeline/check_updates.py   (depuis la racine du repo)
Code de sortie : 0 si rien de nouveau, 1 si du contenu nouveau/modifié a été trouvé.
"""
import csv
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

BASE = 'https://melenchon2027.fr'
API = BASE + '/wp-json/wp/v2'
DATA = Path('data')
# Même filtre que collecte_wp.py : seules les pages sous /programme/ sont du contenu
# programmatique ; le reste (agenda, actus de campagne...) est hors-sujet ici.
PROGRAMME_PREFIX = '/programme/'
SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'AECBotUpdateCheck/1.0 (public research; respectful rate limit)', 'Accept': 'application/json'})


def get_json(url, params=None):
    for attempt in range(4):
        try:
            r = SESSION.get(url, params=params, timeout=35)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json(), r.headers
        except (requests.RequestException, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError('Trop de tentatives: ' + url)


def fetch_all(kind, fields):
    result = []
    page = 1
    while True:
        items, headers = get_json(f'{API}/{kind}', {'per_page': 100, 'page': page, '_fields': fields})
        if not isinstance(items, list):
            raise ValueError(f'Réponse inattendue pour {kind}, page {page}')
        result.extend(items)
        if page >= int(headers.get('X-WP-TotalPages', '1')):
            break
        page += 1
        time.sleep(0.2)
    return result


def load_known_pages():
    path = DATA / 'index.csv'
    known = {}
    if path.is_file():
        with path.open(encoding='utf-8') as f:
            for row in csv.DictReader(f):
                if row.get('id'):
                    known[int(row['id'])] = row.get('modified', '')
    return known


def load_known_pdfs():
    path = DATA / 'pdf_manifest.json'
    known = {}
    if path.is_file():
        for d in json.loads(path.read_text(encoding='utf-8')):
            known[d['id']] = d.get('modified', '')
    return known


def show(label, rows, with_dates=False):
    if not rows:
        return
    print(f"=== {label} ({len(rows)}) ===")
    for r in rows:
        if with_dates:
            pid, title, url, old, new = r
            print(f"  [{pid}] {title}\n      {url}\n      modifié : {old} -> {new}")
        else:
            pid, title, url = r
            print(f"  [{pid}] {title}\n      {url}")
    print()


def main():
    if not (DATA / 'index.csv').is_file() or not (DATA / 'pdf_manifest.json').is_file():
        print("data/index.csv ou data/pdf_manifest.json introuvable : lancer d'abord le pipeline complet"
              " (voir pipeline/README.md) avant de pouvoir comparer.")
        sys.exit(2)

    known_pages = load_known_pages()
    known_pdfs = load_known_pdfs()

    all_pages = fetch_all('pages', 'id,modified,title,link') + fetch_all('posts', 'id,modified,title,link')
    live_pages = [p for p in all_pages if urlparse(p.get('link', '')).path.startswith(PROGRAMME_PREFIX)]
    live_media = fetch_all('media', 'id,modified,title,source_url,mime_type')
    live_pdfs = [m for m in live_media if m.get('mime_type') == 'application/pdf']

    new_pages, changed_pages = [], []
    for item in live_pages:
        pid = item['id']
        title = item.get('title', {}).get('rendered', '')
        modified = item.get('modified', '') or ''
        if pid not in known_pages:
            new_pages.append((pid, title, item.get('link', '')))
        elif known_pages[pid] and modified > known_pages[pid]:
            changed_pages.append((pid, title, item.get('link', ''), known_pages[pid], modified))

    new_pdfs, changed_pdfs = [], []
    for item in live_pdfs:
        pid = item['id']
        title = item.get('title', {}).get('rendered', '')
        modified = item.get('modified', '') or ''
        url = item.get('source_url', '')
        if pid not in known_pdfs:
            new_pdfs.append((pid, title, url))
        elif known_pdfs[pid] and modified > known_pdfs[pid]:
            changed_pdfs.append((pid, title, url, known_pdfs[pid], modified))

    print(f"Pages programmatiques (/programme/) en ligne : {len(live_pages)}")
    print(f"PDF en ligne : {len(live_pdfs)} (déjà connus : {len(known_pdfs)})")
    print()

    show("Nouvelles pages programmatiques", new_pages)
    show("Pages programmatiques modifiées", changed_pages, with_dates=True)
    show("Nouveaux PDF", new_pdfs)
    show("PDF modifiés", changed_pdfs, with_dates=True)

    total = len(new_pages) + len(changed_pages) + len(new_pdfs) + len(changed_pdfs)
    if total == 0:
        print("Rien de nouveau : le corpus committé est à jour.")
        sys.exit(0)
    print(f"-> {total} élément(s) programmatique(s) à (re)collecter. Relancer le pipeline complet (voir pipeline/README.md).")
    sys.exit(1)


if __name__ == '__main__':
    main()

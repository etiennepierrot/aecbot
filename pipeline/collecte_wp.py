#!/usr/bin/env python3
"""Collecte les contenus programmatiques publics depuis l'API WordPress.

Installation : python3 -m pip install requests beautifulsoup4 markdownify
Exécution : python3 collecte_wp.py
"""
import csv
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md

BASE = 'https://melenchon2027.fr'
API = BASE + '/wp-json/wp/v2'
OUT = Path('data')
ARTIFACTS = Path('artifacts')
# Garder uniquement les URL appartenant au programme ; adapter au besoin.
PROGRAMME_PREFIX = '/programme/'
SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'AECBotCorpusCollector/1.0 (public research; respectful rate limit)', 'Accept': 'application/json'})


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


def collect_type(kind):
    result = []
    page = 1
    while True:
        items, headers = get_json(f'{API}/{kind}', {'per_page': 100, 'page': page, '_fields': 'id,date,modified,slug,link,title,content,type,parent,categories'})
        if not isinstance(items, list):
            raise ValueError(f'Réponse inattendue pour {kind}, page {page}')
        result.extend(items)
        print(f'{kind}: page {page}, {len(items)} entrées, total {len(result)}')
        if page >= int(headers.get('X-WP-TotalPages', '1')):
            break
        page += 1
        time.sleep(0.4)
    return result


def html_to_markdown(html):
    soup = BeautifulSoup(html or '', 'html.parser')
    for tag in soup.select('script,style,nav,form,button'):
        tag.decompose()
    # Les tableaux et listes sont conservés par markdownify.
    text = md(str(soup), heading_style='ATX', bullets='-', strip=['img']).strip()
    return re.sub(r'\n{4,}', '\n\n\n', text)


def safe_name(value):
    return re.sub(r'[^a-z0-9_-]+', '-', value.lower()).strip('-')[:90] or 'document'


def main():
    OUT.mkdir(exist_ok=True)
    raw_dir = OUT / 'markdown'
    raw_dir.mkdir(exist_ok=True)
    all_items = []
    for kind in ('pages', 'posts'):
        try:
            all_items += collect_type(kind)
        except Exception as exc:
            print(f'ERREUR {kind}: {exc}')
    (OUT / 'inventaire_complet.json').write_text(json.dumps(all_items, ensure_ascii=False, indent=2), encoding='utf-8')

    kept = []
    excluded = []
    for item in all_items:
        url = item.get('link') or ''
        path = urlparse(url).path
        title = BeautifulSoup(item.get('title', {}).get('rendered', ''), 'html.parser').get_text(' ', strip=True)
        html = item.get('content', {}).get('rendered', '')
        body = html_to_markdown(html)
        record = {'id': item.get('id'), 'type': item.get('type'), 'title': title, 'url': url,
                  'modified': item.get('modified', ''), 'characters': len(body), 'status': ''}
        if not path.startswith(PROGRAMME_PREFIX) or len(body) < 100:
            record['status'] = 'exclu_hors_programme_ou_vide'
            excluded.append(record)
            continue
        filename = f"{item.get('id')}-{safe_name(item.get('slug', 'document'))}.md"
        document = f"# {title}\n\nSource : {url}\nID WordPress : {item.get('id')}\nDernière modification : {item.get('modified', '')}\nCollecté le : {datetime.now(timezone.utc).isoformat()}\n\n---\n\n{body}\n"
        (raw_dir / filename).write_text(document, encoding='utf-8')
        record.update({'status': 'inclus', 'file': filename})
        kept.append((record, document))

    rows = [r for r, _ in kept] + excluded
    with (OUT / 'index.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['id', 'type', 'title', 'url', 'modified', 'characters', 'status', 'file'], extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)

    # Packager en maximum 20 fichiers de ~300 000 caractères chacun.
    groups = []
    current = []
    size = 0
    for record, doc in sorted(kept, key=lambda x: x[0]['url']):
        if current and size + len(doc) > 300_000:
            groups.append(current)
            current, size = [], 0
        current.append(doc)
        size += len(doc)
    if current:
        groups.append(current)
    if len(groups) > 20:
        print('ATTENTION: plus de 20 groupes; ajuster le regroupement avant import dans un Custom GPT.')
    ARTIFACTS.mkdir(exist_ok=True)
    for n, docs in enumerate(groups, 1):
        (ARTIFACTS / f'GPT_programme_{n:02d}.md').write_text('\n\n\n---\n\n\n'.join(docs), encoding='utf-8')
    print(f'\nTerminé : {len(kept)} documents inclus, {len(excluded)} exclus, {len(groups)} fichiers GPT.')
    print(f'Voir {OUT}/index.csv et {OUT}/inventaire_complet.json pour vérifier la couverture.')
    print('IMPORTANT: la collecte des pages/posts ne garantit pas que tous les livrets PDF et mesures existent dans cette API.')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Build AECBot Custom GPT knowledge files from data/extraction_manifest.json.
Python 3.9+, standard library only. Does not modify original documents.
"""
import argparse
import hashlib
import html
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

# Categories are intentionally documentary rather than inferred policy topics.
CATEGORY = {
    'programme': '01_programme',
    'livret': '02_livrets',
    'plan': '03_plans',
    'recent': '04_publications_2026',
    'archive': '05_archives',
    'other': '06_autres',
}

def classify(d):
    title = html.unescape(d.get('title', '')).lower()
    url = d.get('url', '').lower()
    name = urlparse(url).path.rsplit('/', 1)[-1].lower()
    if 'programme-front-populaire' in name:
        return 'archive', 'Contrat du Nouveau Front populaire (2024), distinct du programme LFI'
    if 'dossier-de-presse' in name or 'lettre-aux-enseignants' in name:
        return 'other', 'Document de communication'
    if 'a5-programme-site' in name:
        return 'programme', 'Programme général (édition exacte à confirmer)'
    if 'programme-abrege' in name:
        return 'programme', 'Programme abrégé'
    if 'livret' in name or 'ass-livret' in name:
        return 'livret', 'Livret thématique (édition à confirmer)'
    if 'plan_up_' in name or 'plan-europe_' in name or 'plan_up_' in title:
        return 'plan', 'Plan thématique (édition à confirmer)'
    if '/2026/' in url:
        return 'recent', 'Publication mise en ligne en 2026 (date de rédaction à confirmer)'
    return 'other', 'Document non classé automatiquement'

def clean_body(text):
    # Keep the page markers; remove generated front matter only.
    marker = re.search(r'^---\s*$', text, re.MULTILINE)
    return text[marker.end():].strip() if marker else text.strip()

def norm(text):
    return re.sub(r'\s+', ' ', text).strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-root', default='data', help='Where extraction_manifest.json and the extracted markdown live')
    parser.add_argument('--out-root', default='artifacts', help='Where gpt/ and gpt_manifest.json are written')
    parser.add_argument('--max-kib', type=int, default=450, help='Maximum UTF-8 file size per knowledge file')
    parser.add_argument('--include-archives', action='store_true', help='Include NFP historical document')
    parser.add_argument('--include-other', action='store_true', help='Include press and unclassified documents')
    args = parser.parse_args()
    root = Path(args.data_root)
    out_root = Path(args.out_root)
    manifest_path = root / 'extraction_manifest.json'
    if not manifest_path.is_file():
        parser.error('Missing ' + str(manifest_path))
    docs = json.loads(manifest_path.read_text(encoding='utf-8'))
    out = out_root / 'gpt'
    out.mkdir(parents=True, exist_ok=True)
    # Clear only files this script previously generated.
    for path in out.glob('AEC_*.md'):
        path.unlink()
    records = []
    seen = {}
    for d in docs:
        record = {k: d.get(k) for k in ('id', 'title', 'url', 'modified', 'file', 'markdown', 'pages', 'characters', 'status')}
        category, note = classify(d)
        record.update(category=category, note=note, included=False, reason='')
        if d.get('status') != 'ok':
            record['reason'] = 'Extraction non exploitable'
        elif not d.get('markdown') or not Path(d['markdown']).is_file():
            record['reason'] = 'Markdown introuvable'
        else:
            body = clean_body(Path(d['markdown']).read_text(encoding='utf-8'))
            if not body:
                record['reason'] = 'Texte vide'
            else:
                digest = hashlib.sha256(norm(body).encode('utf-8')).hexdigest()
                record['sha256_normalized_body'] = digest
                if digest in seen:
                    record['reason'] = 'Doublon exact de ' + str(seen[digest])
                else:
                    seen[digest] = d.get('id')
                    if category == 'archive' and not args.include_archives:
                        record['reason'] = 'Archive exclue par défaut'
                    elif category == 'other' and not args.include_other:
                        record['reason'] = 'Document secondaire/non classé exclu par défaut'
                    else:
                        record['included'] = True
                        record['_body'] = body
        records.append(record)

    selected = [r for r in records if r['included']]
    selected.sort(key=lambda r: (list(CATEGORY).index(r['category']), 0 if r['category'] == 'programme' else 1, str(r['title'])))
    max_bytes = args.max_kib * 1024
    files = []
    buffers = defaultdict(list)
    for r in selected:
        category = r['category']
        header = (f"# DOCUMENT : {html.unescape(r['title'] or '')}\n\n"
                  f"ID source : WP-{r['id']}\n\n"
                  f"Type : {category}\n\n"
                  f"Statut documentaire : {r['note']}\n\n"
                  f"URL source : {r['url']}\n\n"
                  f"Dernière modification WordPress : {r.get('modified') or 'inconnue'}\n\n"
                  f"Pages PDF : {r.get('pages') or 'inconnu'}\n\n"
                  "Les sections « Page N » indiquent les pages du PDF, pas forcément les pages imprimées.\n\n---\n\n")
        content = header + r['_body'] + '\n\n'
        # Split only at page markers when document exceeds target size.
        pieces = re.split(r'(?=^## Page \d+\s*$)', content, flags=re.MULTILINE)
        if len(content.encode('utf-8')) <= max_bytes:
            chunks = [content]
        else:
            chunks, chunk = [], pieces[0]
            for part in pieces[1:]:
                if len((chunk + part).encode('utf-8')) > max_bytes and chunk.strip():
                    chunks.append(chunk)
                    chunk = header + '[Suite du document ; pagination conservée]\n\n' + part
                else:
                    chunk += part
            if chunk.strip():
                chunks.append(chunk)
        for idx, chunk in enumerate(chunks, 1):
            if len(chunk.encode('utf-8')) > max_bytes:
                raise RuntimeError('A page exceeds --max-kib; increase limit: ' + str(r['title']))
            buffers[category].append((r, idx, len(chunks), chunk))

    file_no = Counter()
    for category in CATEGORY:
        current = ''
        assigned = []
        def flush():
            nonlocal current, assigned
            if not assigned:
                return
            file_no[category] += 1
            filename = f"AEC_{CATEGORY[category]}_{file_no[category]:02}.md"
            (out / filename).write_text(current, encoding='utf-8')
            files.append({'file': filename, 'bytes': len(current.encode('utf-8')), 'documents': sorted(set(x[0]['id'] for x in assigned))})
            for rec, part_no, parts, _ in assigned:
                rec.setdefault('knowledge_files', []).append({'file': filename, 'part': part_no, 'parts': parts})
            current, assigned = '', []
        for item in buffers[category]:
            chunk = item[3]
            if current and len((current + chunk).encode('utf-8')) > max_bytes:
                flush()
            current += chunk + '\n\n'
            assigned.append(item)
        flush()

    for r in records:
        r.pop('_body', None)
    (out_root / 'gpt_manifest.json').write_text(json.dumps({'documents': records, 'knowledge_files': files}, ensure_ascii=False, indent=2), encoding='utf-8')
    readme = '''# AECBot — règles documentaires\n\n- Le programme général est une référence **provisoire** : vérifier l'édition et l'éventuelle publication d'une version plus récente.\n- Distinguer programme général, livrets, plans, publications 2026 et archives.\n- La date `modified` est la date WordPress, **pas** une preuve de date de rédaction ni d'adoption.\n- Citer le titre, l'URL source et la page PDF (repère `## Page N`).\n- Ne jamais inventer une mesure ou une citation. Signaler les contradictions entre éditions.\n- Les archives du NFP sont exclues par défaut : utiliser `--include-archives` pour les ajouter.\n- Les dossiers de presse et documents non classés sont exclus par défaut.\n- La classification par nom de fichier est indicative : réviser `gpt_manifest.json` avant diffusion.\n'''
    (out / 'AEC_00_LIRE_AVANT_IMPORT.md').write_text(readme, encoding='utf-8')
    print(f"Documents source : {len(records)} | inclus : {len(selected)} | exclus : {len(records)-len(selected)}")
    print(f"Fichiers de connaissances : {len(files) + 1} (dont notice)")
    for f in files:
        print(f"  {f['file']} : {f['bytes']/1024:.1f} Kio")
    if len(files) + 1 > 20:
        print('ATTENTION : plus de 20 fichiers. Augmenter --max-kib ou sélectionner un sous-ensemble.')
    print('Manifeste :', out_root / 'gpt_manifest.json')
    print('Vérifier les catégories et les exclusions avant import.')

if __name__ == '__main__':
    main()

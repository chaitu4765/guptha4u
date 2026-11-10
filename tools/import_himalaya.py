"""Load the reviewed Himalaya snapshot into a selected private demo database."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from datetime import date, datetime
from decimal import Decimal
import json
from pathlib import Path
import re
import sqlite3
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import DB, connect, init
from storefront import CATEGORIES, HIMALAYA_PERMISSION, himalaya_image, product_image


BASE = 'https://www.himalayafineart.com'
SOURCE_TYPES = {title.upper(): key for key, (title, _) in CATEGORIES.items()}
SOURCE_TYPES.update({'EASEL': 'easels', 'CASTORS': 'easels', 'PAPER & PADS': 'papers',
                     'PAINTS & MEDIUMS-OTHER': 'paints'})
REVIEWED = (
    'Camel Artist Acrylic in Crimson Lake 063. Series 3, 40 ml tube. Mix with water or acrylic medium.',
    'Camel Artist Acrylic in Titanium White 423. Series 1, 40 ml tube. Mix with water or acrylic medium.',
    'Camel Artist Acrylic in Black 016. Series 1, 40 ml tube. Mix with water or acrylic medium.',
    'Two Aquafine watercolour half pans in Cobalt Blue Hue and Phthalo Blue. Set 012.',
    'One half pan of Schmincke Horadam Aquarell watercolour in Lemon Yellow 14215, Series 1.',
    'Two Aquafine watercolour half pans in Viridian Hue and Leaf Green. Set 014.',
    'Cyprus Series 2006 Mop Dagger painting brush, size No. 2.',
    'Cyprus Series 3004 fan painting brush with Tejin fibres, size No. 4.',
    'Himalaya Professional stretched canvas in a square 6 × 6 in format.',
    'Camel painting canvas mounted on an 8 × 8 in board.',
    'Spiral-bound Renaissance R-111 travel watercolour pad. 20 sheets of 200 gsm paper, 7.5 × 11 in.',
    'Fabriano Accademia A4 glued drawing pad. 30 sheets of 200 gsm paper. Manufacturer code 41202129.',
    'Sakura Pigma Micron 01 black fineliner. 0.25 mm tip, colour 49, manufacturer code XSDK0149.',
    'Daler-Rowney Simply Box Easel, model 835200020. Tabletop easel with a storage compartment.',
)


def read(path):
    return json.loads(path.read_bytes())


def tag_key(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.casefold()).strip()


def label(value):
    value = value.title() if value.isupper() else value
    return (value.replace('Sharpners', 'Sharpeners').replace('Tempra', 'Tempera')
            .replace('Guilding', 'Gilding').replace('Other - PAINTS & MEDIUMS', 'Other Paints & Mediums'))


def collections(stage):
    by_id = defaultdict(set)
    by_tag = defaultdict(set)
    missing = set()
    for category, group, leaf, url in read(stage / 'navigation.json'):
        original_group, original_leaf = group, leaf
        group, leaf = label(group), label(leaf)
        item = (category, group, leaf)
        handle = url.rsplit('/', 1)[1]
        source = stage / f'collection-{handle}.json'
        if source.is_file():
            for product_id in read(source):
                by_id[product_id].add(item)
        else:
            missing.add(handle)
        names = {tag_key(original_leaf or original_group), tag_key(handle)}
        if original_leaf:
            names.add(tag_key(original_group + ' ' + original_leaf))
        for name in names:
            by_tag[name].add(item)
            if name.endswith(' open stock'):
                plain = name.removesuffix(' open stock')
                by_tag[plain].add(item)
                if plain.endswith(('pads', 'brushes', 'colours')):
                    by_tag[plain[:-1]].add(item)
            elif not name.endswith(' sets'):
                by_tag[name + ' open stock'].add(item)
                by_tag[name + ' sets'].add(item)
    return by_id, by_tag, missing


def photo(product, variant, photo_uses, supplier_codes):
    candidates = [variant.get('featured_image') or {}]
    candidates += [image for image in product['images']
                   if len(product['variants']) == 1 or variant['id'] in image['variant_ids']]
    sku = (variant['sku'] or '').upper()
    for candidate in candidates:
        url = candidate.get('src', '')
        if not himalaya_image(url):
            continue
        parts = urlsplit(url)
        named_skus = set(re.findall(r'(?<![A-Z0-9])A[0-9]{8}(?![0-9])', parts.path.upper()))
        # An exact filename can resolve a shared file. A second live SKU is conflicting evidence.
        if sku not in named_skus and (photo_uses[parts.path] > 1 or named_skus & supplier_codes):
            continue
        params = dict(parse_qsl(parts.query))
        params['width'] = '560'
        return urlunsplit(parts._replace(query=urlencode(params)))
    return ''


def description(name, brand, group, leaf):
    # The source often omits descriptions or describes the whole product line.
    # Use explicit attributes of this listing, never text from a different size or shade.
    dimensions = re.findall(
        r'\b\d+(?:\.\d+)?\s*(?:[x×]\s*\d+(?:\.\d+)?\s*)?'
        r'(?:ml|mm|cm|gsm|sheets?|pages?|grams?|pcs?|inches)\b|\bA[0-7]\b'
        r'|\b\d+(?:\.\d+)?"\s*[x×]\s*\d+(?:\.\d+)?"|\bset of \d+\b', name, re.I)
    codes = re.findall(r'\b(?:no\.?|sr\.?|series)\s*\d+[a-z]?(?=\b)', name, re.I)
    properties = re.findall(
        r'\b(?:100\s*%\s*cotton|acid[ -]free|(?:cold|hot)[ -]press(?:ed)?|fine grain|medium grain'
        r'|synthetic bristles?|hog hair|water[ -]based|alcohol[ -]based|deckle edge|lightfast)\b',
        name, re.I)
    model = re.search(r'\(([A-Za-z0-9.,/-]*[0-9][A-Za-z0-9.,/-]*)\)\s*$', name)
    facts = []
    if brand:
        facts.append(f'Brand: {brand}.')
    if leaf or group:
        facts.append(f'Product type: {leaf or group}.')
    if dimensions:
        facts.append('Listed specifications: ' + ', '.join(dict.fromkeys(dimensions)).lower() + '.')
    if properties:
        facts.append('Listed materials or finish: ' + ', '.join(dict.fromkeys(properties)).lower() + '.')
    if codes:
        facts.append('Series or size: ' + ', '.join(dict.fromkeys(codes)) + '.')
    if model:
        facts.append(f'Product code: {model[1]}.')
    return ' '.join(facts)


def run(stage, checked):
    if not DB.is_file() or DB.resolve() == (ROOT / 'data/retail.sqlite3').resolve():
        raise SystemExit('Set GUPTHA_DB to the existing dedicated demo database before importing.')
    products = {product['handle']: product for file in sorted(stage.glob('page-*.json'))
                for product in read(file)['products']}
    expected = set(read(stage / 'sitemap-products.json'))
    if not expected or set(products) != expected:
        raise SystemExit('The staged feed does not match the product sitemap. Refresh the snapshot before importing.')
    refs = read(ROOT / 'reference/demo-products.json')
    existing = {r['source_sku']: (r, REVIEWED[i]) for i, r in enumerate(refs)}
    photo_uses = Counter(path for product in products.values()
                        for path in {urlsplit(image['src']).path for image in product['images']})
    supplier_codes = {v['sku'].upper() for product in products.values() for v in product['variants'] if v['sku']}
    by_id, by_tag, missing = collections(stage)
    backup = DB.with_name(DB.name + '.before-himalaya-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    with closing(sqlite3.connect(DB)) as source, closing(sqlite3.connect(backup)) as destination:
        source.backup(destination)
    init()
    counts = defaultdict(int)
    photo_review = []
    with closing(connect()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        current = {p['sku']: dict(p) for p in conn.execute('SELECT * FROM products')}
        linked = {p['source_id']: p for p in current.values() if p['source_id'] is not None}
        for handle, product in products.items():
            source_type = product['product_type'].strip().upper()
            tags = {tag_key(tag) for tag in product['tags']}
            tags.update(tag_key(part) for tag in product['tags'] if '.' in tag for part in tag.split('.'))
            groups = set(by_id[product['id']])
            category = SOURCE_TYPES.get(source_type) or next(
                (key for title, key in SOURCE_TYPES.items() if tag_key(title) in tags), '')
            if not category:
                category = min((item[0] for item in groups), default='accessories')
            if not any(key == category and leaf for key, _, leaf in groups):
                groups.update(item for tag in tags for item in by_tag[tag] if item[0] == category)
            primary = sorted((item for item in groups if item[0] == category), key=lambda item: (not item[2], item[1:]))
            group, leaf = primary[0][1:] if primary else ('', '')
            if not group and source_type == 'PAINTS & MEDIUMS-OTHER':
                group = 'Other Paints & Mediums'
            if not primary:
                groups.add((category, group, ''))
            for variant in product['variants']:
                supplier_sku = (variant['sku'] or '').strip()
                ref, reviewed = existing.get(supplier_sku, ({}, ''))
                if ref and ref['reference_url'].rsplit('/', 1)[1] != handle:
                    raise ValueError(f'Existing ERP SKU {ref["sku"]} has a conflicting supplier listing.')
                sku = ref.get('sku') or f'HFA-{supplier_sku or variant["id"]}'
                previous = linked.get(variant['id']) or current.get(sku)
                if previous and previous['source_id'] not in (None, variant['id']):
                    raise ValueError(f'Supplier code {sku} belongs to two different products.')
                name = ' '.join(product['title'].split())
                option = variant['title'] if variant['title'] != 'Default Title' else ''
                if option:
                    name += ' · ' + option
                if supplier_sku == 'A00018110':
                    name = 'Daler-Rowney System3 Textile Printing Medium 250 ml (128237022)'
                brand = ref.get('brand') or product['vendor'].strip()
                available = int(variant['available'])
                price = int(Decimal(variant['price']) * 100)
                compare = int(Decimal(variant['compare_at_price'] or 0) * 100)
                mrp = compare if compare > price else 0
                if not price > 0:
                    raise ValueError(f'Unexpected price for {sku}.')
                url = f'{BASE}/products/{handle}'
                if len(product['variants']) > 1:
                    url += f'?variant={variant["id"]}'
                image = photo(product, variant, photo_uses, supplier_codes)
                source, permission = (url, HIMALAYA_PERMISSION) if image else ('', '')
                if (previous and previous['image_verified'] and previous['image_license'] != HIMALAYA_PERMISSION
                        and product_image(previous['image']) == previous['image']):
                    image, source, permission = (previous[key] for key in ('image', 'image_source', 'image_license'))
                counts['products'] += 1
                counts['photos'] += bool(image)
                if not image:
                    photo_review.append({'sku': sku, 'product': ref.get('name', name), 'source': url,
                                         'reason': 'Source image is shared or has a conflicting SKU' if product['images']
                                         else 'Source listing has no photo'})
                counts['in_stock'] += available
                counts['classified'] += bool(group)
                fields = {
                    'name': ref.get('name', name), 'sku': previous['sku'] if previous else sku,
                    'category': category, 'brand': brand, 'subcategory': group,
                    'variant': ref.get('variant', option), 'price': price, 'mrp': mrp,
                    'description': reviewed or description(name, brand, group, leaf),
                    'image': image, 'image_source': source, 'image_license': permission,
                    'image_verified': int(bool(image)), 'reference_url': url, 'reference_date': checked,
                    'source_id': variant['id'], 'source_sku': supplier_sku, 'source_available': available,
                    'catalogue_groups': json.dumps(sorted(groups), ensure_ascii=False, separators=(',', ':')),
                }
                if previous:
                    fields['featured_discount'] = int(bool(previous['featured_discount']) and mrp > 0
                                                      and (mrp - price) * 5 >= mrp)
                    assignments = ','.join(f'{field}=?' for field in fields)
                    conn.execute(f'UPDATE products SET {assignments} WHERE id=?', (*fields.values(), previous['id']))
                    counts['updated'] += 1
                else:
                    fields['published'] = 0
                    conn.execute(f'INSERT INTO products({",".join(fields)}) VALUES ({",".join("?" for _ in fields)})',
                                 tuple(fields.values()))
        saved = conn.execute('SELECT COUNT(*) FROM products WHERE source_id IS NOT NULL').fetchone()[0]
        if saved < counts['products']:
            raise ValueError('The import did not preserve every source variant.')
    print(dict(counts))
    print(f'{len(missing)} collection routes unavailable. Unlisted products use matching source tags where possible.')
    print(f'ERP backup: {backup}')
    (stage / 'photo-review.json').write_text(json.dumps(photo_review, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('snapshot', type=Path)
    cli.add_argument('--checked', default=date.today().isoformat(), type=lambda day: date.fromisoformat(day).isoformat())
    args = cli.parse_args()
    run(args.snapshot, args.checked)

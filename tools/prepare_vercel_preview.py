"""Build a storefront-only Vercel preview from a local catalogue snapshot."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import shutil
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from storefront import ASSETS, PRODUCT_FIELDS, media_file
from storefront_search import init_search


def prepare(source, target):
    with closing(sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)) as inventory:
        if not inventory.execute('SELECT 1 FROM products WHERE archived=0 LIMIT 1').fetchone():
            raise ValueError('The selected catalogue has no active products.')

    target.mkdir()
    (target / 'data').mkdir()
    (target / 'reference').mkdir()
    with closing(sqlite3.connect(target / 'data' / 'retail.sqlite3', uri=True)) as snapshot, snapshot:
        snapshot.execute('ATTACH DATABASE ? AS inventory', (source.resolve().as_uri() + '?mode=ro',))
        snapshot.execute(f'''CREATE TABLE products AS SELECT {PRODUCT_FIELDS}, archived
            FROM inventory.products WHERE archived=0''')
        snapshot.execute('CREATE UNIQUE INDEX product_id ON products(id)')
        snapshot.execute('''CREATE TABLE settings AS SELECT id, announcement, announcement_link,
            announcement_start, announcement_end, announcement_active FROM inventory.settings''')
        init_search(snapshot)
        image_names = [row[0].removeprefix('/storefront/media/') for row in snapshot.execute(
            "SELECT DISTINCT image FROM products WHERE image_verified=1 AND image LIKE '/storefront/media/%'")]
        count = snapshot.execute('SELECT count(*) FROM products').fetchone()[0]

    for filename in ('storefront.py', 'storefront_accounts.py', 'storefront_checkout.py', 'storefront_search.py'):
        shutil.copy2(ROOT / filename, target / filename)
    shutil.copy2(ROOT / 'reference' / 'catalogue-navigation.json', target / 'reference')
    assets = target / 'public' / 'storefront'
    shutil.copytree(ASSETS, assets, ignore=shutil.ignore_patterns('media'))
    for name in image_names:
        if source_image := media_file(name):
            (assets / 'media').mkdir(exist_ok=True)
            shutil.copy2(source_image, assets / 'media' / name)

    (target / 'requirements.txt').write_text('Flask>=3.1,<4\n', encoding='utf-8')
    (target / '.python-version').write_text('3.12\n', encoding='utf-8')
    config = {'framework': 'flask', 'functions': {'app.py': {
        'includeFiles': '{data/retail.sqlite3,reference/catalogue-navigation.json,public/storefront/**}'}}}
    (target / 'vercel.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
    (target / 'app.py').write_text('''import os
from flask import Flask

os.environ['GUPTHA_CATALOGUE_PREVIEW'] = '1'
if host := os.environ.get('VERCEL_URL'):
    os.environ.setdefault('GUPTHA_PUBLIC_ORIGIN', 'https://' + host)

from storefront import application

app = Flask(__name__, static_folder=None)
app.wsgi_app = application
''', encoding='utf-8')
    print(f'Prepared {count:,} products for a protected preview at {target.resolve()}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalogue', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    prepare(args.catalogue, args.output)

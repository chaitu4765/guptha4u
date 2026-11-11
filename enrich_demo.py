"""Apply the reviewed reference snapshot to existing demo SKUs, preserving IDs and stock."""
from contextlib import closing
from datetime import datetime
import json
from pathlib import Path
import sqlite3

from server import DB, connect, init


def enrich():
    if not DB.is_file():
        raise RuntimeError('Select an existing demo database with GUPTHA_DB first.')
    backup = DB.with_name(DB.name + '.before-reference-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    with closing(sqlite3.connect(DB)) as original, closing(sqlite3.connect(backup)) as copy:
        original.backup(copy)
    rows = json.loads((Path(__file__).parent / 'reference/demo-products.json').read_text(encoding='utf-8'))
    init()
    with closing(connect()) as c, c:
        c.execute('BEGIN IMMEDIATE')
        before = [tuple(row) for row in c.execute('SELECT id,sku,stock FROM products ORDER BY id')]
        for row in rows:
            if not c.execute('SELECT id FROM products WHERE sku=?', (row['sku'],)).fetchone():
                continue
            c.execute('''UPDATE products SET name=?,brand=?,category=?,subcategory=?,variant=?,price=?,mrp=?,
                         reference_url=?,reference_date=?,description=?,featured_discount=?,image_verified=0
                         WHERE sku=? AND source_id IS NULL''',
                      (row['name'], row['brand'], row['category'], row['subcategory'], row['variant'],
                       row['price'], row['mrp'], row['reference_url'], row['reference_date'],
                       row['name'] + '. ' + row['variant'] + '.',
                       int(row['sku'] == 'DEMO-ART-007'), row['sku']))
        after = [tuple(row) for row in c.execute('SELECT id,sku,stock FROM products ORDER BY id')]
        if before != after:
            raise RuntimeError('Product identity or stock changed. Enrichment rolled back.')
    print('Reference snapshot applied. IDs, SKUs and stock verified. Backup at ' + str(backup))


if __name__ == '__main__':
    enrich()

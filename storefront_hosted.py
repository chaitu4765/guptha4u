"""Persistent writes for the hosted demo, isolated from the ERP catalogue."""
from contextlib import closing
import os
import sqlite3


HOSTED_DEMO = os.environ.get('GUPTHA_HOSTED_DEMO') == '1'
DATABASE_ERRORS = (sqlite3.DatabaseError,)
_initialized = set()

if HOSTED_DEMO:
    from psycopg import Connection, DatabaseError
    from psycopg.rows import dict_row

    DATABASE_ERRORS += (DatabaseError,)

    class HostedConnection(Connection):
        def execute(self, query, params=None, **kwargs):
            return super().execute(query.replace('?', '%s'), params, **kwargs)


def connect_hosted(schema):
    url = os.environ.get('GUPTHA_DATABASE_URL')
    if not url:
        raise sqlite3.OperationalError('The hosted demo database is not configured.')
    conn = HostedConnection.connect(url, row_factory=dict_row, connect_timeout=5)
    if schema not in _initialized:
        try:
            with conn.transaction():
                conn.execute('SELECT pg_advisory_xact_lock(1206080)')
                conn.execute(schema, prepare=False)
        except DATABASE_ERRORS:
            conn.close()
            raise
        _initialized.add(schema)
    return conn


STOCK_SCHEMA = '''CREATE TABLE IF NOT EXISTS demo_stock (
    product_id BIGINT PRIMARY KEY, stock INTEGER NOT NULL CHECK (stock >= 0)
);'''


def apply_hosted_stock(products, conn=None, *, only_ids=False):
    if not HOSTED_DEMO or not products:
        return
    if conn is None:
        with closing(connect_hosted(STOCK_SCHEMA)) as stock_conn:
            apply_hosted_stock(products, stock_conn, only_ids=only_ids)
        return
    sql = 'SELECT product_id, stock FROM demo_stock'
    rows = (conn.execute(sql + ' WHERE product_id = ANY(?)', ([int(p['id']) for p in products],))
            if only_ids else conn.execute(sql))
    updated = {str(row['product_id']): row['stock'] for row in rows}
    for product in products:
        product['stock'] = updated.get(product['id'], product['stock'])

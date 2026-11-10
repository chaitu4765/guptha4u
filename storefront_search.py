"""Product search for both suggestions and catalogue results."""
import re
import unicodedata
from difflib import get_close_matches


FIELDS = ('name', 'sku', 'source_sku', 'brand', 'variant', 'subcategory', 'category')
MEASUREMENT = re.compile(r'(\d+)(ml|mm|cm|gsm|kg|mg)')


def init_search(connection):
    connection.execute('CREATE INDEX IF NOT EXISTS product_sku_search ON products(sku COLLATE NOCASE)')
    connection.execute('CREATE INDEX IF NOT EXISTS product_source_sku_search ON products(source_sku COLLATE NOCASE)')
    if connection.execute("SELECT 1 FROM sqlite_master WHERE name='storefront_search_update'").fetchone():
        return
    columns = ', '.join(FIELDS)
    new_values = ', '.join(f'new.{field}' for field in FIELDS)
    connection.executescript(f"""
        BEGIN;
        CREATE VIRTUAL TABLE storefront_search USING fts5(
            {columns}, tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
        );
        CREATE VIRTUAL TABLE storefront_search_terms USING fts5vocab(storefront_search, 'row');
        INSERT INTO storefront_search(rowid, {columns})
            SELECT id, {columns} FROM products WHERE archived=0;
        CREATE TRIGGER storefront_search_insert AFTER INSERT ON products WHEN new.archived=0 BEGIN
            INSERT INTO storefront_search(rowid, {columns}) VALUES (new.id, {new_values});
        END;
        CREATE TRIGGER storefront_search_delete AFTER DELETE ON products BEGIN
            DELETE FROM storefront_search WHERE rowid=old.id;
        END;
        CREATE TRIGGER storefront_search_update AFTER UPDATE OF {columns}, archived ON products BEGIN
            DELETE FROM storefront_search WHERE rowid=old.id;
            INSERT INTO storefront_search(rowid, {columns})
                SELECT new.id, {new_values} WHERE new.archived=0;
        END;
        COMMIT;
    """)


def search_ids(connection, query, limit=-1):
    if not query:
        return []
    sku_matches = [row[0] for row in connection.execute("""
        SELECT id FROM products WHERE archived=0 AND (sku=? COLLATE NOCASE OR source_sku=? COLLATE NOCASE)
        ORDER BY id LIMIT ?
    """, (query, query, limit))]
    if sku_matches:
        return sku_matches
    normalized = unicodedata.normalize('NFKD', query.casefold())
    normalized = ''.join(letter for letter in normalized if not unicodedata.combining(letter))
    terms = re.findall(r'[^\W_]+', normalized)
    if not terms:
        return []
    terms = re.sub(r'\b(\d+)\s+(ml|mm|cm|gsm|kg|mg)\b', r'\1\2', ' '.join(terms)).split()

    def term_options(term, prefix):
        suffix = '*' if prefix else ''
        options = [f'"{term}"{suffix}']
        measurement = MEASUREMENT.fullmatch(term)
        if measurement:
            amount, unit = measurement.groups()
            options.append(f'"{amount} {unit}"{suffix}')
        if term in ('watercolor', 'watercolour'):
            options.extend(('"water colour"', '"watercolor"', '"watercolour"'))
        return options

    def rank(expression):
        if limit > 0:
            # FTS can stop its ranked scan at the suggestion shortlist.
            candidates = connection.execute("""
                SELECT rowid,name FROM storefront_search
                WHERE storefront_search MATCH ? AND rank MATCH 'bm25(9,14,14,4,5,2,0.8)'
                ORDER BY rank LIMIT ?
            """, (expression, max(48, limit))).fetchall()
            needle = query.casefold()
            def match_order(row):
                name = row[1].casefold()
                return 0 if name == needle else 1 if name.startswith(needle) else 2 if needle in name else 3
            return [row[0] for row in sorted(candidates, key=match_order)[:limit]]
        return [row[0] for row in connection.execute("""
            SELECT rowid FROM storefront_search
            WHERE storefront_search MATCH ?
            ORDER BY CASE WHEN lower(name)=? THEN 1 WHEN instr(lower(name),?)=1 THEN 2
                          WHEN instr(lower(name),?)>0 THEN 3 ELSE 4 END,
                     bm25(storefront_search, 9, 14, 14, 4, 5, 2, 0.8), rowid
            LIMIT ?
        """, (expression, *([query.casefold()] * 3), limit))]

    alternatives = [term_options(term, index == len(terms) - 1) for index, term in enumerate(terms)]
    expression = ' AND '.join('(' + ' OR '.join(options) + ')' for options in alternatives)
    exact = rank(expression)
    if exact:
        return exact

    corrected = []
    changed = False
    for term, options in zip(terms, alternatives):
        if len(term) >= 4 and term.isalpha():
            candidates = [row[0] for row in connection.execute(
                'SELECT term FROM storefront_search_terms WHERE term GLOB ? AND length(term) BETWEEN ? AND ?',
                (term[0] + '*', len(term) - 1, len(term) + 1))]
            matches = [word for word in get_close_matches(term, candidates, n=3, cutoff=.80) if word != term]
            options.extend(f'"{word}"' for word in matches)
            changed |= bool(matches)
        corrected.append('(' + ' OR '.join(options) + ')')
    return rank(' AND '.join(corrected)) if changed else []

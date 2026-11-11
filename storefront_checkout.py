"""Opt-in demo orders, Privilege enrollment and shared inventory updates."""
from contextlib import closing
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
from urllib.parse import urlencode
from storefront_hosted import HOSTED_DEMO, STOCK_SCHEMA, connect_hosted


CHECKOUT_API = '/api/storefront/demo/checkout'
PRIVILEGE_API = '/api/storefront/demo/privilege'
POST_PATHS = {CHECKOUT_API, PRIVILEGE_API}
BODY_LIMIT = 32768
MEMBER_PRICE = 20000
MEMBER_PERCENT = 10
QUALIFYING_SPEND = 250000
DELIVERY_FEE = 7900
PAYMENTS = {'upi': 'Demo UPI', 'card': 'Demo card', 'cod': 'Cash on delivery', 'pickup': 'Pay at pickup'}
WHATSAPP_NUMBER = '917981456043'


def whatsapp_draft(message):
    return f'https://wa.me/{WHATSAPP_NUMBER}?' + urlencode({'text': message})


def demo_path():
    setting = os.environ.get('GUPTHA_DEMO_CHECKOUT_DB')
    return Path(setting).resolve() if setting else None


def demo_enabled():
    return HOSTED_DEMO or demo_path() is not None


def catalogue_path():
    return Path(os.environ.get('GUPTHA_DB', Path(__file__).parent / 'data/retail.sqlite3')).resolve()


CHECKOUT_SCHEMA = """
            CREATE TABLE IF NOT EXISTS demo_applications(
                contact TEXT PRIMARY KEY, created TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS demo_cards(
                contact TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, created TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS demo_orders(
                request_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
                contact TEXT NOT NULL, created TEXT NOT NULL, data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS demo_account_orders(
                account_id TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
                PRIMARY KEY(account_id, reference)
            );
"""


def connect_demo():
    if HOSTED_DEMO:
        return connect_hosted(CHECKOUT_SCHEMA + STOCK_SCHEMA)
    path = demo_path()
    catalogue = catalogue_path()
    if path is None or path == catalogue or (path.exists() and catalogue.exists() and path.samefile(catalogue)):
        raise sqlite3.OperationalError('A separate demo checkout database is required.')
    conn = sqlite3.connect(path, timeout=5, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(CHECKOUT_SCHEMA)
    except sqlite3.DatabaseError:
        conn.close()
        raise
    return conn


def text_field(data, key, label, limit, required=True):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value) > limit or any(ord(ch) < 32 for ch in value):
        raise ValueError(f'Enter a valid {label}.')
    value = value.strip()
    if required and not value:
        raise ValueError(f'Enter your {label}.')
    return value


def contact_value(data):
    contact = text_field(data, 'contact', 'email or mobile number', 160)
    if re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', contact):
        return contact.casefold()
    if re.fullmatch(r'(?:\+91|91)?[\d ()-]+', contact, re.ASCII):
        digits = re.sub(r'\D', '', contact)
        if len(digits) == 12 and digits.startswith('91'):
            digits = digits[2:]
        if len(digits) == 10:
            return '+91' + digits
    raise ValueError('Enter an email address or a 10-digit Indian mobile number.')


def checkout_quote(conn, data, load_products):
    contact = contact_value(data)
    name = text_field(data, 'name', 'name', 100)
    fulfillment = data.get('fulfillment')
    payment = data.get('payment')
    if fulfillment not in ('delivery', 'pickup'):
        raise ValueError('Choose delivery or store pickup.')
    if payment not in ('upi', 'card', 'cod' if fulfillment == 'delivery' else 'pickup'):
        raise ValueError('Choose a payment method for this order.')
    address = {}
    if fulfillment == 'delivery':
        for key, label, limit in (('address', 'street address', 180), ('city', 'city', 80),
                                  ('region', 'state', 80), ('pin', 'PIN code', 6)):
            address[key] = text_field(data, key, label, limit)
        if not re.fullmatch(r'[1-9][0-9]{5}', address['pin']):
            raise ValueError('Enter a valid six-digit PIN code.')
    card = text_field(data, 'card', 'Privilege card number', 40, required=False).upper()
    membership = conn.execute('SELECT number FROM demo_cards WHERE contact=?', (contact,)).fetchone()
    if card and (not membership or membership['number'] != card):
        raise ValueError('Use the demo Privilege card number and the contact used to enroll.')
    items = data.get('items')
    if not isinstance(items, dict) or not 1 <= len(items) <= 100:
        raise ValueError('Add between 1 and 100 different materials to your cart.')
    for product_id, quantity in items.items():
        if (not re.fullmatch(r'[1-9][0-9]{0,18}', product_id) or int(product_id) > 9223372036854775807
                or type(quantity) is not int or not 1 <= quantity <= 10000000):
            raise ValueError('Review the quantities in your cart.')
    products = load_products(items)
    lines = []
    subtotal = savings = tax = 0
    for product_id, quantity in items.items():
        product = products.get(product_id)
        if not product or quantity > product['stock']:
            raise ValueError('A material or quantity is no longer available. Review your cart.')
        price = product['price']
        regular = max(price, product['mrp'] or 0)
        member_price = regular - (regular * MEMBER_PERCENT + 50) // 100 if card else regular
        unit = min(price, member_price)
        subtotal += price * quantity
        savings += (price - unit) * quantity
        tax += int((Decimal(str(product['tax'])) * unit * quantity / 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        lines.append({key: product[key] for key in ('id', 'name', 'image', 'url')} |
                     {'type': product['variant'] or product['subcategory'] or product['category'] or 'Art supply',
                      'quantity': quantity, 'unit': unit, 'total': unit * quantity})
    delivery = DELIVERY_FEE if fulfillment == 'delivery' else 0
    total = subtotal - savings + delivery + tax
    if not 0 <= total <= 9007199254740991 or subtotal > 9007199254740991:
        raise ValueError('Split this demo order into smaller purchases.')
    quote = {'lines': lines, 'subtotal': subtotal, 'savings': savings, 'delivery': delivery,
             'tax': tax, 'total': total, 'fulfillment': fulfillment, 'payment': payment,
             'earns_card': membership is None and payment in ('upi', 'card') and subtotal - savings > QUALIFYING_SPEND}
    return quote, {'contact': contact, 'name': name, 'address': address}, products


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def issue_card(conn, contact, created):
    number = 'GA-DEMO-' + secrets.token_hex(8).upper()
    inserted = conn.execute('INSERT INTO demo_cards VALUES(?,?,?) ON CONFLICT(contact) DO NOTHING', (contact, number, created))
    return number if inserted.rowcount else None


def submit_demo(path, raw, load_products, account_id=None):
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError, RecursionError):
        raise ValueError('Send a valid checkout form.') from None
    if not isinstance(data, dict):
        raise ValueError('Send a valid checkout form.')
    action = data.get('action')
    created = datetime.now(timezone.utc).isoformat(timespec='seconds')
    with closing(connect_demo()) as conn, conn:
        if path == PRIVILEGE_API and action == 'apply':
            contact = contact_value(data)
            conn.execute('INSERT INTO demo_applications VALUES(?,?) ON CONFLICT(contact) DO NOTHING', (contact, created))
            return {'applied': True, 'whatsapp': whatsapp_draft(
                f'Hello Gupta Art Store, I would like to request a Gupta Privilege card.\nMy email or mobile number: {contact}')}
        if path == CHECKOUT_API and action == 'review':
            quote, _, _ = checkout_quote(conn, data, (lambda ids: load_products(ids, conn)) if HOSTED_DEMO else load_products)
            return {'quote': quote, 'review': digest(quote)}
        if (path, action) not in ((CHECKOUT_API, 'order'), (PRIVILEGE_API, 'buy')):
            raise ValueError('Choose a valid checkout action.')
        request_key = text_field(data, 'request_key', 'checkout reference', 36)
        if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', request_key):
            raise ValueError('Refresh the page to start a new checkout.')
        fingerprint = digest({'account': account_id, 'order': data}) if account_id else digest(data)
        if path == CHECKOUT_API and not HOSTED_DEMO:
            conn.execute('ATTACH DATABASE ? AS inventory', (catalogue_path().as_uri() + '?mode=rw',))
            # SQLite commits changes to both files atomically with rollback journals.
            if any(conn.execute(f'PRAGMA {db}.journal_mode').fetchone()[0] not in ('delete', 'truncate', 'persist')
                   for db in ('main', 'inventory')):
                raise sqlite3.OperationalError('Demo checkout requires rollback journals.')
        if HOSTED_DEMO:
            # Serialize the demo's review revalidation, inventory update and receipt creation.
            conn.execute('SELECT pg_advisory_xact_lock(1206081)')
        else:
            conn.execute('BEGIN IMMEDIATE')
        existing = conn.execute('SELECT fingerprint,data FROM demo_orders WHERE request_key=?',
                                (request_key,)).fetchone()
        if existing:
            if existing['fingerprint'] != fingerprint:
                raise ValueError('Start a new review before placing a different order.')
            return json.loads(existing['data'])['receipt']
        if path == CHECKOUT_API:
            quote, customer, products = checkout_quote(conn, data, lambda ids: load_products(ids, conn))
            if data.get('review') != digest(quote):
                raise ValueError('Your order changed. Review the updated total before placing it.')
            contact = customer['contact']
            paid = quote['payment'] in ('upi', 'card')
            card = issue_card(conn, contact, created) if quote['earns_card'] else None
            kind = 'Materials'
        else:
            contact = contact_value(data)
            customer = {'contact': contact, 'name': text_field(data, 'name', 'name', 100)}
            card = issue_card(conn, contact, created)
            if card is None:
                raise ValueError('A demo Privilege card has already been issued for this contact.')
            quote = {'total': MEMBER_PRICE, 'payment': 'upi'}
            paid = True
            kind = 'Privilege card'
        reference = 'GD-' + secrets.token_hex(8).upper()
        if paid and path == CHECKOUT_API:
            for line in quote['lines']:
                quantity, product_id = line['quantity'], line['id']
                if HOSTED_DEMO:
                    updated = conn.execute('''INSERT INTO demo_stock VALUES(?,?) ON CONFLICT(product_id)
                        DO UPDATE SET stock=demo_stock.stock-? WHERE demo_stock.stock>=?''',
                        (int(product_id), products[product_id]['stock'] - quantity, quantity, quantity))
                else:
                    updated = conn.execute('''UPDATE inventory.products SET stock=stock-?
                        WHERE id=? AND archived=0 AND stock>=?''', (quantity, product_id, quantity))
                if updated.rowcount != 1:
                    raise ValueError('A material or quantity is no longer available. Review your cart.')
                if not HOSTED_DEMO:
                    conn.execute('INSERT INTO inventory.movements(created,product_id,delta,reason) VALUES(?,?,?,?)',
                                 (created, product_id, -quantity, f'Demo storefront payment {reference}'))
        receipt = {'reference': reference, 'paid': paid, 'total': quote['total'],
                   'payment': PAYMENTS[quote['payment']], 'card': card}
        if paid:
            items = (['Gupta Privilege card | Membership | Quantity: 1'] if path == PRIVILEGE_API else
                     [f"{line['name']} | {line['type']} | Quantity: {line['quantity']}" for line in quote['lines']])
            message = ['Hello Gupta Art Store, my demo payment is complete.',
                       f'Order ID: {reference}', f"Customer: {customer['name']}"]
            receipt['whatsapp'] = whatsapp_draft('\n'.join([*message, 'Items:', *items]))
        stored = {'kind': kind, 'receipt': receipt, 'customer': customer, 'quote': quote}
        conn.execute('INSERT INTO demo_orders VALUES(?,?,?,?,?,?)',
                     (request_key, fingerprint, reference, contact, created, json.dumps(stored)))
        if account_id:
            conn.execute('INSERT INTO demo_account_orders VALUES(?,?)', (account_id, reference))
        return receipt


def admin_demo_activity():
    if demo_path() is None:
        return None
    with closing(connect_demo()) as conn:
        applications = [dict(row) for row in conn.execute(
            'SELECT contact, created FROM demo_applications ORDER BY created DESC LIMIT 50')]
        orders = []
        for row in conn.execute('SELECT contact, created, data FROM demo_orders ORDER BY created DESC LIMIT 50'):
            data = json.loads(row['data'])
            receipt = data['receipt']
            orders.append({'contact': row['contact'], 'created': row['created'], 'kind': data['kind'],
                           **{key: receipt[key] for key in ('reference', 'total', 'paid')}})
    return {'applications': applications, 'orders': orders}


def customer_orders(account_id):
    if not demo_enabled():
        return []
    with closing(connect_demo()) as conn:
        rows = conn.execute('''SELECT o.data,o.created FROM demo_orders o
            JOIN demo_account_orders a ON a.reference=o.reference
            WHERE a.account_id=? ORDER BY o.created DESC LIMIT 30''', (account_id,)).fetchall()
    return [json.loads(row['data']) | {'created': row['created']} for row in rows]

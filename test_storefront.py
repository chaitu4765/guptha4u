"""Test the catalogue and public boundary on a disposable copy of the shipped demo."""
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from http.cookiejar import CookieJar
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import build_opener, HTTPCookieProcessor, Request
from unittest.mock import patch
import sys
import uuid


def main(run_browser):
    with TemporaryDirectory(prefix='gupta-storefront-test-') as directory:
        root = Path(directory)
        media = root / 'media'
        media.mkdir()
        os.environ.update(GUPTHA_DB=str(root / 'demo.sqlite3'), GUPTHA_MEDIA=str(media))
        import seed_demo
        import server
        import storefront

        for filename in ('paints', 'brushes'):
            shutil.copyfile(storefront.ASSETS / 'art' / (filename + '.webp'), media / (filename + '.webp'))
        seed_demo.seed()
        with server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler) as http:
            thread = Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                run(http.server_port, server, storefront, root, run_browser)
                with closing(server.connect()) as c:
                    identities = [tuple(row) for row in c.execute('SELECT id,sku,stock,cost FROM products ORDER BY id')]
                from enrich_demo import enrich
                enrich()
                seed_demo.seed()
                with closing(server.connect()) as c:
                    assert identities == [tuple(row) for row in c.execute('SELECT id,sku,stock,cost FROM products ORDER BY id')]
                    row = c.execute("SELECT * FROM products WHERE sku='DEMO-ART-007'").fetchone()
                    assert row['brand'] == 'CYPRUS' and row['featured_discount'] == 1 and row['price'] == 33000
                    assert row['mrp'] == 43800 and row['reference_date'] == '2026-11-07'
                assert list(root.glob('demo.sqlite3.before-reference-*'))
                print('PASS: backed-up enrichment and repeated seeding preserve IDs, stock, costs and reference data.', flush=True)
            finally:
                http.shutdown()
                thread.join()


def run(port, server, storefront, root, run_browser):
    base = f'http://127.0.0.1:{port}'
    guest = build_opener()
    owner = build_opener(HTTPCookieProcessor(CookieJar()))

    def request(path, data=None, code=200, opener=guest):
        body = json.dumps(data).encode() if data is not None else None
        req = Request(base + path, body, {'Content-Type':'application/json', 'Origin':base})
        try:
            result = opener.open(req, timeout=10)
        except HTTPError as error:
            result = error
        with result:
            assert result.status in (code if isinstance(code, tuple) else (code,)), (path, result.status, code)
            return result.read().decode()

    def unexpected_inventory():
        raise AssertionError('Stationery accessed ERP inventory')

    def settings_only():
        connection = sqlite3.connect(':memory:')
        connection.execute('CREATE TABLE settings (id INTEGER)')
        return connection

    stationery = storefront.stationery
    home = request(stationery.STATIONERY)
    art_home = request('/shop')
    assert home.count('data-stationery-object=') == len(stationery.GROUPS)
    assert all(storefront.privilege_strip() not in page for page in (art_home, home))
    assert all(storefront.BRAND_LOGO in page and 'Gupta Art and Stationery, home' in page for page in (art_home, home))
    assert home.index('Featured premium pens') < home.index('Premium pen brands') < home.index('Featured stationery discounts')
    assert 'stationery-pendant' in home and 'data-category-navigation' in home
    assert 'Explore Collection' not in home and 'href="/shop/stationery"' in art_home
    found = json.loads(request(stationery.SEARCH + '?q=kangaro+hd'))['products']
    assert len(found) == 1 and 'HD-10D' in found[0]['name']
    detail_html = request(found[0]['url'])
    assert found[0]['image'] in detail_html and 'Product reference and photo' not in detail_html
    assert 'data-stationery-product-back href="/shop/stationery/office-tools#stationery-products"' in detail_html
    stationery_id = 'stationery:' + found[0]['id']
    status, _, body = storefront.storefront_response(
        '/api/storefront/products', urlencode({'ids': stationery_id}), unexpected_inventory, base)
    assert status == 200
    saved_stationery, = json.loads(body)['products']
    assert saved_stationery['id'] == stationery_id and saved_stationery['demo_stationery']
    assert saved_stationery['image'] == found[0]['image'] and saved_stationery['price'] < saved_stationery['mrp']
    assert not json.loads(request(stationery.SEARCH + '?q=watercolor'))['products']
    filters = request(stationery.group_url('office-tools') + '?type=Staplers')
    assert 'Kangaro HD-10D' in filters and 'Sun Star Mini Portable Scissors' not in filters
    for key in stationery.GROUPS:
        path = stationery.group_url(key)
        status, _, body = storefront.storefront_response(path, '', settings_only, base)
        assert status == 200
        expected = [p for p in stationery.catalogue() if p['group'] == key]
        assert expected and body.count(b'class="stationery-product"') == len(expected)
        assert (b'data-pen-gallery' in body) == (key in stationery.FEATURED)
    for item in stationery.catalogue():
        status, _, body = storefront.storefront_response(stationery.product_image(item), '', unexpected_inventory, base)
        assert status == 200 and body.startswith(b'RIFF') and body[8:12] == b'WEBP'

    request('/api/setup', {'email':'storefront-test@example.test', 'password':'isolated-fixture-password'}, opener=owner)
    first = {'name':'QA Studio Palette', 'sku':'QA-PALETTE', 'category':'Accessories', 'price':123.45,
             'cost':7.61, 'stock':8, 'published':False, 'description':'Disposable test fixture.',
             'image':'/storefront/media/paints.webp', 'brand':'QA Artist', 'subcategory':'Palettes',
             'mrp':200, 'featured_discount':True, 'image_verified':True,
             'image_source':'https://example.test/fixture', 'image_license':'Original test artwork'}
    request('/api/products', first, opener=owner)
    request('/api/products', {**first, 'sku':'QA-EMPTY', 'stock':0, 'price':92, 'featured_discount':False, 'image':'/storefront/media/brushes.webp'}, opener=owner)
    request('/api/products', {**first, 'sku':'QA-ARCHIVE', 'name':'QA Archive'}, opener=owner)
    with closing(server.connect()) as c:
        id_of = {row['sku']:str(row['id']) for row in c.execute('SELECT id,sku FROM products')}
    request('/api/products/archive', {'id':id_of['QA-ARCHIVE']}, opener=owner)
    ids = ','.join(id_of.values())
    products = json.loads(request('/api/storefront/products?ids=' + ids))['products']
    assert {p['id'] for p in products} == set(id_of.values()) - {id_of['QA-ARCHIVE']}
    selected = next(p for p in products if p['id'] == id_of['QA-PALETTE'])
    mixed = json.loads(request('/api/storefront/products?' + urlencode({'ids': selected['id'] + ',' + stationery_id})))
    assert mixed['products'] == [selected, saved_stationery]
    twin = next(p for p in products if p['id'] == id_of['QA-EMPTY'])
    assert selected['url'] != twin['url'] and selected['image'] != twin['image']
    assert not {'cost','reorder','published','archived'} & set(selected)
    assert selected['discount'] == 38
    request('/api/products', {**first,'sku':'INVALID-DEAL','mrp':150,'featured_discount':True}, code=400, opener=owner)
    request('/api/products', {**first,'sku':'INVALID-PRICE','mrp':100}, code=400, opener=owner)
    request('/api/products', {**first,'sku':'INVALID-IMAGE','image_license':''}, code=400, opener=owner)
    assert selected['price'] == 12345 and selected['stock'] == 8
    assert all(p['image'] == storefront.PLACEHOLDER for p in products if p['sku'].startswith('DEMO-'))
    assert json.loads(request('/api/storefront/search?q=qa-palette'))['products'] == [selected]
    assert json.loads(request('/api/storefront/search?q=qa-archive'))['products'] == []
    assert json.loads(request('/api/storefront/search?q=accessories'))['products']
    request('/api/storefront/products?ids=1,abc', code=400)
    request('/api/storefront/products?ids=9223372036854775808', code=400)
    request('/api/state', code=401)
    request('/api/backup', code=401)
    assert selected['id'] not in {str(p['id']) for p in json.loads(request('/api/shop'))['products']}
    detail = request(selected['url'])
    assert selected['image'] in detail and '<title>QA Studio Palette (QA-PALETTE) | Gupta' in detail and '123.45' in detail
    assert '<script type="application/ld+json">' in detail and base + selected['url'] in detail
    assert 'Out of stock' in request(twin['url'])
    assert 'QA Artist' in request('/shop/category/brands')
    assert 'QA Archive' not in request('/shop/catalogue')
    assert '16 materials' in request('/shop/catalogue')
    assert '2 materials' in request('/shop/category/accessories?subcategory=Palettes')
    offers = request('/shop/category/accessories')
    assert offers.index(selected['url']) < offers.index(twin['url'])
    assert 'Browse Palettes' in offers
    assert 'Acrylic Colours' not in request('/shop/category/accessories?subcategory=Palettes').split('<main id="main">', 1)[1]
    with closing(server.connect()) as c:
        rows = c.execute(f'SELECT {storefront.PRODUCT_FIELDS} FROM products WHERE id IN (?,?)',
                         (selected['id'], twin['id'])).fetchall()
    sample = {p['id']: p for p in map(storefront.catalogue_product, rows)}
    for fixture, group in ((selected, 'Acrylic Colours'), (twin, 'Water Colour')):
        sample[fixture['id']]['catalogue_groups'] = json.dumps([['paints', group, 'Acrylic Inks']])
    groups = storefront.category_sections(sample.values(), 'paints')
    branch = {'subcategory': ['Acrylic Colours'], 'type': ['Acrylic Inks']}
    branch_page, _ = storefront.listing('/shop/category/paints', branch, list(sample.values()), 'paints', groups=groups)
    assert f'data-add="{selected["id"]}"' in branch_page and f'data-add="{twin["id"]}"' not in branch_page
    assert 'Page 2 of 2' in request('/shop/catalogue?page=2')
    assert '1 material' in request('/shop/catalogue?q=QA+Studio&stock=in')
    assert '92.00' in request('/shop/catalogue?q=QA+Studio&sort=low').split('123.45')[0]
    sitemap = request('/sitemap.xml')
    assert selected['url'] in sitemap and 'qa-archive' not in sitemap and '/shop/cart' not in sitemap

    announcement = {'message':'Test studio notice <test>', 'active':True, 'link':'/shop/catalogue'}
    request('/api/storefront-settings', announcement, code=401)
    request('/api/storefront-settings', {**announcement, 'link':'javascript:alert(1)'}, code=400, opener=owner)
    request('/api/storefront-settings', {**announcement, 'start':'2999-01-01'}, opener=owner)
    assert all('Test studio notice' not in request(path) for path in ('/shop', stationery.STATIONERY))
    request('/api/storefront-settings', announcement, opener=owner)
    assert all('Test studio notice &lt;test&gt;' in request(path) for path in ('/shop', stationery.STATIONERY, found[0]['url']))
    request('/api/storefront-settings', {**announcement, 'active':False}, opener=owner)
    assert all('Test studio notice' not in request(path) for path in ('/shop', stationery.STATIONERY))

    os.environ['GUPTHA_PUBLIC_ORIGIN'] = 'https://store.example.test'

    def wsgi(path, code, method='GET'):
        result = []
        body = b''.join(storefront.application({'REQUEST_METHOD':method, 'PATH_INFO':path, 'QUERY_STRING':''},
                                               lambda status, headers: result.extend([status, dict(headers)])))
        assert result[0].startswith(str(code)), (path, result)
        return body, result[1]

    for path in ('/api/state','/api/backup','/api/session','/api/shop','/legacy-shop','/app.js','/images/acrylic-red.jpg',
                 '/storefront/../app.js', '/storefront/media/../app.js', '/data/retail.sqlite3'):
        wsgi(path, 404)
    for path in ('/api/shop/order', '/api/storefront-settings', '/api/setup', '/api/products'):
        wsgi(path, 405, 'POST')
    assert b'https://store.example.test/shop' in wsgi('/shop', 200)[0]
    assert wsgi('/shop', 200, 'HEAD')[0] == b''
    assert wsgi('/', 302)[1]['Location'] == '/shop'
    assert wsgi(selected['image'], 200)[1]['Content-Type'] == 'image/webp'
    for key in storefront.CATEGORIES:
        assert wsgi(f'/storefront/models/{key}.glb', 200)[0].startswith(b'glTF')
    assert storefront.price(12345678) == '₹1,23,456.78'
    print('PASS: demo catalogue, visibility, identity, filtering, image mapping, announcement permissions, SEO and WSGI isolation.', flush=True)

    os.environ['GUPTHA_DEMO_CHECKOUT_DB'] = str(root / 'checkout.sqlite3')
    os.environ['GUPTHA_ACCOUNTS_DB'] = str(root / 'accounts.sqlite3')
    assert all(storefront.privilege_strip() in request(path) for path in ('/shop', stationery.STATIONERY))
    shopper = build_opener(HTTPCookieProcessor(CookieJar()))
    credentials = urlencode({'name':'Demo Customer','email':'demo-account@example.test',
                             'password':'isolated-shopper-password'}).encode()
    assert 'Create demo account' in request('/shop/checkout')
    assert not json.loads(request('/shop/auth/session'))['signed_in']
    with shopper.open(Request(base + '/shop/sign-up?next=%2Fshop%2Fcheckout', credentials,
                             {'Origin':base, 'Content-Type':'application/x-www-form-urlencoded'})) as signed_up:
        assert signed_up.url == base + '/shop/checkout' and b'Review order' in signed_up.read()
    assert json.loads(request('/shop/auth/session', opener=shopper))['signed_in']
    assert 'Request a Privilege card' in request('/shop/privilege')
    request('/api/storefront-demo', code=401)
    privilege = '/api/storefront/demo/privilege'
    checkout = '/api/storefront/demo/checkout'
    contact = 'guest@example.test'
    member = {'action':'buy', 'contact':contact, 'name':'Demo Customer', 'request_key':str(uuid.uuid4())}
    application = json.loads(request(privilege, {'action':'apply', 'contact':contact}))
    draft = urlsplit(application['whatsapp'])
    assert draft.netloc == 'wa.me' and draft.path == '/917981456043' and contact in parse_qs(draft.query)['text'][0]
    bought = json.loads(request(privilege, member))
    assert bought['total'] == 20000 and bought['paid'] and bought['card'].startswith('GA-DEMO-')
    assert json.loads(request(privilege, member)) == bought
    request(privilege, {**member, 'request_key':str(uuid.uuid4())}, code=400)

    with closing(server.connect()) as c:
        id_for = c.execute("SELECT id FROM products WHERE sku='QA-PALETTE'").fetchone()['id']
        original_stock = c.execute('SELECT stock FROM products WHERE id=?', (id_for,)).fetchone()['stock']
        original_orders = c.execute('SELECT count(*) FROM orders').fetchone()[0]
    info = {'action':'review', 'items':{str(id_for):1}, 'name':'Demo Customer',
            'contact':contact, 'fulfillment':'pickup', 'payment':'upi', 'card':bought['card']}
    request(checkout, info, code=401)

    def pay(data, code=200):
        return json.loads(request(checkout, data, code=code, opener=shopper))

    pay({**info, 'contact':'wrong@example.test'}, code=400)
    pay({**info, 'items':{str(id_for):99}}, code=400)
    review = pay(info)
    assert review['quote']['subtotal'] == 12345 and review['quote']['savings'] == 0
    request('/api/products', {**first, 'id':id_for, 'price':2500, 'mrp':2500,
                              'featured_discount':False}, opener=owner)
    order = {**info, 'action':'order', 'review':review['review'], 'request_key':str(uuid.uuid4())}
    pay(order, code=400)
    review = pay(info)
    assert review['quote']['savings'] == 25000 and review['quote']['total'] == 225000
    exact = {**info, 'contact':'earn@example.test', 'card':''}
    assert not pay(exact)['quote']['earns_card']
    earn = {**exact, 'items':{str(id_for):2}}
    assert not pay({**earn, 'payment':'pickup'})['quote']['earns_card']
    review = pay(earn)
    assert review['quote']['earns_card']
    order = {**earn, 'action':'order', 'review':review['review'], 'request_key':str(uuid.uuid4())}
    receipt = pay(order)
    assert receipt['card'] and receipt['total'] == 500000 and receipt['paid']
    history = request('/shop/account', opener=shopper)
    assert all(part in history for part in ('Purchase history', receipt['reference'], 'QA Studio Palette', 'Qty 2', 'Demo paid'))
    assert receipt['reference'] not in request('/shop/account')
    message = parse_qs(urlsplit(receipt['whatsapp']).query)['text'][0]
    assert all(part in message for part in (receipt['reference'], 'Demo Customer', 'QA Studio Palette', 'Palettes', 'Quantity: 2'))
    assert pay(order) == receipt
    assert json.loads(request('/api/storefront/products?ids=' + str(id_for)))['products'][0]['stock'] == original_stock - 2
    activity = json.loads(request('/api/storefront-demo', opener=owner))['activity']
    assert len(activity['orders']) == 2 and activity['applications'][0]['contact'] == contact
    with closing(server.connect()) as c:
        assert c.execute('SELECT stock FROM products WHERE id=?', (id_for,)).fetchone()['stock'] == original_stock - 2
        assert [r['delta'] for r in c.execute('SELECT delta FROM movements WHERE reason=?',
                ('Demo storefront payment ' + receipt['reference'],))] == [-2]
        assert c.execute('SELECT count(*) FROM orders').fetchone()[0] == original_orders
    remaining = {**exact, 'contact':'competing@example.test', 'items':{str(id_for):original_stock - 2}}
    final_review = pay(remaining)['review']
    simultaneous = [{**remaining, 'action':'order', 'review':final_review, 'request_key':str(uuid.uuid4())}
                    for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(lambda data: pay(data, code=(200, 400)), simultaneous))
    assert sum('reference' in outcome for outcome in outcomes) == 1
    assert json.loads(request('/api/storefront/products?ids=' + str(id_for)))['products'][0]['stock'] == 0
    request('/api/stock', {'product_id':id_for, 'quantity':original_stock, 'reason':'Reset competing payment fixture'}, opener=owner)
    request('/api/products', {**first, 'id':id_for}, opener=owner)

    raw = json.dumps({'action':'apply', 'contact':'wsgi@example.test'}).encode()
    for origin, expected in [('https://cross-origin.example.test', '403'), ('https://store.example.test', '200')]:
        result = []
        body = b''.join(storefront.application({
            'REQUEST_METHOD':'POST', 'PATH_INFO':privilege, 'CONTENT_LENGTH':str(len(raw)),
            'CONTENT_TYPE':'application/json', 'HTTP_ORIGIN':origin, 'wsgi.input':BytesIO(raw)
        }, lambda status, headers: result.append(status)))
        assert result[0].startswith(expected), (result, body)
    wsgi('/api/storefront-demo', 404)
    print('PASS: signup gate, paid stock movement, idempotent receipts, Privilege, repricing and origin checks.', flush=True)

    assert 'Continue with Google' in request('/shop/sign-in')
    assert 'Create your account' in request('/shop/sign-up')
    assert 'Refund policy' in request('/shop/refunds')
    os.environ['GUPTHA_ACCOUNTS_DB'] = str(root / 'accounts.sqlite3')
    origin = os.environ['GUPTHA_PUBLIC_ORIGIN']
    from storefront import accounts

    def private_request(path, query='', cookie='', method='GET', source=origin):
        return storefront.storefront_account_response(path, method, query, origin, cookie,
                                                       source, '', 0, BytesIO().read, storefront.read_catalogue)

    with patch.object(accounts, 'provider_config', return_value=('test-app', 'test-secret')), \
            patch.object(accounts, 'verify_provider', return_value={
                'sub':'test-provider-account', 'email':'private@example.test', 'email_verified':True, 'name':'Private Shopper'
            }) as verify:
        status, headers, _ = private_request('/shop/auth/google')
        assert status == 303
        auth = parse_qs(urlsplit(dict(headers)['Location']).query)
        binding = dict(headers)['Set-Cookie'].split(';', 1)[0]
        params = 'state=' + auth['state'][0] + '&code=local-test-code'
        assert dict(private_request('/shop/auth/google/callback', params)[1])['Location'].endswith('status=retry')
        status, headers, _ = private_request('/shop/auth/google/callback', params, binding)
        assert status == 303 and verify.call_count == 1
        assert verify.call_args.args[-1] == auth['nonce'][0]
        session = dict(headers)['Set-Cookie'].split(';', 1)[0]
        assert dict(headers)['Location'] == '/shop/account'
        status, headers, body = private_request('/shop/account', cookie=session)
        assert status == 200 and dict(headers)['Cache-Control'] == 'no-store' and b'Private Shopper' in body
        assert private_request('/shop/account')[0] == 303
        assert dict(private_request('/shop/auth/google/callback', params, binding)[1])['Location'].endswith('status=retry')
        assert private_request('/shop/auth/sign-out', cookie=session, method='POST', source='https://other.test')[0] == 403
        assert private_request('/shop/auth/sign-out', cookie=session, method='POST')[0] == 303
        assert private_request('/shop/account', cookie=session)[0] == 303
    print('PASS: account pages, OAuth state and nonce binding, session replay prevention and sign-out.', flush=True)

    if run_browser:
        cli = shutil.which('playwright-cli.cmd') or shutil.which('playwright-cli')
        if not cli:
            raise RuntimeError('Install Playwright CLI and a Chrome browser to run --browser.')
        session = '-s=gupta-test-' + uuid.uuid4().hex[:8]
        script = Path(__file__).with_name('test_storefront_browser.js').resolve()
        try:
            subprocess.run([cli, session, 'open', base + '/shop', '--browser=chrome'], cwd=root, check=True)
            result = subprocess.run([cli, session, 'run-code', '--filename=' + str(script), '--raw'],
                                    cwd=root, capture_output=True, text=True, encoding='utf-8')
            assert result.returncode == 0 and 'PASS: storefront browser workflows' in result.stdout, result.stdout + result.stderr
            print(result.stdout.strip(), flush=True)
        finally:
            subprocess.run([cli, session, 'close'], cwd=root, check=False)


if __name__ == '__main__':
    main('--browser' in sys.argv)

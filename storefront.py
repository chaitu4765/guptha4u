"""Storefront shared by the local ERP server and the public WSGI app."""
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from html import escape
from http import HTTPStatus
from fractions import Fraction
from functools import lru_cache
import json
from pathlib import Path
import os
import re
import sqlite3
import unicodedata
from urllib.parse import parse_qs, urlencode, urlsplit
from storefront_search import search_ids
from storefront_checkout import (BODY_LIMIT, CHECKOUT_API, POST_PATHS, demo_path, submit_demo,
                                 DELIVERY_FEE, MEMBER_PERCENT, MEMBER_PRICE, QUALIFYING_SPEND, customer_orders)
import storefront_accounts as accounts

ROOT = Path(__file__).resolve().parent
CATALOGUE_PREVIEW = os.environ.get('GUPTHA_CATALOGUE_PREVIEW') == '1'
ASSETS = ROOT / 'public' / 'storefront'
MEDIA = Path(os.environ.get('GUPTHA_MEDIA', ASSETS / 'media')).resolve()
BRAND = 'Gupta Art Store and Stationary'
SHOP = '/shop'
PLACEHOLDER = '/storefront/placeholder.svg'
PAGE_SIZE = 12
PRODUCT_FIELDS = ('id, name, sku, category, price, stock, description, image, brand, subcategory, variant, '
                  'mrp, featured_discount, reference_url, reference_date, image_source, image_license, image_verified, '
                  'source_sku, source_available, catalogue_groups')
HIMALAYA_IMAGES = 'https://cdn.shopify.com/s/files/1/0850/0084/7665/'
HIMALAYA_PERMISSION = 'Himalaya Fine Art photo used with permission for the private client demo.'
MEDIA_NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,149}\.(?:jpe?g|png|webp|avif)', re.I)
PRODUCT_ID = r'[1-9][0-9]{0,18}'
MAX_PRODUCT_ID = 9223372036854775807
IMAGE_TYPES = {'.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
               '.webp':'image/webp', '.avif':'image/avif'}
CATEGORIES = {
    'paints': ('Paints & Mediums', 'Colour for washes, layers and marks.'),
    'brushes': ('Brushes & Painting Tools', 'Tools for the finest line and the broadest stroke.'),
    'canvas': ('Canvas', 'Surfaces for painting and mixed media.'),
    'easels': ('Easels', 'A place to set up your canvas.'),
    'drawing': ('Drawing & Illustration', 'Tools for lines, tones and first sketches.'),
    'papers': ('Papers & Pads', 'A surface for every new page.'),
    'accessories': ('Accessories', 'The small essentials of a working studio.'),
    'brands': ('Brands', 'Browse makers when brands are recorded in the catalogue.'),
}
BRAND_RANGES = ('A to C', 'D to F', 'G to I', 'J to L', 'M to O', 'P to R', 'S to U', 'V to Z')
ICONS = {
    'search': 'M20 20l-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    'heart': 'M20.8 8.6c0 4.7-8.8 9.4-8.8 9.4s-8.8-4.7-8.8-9.4a4.5 4.5 0 0 1 8.8-1 4.5 4.5 0 0 1 8.8 1Z',
    'bag': 'M5 8h14l1 13H4L5 8Zm4 1V6a3 3 0 0 1 6 0v3',
    'arrow': 'M4 12h15m-6-6 6 6-6 6',
    'menu': 'M4 7h16M4 12h16M4 17h16',
    'close': 'M6 6l12 12M18 6 6 18',
}


def icon(name):
    return (f'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            f'<path d="{ICONS[name]}"/></svg>')


def slug(name):
    ascii_name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', ascii_name.lower()).strip('-')[:72].rstrip('-') or 'item'


def media_file(filename):
    if MEDIA_NAME.fullmatch(filename):
        file = (MEDIA / filename).resolve()
        if file.is_relative_to(MEDIA) and file.suffix.lower() in IMAGE_TYPES and file.is_file():
            return file
    return None


def product_image(value):
    prefix = '/storefront/media/'
    if value and value.startswith(prefix) and media_file(value[len(prefix):]):
        return value
    return PLACEHOLDER


def catalogue_product(row):
    p = dict(row)
    p['id'] = str(p['id'])
    p['discount'] = ((p['mrp'] - p['price']) * 100 // p['mrp']) if p['mrp'] > p['price'] else 0
    return p


def himalaya_image(value):
    return bool(re.fullmatch(
        re.escape(HIMALAYA_IMAGES) + r'(?:files|products)/[A-Za-z0-9_.%+-]+\.(?:jpe?g|png|webp|avif)(?:\?[0-9A-Za-z&=]+)?',
        value or '', re.IGNORECASE))


def public_product(p):
    p = p.copy()
    p['url'] = f"{SHOP}/product/{slug(p['name'])}-{p['id']}"
    if not p['image_verified']:
        p['image'] = PLACEHOLDER
    elif p['image_license'] != HIMALAYA_PERMISSION or not himalaya_image(p['image']):
        p['image'] = product_image(p['image'])
    del p['catalogue_groups']
    return p


def category_for(p):
    label = (p['category'] or '').strip().casefold()
    if label in CATEGORIES and label != 'brands':
        return label
    for key, (title, _) in CATEGORIES.items():
        if key != 'brands' and label == title.casefold():
            return key
    aliases = {'paints & colours':'paints', 'brushes':'brushes', 'drawing supplies':'drawing'}
    if label == 'canvas & paper':
        return 'canvas' if 'canvas' in p['name'].casefold() else 'papers'
    if label == 'studio accessories':
        return 'easels' if 'easel' in p['name'].casefold() else 'accessories'
    return aliases.get(label)


def announcement_url(value):
    try:
        url = urlsplit(value)
    except ValueError:
        return ''
    if any(c.isspace() or ord(c) < 32 for c in value) or '\\' in value:
        return ''
    if value.startswith('/shop') and not url.netloc and (url.path == SHOP or url.path.startswith(SHOP + '/')):
        return value
    if url.scheme == 'https' and url.hostname and not url.username and not url.password:
        return value
    return ''


def announcement_values(data):
    message = str(data.get('message') or '').strip()
    link = str(data.get('link') or '').strip()
    start = str(data.get('start') or '')
    end = str(data.get('end') or '')
    active = data.get('active', False)
    if not isinstance(active, bool):
        raise ValueError('Choose whether to show the announcement.')
    if len(message) > 180 or len(link) > 500 or (link and not announcement_url(link)):
        raise ValueError('Use a message up to 180 characters and a shop path or HTTPS link.')
    try:
        for day in (start, end):
            if day and date.fromisoformat(day).isoformat() != day:
                raise ValueError
    except ValueError:
        raise ValueError('Use valid announcement dates.') from None
    if start and end and end < start:
        raise ValueError('The announcement must end on or after its start date.')
    if active and not message:
        raise ValueError('Enter a message before showing the announcement.')
    return message, link, start, end, '1' if active else ''


def announcement(c):
    row = c.execute('SELECT * FROM settings WHERE id=1').fetchone()
    if not row or 'announcement' not in row.keys():
        return ''
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    message = row['announcement']
    if (not row['announcement_active'] or not message
            or (row['announcement_start'] and today < row['announcement_start'])
            or (row['announcement_end'] and today > row['announcement_end'])):
        return ''
    link = announcement_url(row['announcement_link'])
    action = (f'<a class="announcement-link" href="{escape(link)}">View offer {icon("arrow")}</a>'
              if link else '')
    parts = re.split(r'((?:₹[ \t]*)?\d+(?:,\d+)*(?:\.\d+)?(?:[ \t]*%)?)', message)
    headline = ''.join(f'<strong class="offer-number">{escape(part)}</strong>' if i % 2 else escape(part)
                       for i, part in enumerate(parts))
    return (f'<aside class="announcement is-ticking" aria-label="Store announcement"><div class="wrap announcement-inner">'
            f'<span class="announcement-tag">Store update</span><div class="headline-window" tabindex="0"><div class="headline-track">'
            f'<p>{headline}</p><p aria-hidden="true">{headline}</p></div></div>{action}'
            f'</div></aside>')


@lru_cache(maxsize=2048)
def catalogue_groups(value):
    return tuple(tuple(group) for group in json.loads(value))


def groups_for(p):
    return catalogue_groups(p['catalogue_groups']) or ((category_for(p), p['subcategory'] or p['category'], ''),)


def brand_range(name):
    first = name[:1].upper()
    return next((label for label in BRAND_RANGES if first and label[0] <= first <= label[-1]), 'Other')


def in_category(p, key):
    return bool(p['brand']) if key == 'brands' else any(category == key for category, _, _ in groups_for(p))


REFERENCE_NAVIGATION = json.loads((ROOT / 'reference' / 'catalogue-navigation.json').read_text(encoding='utf-8'))
MORE_MATERIALS = '~more'


def category_paths(product, key):
    if key == 'brands':
        brand = product['brand']
        return ((brand_range(brand), brand),) if brand else ()
    return tuple((group, leaf) for category, group, leaf in groups_for(product) if category == key)


def category_sections(products, key):
    sections = {group: dict.fromkeys(leaves) for group, leaves in REFERENCE_NAVIGATION.get(key, {}).items()}
    if key == 'brands':
        brands = {}
        for p in products:
            if p['brand']:
                brands.setdefault(p['brand'].casefold(), p['brand'])
        for brand in sorted(brands.values(), key=str.casefold):
            sections.setdefault(brand_range(brand), {})[brand] = None
        return {group: sections[group] for group in (*BRAND_RANGES, 'Other') if group in sections}
    for product in products:
        for group, leaf in category_paths(product, key):
            if group:
                leaves = sections.setdefault(group, {})
                if leaf:
                    leaves[leaf] = None
    return sections


def category_url(key, subcategory='', leaf=''):
    path = f'{SHOP}/category/{key}'
    params = {name: value for name, value in (('subcategory', subcategory), ('type', leaf)) if value}
    return path + '?' + urlencode(params) if params else path


def section_link(key, group, leaf='', css=''):
    name = leaf or ('More materials' if group == MORE_MATERIALS else group)
    return (f'<a class="{css}" href="{escape(category_url(key, group, leaf))}" '
            f'data-studio-link>{escape(name)}</a>')


def nav_links(products=None, dropdown=False):
    links = []
    for key, (title, _) in CATEGORIES.items():
        link = f'<a href="{category_url(key)}" data-studio-link>{escape(title)}</a>'
        if dropdown:
            branches = []
            for group, leaves in category_sections(products or [], key).items():
                leaves_html = ''.join(section_link(key, group, leaf, 'nav-leaf-link') for leaf in leaves)
                leaf_panel = f'<div class="nav-branch-links">{leaves_html}</div>' if leaves_html else ''
                branches.append(f'<div class="nav-branch">{section_link(key, group, css="nav-group-link")}{leaf_panel}</div>')
            children = ''.join(branches) or '<span class="nav-empty">No materials yet</span>'
            link = f'<details class="nav-dropdown" data-nav-key="{key}"><summary>{escape(title)}</summary><div>{children}</div></details>'
        links.append(link)
    return ''.join(links)


def layout(title, description, path, content, origin, notice='', noindex=False, structured=None, products=(), demo=False):
    full_title = BRAND if not title else f'{title} | {BRAND}'
    canonical = escape(origin + path)
    markup = ''
    if structured:
        markup = '<script type="application/ld+json">' + json.dumps(structured).replace('<', r'\u003c') + '</script>'
    robots = '<meta name="robots" content="noindex,follow">' if noindex or CATALOGUE_PREVIEW else ''
    navigation = nav_links(products, True)
    member_link = '<a href="/shop/privilege">Privilege membership</a>' if demo else ''
    return f'''<!doctype html>
<html lang="en" data-type="product">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="page-type" content="product">
<meta name="site-kind" content="other">
<meta name="theme-color" content="#F7F3EC">
<title>{escape(full_title)}</title>
<meta name="description" content="{escape(description)}">
<link rel="canonical" href="{canonical}">
{robots}
<link rel="icon" href="/storefront/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/storefront/store.css">
<link rel="stylesheet" href="/storefront/studio.css">
<link rel="stylesheet" href="/storefront/polish.css">
<link rel="stylesheet" href="/storefront/updates.css">
{'<link rel="stylesheet" href="/storefront/account.css">' if path in ('/shop/account', '/shop/sign-in', '/shop/sign-up') else ''}
{'<link rel="stylesheet" href="/storefront/checkout.css">' if demo else ''}
<script defer src="/storefront/store.js"></script>
<script type="module" src="/storefront/vendor/storefront.js"></script>
{markup}
</head>
<body{' data-catalogue-preview' if CATALOGUE_PREVIEW else ''}>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
<div class="wrap mast">
  <details class="mobile-nav"><summary aria-label="Browse categories">{icon('menu')}</summary>
    <nav aria-label="Mobile categories"><a href="/shop/catalogue">All materials</a>{navigation}</nav>
  </details>
  <a href="/shop" class="wordmark" aria-label="{BRAND}, home"><span>Gupta</span><small>Art Store and Stationary</small></a>
  <nav class="category-nav" data-category-navigation aria-label="Shop categories">{navigation}</nav>
  <form class="global-search" role="search" action="/shop/catalogue">
    <label class="sr-only" for="search">Search materials</label>
    <input id="search" type="search" name="q" placeholder="Search materials" maxlength="100" autocomplete="off">
    <button aria-label="Search">{icon('search')}</button>
    <ul id="suggestions" role="listbox" aria-label="Product suggestions" hidden></ul>
    <span class="sr-only" id="search-status" role="status"></span>
  </form>
  <div class="utilities">
    <a href="/shop/account" aria-label="Account"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5 20v-1a7 7 0 0 1 14 0v1Z"/></svg></a>
    <a href="/shop/wishlist" aria-label="Wishlist">{icon('heart')}</a>
    <a href="/shop/cart" class="bag" aria-label="Cart">{icon('bag')} <span data-cart-count>0</span></a>
  </div>
</div>
</header>
{'<p class="catalogue-preview-note">Catalogue preview · Browse materials and search the demo range.</p>' if CATALOGUE_PREVIEW else ''}
<div data-store-announcement>{notice}</div>
<main id="main">{content}</main>
<div data-meadow-footer data-demo-checkout="{int(demo)}"><footer class="site-footer meadow-fallback">
  <div class="wrap footer-grid">
    <div><a href="/shop" class="wordmark"><span>Gupta</span><small>Art Store and Stationary</small></a>
    <p>Art materials and stationery for your workbench.</p>
    <a class="footer-instagram" href="https://www.instagram.com/gupta_artstore/"><img src="/storefront/instagram.svg" alt="" width="20" height="20">Follow us on Instagram</a></div>
    <nav aria-label="Footer categories">{nav_links()}</nav>
    <nav aria-label="Store information"><a href="/shop/catalogue">All materials</a>{member_link}<a href="/shop/about">About this demo</a><a href="/shop/privacy">Privacy policy</a><a href="/shop/refunds">Refund policy</a></nav>
  </div>
  <div class="wrap footer-bottom"><span>{BRAND}</span><span>Demo catalogue</span></div>
</footer></div>
<a href="#" class="back-to-top" data-back-top hidden>Back to top {icon('up') if 'up' in ICONS else '<span aria-hidden="true">↑</span>'}</a>
<div class="studio-loading" data-studio-loading hidden><span class="art-loader" aria-hidden="true"></span><p role="status">Opening the studio…</p></div>
<p class="sr-only" id="store-status" role="status"></p>
</body></html>'''


def price(paise):
    rupees, paise = divmod(paise, 100)
    whole = str(rupees)
    rest, last = whole[:-3], whole[-3:]
    groups = ([rest[:1]] if len(rest) % 2 else []) + [rest[i:i + 2] for i in range(len(rest) % 2, len(rest), 2)]
    return f'₹{",".join([*groups, last])}.{paise:02}'


def image(p, eager=False):
    alt = '' if p['image'] == PLACEHOLDER else p['name']
    loading = 'eager' if eager else 'lazy'
    return (f'<img src="{escape(p["image"])}" alt="{escape(alt)}" width="480" height="420" '
            f'loading="{loading}" decoding="async" referrerpolicy="no-referrer" data-product-image>')


def stock_label(p):
    return '<span class="available">In stock</span>' if p['stock'] > 0 else '<span class="unavailable">Out of stock</span>'


def save_button(p):
    return (f'<button class="save" type="button" data-save="{p["id"]}" '
            f'data-name="{escape(p["name"])}" aria-label="Save {escape(p["name"])}" aria-pressed="false">'
            f'{icon("heart")}</button>')


def discount_badge(discount):
    if not discount:
        return ''
    band = min(discount // 10, 4) * 10
    return f'<span class="discount-badge" data-discount-band="{band}">{discount}% off</span>'


def cards(products):
    return '<div class="products">' + ''.join(
        f'''<article class="product-card">
  <a class="product-image" href="{p["url"]}" aria-label="{escape(p["name"])}">{image(p)}</a>
  {save_button(p)}
  {discount_badge(p['discount'])}
  <div class="product-copy">
    <h3><a href="{p["url"]}">{escape(p["name"])}</a></h3>
    <p class="product-brand">{escape(p['brand'])}</p>
    <p class="product-meta">{f'<del>{price(p["mrp"])}</del>' if p['discount'] else ''}<strong>{price(p["price"])}</strong>{stock_label(p)}</p>
    <form class="card-add" data-add="{p['id']}" method="post">
      <button class="button outline" type="submit"{' disabled' if p['stock'] <= 0 else ''}>Add to cart</button>
      <p class="card-add-message" data-add-message role="status"></p>
    </form>
  </div>
</article>''' for p in map(public_product, products)) + '</div>'


def category_image(key, eager=False):
    return (f'<img src="/storefront/art/studio-v2-{key}.webp" '
            f'width="260" height="366" alt="" decoding="async" loading="{"eager" if eager else "lazy"}">')


def discounted(products):
    return sorted((p for p in products if p['discount'] >= 20),
                  key=lambda p: (-p['featured_discount'], -Fraction(p['mrp']-p['price'],p['mrp']), p['name'].casefold()))


def studio_stage(key=''):
    tiles = ''.join(
        f'<a class="studio-object" data-studio-link data-key="{name}" href="{category_url(name)}">'
        f'<span class="studio-object-art">{category_image(name)}</span>'
        f'<span class="studio-object-label">{escape(title)}</span></a>'
        for name, (title, _) in CATEGORIES.items())
    lifts = ''.join(f'<img class="studio-lift" data-lift="{name}" data-src="/storefront/art/studio-hover-{name}.webp" alt="">'
                    for name in CATEGORIES)
    heading = escape(CATEGORIES[key][0]) if key else 'Everything an Artist Needs'
    supporting = escape(CATEGORIES[key][1]) if key else 'All in One Place'
    return f'''<section class="studio-stage" aria-label="Interactive art studio">
  <div class="studio-scene" aria-hidden="true">
    <div class="studio-lifts"><img class="studio-plate" data-src="/storefront/art/studio-plate.webp" alt="">{lifts}</div>
  </div>
  <div class="studio-wash" aria-hidden="true"></div>
  <div class="studio-render" aria-hidden="true">{category_image(key, True) if key else ''}</div>
  <div class="studio-copy"><h1>{heading}</h1><p>{supporting}</p></div>
  <a class="studio-back" href="/shop" data-studio-link{' hidden' if not key else ''}>Back to studio</a>
  <div class="studio-objects">{tiles}</div>
  <p class="studio-hint">Choose a category to explore the studio</p>
  <p class="sr-only" id="scene-status" role="status"></p>
</section>'''


def studio_page(products, key='', params=None, ranked=None, demo=False):
    params = params or {}
    selected = params.get('subcategory', [''])[0]
    related = [p for p in products if in_category(p, key)] if key else products
    groups = category_sections(related, key) if key else {}
    chips = ''.join(
        section_link(key, label, css='subcategory' + (' selected' if label == selected else ''))
        for label in groups)
    if key and not any(params.values()):
        content, page = category_overview(related, key, groups), 1
        offers = discounted(related)[:4]
        if offers:
            content = f'<section class="wrap section offer-section"><h2>Featured discounts</h2>{cards(offers)}</section>' + content
        chips = ''
    elif key:
        content, page = listing(category_url(key), params, products, key, ranked, groups)
    else:
        offers = discounted(related)[:12]
        intro = '<h2>Featured discounts</h2><p>Save 20% or more on materials for your next piece.</p>'
        if offers:
            content = f'<section id="featured-offers" class="wrap section offer-section"><div class="section-head"><div>{intro}</div></div>{cards(offers)}</section>'
        elif related:
            content = '<section class="wrap section offer-section"><h2>Featured discounts</h2><p class="offer-empty">New offers will appear here when available.</p></section>'
        else:
            content = '<section class="wrap section">' + empty('This shelf is empty', 'There are currently no materials in this collection.') + '</section>'
        if demo:
            content = f'''<section class="wrap section home-privilege" aria-labelledby="privilege-heading">
<div class="membership-strip"><div><p class="commerce-label">Gupta Privilege</p>
<h2 id="privilege-heading">Member prices for your next project</h2>
<p>Get a Privilege card free with a qualifying purchase above <strong class="offer-number">₹{QUALIFYING_SPEND // 100:,}</strong>, or buy one for <strong class="offer-number">₹{MEMBER_PRICE // 100:,}</strong>.</p></div>
<a class="button" href="/shop/privilege">Explore membership</a></div></section>''' + content
        page = 1
    return (f'<div id="studio" data-category="{key}">{studio_stage(key)}'
            f'<div class="studio-content" data-category="{key}">'
            f'{f"""<section class="wrap subcategories"><h2>Explore {escape(CATEGORIES[key][0])}</h2><div class="category-chips">{chips}</div></section>""" if chips else ""}'
            f'{content}</div></div><script defer src="/storefront/studio.js"></script>'), page


def home(products, demo=False):
    return studio_page(products, demo=demo)[0]


def empty(title, message):
    return f'<div class="empty"><h2>{title}</h2><p>{message}</p><a class="button outline" href="/shop/catalogue">Browse all materials</a></div>'


def trail(label, parent=None):
    middle = f'<li><a href="{parent[0]}">{escape(parent[1])}</a></li>' if parent else ''
    return (f'<nav class="trail" aria-label="Breadcrumb"><ol><li><a href="/shop">Home</a></li>{middle}'
            f'<li aria-current="page">{escape(label)}</li></ol></nav>')


def category_overview(products, key, groups):
    samples = {}
    for p in products:
        for group in {group or MORE_MATERIALS for group, _ in category_paths(p, key)}:
            bucket = samples.setdefault(group, [])
            if len(bucket) < 4:
                bucket.append(p)
    sections = []
    for group in (*groups, *([MORE_MATERIALS] if MORE_MATERIALS in samples else [])):
        name = 'More materials' if group == MORE_MATERIALS else group
        browse = 'Browse more materials' if group == MORE_MATERIALS else 'Browse ' + name
        leaves = ''.join(section_link(key, group, leaf, 'subcategory') for leaf in groups.get(group, ()))
        links = f'<div class="category-chips" aria-label="{escape(name)} types">{leaves}</div>' if leaves else ''
        items = cards(samples[group]) if group in samples else '<p class="offer-empty">No matching materials in the catalogue yet.</p>'
        sections.append(f'<section class="catalogue-section"><div class="section-head"><h2>{escape(name)}</h2>'
                        f'<a class="button outline" data-studio-link href="{escape(category_url(key, group))}">{escape(browse)}</a>'
                        f'</div>{links}{items}</section>')
    return '<div class="wrap page category-overview">' + (''.join(sections) or empty(
        'This shelf is empty', 'The ERP catalogue has no products for this collection.')) + '</div>'


def listing(path, params, products, key=None, ranked=None, groups=None, facets=None):
    label, intro = CATEGORIES[key] if key else ('All materials', 'Browse the store’s art supplies and stationery.')
    if key:
        products = [p for p in products if in_category(p, key)]
    selected = params.get('subcategory', [''])[0]
    leaf = params.get('type', [''])[0]
    groups = groups or {}
    section = '' if selected == MORE_MATERIALS else selected
    if selected or leaf:
        # Older saved links sometimes used subcategory for a leaf name.
        legacy_leaf = bool(selected and selected not in groups and selected != MORE_MATERIALS and not leaf)
        products = [p for p in products if any(
            ((kind.casefold() == selected.casefold()) if legacy_leaf else
             ((not selected or group == section) and (not leaf or kind.casefold() == leaf.casefold())))
            for group, kind in category_paths(p, key))]
    leaves = groups.get(selected, {}) if selected else dict.fromkeys(
        name for names in groups.values() for name in names)
    facet_products = products if facets is None else facets
    labels = sorted({p['category'] for p in facet_products if p['category']}, key=str.casefold)
    brands = sorted({p['brand'] for p in facet_products if p['brand']}, key=str.casefold)
    brand = params.get('brand', [''])[0]
    query = params.get('q', [''])[0].strip()[:100]
    category = params.get('category', [''])[0][:500]
    availability = params.get('stock', [''])[0]
    order = params.get('sort', [''])[0]
    products = [p for p in products if (not category or p['category'] == category)
                and (not brand or p['brand'] == brand)
                and (availability != 'in' or p['stock'] > 0)
                and (ranked is None or int(p['id']) in ranked)]
    if order in ('low', 'high'):
        products.sort(key=lambda p: p['price'], reverse=order == 'high')
    elif ranked is not None:
        products.sort(key=lambda p: ranked[int(p['id'])])
    page = params.get('page', ['1'])[0]
    pages = max(1, (len(products) + PAGE_SIZE - 1) // PAGE_SIZE)
    current = min(max(1, int(page)), pages) if re.fullmatch(r'[0-9]{1,8}', page) else 1
    visible = products[(current - 1) * PAGE_SIZE:current * PAGE_SIZE]

    def option(value, text, selected):
        active = ' selected' if value == selected else ''
        return f'<option value="{escape(value)}"{active}>{escape(text)}</option>'

    def page_link(number, text):
        args = {'q':query, 'category':category, 'brand':brand, 'subcategory':selected,
                'type':leaf, 'stock':availability, 'sort':order, 'page':number}
        return f'<a class="outline button" href="{path}?{escape(urlencode({k:v for k,v in args.items() if v}))}">{text}</a>'

    art = (f'<div class="collection-art" style="view-transition-name: study-{key}">{category_image(key, True)}</div>'
           if key else '')
    group_links = ''.join(f'<a href="{path}?{escape(urlencode({"category": value}))}">{escape(value)}</a>' for value in labels)
    groups = f'<div class="category-chips" aria-label="Recorded categories">{group_links}</div>' if key and len(labels) > 1 else ''
    selected_name = 'More materials' if selected == MORE_MATERIALS else selected
    heading = f'Results for “{query}”' if query and not key else leaf or selected_name or label
    results = cards(visible) if visible else empty('No matching materials', 'Try a different search or browse the full catalogue.')
    if key and not labels and not products and not query:
        results = empty('This shelf is empty', 'The ERP catalogue has no products for this collection.')
    count = f'{len(products):,} {"material" if len(products) == 1 else "materials"}'
    reset_path = category_url(key, selected, leaf) if key else path
    pagination = ''
    if pages > 1:
        prev = page_link(current-1, 'Previous') if current > 1 else ''
        following = page_link(current+1, 'Next') if current < pages else ''
        pagination = f'<nav class="pagination" aria-label="Catalogue pages">{prev}<span>Page {current} of {pages}</span>{following}</nav>'
    content = f'''<section class="wrap page">
{trail(heading, (category_url(key, selected), selected_name) if key and leaf and selected else
       (category_url(key), label) if key and selected else None)}
<div class="collection-head{' has-art' if key else ''}"><div><h1>{escape(heading)}</h1><p>{escape(intro)}</p>
{'<a class="button outline button--small collection-back" data-studio-link href="/shop">Back to all categories</a>' if key else ''}</div>{'' if key else art}</div>
{groups}
<form class="filters" action="{path}" aria-label="Filter materials">
<input type="hidden" name="subcategory" value="{escape(selected)}">
<div class="filter-head"><h2>Filter materials</h2><a class="button outline button--small" {'data-studio-link' if key else ''} href="{escape(reset_path)}">Clear filters</a></div>
<div class="filter-fields">
<label>Search<input type="search" name="q" maxlength="100" placeholder="Name, brand or SKU" value="{escape(query)}"></label>
<label>Category<select name="category">{option('', 'All categories', category)}{''.join(option(v, CATEGORIES.get(v,(v,''))[0], category) for v in labels)}</select></label>
{f"""<label>Product type<select name="type">{option('', 'All types', leaf)}{''.join(option(v, v, leaf) for v in leaves)}</select></label>""" if leaves else ''}
<label>Brand<select name="brand">{option('', 'All brands', brand)}{''.join(option(v, v, brand) for v in brands)}</select></label>
<label>Availability<select name="stock">{option('', 'Any availability', availability)}{option('in', 'In stock', availability)}</select></label>
<label>Sort by<select name="sort">{option('', 'Best match' if query else 'Name', order)}{option('low', 'Price, low to high', order)}{option('high', 'Price, high to low', order)}</select></label>
</div>
<div class="filter-actions"><p class="result-count" role="status">{count}</p><button class="button">Apply filters</button></div>
</form>
{results}{pagination}</section>'''
    return content, current


def detail(p, products):
    key = category_for(p)
    parent = (f'{SHOP}/category/{key}', CATEGORIES[key][0]) if key else ('/shop/catalogue', 'All materials')
    related = [r for r in products if r['id'] != p['id'] and p['category'] and r['category'] == p['category']][:4]
    desc = f'<p class="description">{escape(p["description"])}</p>' if p['description'] else ''
    cap = max(1, p['stock'])
    disabled = ' disabled' if p['stock'] < 1 else ''
    return f'''<section class="wrap page">
{trail(p["name"], parent)}
<div class="detail">
  <div class="detail-art">{image(p, True)}</div>
  <div class="detail-copy">
    <a class="button outline button--small" href="{parent[0]}">Browse {escape(parent[1])}</a>
    <h1>{escape(p["name"])}</h1>
    <p class="detail-price">{f'<del>{price(p["mrp"])}</del> ' if p['discount'] else ''}{price(p["price"])}</p>
    {f'<p class="detail-discount">Save {price(p["mrp"] - p["price"])} ({p["discount"]}%)</p>' if p['mrp'] > p['price'] else ''}
    <p>{escape(p['brand'])} {escape(p['variant'])}</p>
    <p>{stock_label(p)} <span class="sku">SKU {escape(p["source_sku"] or p["sku"])}</span></p>
    {desc}
    {f'<p class="reference-price">Demo price checked {escape(p["reference_date"])}. <a href="{escape(p["reference_url"])}" rel="noopener">Price reference</a></p>' if p['reference_url'] else ''}
    {f'<p class="image-credit">Image source {escape(p["image_source"])}. {escape(p["image_license"])}</p>' if p['image'] != PLACEHOLDER else ''}
    <form class="purchase" data-add="{p["id"]}">
      <label>Quantity<input type="number" name="quantity" min="1" max="{cap}" value="1" required{disabled}></label>
      <button class="button" type="submit"{disabled}>Add to cart {icon("bag")}</button>
      {save_button(p)}
    </form>
    <p id="add-message" class="cart-note"></p>
    <noscript><p>Enable JavaScript to use your cart and wishlist.</p></noscript>
  </div>
</div>
</section>''' + (f'<section class="wrap section"><h2>More from this category</h2>{cards(related)}</section>' if related else '')


def product_schema(p, origin):
    offer = {'@type':'Offer', 'url':origin + p['url'], 'priceCurrency':'INR', 'price':price(p['price']).replace('₹','').replace(',',''),
             'availability':'https://schema.org/' + ('InStock' if p['stock'] > 0 else 'OutOfStock')}
    schema = {'@context':'https://schema.org', '@type':'Product', 'name':p['name'], 'sku':p['sku'], 'offers':offer}
    if p['brand']:
        schema['brand'] = {'@type':'Brand', 'name':p['brand']}
    if p['description']:
        schema['description'] = p['description']
    if p['image'] != PLACEHOLDER:
        schema['image'] = origin + p['image']
    return schema


def breadcrumb_schema(origin, *items):
    return {'@context':'https://schema.org', '@type':'BreadcrumbList', 'itemListElement':[
        {'@type':'ListItem', 'position':position, 'name':name, 'item':origin + url}
        for position, (url, name) in enumerate(((SHOP, 'Home'), *items), 1)
    ]}


def response(status, body, mime='text/html; charset=utf-8', headers=()):
    if isinstance(body, str):
        body = body.encode()
    return status, [('Content-Type', mime), ('Content-Length', str(len(body))),
                    ('X-Content-Type-Options', 'nosniff'), *headers], body


def json_response(body, status=200):
    return response(status, json.dumps(body), 'application/json; charset=utf-8', [('Cache-Control', 'no-store')])


def demo_page(view):
    membership = view == 'privilege'
    title = 'Gupta Privilege' if membership else 'Checkout'
    if membership:
        form = f'''<h2>Request a Privilege card</h2>
<p>Leave an email or mobile number to open a request in WhatsApp, or try the {price(MEMBER_PRICE)} demo purchase.</p>
<form data-demo-form="privilege" method="post" action="/api/storefront/demo/privilege">
  <label>Full name <small>(for card purchases)</small><input name="name" maxlength="100" autocomplete="name"></label>
  <label>Email or mobile number<input name="contact" maxlength="160" required></label>
  <p class="commerce-error" role="alert"></p>
  <div class="commerce-actions">
    <button class="button" type="submit" value="apply">Send my details</button>
    <button class="button outline" type="submit" value="buy">Buy for {price(MEMBER_PRICE)}</button>
  </div>
</form>'''
        summary = f'''<div class="commerce-benefit">
<span class="commerce-label">Gupta Privilege</span><strong>{MEMBER_PERCENT}%</strong><span>off regular prices in this demo</span></div>
<h2>Ways to join</h2>
<dl class="commerce-rules">
  <div><dt>Earn your card</dt><dd>Spend more than {price(QUALIFYING_SPEND)} on materials in one paid order, after savings and before tax and delivery.</dd></div>
  <div><dt>Buy your card</dt><dd>Pay {price(MEMBER_PRICE)} once. Use the issued card number and the same contact at demo checkout.</dd></div>
</dl>
<p>At checkout you get the better of the member price and the current sale price.</p>'''
        intro = 'Get special prices on art supplies with a Privilege card.'
    else:
        form = f'''<h2>Contact and fulfillment</h2>
<form data-demo-form="checkout" method="post" action="/api/storefront/demo/checkout">
  <div class="commerce-fields">
    <label>Full name<input name="name" autocomplete="name" maxlength="100" required></label>
    <label>Email or mobile number<input name="contact" maxlength="160" required></label>
  </div>
  <fieldset><legend>How would you like to receive your order?</legend>
    <div class="commerce-choices">
      <label><input type="radio" name="fulfillment" value="delivery" checked> Delivery <small>{price(DELIVERY_FEE)}</small></label>
      <label><input type="radio" name="fulfillment" value="pickup"> Store pickup <small>Free</small></label>
    </div>
  </fieldset>
  <div class="commerce-fields" data-delivery>
    <label class="commerce-wide">Street address<input name="address" autocomplete="street-address" maxlength="180" required></label>
    <label>City<input name="city" autocomplete="address-level2" maxlength="80" required></label>
    <label>State<input name="region" autocomplete="address-level1" maxlength="80" required></label>
    <label>PIN code<input name="pin" inputmode="numeric" autocomplete="postal-code" maxlength="6" pattern="[1-9][0-9]{{5}}" required></label>
  </div>
  <label>Privilege card <small>(optional)</small><input name="card" maxlength="40" autocomplete="off" placeholder="GA-DEMO-…"></label>
  <label>Payment method
    <select name="payment"><option value="upi">Demo UPI</option><option value="card">Demo card</option>
      <option value="cod">Cash on delivery</option><option value="pickup" hidden disabled>Pay at pickup</option></select>
  </label>
  <p class="commerce-error" role="alert"></p>
  <div class="commerce-actions"><button class="button" type="submit">Review order</button>
    <a class="button outline" href="/shop/cart">Edit cart</a></div>
</form>'''
        summary = '''<h2>Order summary</h2><div data-order-summary aria-live="polite" aria-busy="true"><p>Loading your cart…</p></div>'''
        intro = 'Choose delivery or pickup, then review your order and savings.'
    return f'''<section class="wrap page commerce-page">
{trail(title)}
<div class="commerce-heading"><p class="commerce-label">Private demo</p><h1>{title}</h1><p>{intro}</p></div>
<div class="commerce-layout">
  <div class="commerce-panel">{form}</div>
  <aside class="commerce-panel commerce-summary">{summary}</aside>
</div>
<section class="commerce-panel commerce-result" data-demo-result hidden></section>
<p class="commerce-note">Use sample contact details. Payments are simulated in this demo.</p>
<noscript><p>Enable JavaScript to use this demo form.</p></noscript>
</section>'''


def storefront_demo_post(path, size, source, content_type, origin, read, connect, raw_cookies=''):
    if demo_path() is None:
        return json_response({'error': 'Demo checkout is unavailable.'}, 404)
    if source != origin:
        return json_response({'error': 'Open the demo from the storefront address.'}, 403)
    if content_type.partition(';')[0].strip().lower() != 'application/json':
        return json_response({'error': 'Send a JSON checkout form.'}, 415)
    try:
        size = int(size)
    except (ValueError, TypeError):
        size = 0
    if not 0 < size <= BODY_LIMIT:
        return json_response({'error': 'The checkout form is empty or too large.'}, 413)

    def load_products(ids, transaction=None):
        marks = ','.join('?' for _ in ids)
        if transaction is not None:
            rows = transaction.execute(f'SELECT {PRODUCT_FIELDS}, tax FROM inventory.products WHERE archived=0 AND id IN ({marks})', tuple(ids))
            return {str(row['id']): public_product(catalogue_product(row)) for row in rows}
        with closing(connect()) as c:
            rows = c.execute(f'SELECT {PRODUCT_FIELDS}, tax FROM products WHERE archived=0 AND id IN ({marks})', tuple(ids))
            return {str(row['id']): public_product(catalogue_product(row)) for row in rows}

    try:
        account = accounts.current_account(raw_cookies)
        if path == CHECKOUT_API and not account:
            return json_response({'error': 'Sign in to place your order.'}, 401)
        return json_response(submit_demo(path, read(size), load_products, account['id'] if account else None))
    except ValueError as error:
        return json_response({'error': str(error)}, 400)
    except sqlite3.DatabaseError:
        return json_response({'error': 'Demo checkout is temporarily unavailable. Please try again.'}, 503)


ACCOUNT_PAGES = {'/shop/sign-in', '/shop/sign-up', '/shop/account'}
ACCOUNT_CALLBACK = re.compile(r'/shop/auth/(google|apple)(/callback)?')


def navigation_products(connection):
    return [dict(row) for row in connection.execute('''SELECT DISTINCT category,subcategory,brand,catalogue_groups,
        CASE WHEN catalogue_groups='[]' THEN name ELSE '' END AS name FROM products WHERE archived=0''')]


def account_return(value):
    if (len(value) <= 1000 and not any(ord(char) < 32 or ord(char) == 127 for char in value)
            and '\\' not in value and re.fullmatch(r'/shop(?:/?|/(?:cart|checkout|catalogue|wishlist|privilege|category/[a-z-]+|product/[a-z0-9-]+))(?:\?[^#]*)?', value)):
        return value
    return '/shop/account'


def storefront_account_response(path, method, query, origin, raw_cookies, source, content_type, size, read, connect):
    private = [('Cache-Control', 'no-store'), ('Referrer-Policy', 'same-origin')]
    if path == '/shop/auth/session' and method == 'GET':
        return json_response({'signed_in': accounts.current_account(raw_cookies) is not None})
    if path == '/shop/auth/sign-out':
        if method != 'POST' or source != origin:
            return response(403, 'Sign out from your account page.', 'text/plain', private)
        return response(303, '', headers=[*private, ('Location', '/shop/sign-in'),
                                          ('Set-Cookie', accounts.sign_out(raw_cookies, origin))])
    match = ACCOUNT_CALLBACK.fullmatch(path)
    if match:
        provider, callback = match.groups()
        expected_method = 'POST' if callback and provider == 'apple' else 'GET'
        if method != expected_method:
            return response(405, 'Method not allowed', 'text/plain', [*private, ('Allow', expected_method)])
        config = accounts.provider_config(provider, origin)
        if not config:
            return response(303, '', headers=[*private, ('Location', '/shop/sign-in?status=unavailable')])
        if not callback:
            url, flow = accounts.begin(provider, origin, config[0])
            return response(303, '', headers=[*private, ('Location', url), ('Set-Cookie', flow)])
        clear_flow = accounts.cookie(accounts.FLOW_COOKIE, '', origin, 0)
        headers = [*private, ('Set-Cookie', clear_flow)]
        try:
            if method == 'POST':
                length = int(size or 0)
                if not 0 < length <= BODY_LIMIT or content_type.partition(';')[0] != 'application/x-www-form-urlencoded':
                    raise ValueError('Invalid sign-in response.')
                query = read(length).decode()
            if len(query) > BODY_LIMIT:
                raise ValueError('Invalid sign-in response.')
            session = accounts.finish(provider, origin, config, parse_qs(query), raw_cookies)
        except (ValueError, UnicodeError):
            return response(303, '', headers=[*headers, ('Location', '/shop/sign-in?status=retry')])
        return response(303, '', headers=[*headers, ('Location', '/shop/account'), ('Set-Cookie', session)])
    if path not in ACCOUNT_PAGES:
        return None
    demo_email = accounts.demo_credentials_enabled(origin)
    params = parse_qs(query)
    next_page = account_return(params.get('next', [''])[0])
    error = ''
    if method == 'POST' and demo_email and path != '/shop/account':
        if source != origin:
            return response(403, 'Open the account form from the storefront address.', 'text/plain', private)
        try:
            length = int(size or 0)
            if not 0 < length <= 8192 or content_type.partition(';')[0] != 'application/x-www-form-urlencoded':
                raise ValueError('Send a valid account form.')
            fields = parse_qs(read(length).decode())
            session = accounts.email_session(path.endswith('/sign-up'), fields, raw_cookies, origin)
            return response(303, '', headers=[*private, ('Location', next_page), ('Set-Cookie', session)])
        except (ValueError, UnicodeError) as exc:
            error = str(exc)
    if method not in {'GET', 'HEAD'} and not error:
        return response(405, 'Method not allowed', 'text/plain', [*private, ('Allow', 'GET, HEAD')])
    account = accounts.current_account(raw_cookies)
    if path == '/shop/account' and not account:
        return response(303, '', headers=[*private, ('Location', '/shop/sign-in')])
    if path != '/shop/account' and account:
        return response(303, '', headers=[*private, ('Location', next_page)])
    demo = demo_path() is not None
    with closing(connect()) as c:
        products = navigation_products(c)
    if account:
        title = 'Your account'
        identity = escape(account['name'] or account['email'] or account['provider'].capitalize() + ' member')
        orders = customer_orders(account['id'])
        history = ''.join(f'<li><strong>{escape(order["receipt"]["reference"])}</strong>'
                          f'<span>{escape(order["kind"])} · {price(order["receipt"]["total"])}'
                          f' · {"Demo paid" if order["receipt"]["paid"] else "Payment due"}</span></li>' for order in orders)
        privilege = '<a class="button outline" href="/shop/privilege">Gupta Privilege</a>' if demo else ''
        content = f'''<section class="wrap page account-dashboard">{trail(title)}
<h1>{title}</h1><p>{identity}</p>
<div class="account-actions"><a class="button outline" href="/shop/wishlist">Wishlist</a>
<a class="button outline" href="/shop/cart">View cart</a>{privilege}
<form action="/shop/auth/sign-out" method="post"><button class="button outline">Sign out</button></form></div>
<h2>Order history</h2>{'<ul class="account-orders">' + history + '</ul>' if history else '<p>Orders placed while signed in will appear here.</p>'}
</section>'''
    else:
        signup = path.endswith('/sign-up')
        title = 'Create your account' if signup else 'Sign in to Gupta'
        desc = ('Create an account to add materials to your cart and keep track of orders.' if signup else
                'Pick up where you left off and see your Gupta orders.')
        redirect_query = '?' + urlencode({'next': next_page}) if next_page != '/shop/account' else ''
        actions = ''
        for provider in accounts.PROVIDERS:
            label = (f'<img src="/storefront/{provider}-sign-in.png" alt="" width="22" height="22">'
                     f'<span>Continue with {provider.title()}</span>')
            button = f'account-provider account-provider-{provider}'
            if accounts.provider_config(provider, origin):
                actions += f'<a class="{button}" href="/shop/auth/{provider}">{label}</a>'
            else:
                actions += f'<button class="{button}" type="button" disabled>{label}</button>'
        missing = [provider.title() for provider in accounts.PROVIDERS if not accounts.provider_config(provider, origin)]
        status = params.get('status', [''])[0]
        if not error and status in {'retry', 'unavailable'}:
            error = 'Sign-in could not be completed. Please try again.'
        note = f'<p class="account-note">{" and ".join(missing)} sign-in requires store setup.</p>' if missing else ''
        alert = f'<p class="account-error" role="alert">{escape(error)}</p>' if error else ''
        switch = (f'Already have an account? <a href="/shop/sign-in{escape(redirect_query)}">Sign in</a>' if signup else
                  f'New to Gupta? <a href="/shop/sign-up{escape(redirect_query)}">Create an account</a>')
        email_form = ''
        if demo_email:
            name = '<label>Full name<input name="name" autocomplete="name" maxlength="100" required></label>' if signup else ''
            email_form = f'''<form class="account-form" action="{path}{escape(redirect_query)}" method="post">
{name}<label>Email address<input name="email" type="email" autocomplete="username" maxlength="254" required></label>
<label>Password<input name="password" type="password" autocomplete="{'new-password' if signup else 'current-password'}" minlength="10" maxlength="160" required></label>
<button class="button" type="submit">{'Create demo account' if signup else 'Sign in with email'}</button>
{'<p class="account-note">Use sample details and a unique demo password.</p>' if signup else ''}</form>
<p class="account-divider">Or continue with</p>'''
        content = f'''<section class="wrap account-shell" aria-labelledby="account-heading">
<div class="account-copy"><a class="account-browse" href="/shop/catalogue">{icon('arrow')} Browse materials</a>
<h1 id="account-heading">{title}</h1><p class="account-intro">{desc}</p>{alert}{email_form}
<div class="account-providers">{actions}</div>{note}<p class="account-switch">{switch}</p></div>
<figure class="account-art"><img src="/storefront/art/studio-v2.webp" alt="Brushes and canvases on the sunlit Gupta workbench" width="2172" height="724">
<figcaption>Gupta Art Store <span>Since 1916</span></figcaption></figure>
</section>'''
    return response(400 if error and method == 'POST' else 200, layout(title, 'Your Gupta store account.', path, content, origin,
                    noindex=True, products=products, demo=demo), headers=private)


def storefront_response(path, query, connect, origin, raw_cookies=''):
    """Return None for routes owned by the local ERP."""
    if path.startswith('/storefront/'):
        relative = path.removeprefix('/storefront/')
        if relative.startswith('media/'):
            file = media_file(relative.removeprefix('media/'))
            if file:
                try:
                    return response(200, file.read_bytes(), IMAGE_TYPES[file.suffix.lower()], [('Cache-Control','no-cache')])
                except FileNotFoundError:
                    pass
            return response(404, 'Image not found', 'text/plain')
        file = (ASSETS / relative).resolve()
        types = {**IMAGE_TYPES, '.svg':'image/svg+xml', '.css':'text/css; charset=utf-8',
                 '.js':'text/javascript; charset=utf-8', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8',
                 '.glb':'model/gltf-binary'}
        if file.is_relative_to(ASSETS) and file.suffix in types and file.is_file():
            cache = 'no-cache' if file.suffix in {'.js', '.css', '.glb', '.webp'} else 'public, max-age=3600'
            return response(200, file.read_bytes(), types[file.suffix], [('Cache-Control',cache)])
        return response(404, 'File not found', 'text/plain')
    if path == '/robots.txt':
        rules = 'User-agent: *\nDisallow: /api/\nDisallow: /legacy-shop\n'
        return response(200, rules + f'Sitemap: {origin}/sitemap.xml\n', 'text/plain')
    if (path not in {'/sitemap.xml', '/api/storefront/products', '/api/storefront/search', SHOP}
            and not path.startswith(SHOP + '/')):
        return None
    if len(query) > 6500:
        return json_response({'error':'Query is too long.'}, 400)
    if path == '/shop/checkout' and demo_path() and not accounts.current_account(raw_cookies):
        return response(303, '', headers=[('Cache-Control', 'no-store'),
                        ('Location', '/shop/sign-up?' + urlencode({'next': path}))])
    params = parse_qs(query)
    if path == '/api/storefront/products':
        ids = params.get('ids', [''])[0]
        if not re.fullmatch(rf'{PRODUCT_ID}(?:,{PRODUCT_ID}){{0,99}}', ids):
            return json_response({'error':'Provide up to 100 product IDs.'}, 400)
        ids = tuple(map(int, ids.split(',')))
        if any(product_id > MAX_PRODUCT_ID for product_id in ids):
            return json_response({'error':'Invalid product ID.'}, 400)
        placeholders = ','.join('?' for _ in ids)
        with closing(connect()) as c:
            rows = c.execute(f'SELECT {PRODUCT_FIELDS} FROM products WHERE archived=0 AND id IN ({placeholders})', ids)
            return json_response({'products':[public_product(catalogue_product(row)) for row in rows]})
    with closing(connect()) as c:
        query_text = params.get('q', [''])[0].strip()[:100]
        if path == '/api/storefront/search':
            ids = search_ids(c, query_text, 8)
            if not ids:
                return json_response({'products':[]})
            slots = ','.join('?' for _ in ids)
            found = {row['id']: public_product(catalogue_product(row)) for row in c.execute(
                f'SELECT {PRODUCT_FIELDS} FROM products WHERE archived=0 AND id IN ({slots})', ids)}
            matches = [found[pid] for pid in ids if pid in found]
            if params.get('brief') == ['1']:
                matches = [{key: product[key] for key in ('id', 'name', 'url', 'image')} for product in matches]
            return json_response({'products':matches})
        ranked = {pid: index for index, pid in enumerate(search_ids(c, query_text))} if query_text else None
        nav_products = None
        where, args = '', ()
        if path == SHOP + '/catalogue' and ranked is not None and len(ranked) <= 1000:
            nav_products = navigation_products(c)
            args = tuple(ranked)
            where = ' AND id IN (' + ','.join('?' for _ in args) + ')' if args else ' AND 0'
        products = [catalogue_product(row) for row in c.execute(
            f'SELECT {PRODUCT_FIELDS} FROM products WHERE archived=0{where} ORDER BY name COLLATE NOCASE, id', args)]
        notice = announcement(c)
    if path == '/sitemap.xml':
        paths = [SHOP, SHOP + '/catalogue', SHOP + '/about', SHOP + '/privacy', SHOP + '/refunds']
        paths.extend(f'{SHOP}/category/{key}' for key in CATEGORIES if any(in_category(p, key) for p in products))
        paths.extend(f'{SHOP}/product/{slug(p["name"])}-{p["id"]}' for p in products)
        xml = ''.join(f'<url><loc>{escape(origin + url)}</loc></url>' for url in paths)
        return response(200, '<?xml version="1.0" encoding="UTF-8"?>'
                        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + xml + '</urlset>',
                        'application/xml; charset=utf-8', [('Cache-Control','no-cache')])

    demo = demo_path() is not None
    title, desc, status, noindex, schema = '', 'Browse art supplies and stationery from Gupta’s demo catalogue.', 200, False, None
    canonical = path
    if path in {SHOP, SHOP + '/'}:
        canonical = SHOP
        content = home(products, demo)
    elif path == SHOP + '/catalogue' or path.removeprefix(SHOP + '/category/') in CATEGORIES:
        key = path.removeprefix(SHOP + '/category/') if path != SHOP + '/catalogue' else None
        title, desc = CATEGORIES[key] if key else ('Catalogue', 'Browse the store’s art supplies and stationery.')
        selected = params.get('subcategory', [''])[0]
        leaf = params.get('type', [''])[0]
        if key and (selected or leaf):
            branch = leaf or ('More materials' if selected == MORE_MATERIALS else selected)
            title = branch + ' — ' + title
            canonical = category_url(key, selected, leaf)
        noindex = any(param in params for param in ('q', 'category', 'brand', 'type', 'stock', 'sort')) or (
            bool(key) and not any(in_category(p, key) for p in products))
        if key:
            content, page = studio_page(products, key, params, ranked)
        else:
            content, page = listing(path, params, products, ranked=ranked, facets=nav_products)
        if page > 1 and not noindex:
            canonical += ('&' if '?' in canonical else '?') + 'page=' + str(page)
        schema = breadcrumb_schema(origin, (canonical, title))
    elif path in {SHOP + '/cart', SHOP + '/wishlist'}:
        title = 'Your cart' if path.endswith('/cart') else 'Your wishlist'
        view = 'cart' if path.endswith('/cart') else 'wishlist'
        noindex = True
        content = f'''<section class="wrap page">{trail(title)}<h1>{title}</h1>
<p class="saved-intro">{('Review your materials before checkout.' if demo else 'Save materials here while you browse the demo catalogue.') if view == 'cart' else 'Keep materials you want to find again.'}</p>
<div data-view="{view}" data-demo-checkout="{int(demo)}" aria-busy="true"><p>Loading your {view}…</p></div>
<noscript><p>Enable JavaScript to see the items saved in this browser.</p><a href="/shop/catalogue">Browse materials</a></noscript></section>'''
    elif demo and path in {SHOP + '/checkout', SHOP + '/privilege'}:
        view = path.rsplit('/', 1)[1]
        title = 'Gupta Privilege' if view == 'privilege' else 'Checkout'
        noindex = True
        notice = ''
        content = demo_page(view)
    elif path == SHOP + '/about':
        title = 'About this demo'
        content = f'<section class="wrap page prose">{trail(title)}<h1>{title}</h1><p>{BRAND} is a private demonstration storefront using the store’s ERP catalogue. Imported prices and availability reflect the dated supplier snapshot linked on each product page.</p><p>You can browse materials and save them in your browser.</p></section>'
    elif path == SHOP + '/privacy':
        title = 'Privacy policy'
        content = f'''<section class="wrap page prose">{trail(title)}<h1>{title}</h1>
<p>This policy describes how this Gupta storefront demo handles the information you share.</p>
<h2>Browsing and shopping</h2><p>Your cart and wishlist are saved in this browser. You can clear them through your browser’s site settings. Search terms and availability checks go to the storefront server.</p>
<h2>Account and demo checkout</h2><p>If you sign in through Google or Apple, the storefront uses the provider’s account identifier and the email address it shares to create your account. Local demo accounts store the name and email you enter and a salted password hash. A session cookie keeps you signed in. Demo orders store the sample contact and fulfillment details you submit.</p>
<h2>WhatsApp messages</h2><p>When you open a WhatsApp draft, the request or order details in the draft go to WhatsApp. You can review and edit the draft before sending it to the store.</p></section>'''
    elif path == SHOP + '/refunds':
        title = 'Refund policy'
        content = f'''<section class="wrap page prose">{trail(title)}<h1>{title}</h1>
<p>Checkout and Privilege card purchases on this demo use simulated payments. Demo orders are never shipped and do not generate a charge or refund.</p>
<h2>Purchases made at the store</h2><p>For a purchase made outside this demo, ask Gupta Art Store and Stationary about the terms that apply to your receipt.</p></section>'''
    else:
        match = re.fullmatch(rf'/shop/product/[a-z0-9-]+-({PRODUCT_ID})', path)
        product = next((p for p in products if match and p['id'] == match[1]), None)
        if product:
            product = public_product(product)
        if product and path != product['url']:
            return response(301, '', headers=[('Location', product['url']), ('Cache-Control','no-store')])
        if product:
            title = product['name']
            desc = (' '.join(product['description'].split()) if product['description'] else f"{title} in the {BRAND} catalogue.")[:160]
            if any(p['id'] != product['id'] and p['name'].casefold() == title.casefold() for p in products):
                title = f"{title} ({product['sku']})"
                desc = f"SKU {product['sku']}. {desc}"[:160]
            content = detail(product, products)
            key = category_for(product)
            parent = (f'{SHOP}/category/{key}', CATEGORIES[key][0]) if key else (SHOP + '/catalogue', 'All materials')
            schema = [product_schema(product, origin), breadcrumb_schema(origin, parent, (path, product['name']))]
        else:
            title, status, noindex = 'Page not found', 404, True
            content = '<section class="wrap page">' + empty(title, 'This page or product is no longer available.') + '</section>'
    return response(status, layout(title, desc, canonical, content, origin, notice, noindex, schema,
                                   products if nav_products is None else nav_products, demo),
                    headers=[('Cache-Control','no-cache')])


def read_catalogue():
    db = Path(os.environ.get('GUPTHA_DB', ROOT / 'data' / 'retail.sqlite3')).resolve()
    c = sqlite3.connect(db.as_uri() + '?mode=ro', uri=True, timeout=5)
    c.row_factory = sqlite3.Row
    return c


def application(environ, start_response):
    """Production WSGI entry point. The ERP web server remains private."""
    origin = os.environ.get('GUPTHA_PUBLIC_ORIGIN', 'http://127.0.0.1:8080').rstrip('/')
    method, path = environ['REQUEST_METHOD'], environ['PATH_INFO']
    raw_cookies = environ.get('HTTP_COOKIE', '')
    if CATALOGUE_PREVIEW and (method not in {'GET', 'HEAD'} or path in ACCOUNT_PAGES
                              or path in {'/shop/cart', '/shop/checkout', '/shop/privilege'}
                              or path.startswith('/shop/auth/')):
        result = response(404, 'This route is unavailable in the catalogue preview.', 'text/plain')
    elif path in ACCOUNT_PAGES or path.startswith('/shop/auth/'):
        try:
            result = storefront_account_response(
                path, method, environ.get('QUERY_STRING', ''), origin, raw_cookies, environ.get('HTTP_ORIGIN'),
                environ.get('CONTENT_TYPE', ''), environ.get('CONTENT_LENGTH'), environ['wsgi.input'].read, read_catalogue)
        except sqlite3.DatabaseError:
            result = response(503, 'Account temporarily unavailable.', 'text/plain', [('Cache-Control', 'no-store')])
        if result is None:
            result = response(404, 'Not found', 'text/plain')
    elif method == 'POST' and path in POST_PATHS:
        result = storefront_demo_post(path, environ.get('CONTENT_LENGTH'), environ.get('HTTP_ORIGIN'),
                                      environ.get('CONTENT_TYPE', ''), origin, environ['wsgi.input'].read, read_catalogue, raw_cookies)
    elif method not in {'GET', 'HEAD'}:
        result = response(405, 'Method not allowed', 'text/plain', [('Allow','GET, HEAD')])
    elif path == '/':
        result = response(302, '', headers=[('Location', SHOP)])
    else:
        try:
            result = storefront_response(path, environ.get('QUERY_STRING', ''), read_catalogue, origin, raw_cookies)
        except sqlite3.DatabaseError:
            result = response(503, 'Catalogue temporarily unavailable. Please try again.', 'text/plain')
        if result is None:
            result = response(404, 'Not found', 'text/plain')
    status, headers, body = result
    start_response(f'{status} {HTTPStatus(status).phrase}', headers)
    return [b'' if method == 'HEAD' else body]

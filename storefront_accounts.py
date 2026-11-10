"""Customer sessions and provider login for the storefront."""
from contextlib import closing
from functools import lru_cache
from hashlib import pbkdf2_hmac, sha256
from hmac import compare_digest
from http.cookies import CookieError, SimpleCookie
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


SESSION_COOKIE = 'gupta_customer'
FLOW_COOKIE = 'gupta_login'
SESSION_AGE = 60 * 60 * 24 * 14
FLOW_AGE = 600
PROVIDERS = {
    'google': ('https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token',
               'https://www.googleapis.com/oauth2/v3/certs', ('https://accounts.google.com', 'accounts.google.com'), 'openid email profile'),
    'apple': ('https://appleid.apple.com/auth/authorize', 'https://appleid.apple.com/auth/token',
              'https://appleid.apple.com/auth/keys', ('https://appleid.apple.com',), 'email'),
}
TOKEN_PATTERN = re.compile(r'[A-Za-z0-9_-]{43}')


def digest(value):
    return sha256(value.encode()).hexdigest()


def cookies(raw):
    try:
        jar = SimpleCookie(raw)
    except CookieError:
        return {}
    return {key: item.value for key, item in jar.items()}


def cookie(name, value, origin, age, same_site='Lax'):
    secure = '; Secure' if urlsplit(origin).scheme == 'https' else ''
    path = '/shop/auth' if name == FLOW_COOKIE else '/'
    return f'{name}={value}; Path={path}; Max-Age={age}; HttpOnly; SameSite={same_site}{secure}'


def provider_config(name, origin):
    if name not in PROVIDERS or not os.environ.get('GUPTHA_ACCOUNTS_DB'):
        return None
    scheme = urlsplit(origin).scheme
    if scheme != 'https' and (name == 'apple' or urlsplit(origin).hostname not in {'localhost', '127.0.0.1', '::1'}):
        return None
    prefix = f'GUPTHA_{name.upper()}'
    client = os.environ.get(prefix + '_CLIENT_ID')
    secret = os.environ.get(prefix + '_CLIENT_SECRET')
    if client and secret and importlib.util.find_spec('jwt') and importlib.util.find_spec('cryptography'):
        return client, secret
    return None


def demo_credentials_enabled(origin):
    return (urlsplit(origin).hostname in {'localhost', '127.0.0.1', '::1'}
            and bool(os.environ.get('GUPTHA_ACCOUNTS_DB') and os.environ.get('GUPTHA_DEMO_CHECKOUT_DB')))


def connect_accounts():
    path = Path(os.environ['GUPTHA_ACCOUNTS_DB']).resolve()
    catalogue = Path(os.environ.get('GUPTHA_DB', Path(__file__).parent / 'data/retail.sqlite3')).resolve()
    checkout = os.environ.get('GUPTHA_DEMO_CHECKOUT_DB')
    for other in [catalogue, *([Path(checkout).resolve()] if checkout else [])]:
        if path == other or (path.exists() and other.exists() and path.samefile(other)):
            raise sqlite3.OperationalError('A separate customer accounts database is required.')
    conn = sqlite3.connect(path, timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS customers_online (
                id TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL,
                name TEXT NOT NULL, email TEXT NOT NULL, UNIQUE(provider,subject)
            );
            CREATE TABLE IF NOT EXISTS customer_sessions (
                token TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS customer_passwords (
                account_id TEXT PRIMARY KEY REFERENCES customers_online(id),
                salt TEXT NOT NULL, hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS customer_login_states (
                state TEXT PRIMARY KEY, binding TEXT NOT NULL, provider TEXT NOT NULL,
                nonce TEXT NOT NULL, expires INTEGER NOT NULL
            );
        """)
    except sqlite3.DatabaseError:
        conn.close()
        raise
    return conn


def current_account(raw):
    token = cookies(raw).get(SESSION_COOKIE, '')
    if not TOKEN_PATTERN.fullmatch(token) or not os.environ.get('GUPTHA_ACCOUNTS_DB'):
        return None
    with closing(connect_accounts()) as conn:
        row = conn.execute('''SELECT a.id,a.provider,a.name,a.email FROM customers_online a
            JOIN customer_sessions s ON s.account_id=a.id WHERE s.token=? AND s.expires>?''',
                           (digest(token), int(time.time()))).fetchone()
    return dict(row) if row else None


def start_session(conn, account_id, raw, origin):
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    previous = cookies(raw).get(SESSION_COOKIE, '')
    conn.execute('DELETE FROM customer_sessions WHERE expires<=? OR token=?', (now, digest(previous)))
    conn.execute('INSERT INTO customer_sessions VALUES(?,?,?)', (digest(token), account_id, now + SESSION_AGE))
    return cookie(SESSION_COOKIE, token, origin, SESSION_AGE)


def email_session(signup, fields, raw, origin):
    email = fields.get('email', [''])[0].strip().casefold()
    password = fields.get('password', [''])[0]
    name = fields.get('name', [''])[0].strip()
    if len(email) > 254 or not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        raise ValueError('Enter a valid email address.')
    if not 10 <= len(password) <= 160:
        raise ValueError('Use a password with 10 to 160 characters.')
    if signup and (not 1 <= len(name) <= 100 or any(ord(char) < 32 for char in name)):
        raise ValueError('Enter your name.')
    with closing(connect_accounts()) as conn, conn:
        if signup:
            account_id = secrets.token_hex(16)
            salt = secrets.token_hex(16)
            value = pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
            try:
                conn.execute('INSERT INTO customers_online VALUES(?,?,?,?,?)', (account_id, 'demo', email, name, email))
            except sqlite3.IntegrityError:
                raise ValueError('This demo account already exists. Sign in to continue.') from None
            conn.execute('INSERT INTO customer_passwords VALUES(?,?,?)', (account_id, salt, value))
        else:
            found = conn.execute('''SELECT a.id,p.salt,p.hash FROM customers_online a
                JOIN customer_passwords p ON p.account_id=a.id WHERE a.provider='demo' AND a.subject=?''', (email,)).fetchone()
            salt = found['salt'] if found else '00' * 16
            value = pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
            if not found or not compare_digest(found['hash'], value):
                raise ValueError('That email address and password did not match.')
            account_id = found['id']
        return start_session(conn, account_id, raw, origin)


def begin(provider, origin, client):
    auth, _, _, _, scope = PROVIDERS[provider]
    state, binding, nonce = [secrets.token_urlsafe(32) for _ in range(3)]
    now = int(time.time())
    with closing(connect_accounts()) as conn, conn:
        conn.execute('DELETE FROM customer_login_states WHERE expires<=?', (now,))
        conn.execute('INSERT INTO customer_login_states VALUES(?,?,?,?,?)',
                     (digest(state), digest(binding), provider, nonce, now + FLOW_AGE))
    params = {'client_id': client, 'redirect_uri': f'{origin}/shop/auth/{provider}/callback',
              'response_type': 'code', 'scope': scope, 'state': state, 'nonce': nonce}
    if provider == 'apple':
        params['response_mode'] = 'form_post'
    return auth + '?' + urlencode(params), cookie(FLOW_COOKIE, binding, origin, FLOW_AGE,
                                                 'None' if provider == 'apple' else 'Lax')


@lru_cache(maxsize=2)
def signing_keys(url):
    from jwt import PyJWKClient
    return PyJWKClient(url, timeout=6)


def verify_provider(provider, origin, config, code, nonce):
    import jwt
    _, token_url, keys_url, issuers, _ = PROVIDERS[provider]
    client, secret = config
    body = urlencode({'client_id': client, 'client_secret': secret, 'code': code,
                      'grant_type': 'authorization_code', 'redirect_uri': f'{origin}/shop/auth/{provider}/callback'}).encode()
    request = Request(token_url, body, {'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urlopen(request, timeout=8) as result:
            token = json.loads(result.read(65536))['id_token']
        signing_key = signing_keys(keys_url).get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, signing_key, algorithms=['RS256'], audience=client, issuer=issuers,
                            options={'require': ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce']})
    except (ValueError, OSError, KeyError, TypeError, jwt.PyJWTError):
        raise ValueError('The sign-in provider could not verify this request.') from None
    if claims['nonce'] != nonce or ('azp' in claims and claims['azp'] != client):
        raise ValueError('The sign-in response does not match this request.')
    return claims


def finish(provider, origin, config, fields, raw):
    state = fields.get('state', [''])[0]
    binding = cookies(raw).get(FLOW_COOKIE, '')
    code = fields.get('code', [''])[0]
    if not TOKEN_PATTERN.fullmatch(state) or not TOKEN_PATTERN.fullmatch(binding) or not 0 < len(code) < 4096:
        raise ValueError('This sign-in request has expired or was cancelled.')
    now = int(time.time())
    with closing(connect_accounts()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        flow = conn.execute('''SELECT nonce FROM customer_login_states
            WHERE state=? AND binding=? AND provider=? AND expires>?''',
                            (digest(state), digest(binding), provider, now)).fetchone()
        if not flow:
            raise ValueError('This sign-in request has expired.')
        conn.execute('DELETE FROM customer_login_states WHERE state=?', (digest(state),))
    claims = verify_provider(provider, origin, config, code, flow['nonce'])
    subject = claims['sub']
    name = str(claims.get('name') or '')[:160]
    verified = claims.get('email_verified') in (True, 'true')
    email = str(claims.get('email') or '')[:254] if verified else ''
    with closing(connect_accounts()) as conn, conn:
        conn.execute('''INSERT INTO customers_online VALUES(?,?,?,?,?)
            ON CONFLICT(provider,subject) DO UPDATE SET
            name=COALESCE(NULLIF(excluded.name,''),customers_online.name),
            email=COALESCE(NULLIF(excluded.email,''),customers_online.email)''',
                     (secrets.token_hex(16), provider, subject, name, email))
        account = conn.execute('SELECT id FROM customers_online WHERE provider=? AND subject=?',
                               (provider, subject)).fetchone()
        return start_session(conn, account['id'], raw, origin)


def sign_out(raw, origin):
    token = cookies(raw).get(SESSION_COOKIE, '')
    if TOKEN_PATTERN.fullmatch(token) and os.environ.get('GUPTHA_ACCOUNTS_DB'):
        with closing(connect_accounts()) as conn, conn:
            conn.execute('DELETE FROM customer_sessions WHERE token=?', (digest(token),))
    return cookie(SESSION_COOKIE, '', origin, 0)

"""Guptha Arts: local single-business retail ERP. Python standard library only."""
import os, json, sqlite3, secrets, hashlib, hmac, time, csv, io, re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from datetime import datetime, timezone, date

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('GUPTHA_DB', str(ROOT / 'data' / 'retail.sqlite3')))
DB.parent.mkdir(parents=True, exist_ok=True)
SESSIONS = {}
FAILURES = {}
def connect():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c
def init():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),name TEXT,address TEXT DEFAULT '',phone TEXT DEFAULT '',gstin TEXT DEFAULT '',footer TEXT DEFAULT 'Thank you for shopping with us.');
        INSERT OR IGNORE INTO settings(id,name) VALUES(1,'Guptha Arts');
        CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT,salt TEXT,hash TEXT);
        CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL,sku TEXT NOT NULL UNIQUE,category TEXT DEFAULT '',price INTEGER NOT NULL,cost INTEGER NOT NULL DEFAULT 0,tax REAL NOT NULL DEFAULT 0,stock INTEGER NOT NULL DEFAULT 0,reorder INTEGER DEFAULT 5,published INTEGER DEFAULT 1,description TEXT DEFAULT '',archived INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT DEFAULT '',email TEXT DEFAULT '',address TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT DEFAULT '',email TEXT DEFAULT '',address TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,created TEXT NOT NULL,customer_id INTEGER REFERENCES customers(id),customer_name TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',channel TEXT NOT NULL,status TEXT NOT NULL,payment TEXT NOT NULL,subtotal INTEGER NOT NULL,discount INTEGER NOT NULL,tax INTEGER NOT NULL,total INTEGER NOT NULL,paid INTEGER NOT NULL,notes TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS lines(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),product_id INTEGER REFERENCES products(id),name TEXT,sku TEXT,qty INTEGER,price INTEGER,cost INTEGER,tax_rate REAL,tax INTEGER,total INTEGER);
        CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY,created TEXT,product_id INTEGER REFERENCES products(id),delta INTEGER,reason TEXT);
        CREATE TABLE IF NOT EXISTS purchases(id INTEGER PRIMARY KEY,created TEXT,supplier_id INTEGER REFERENCES suppliers(id),product_id INTEGER REFERENCES products(id),qty INTEGER,cost INTEGER,total INTEGER,reference TEXT);
        CREATE TABLE IF NOT EXISTS holds(id INTEGER PRIMARY KEY,created TEXT,label TEXT,cart TEXT);
        CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,order_id INTEGER REFERENCES orders(id),created TEXT,method TEXT,amount INTEGER,reference TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS privilege_cards(id INTEGER PRIMARY KEY,number TEXT NOT NULL UNIQUE,customer_id INTEGER REFERENCES customers(id),percent REAL NOT NULL,active INTEGER DEFAULT 1,expires TEXT DEFAULT '');
        ''')
        columns={r['name'] for r in c.execute('PRAGMA table_info(orders)')}
        for column,definition in [('card_number',"TEXT DEFAULT ''"),('card_percent','REAL DEFAULT 0')]:
            if column not in columns: c.execute(f'ALTER TABLE orders ADD COLUMN {column} {definition}')
        if 'metadata' not in {r['name'] for r in c.execute('PRAGMA table_info(holds)')}:
            c.execute("ALTER TABLE holds ADD COLUMN metadata TEXT DEFAULT '{}'")
        if 'image' not in {r['name'] for r in c.execute('PRAGMA table_info(products)')}:
            c.execute("ALTER TABLE products ADD COLUMN image TEXT DEFAULT ''")
        c.execute("INSERT INTO payments(order_id,created,method,amount,reference) SELECT id,created,CASE WHEN payment IN ('Cash','UPI','Card') THEN payment ELSE 'Legacy' END,paid,'Imported existing payment total' FROM orders WHERE paid>0 AND NOT EXISTS(SELECT 1 FROM payments WHERE payments.order_id=orders.id)")
def now(): return datetime.now(timezone.utc).isoformat()
def money(v):
    try:
        d=Decimal(str(v))
        if not d.is_finite() or d<0 or d>100000000: raise ValueError()
        return int((d*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
    except Exception: raise ValueError('Enter a valid non-negative amount.')
def integer(v,minimum=0):
    n=int(v)
    if str(n)!=str(v) or not minimum<=n<=10000000: raise ValueError('Enter a valid whole-number quantity.')
    return n
def text(v,limit=500): return str(v or '').strip()[:limit]
def required(v):
    s=text(v)
    if not s: raise ValueError('Name is required.')
    return s
def record(c,sql,args=()): return [dict(r) for r in c.execute(sql,args)]
def stock(c,pid,delta,reason):
    c.execute('UPDATE products SET stock=stock+? WHERE id=?',(delta,pid))
    c.execute('INSERT INTO movements(created,product_id,delta,reason) VALUES(?,?,?,?)',(now(),pid,delta,reason))
def pw(password,salt): return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),240000).hex()

def card_number(value):
    number=re.sub(r'\s','',text(value,80)).upper()
    if not re.fullmatch(r'[A-Z0-9-]{3,40}',number): raise ValueError('Card number must contain 3–40 letters, numbers or hyphens.')
    return number

def valid_card(c,value):
    card=c.execute('SELECT * FROM privilege_cards WHERE number=?',(card_number(value),)).fetchone()
    if not card: raise ValueError('Privilege card not found. Check the card number.')
    if not card['active']: raise ValueError('This privilege card is inactive.')
    if card['expires'] and card['expires']<date.today().isoformat(): raise ValueError('This privilege card has expired.')
    return card

def mobile(value):
    digits=re.sub(r'\D','',text(value,30))
    if len(digits)==12 and digits.startswith('91'): digits=digits[2:]
    if not re.fullmatch(r'[6-9]\d{9}',digits): raise ValueError('Enter a valid 10-digit mobile number.')
    return digits

def customer_by_mobile(c,number):
    for row in c.execute("SELECT * FROM customers WHERE phone<>'' ORDER BY id"):
        digits=re.sub(r'\D','',row['phone'])
        if digits.startswith('91') and len(digits)==12: digits=digits[2:]
        if digits==number: return row
    return None

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,obj,status=200,headers=None):
        body=json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        for k,v in (headers or {}).items(): self.send_header(k,v)
        self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def session(self):
        cookie=dict(x.strip().split('=',1) for x in self.headers.get('Cookie','').split(';') if '=' in x)
        s=SESSIONS.get(cookie.get('guptha',''))
        return bool(s and s>time.time())
    def do_GET(self):
        path=urlparse(self.path).path
        with connect() as c:
            if path=='/api/session': return self.send({'setup':not bool(c.execute('SELECT id FROM owner').fetchone()),'authenticated':self.session()})
            if path=='/api/shop': return self.send({'settings':dict(c.execute('SELECT * FROM settings').fetchone()),'products':record(c,'SELECT id,name,sku,category,price,tax,stock,description,image FROM products WHERE published=1 AND archived=0')})
            if path.startswith('/api/'):
                if not self.session(): return self.send({'error':'Please sign in.'},401)
                if path=='/api/state':
                    return self.send({**{k:record(c,f'SELECT * FROM {k} ORDER BY id DESC') for k in ['customers','suppliers','orders','purchases','movements','holds','payments','privilege_cards']},'products':record(c,'SELECT * FROM products WHERE archived=0 ORDER BY name'),'settings':dict(c.execute('SELECT * FROM settings').fetchone())})
                if re.fullmatch(r'/api/orders/\d+',path):
                    oid=int(path.split('/')[-1]); rows=record(c,'SELECT * FROM orders WHERE id=?',(oid,))
                    if not rows: return self.send({'error':'Order not found'},404)
                    return self.send({'order':rows[0],'lines':record(c,'SELECT * FROM lines WHERE order_id=?',(oid,)),'payments':record(c,'SELECT * FROM payments WHERE order_id=? ORDER BY id',(oid,)),'settings':dict(c.execute('SELECT * FROM settings').fetchone())})
                if path=='/api/backup':
                    return self.send({k:record(c,f'SELECT * FROM {k}') for k in ['settings','products','customers','suppliers','orders','lines','purchases','movements','holds','payments','privilege_cards']},headers={'Content-Disposition':'attachment; filename=guptha-backup.json'})
                return self.send({'error':'Not found'},404)
        file=(ROOT/'public'/('index.html' if path in ['/','/shop'] else path.lstrip('/'))).resolve()
        if not file.is_relative_to(ROOT/'public') or not file.is_file(): return self.send({'error':'Not found'},404)
        types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}
        body=file.read_bytes(); self.send_response(200); self.send_header('Content-Type',types.get(file.suffix,'application/octet-stream')); self.send_header('Content-Length',str(len(body))); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        path=urlparse(self.path).path
        origin=self.headers.get('Origin')
        if origin and urlparse(origin).netloc!=self.headers.get('Host'): return self.send({'error':'Cross-origin request rejected'},403)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size>1000000: return self.send({'error':'Request too large'},413)
            data=json.loads(self.rfile.read(size) or '{}')
            if not isinstance(data,dict): raise ValueError('Invalid request')
            with connect() as c:
                c.execute('BEGIN IMMEDIATE')
                if path in ['/api/setup','/api/login']:
                    owner=c.execute('SELECT * FROM owner').fetchone()
                    password=str(data.get('password','')); email=text(data.get('email')).lower()
                    if path=='/api/setup':
                        if owner: return self.send({'error':'Owner is already configured'},409)
                        if len(password)<10 or '@' not in email: raise ValueError('Use an email and password of at least 10 characters.')
                        salt=secrets.token_hex(16); c.execute('INSERT INTO owner VALUES(1,?,?,?)',(email,salt,pw(password,salt)))
                    else:
                        attempts=[t for t in FAILURES.get(self.client_address[0],[]) if t>time.time()-300]
                        if len(attempts)>=10: return self.send({'error':'Too many attempts. Try again in five minutes.'},429)
                        if not owner or email!=owner['email'] or not hmac.compare_digest(pw(password,owner['salt']),owner['hash']):
                            FAILURES[self.client_address[0]]=attempts+[time.time()]; return self.send({'error':'Email or password is incorrect.'},401)
                    token=secrets.token_urlsafe(32); SESSIONS[token]=time.time()+43200; c.commit()
                    return self.send({'ok':True},headers={'Set-Cookie':f'guptha={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'})
                if path=='/api/logout':
                    for item in self.headers.get('Cookie','').split(';'):
                        if item.strip().startswith('guptha='): SESSIONS.pop(item.strip()[7:],None)
                    return self.send({'ok':True},headers={'Set-Cookie':'guptha=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
                public=path=='/api/shop/order'
                if not public and not self.session(): return self.send({'error':'Please sign in.'},401)
                result={'ok':True}
                if path=='/api/products':
                    tax=float(data.get('tax',0))
                    if tax not in [0,0.1,0.25,1,1.5,3,5,6,12,18,28,40]: raise ValueError('Select a supported tax rate.')
                    values=(required(data.get('name')),required(data.get('sku')),text(data.get('category')),money(data.get('price',0)),money(data.get('cost',0)),tax,integer(data.get('reorder',5)),int(bool(data.get('published',True))),text(data.get('description'),3000),text(data.get('image',''),500))
                    if data.get('id'):
                        c.execute('UPDATE products SET name=?,sku=?,category=?,price=?,cost=?,tax=?,reorder=?,published=?,description=?,image=? WHERE id=?',(*values,int(data['id'])))
                    else:
                        pid=c.execute('INSERT INTO products(name,sku,category,price,cost,tax,reorder,published,description,image) VALUES(?,?,?,?,?,?,?,?,?,?)',values).lastrowid
                        stock(c,pid,integer(data.get('stock',0)),'Opening stock')
                elif path=='/api/products/archive': c.execute('UPDATE products SET archived=1,published=0 WHERE id=?',(int(data['id']),))
                elif path in ['/api/customers','/api/suppliers']:
                    table=path.split('/')[-1]; vals=(required(data.get('name')),text(data.get('phone')),text(data.get('email')),text(data.get('address')))
                    if data.get('id'): c.execute(f'UPDATE {table} SET name=?,phone=?,email=?,address=? WHERE id=?',(*vals,int(data['id'])))
                    else: result['id']=c.execute(f'INSERT INTO {table}(name,phone,email,address) VALUES(?,?,?,?)',vals).lastrowid
                elif path=='/api/cards/lookup': result=dict(valid_card(c,data.get('number')))
                elif path=='/api/cards':
                    number=card_number(data.get('number')); percent=money(data.get('percent',0))/100
                    if percent>100: raise ValueError('Discount percentage must be between 0 and 100.')
                    expires=text(data.get('expires'))
                    if expires: date.fromisoformat(expires)
                    vals=(number,int(data['customer_id']) if data.get('customer_id') else None,percent,int(bool(data.get('active',True))),expires)
                    if data.get('id'): c.execute('UPDATE privilege_cards SET number=?,customer_id=?,percent=?,active=?,expires=? WHERE id=?',(*vals,int(data['id'])))
                    else: result['id']=c.execute('INSERT INTO privilege_cards(number,customer_id,percent,active,expires) VALUES(?,?,?,?,?)',vals).lastrowid
                elif path=='/api/stock':
                    pid=int(data['product_id']); p=c.execute('SELECT * FROM products WHERE id=? AND archived=0',(pid,)).fetchone()
                    qty=integer(data['quantity']); reason=required(data.get('reason'))
                    if not p: raise ValueError('Product not found')
                    stock(c,pid,qty-p['stock'],reason)
                elif path=='/api/purchases':
                    pid=int(data['product_id']); sid=int(data['supplier_id']); qty=integer(data['qty'],1); cost=money(data['cost'])
                    if not c.execute('SELECT id FROM products WHERE id=? AND archived=0',(pid,)).fetchone(): raise ValueError('Product not found')
                    c.execute('INSERT INTO purchases(created,supplier_id,product_id,qty,cost,total,reference) VALUES(?,?,?,?,?,?,?)',(now(),sid,pid,qty,cost,qty*cost,text(data.get('reference'))))
                    stock(c,pid,qty,'Purchase received'); c.execute('UPDATE products SET cost=? WHERE id=?',(cost,pid))
                elif path=='/api/holds':
                    if data.get('delete'): c.execute('DELETE FROM holds WHERE id=?',(int(data['delete']),))
                    else:
                        if data.get('id'): c.execute('DELETE FROM holds WHERE id=?',(int(data['id']),))
                        c.execute('INSERT INTO holds(created,label,cart,metadata) VALUES(?,?,?,?)',(now(),text(data.get('label')) or 'Held bill',json.dumps(data.get('cart',[])),json.dumps(data.get('metadata',{}))))
                elif path in ['/api/orders','/api/shop/order']:
                    cart=data.get('cart',[])
                    if not isinstance(cart,list) or not 1<=len(cart)<=200: raise ValueError('Add at least one item.')
                    items={}
                    for item in cart:
                        pid=int(item['id']); items[pid]=items.get(pid,0)+integer(item['qty'],1)
                    products=[]
                    for pid,qty in items.items():
                        p=c.execute('SELECT * FROM products WHERE id=? AND archived=0',(pid,)).fetchone()
                        if not p or (public and not p['published']): raise ValueError('An item is no longer available.')
                        if qty>p['stock']: raise ValueError(f"Only {p['stock']} available for {p['name']}.")
                        products.append((p,qty))
                    subtotal=sum(p['price']*q for p,q in products); discount=0 if public else money(data.get('discount',0)); card=None
                    if not public and data.get('card_number'):
                        card=valid_card(c,data['card_number'])
                        if discount: raise ValueError('Privilege discounts cannot be combined with a manual discount.')
                        discount=int((Decimal(subtotal)*Decimal(str(card['percent']))/100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
                    if discount>subtotal: raise ValueError('Discount exceeds the subtotal.')
                    tax_total=0; lines=[]; remaining=discount
                    for idx,(p,q) in enumerate(products):
                        base=p['price']*q
                        share=remaining if idx==len(products)-1 else (discount*base//subtotal if subtotal else 0); remaining-=share
                        tax=int((Decimal(base-share)*Decimal(str(p['tax']))/100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
                        tax_total+=tax; lines.append((p,q,tax,base-share+tax))
                    total=subtotal-discount+tax_total; customer=None
                    if not public and data.get('customer_id'):
                        customer=c.execute('SELECT * FROM customers WHERE id=?',(int(data['customer_id']),)).fetchone()
                        if not customer: raise ValueError('Selected customer was not found.')
                    entered_mobile=mobile(data['phone']) if data.get('phone') else None
                    if entered_mobile:
                        match=customer_by_mobile(c,entered_mobile)
                        if customer and match and match['id']!=customer['id']: raise ValueError('This mobile number belongs to another customer.')
                        if customer and customer['phone'] and mobile(customer['phone'])!=entered_mobile: raise ValueError('Mobile number does not match the selected customer.')
                        customer=customer or match
                        if not customer:
                            customer_name=required(data.get('name'))
                            cid=c.execute('INSERT INTO customers(name,phone,address) VALUES(?,?,?)',(customer_name,entered_mobile,text(data.get('address')))).lastrowid
                            customer=c.execute('SELECT * FROM customers WHERE id=?',(cid,)).fetchone()
                        elif not customer['phone']:
                            c.execute('UPDATE customers SET phone=? WHERE id=?',(entered_mobile,customer['id']))
                            customer=c.execute('SELECT * FROM customers WHERE id=?',(customer['id'],)).fetchone()
                    elif public: raise ValueError('Enter a valid 10-digit mobile number.')
                    name=customer['name'] if customer else ('Walk-in customer' if not public else required(data.get('name')))
                    phone=entered_mobile or (customer['phone'] if customer else '')
                    address=text(data.get('address')) if public else (customer['address'] if customer else text(data.get('address')))
                    if public and not address: raise ValueError('Enter a delivery address or pickup instructions.')
                    if public:
                        if not customer['address'] and address: c.execute('UPDATE customers SET address=? WHERE id=?',(address,customer['id']))
                    payment='COD' if public else text(data.get('payment')); allocations=[]
                    if not public and 'payments' in data:
                        if not isinstance(data['payments'],list) or len(data['payments'])>3: raise ValueError('Use up to three payment methods.')
                        methods=set()
                        for entry in data['payments']:
                            method=entry.get('method'); amount=money(entry.get('amount',0))
                            if method not in ['Cash','UPI','Card'] or method in methods: raise ValueError('Choose each payment method only once.')
                            methods.add(method)
                            if amount: allocations.append((method,amount,text(entry.get('reference'))))
                        paid=sum(a[1] for a in allocations)
                        if paid>total: raise ValueError('Payments exceed the bill total. Enter only the amount applied to this bill.')
                        payment='Split' if len(allocations)>1 else allocations[0][0] if allocations else 'Credit'
                    else:
                        if payment not in ['Cash','UPI','Card','Credit','COD']: raise ValueError('Choose a payment method.')
                        paid=0 if payment in ['Credit','COD'] else total
                        if paid: allocations=[(payment,paid,'')]
                    oid=c.execute('INSERT INTO orders(created,customer_id,customer_name,phone,address,channel,status,payment,subtotal,discount,tax,total,paid,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(now(),customer['id'] if customer else None,name,phone,address,'Online' if public else 'POS','New' if public else 'Completed',payment,subtotal,discount,tax_total,total,paid,text(data.get('notes')))).lastrowid
                    if card: c.execute('UPDATE orders SET card_number=?,card_percent=? WHERE id=?',(card['number'],card['percent'],oid))
                    for method,amount,reference in allocations: c.execute('INSERT INTO payments(order_id,created,method,amount,reference) VALUES(?,?,?,?,?)',(oid,now(),method,amount,reference))
                    for p,q,tax,line_total in lines:
                        c.execute('INSERT INTO lines(order_id,product_id,name,sku,qty,price,cost,tax_rate,tax,total) VALUES(?,?,?,?,?,?,?,?,?,?)',(oid,p['id'],p['name'],p['sku'],q,p['price'],p['cost'],p['tax'],tax,line_total)); stock(c,p['id'],-q,f'Order GA-{oid:05d}')
                    if not public and data.get('hold_id'): c.execute('DELETE FROM holds WHERE id=?',(int(data['hold_id']),))
                    result={'id':oid,'total':total,'payment':payment}
                elif path=='/api/orders/status':
                    oid=int(data['id']); o=c.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone(); status=data.get('status')
                    allowed={'New':['Processing','Cancelled'],'Processing':['Ready','Cancelled'],'Ready':['Completed','Cancelled'],'Completed':['Returned'],'Cancelled':[],'Returned':[]}
                    if not o or status not in allowed.get(o['status'],[]): raise ValueError('This status transition is not allowed.')
                    if status in ['Cancelled','Returned']:
                        for line in c.execute('SELECT * FROM lines WHERE order_id=?',(oid,)).fetchall(): stock(c,line['product_id'],line['qty'],f'{status} GA-{oid:05d}')
                    c.execute('UPDATE orders SET status=? WHERE id=?',(status,oid))
                elif path=='/api/orders/payment':
                    o=c.execute('SELECT * FROM orders WHERE id=?',(int(data['id']),)).fetchone()
                    if not o or o['status'] in ['Cancelled','Returned']: raise ValueError('Cannot collect payment for this order.')
                    amount=money(data['amount'])
                    if amount<=0 or amount>o['total']-o['paid']: raise ValueError('Amount exceeds the outstanding balance or is zero.')
                    method=data.get('method','Cash')
                    if method not in ['Cash','UPI','Card']: raise ValueError('Choose cash, UPI or card.')
                    c.execute('INSERT INTO payments(order_id,created,method,amount,reference) VALUES(?,?,?,?,?)',(o['id'],now(),method,amount,text(data.get('reference'))))
                    c.execute('UPDATE orders SET paid=paid+? WHERE id=?',(amount,o['id']))
                    methods=[r[0] for r in c.execute('SELECT DISTINCT method FROM payments WHERE order_id=?',(o['id'],))]
                    c.execute('UPDATE orders SET payment=? WHERE id=?',('Split' if len(methods)>1 else methods[0],o['id']))
                elif path=='/api/settings': c.execute('UPDATE settings SET name=?,address=?,phone=?,gstin=?,footer=? WHERE id=1',(required(data.get('name')),text(data.get('address')),text(data.get('phone')),text(data.get('gstin')),text(data.get('footer'))))
                else: return self.send({'error':'Not found'},404)
                c.commit(); return self.send(result)
        except (ValueError,KeyError,TypeError,sqlite3.IntegrityError) as e: return self.send({'error':'SKU/card number must be unique and selected records must exist.' if isinstance(e,sqlite3.IntegrityError) else str(e)},400)
        except Exception as e:
            print(type(e).__name__,str(e)); return self.send({'error':'Unable to complete this operation. Please try again.'},500)

if __name__=='__main__':
    init(); port=int(os.environ.get('PORT','8090'))
    print(f'Guptha Arts running at http://127.0.0.1:{port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()

"""Integration checks against an isolated temporary database."""
import tempfile, subprocess, os, time, json, urllib.request, urllib.error, http.cookiejar
from pathlib import Path

with tempfile.TemporaryDirectory() as tmp:
    env={**os.environ,'GUPTHA_DB':str(Path(tmp)/'test.sqlite3'),'PORT':'8091'}
    proc=subprocess.Popen(['python','server.py'],env=env,stdout=subprocess.DEVNULL)
    owner=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    guest=urllib.request.build_opener()
    def req(path,body=None,client=owner,expected=200):
        r=urllib.request.Request('http://127.0.0.1:8091/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
        try:
            with client.open(r) as response: status=response.status; data=json.load(response)
        except urllib.error.HTTPError as e: status=e.code;data=json.load(e)
        assert status==expected,(path,status,data)
        return data
    try:
        for _ in range(50):
            try: req('session');break
            except urllib.error.URLError:time.sleep(.1)
        req('state',client=guest,expected=401)
        req('setup',{'email':'owner@example.test','password':'test-password-only'})
        req('setup',{'email':'owner@example.test','password':'test-password-only'},expected=409)
        product={'name':'Test canvas','sku':'TEST-1','category':'Canvas','price':'100.00','cost':'50.00','tax':18,'stock':10,'reorder':2,'published':True}
        req('products',product);req('products',product,expected=400)
        pid=req('state')['products'][0]['id']
        c=req('customers',{'name':'Test customer','phone':'9999999999'})['id']
        sale=req('orders',{'cart':[{'id':pid,'qty':2}],'customer_id':c,'payment':'Cash','discount':'10'})
        assert sale['total']==22420,sale
        assert req('state')['products'][0]['stock']==8
        req('orders',{'cart':[{'id':pid,'qty':9}],'payment':'Cash'},expected=400)
        assert len(req('state')['orders'])==1
        req('orders/status',{'id':sale['id'],'status':'Returned'})
        req('orders/status',{'id':sale['id'],'status':'Returned'},expected=400)
        assert req('state')['products'][0]['stock']==10
        online=req('shop/order',{'cart':[{'id':pid,'qty':3,'price':1}],'name':'Shopper','phone':'8888888888','address':'Pickup'},client=guest)
        assert online['total']==35400
        assert len(req('state')['customers'])==2
        req('orders/status',{'id':online['id'],'status':'Processing'})
        req('orders/status',{'id':online['id'],'status':'Ready'})
        req('orders/payment',{'id':online['id'],'amount':'400'},expected=400)
        req('orders/payment',{'id':online['id'],'amount':'354'})
        req('orders/status',{'id':online['id'],'status':'Completed'})
        supplier=req('suppliers',{'name':'Test supplier'})['id']
        req('purchases',{'supplier_id':supplier,'product_id':pid,'qty':5,'cost':'45.50','reference':'TEST-PO'})
        assert req('state')['products'][0]['stock']==12
        req('stock',{'product_id':pid,'quantity':11,'reason':'Count'})
        req('holds',{'label':'Test held cart','cart':[{'id':pid,'qty':1}]})
        hold=req('state')['holds'][0]['id'];req('orders',{'cart':[{'id':pid,'qty':1}],'payment':'Credit','hold_id':hold})
        assert not req('state')['holds']
        req('orders',{'cart':[{'id':pid,'qty':-1}],'payment':'Cash'},expected=400)
        req('orders',{'cart':[{'id':pid,'qty':1}],'payment':'Cash','discount':'101'},expected=400)
        invoice=req('orders/'+str(sale['id']));assert len(invoice['lines'])==1
        backup=req('backup');assert 'owner' not in backup and len(backup['orders'])==3
        # One bill, member discount, multiple tender methods, and later collection.
        card=req('cards',{'number':'GA-MEMBER-01','percent':'10','customer_id':c})['id']
        assert req('cards/lookup',{'number':' ga-member-01 '})['percent']==10
        req('cards',{'number':'GA-MEMBER-01','percent':5},expected=400)
        req('cards',{'number':'BAD-PERCENT','percent':101},expected=400)
        req('cards',{'number':'EXPIRED','percent':5,'expires':'2020-01-01'})
        req('cards/lookup',{'number':'EXPIRED'},expected=400)
        req('cards',{'number':'INACTIVE','percent':5,'active':False})
        req('cards/lookup',{'number':'INACTIVE'},expected=400)
        payload={'cart':[{'id':pid,'qty':1}],'card_number':'GA-MEMBER-01','payments':[{'method':'Cash','amount':'50'},{'method':'UPI','amount':'56.20'}]}
        stock_before=req('state')['products'][0]['stock']
        req('orders',{**payload,'discount':'10'},expected=400)
        req('orders',{**payload,'card_number':'EXPIRED'},expected=400)
        req('orders',{**payload,'payments':[{'method':'Cash','amount':'200'}]},expected=400)
        req('orders',{**payload,'payments':[{'method':'Cash','amount':'50'},{'method':'Cash','amount':'50'}]},expected=400)
        assert req('state')['products'][0]['stock']==stock_before
        split=req('orders',payload)
        inv=req('orders/'+str(split['id']))
        assert inv['order']['total']==10620 and inv['order']['paid']==10620
        assert inv['order']['card_percent']==10 and inv['order']['discount']==1000
        assert [(p['method'],p['amount']) for p in inv['payments']]==[('Cash',5000),('UPI',5620)]
        partial=req('orders',{'cart':[{'id':pid,'qty':1}],'payments':[{'method':'Cash','amount':20}]})
        req('orders/payment',{'id':partial['id'],'amount':98,'method':'UPI','reference':'TEST-REF'})
        inv=req('orders/'+str(partial['id']))
        assert inv['order']['paid']==11800 and inv['order']['payment']=='Split' and len(inv['payments'])==2
        assert inv['payments'][1]['reference']=='TEST-REF'
        req('cards',{'id':card,'number':'GA-MEMBER-01','percent':20,'active':False})
        assert req('orders/'+str(split['id']))['order']['card_percent']==10
        req('orders',payload,expected=400)
        # Counter sales create and reuse customer records by mobile number.
        mobile_sale=req('orders',{'cart':[{'id':pid,'qty':1}],'phone':'98765 43210','name':'New counter customer','payment':'Cash'})
        customer_record=next(cu for cu in req('state')['customers'] if cu['phone']=='9876543210')
        assert req('orders/'+str(mobile_sale['id']))['order']['customer_id']==customer_record['id']
        repeat=req('orders',{'cart':[{'id':pid,'qty':1}],'phone':'+91 98765 43210','payment':'Cash'})
        assert req('orders/'+str(repeat['id']))['order']['customer_id']==customer_record['id']
        assert len([cu for cu in req('state')['customers'] if cu['phone']=='9876543210'])==1
        req('orders',{'cart':[{'id':pid,'qty':1}],'customer_id':c,'phone':'9876543210','payment':'Cash'},expected=400)
        req('orders',{'cart':[{'id':pid,'qty':1}],'phone':'123','name':'Invalid','payment':'Cash'},expected=400)
        assert Path(env['GUPTHA_DB']).stat().st_size>0
        req('products/archive',{'id':pid});assert not req('shop',client=guest)['products']
        req('shop/order',{'cart':[{'id':pid,'qty':1}],'name':'Shopper','phone':'8888888888','address':'Pickup'},client=guest,expected=400)
        req('logout',{});req('state',expected=401)
        req('login',{'email':'owner@example.test','password':'wrong-password'},expected=401)
        req('login',{'email':'owner@example.test','password':'test-password-only'})
        assert len(req('state')['orders'])==7
        # Restart proves database persistence and safe, non-duplicating migration.
        payment_count=len(req('backup')['payments'])
        proc.terminate();proc.wait(timeout=10)
        proc=subprocess.Popen(['python','server.py'],env=env,stdout=subprocess.DEVNULL)
        for _ in range(50):
            try: req('session');break
            except urllib.error.URLError:time.sleep(.1)
        req('state',expected=401)
        req('login',{'email':'owner@example.test','password':'test-password-only'})
        assert len(req('state')['orders'])==7 and len(req('backup')['payments'])==payment_count
        print('PASS: authentication, restart persistence, unique SKU/card numbers, billing/tax/discount, oversell rollback, returns, online orders, customer sync, fulfilment, split payments, partial payment ledger, privilege discounts, expired/inactive cards, immutable invoice discounts, purchases, stock adjustments, holds, invoices, backup and archiving.')
    finally:
        proc.terminate();proc.wait(timeout=10)

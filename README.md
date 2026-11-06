# Guptha Arts retail workspace

An independent, subscription-free local ERP inspired by the public er4u feature set. It does not connect to er4u or unlock its paid product.

## Run

Requires Python 3.11+. No pip or npm dependencies.

```powershell
python server.py
```

Open http://127.0.0.1:8090 and create the owner account. Double-click `start.bat` as an alternative. Storefront: http://127.0.0.1:8090/shop. The service binds only to this computer; restart the server after closing its terminal. Sessions expire after 12 hours or a server restart.

## Start using your store

1. Set the legal business name, address, phone and optional GSTIN in Settings.
2. Add products with unique SKUs/barcodes, purchase costs, selling prices, tax rates, opening stock and reorder thresholds. The requested demo catalog contains 12 clearly marked sample products. Prices and stock are illustrative, not verified store data. Edit or archive them before business use.
3. Add suppliers and receive purchase lines. Received quantities update stock in the same database transaction.
4. Create privilege cards in **Privilege cards** with a unique number, percentage, optional customer and expiry. Enter or scan the card number in POS, then Apply. Active, unexpired cards discount the bill before tax. Manual discounts cannot be stacked. Past bills preserve their original percentage.
5. Bill through POS. Search/scan a SKU, add quantities, and choose a customer. Select Cash, UPI, Card, Credit or **Split payment**. For a ₹1,000 bill, enter ₹500 cash and ₹500 UPI. A smaller payment leaves a balance due; excess payments are rejected. Each method is recorded separately on the invoice. Later collections record method and optional reference. Hold/resume preserves customer, privilege card and payment entries; holding does not collect payment.
   Enter a customer's mobile number in billing to load their name, completed purchase count and active privilege card. A new mobile number and name are saved to Customers when the sale completes. `GA-DEMO-10` is an unassigned, active demo card for 10% off; assign it to a customer in Privilege cards to see it during mobile lookup.
   In Customers, select **Purchases** beside a customer to see all linked bills, dates, totals and statuses, then open any bill. The count and total spent include completed orders only; returned and cancelled orders remain visible in the history.
6. Print invoices from the order view. Online orders reserve the same stock and appear as New orders. Move them through Processing, Ready and Completed. Record payments when received.
7. Cancelling an online order or returning an entire completed order restores stock once. Refund actual money separately. Partial returns are not implemented.
8. Review reports, export CSVs (amounts are stored in paise), or download all operational records as JSON.

## Storage and backup

SQLite database: `data/retail.sqlite3`. Stop the server and copy this file for a complete restorable backup, including owner credentials. Restore by replacing the file while the server is stopped. JSON export excludes credentials and is for records/data portability; no JSON restore/import UI is provided. Use a different database with `GUPTHA_DB` and port with `PORT`.

## Verification

```powershell
python test_workflows.py
node --check public/app.js
node test_ui.cjs
```

Tests use a temporary database and never alter the real business database. Browser checks use Playwright from the local REA installation and Chrome; set `PLAYWRIGHT_MODULE` and `CHROME_PATH` for alternate installations. Screenshots in `artifacts/` contain test data only.

To add the requested demo catalog idempotently, run `python seed_demo.py`. It adds missing `DEMO-ART-*` SKUs without changing existing products, accounts, bills or customers. Demo products use zero tax; set appropriate rates for actual business products.

## Boundaries

This is a working single-owner, single-store local application, not verified feature parity with er4u's private ERP. Multiple staff roles/branches, supplier credit ledgers, manufacturing, loyalty points/rewards beyond privilege percentage discounts, partial returns, product image uploads, delivery integrations, payment gateway capture, automated WhatsApp/SMS, GST filing/e-invoice registration, and bank reconciliation are not implemented. Tax rates are owner-configured; totals use integer paise with per-line rounding. Have invoice/tax treatment reviewed before business use. Current invoices show combined line tax, not separate CGST/SGST/IGST reporting.

The storefront runs locally; making it available to customers on the internet requires a production hosting setup with HTTPS, backups, abuse protection and a proper production web server. Do not expose Python's development HTTP server directly. UPI/Card labels only record externally received payments. COD/pickup checkout makes no charge. No real emails or messages are sent.

Public er4u script analysis was performed with REA. Evidence parent: `ev_10d740b28e16b9472755781d4b4f02eec77ceec695bb31cee02fea4239eef26b`; public source SHA-256: `9628f166f9453544aaf21388ac18802411aeba626a66da70c11127160ea906ef`. This static evidence does not establish the private ERP's backend behavior. User Maps reference resolves to Guptas Art Store; business address and catalog have not been inferred or invented.

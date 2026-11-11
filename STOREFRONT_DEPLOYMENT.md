# Run and deploy the Gupta storefront

## Local demo

From the inner `guptha4u` repository, run `python server.py --demo` with a demo inventory and open `http://127.0.0.1:8090/shop`. The ERP remains at `/` and the original local ordering demo is at `/legacy-shop`. The switch uses separate SQLite files beside the catalogue for checkout and accounts, unless you supply their paths explicitly.

This checkout came without a database. To preview the shipped 14-product catalogue in a fresh, dedicated SQLite file:

```powershell
$env:GUPTHA_DB = Join-Path $PWD 'data/storefront-demo.sqlite3'
if (!(Test-Path -LiteralPath $env:GUPTHA_DB)) { python seed_demo.py }
python enrich_demo.py
python server.py
```

To populate a demo database from the staged Himalaya snapshot, run `python tools/import_himalaya.py data/himalaya-source --checked 2026-11-07 --seed-demo-stock` with `GUPTHA_DB` explicitly set to that existing demo file. The importer checks sitemap coverage and creates a backup. The stock switch records one simulated opening unit for each supplier-available variant without stock or movement history. Both the store and ERP use the inventory quantity thereafter.

### Checkout and Privilege demo

Set `GUPTHA_DEMO_CHECKOUT_DB` to a separate writable SQLite file before starting the storefront. Set the same path on the private ERP process to see recent requests and orders under **Privilege cards**. Material checkout requires a customer account. A simulated UPI or card payment writes the receipt and decrements ERP inventory in the same transaction. Keep both SQLite databases on rollback journals (`DELETE`, `TRUNCATE` or `PERSIST`) for the shared transaction. Cash on delivery and pay-at-pickup orders record payment due. Use sample contact details. Demo card numbers work in demo checkout with the contact used to enroll.

The demo charges ₹79 for delivery and offers free pickup. A ₹200 simulated purchase issues a card, as does one simulated paid merchandise order above ₹2,500 after discounts and before tax and delivery. A card offers 10% off the regular price when that beats the sale price. Keep the demo database separate from the catalogue and ERP files.

The membership request and paid-order confirmation prepare WhatsApp drafts to the store’s Indian number. The shopper reviews and sends the draft in WhatsApp. Checkout never depends on WhatsApp delivery.

### Google and Apple sign-in

The loopback demo also supports email signup and sign-in when both `GUPTHA_ACCOUNTS_DB` and `GUPTHA_DEMO_CHECKOUT_DB` are set. Use sample emails and unique demo passwords.

Install the optional server dependency with `python -m pip install -r requirements-auth.txt`. Set `GUPTHA_ACCOUNTS_DB` to a separate writable SQLite file and `GUPTHA_PUBLIC_ORIGIN` to the storefront origin. Set these environment variables through the service manager or a secret store.

| Provider | Configuration | Registered callback path |
|---|---|---|
| Google | `GUPTHA_GOOGLE_CLIENT_ID` and `GUPTHA_GOOGLE_CLIENT_SECRET` from a Google OAuth web client | `/shop/auth/google/callback` |
| Apple | `GUPTHA_APPLE_CLIENT_ID` from the Apple Services ID and `GUPTHA_APPLE_CLIENT_SECRET` as an Apple-signed client secret JWT | `/shop/auth/apple/callback` |

Register each full callback URL on the provider console. Google supports the registered loopback preview origin for testing. Apple requires a registered HTTPS domain and return URL. Rotate the Apple client secret before it expires. Provider buttons stay disabled until their configuration is available. The account page shows orders placed while signed in. The cart and wishlist remain saved in the current browser.

[Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect) · [Apple web sign-in setup](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple)

For an existing installation, set `GUPTHA_DB` to the existing SQLite file, take a backup, then start `server.py` to apply the additive schema setup. Keep that database as the only source of inventory. Run enrichment when you want to apply the reviewed snapshot to the existing demo SKUs. It creates a complete SQLite backup before schema setup and preserves product IDs, stock and costs. The public demo includes unpublished rows. Archive a product to remove it from the catalogue and saved-item lookups.

## Public images and announcements

- Confirm the exact product, brand and variant and record where the photo came from and its reuse terms. Record the ERP product ID in the image audit.
- Place the approved raster image in the persistent folder configured by `GUPTHA_MEDIA` (local default `public/storefront/media`). Name it with letters, digits, dashes or underscores and a JPG, PNG, WebP or AVIF extension. Prefer a compressed WebP with dimensions suitable for the product detail page.
- In ERP Inventory, edit the product by its SKU and set **Product Image Path** to `/storefront/media/filename.webp`. Review the detail page. Catalogue, search, cart and wishlist resolve the same record. The client demo also accepts source photos on Himalaya’s Shopify CDN when the row records permission for the private demo. Use approved replacement assets for public release.
- Record **Exact image source** and **Image license / reuse permission**, then select the verification checkbox. The API validates those fields before publishing the photo.
- Enter the original reference price in **MRP** and the current amount in **Selling price**. **Featured discount** requires a reduction of at least 20%. Selected products appear first, followed by other eligible offers sorted by discount. The product page links to its dated reference price.
- In ERP Settings, use **Storefront announcement** to enter the message, optional HTTPS or shop link, visibility and date range. The announcement appears below the storefront navigation on browsing pages. Dates are inclusive in India Standard Time.

The hero uses a single generated studio panorama with category crops from the same image. Desktop preserves the panorama through category zoom, return and browser history. Mobile uses smaller WebP crops. The artwork prompt asked for a wide, text-free sunlit art studio matching the approved concept, with eight individually spaced still lifes on birch plinths. The image was made with the built-in image generation tool.

## Frontend assets and shadcn setup

Python serves the storefront. React and TypeScript components live in `components/ui/`, including `dorpdown-navigation.tsx` and `meadow-rise-footer.tsx`. Storefront styles live in `public/storefront/`, with the animated navigation and meadow footer in `updates.css` and the account screens in `account.css`. The desktop dropdown uses Framer Motion and Lucide. The server-rendered menu serves mobile and works without JavaScript. Run `npm ci` and `npm run build:storefront` to build the bundles. Run `npm run check:ui` to check the TypeScript.

`reference/catalogue-navigation.json` defines the photographed category groups and their display order. The catalogue adds groups found on ERP products and lists brands by letter range. Nested links carry both the group and type so a type in another group cannot leak into the results.

For a standalone shadcn version, run `npx shadcn@latest init -t vite` in a separate folder and select the React TypeScript Vite setup. The scaffold configures Tailwind. For an existing Vite frontend, install `tailwindcss` and `@tailwindcss/vite`, register the Tailwind Vite plugin, add `@import "tailwindcss";` to the app stylesheet, then run `npx shadcn@latest init`. Set `@` to the source root in Vite and TypeScript and place the components in `src/components/ui` when using the `src` layout. This lets generated and hand-authored components use the same `@/components/ui` import path. Port the scoped CSS and Gupta’s design tokens along with the TSX.

## Protected Vercel catalogue preview

Build the upload in a fresh folder inside `data/`.

```powershell
python tools/prepare_vercel_preview.py data/retail.sqlite3 data/vercel-preview
```

The bundle contains the storefront, published announcement fields, catalogue products and a search index. ERP users, internal product costs, orders, passwords and checkout databases stay outside the upload. The preview reads its catalogue snapshot and supports browsing, search and a browser-local wishlist. Build a new snapshot to refresh it.

Enable Vercel Authentication with Standard Protection. For a new project, deploy a placeholder without catalogue data first. Vercel can assign the first deployment to Production and give it a public alias. Then run `vercel deploy --environment preview` from the generated folder. Confirm the deployment is in Preview and requires authentication before sharing its URL. The staged supplier photos are for the protected client demo.

### Checkout-enabled preview

Pass `--checkout-demo` to the bundle builder and connect the dedicated demo Postgres database to the Vercel preview environment as `GUPTHA_DATABASE_URL`. The bundle gives each supplier-available variant one opening demo unit. Paid simulations persist order history and change only the demo stock in Postgres. Redeploy with the same database to retain accounts, orders and stock changes. Share the resulting preview using Vercel’s deployment-scoped share link.

## Production demo

Run one instance of the public WSGI app on a host with persistent local disk. Run the ERP separately on loopback for private administration over SSH or a private network. Point both processes at the same persistent database and media folder. With demo checkout disabled, the public WSGI process opens the inventory database read-only. The public proxy connects to Waitress on port 8080. Keep the ERP's port 8090 private.

1. Stop writes before moving the database. Use SQLite's backup API or copy the complete database while the ERP is stopped. Save the media directory alongside the backup. Verify the restored file with `PRAGMA integrity_check` and compare product counts and ordered product IDs with the original. Keep a protected off-host copy and regularly test restores. Keep SQLite on local block storage.
2. On the host, set environment variables in the service manager. Set `GUPTHA_DB=/srv/gupta/data/retail.sqlite3`, `GUPTHA_MEDIA=/srv/gupta/media` and `GUPTHA_PUBLIC_ORIGIN=https://your-store.example`. Configure service users and permissions so the public process can read the database and approved images. Keep owner credentials and other deployment secrets outside source control.
3. Run the ERP on loopback with `python server.py` using that database. Before exposing the storefront, confirm the ERP's schema setup completed and review the data appearing in the public catalogue.
4. Install and run Waitress from the repository directory using a service manager.

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install 'waitress==3.0.2'
waitress-serve --listen=127.0.0.1:8080 --threads=4 storefront:application
```

5. Configure an HTTPS reverse proxy with a valid certificate and HTTP-to-HTTPS redirect. For NGINX, add the zone below in `http` and the locations inside the HTTPS server block. Restrict public inbound traffic to the proxy.

```nginx
limit_req_zone $binary_remote_addr zone=gupta_catalogue:10m rate=10r/s;
gzip on;
gzip_types text/javascript text/css model/gltf-binary application/json;

# Inside the TLS server block
location /api/storefront/ {
    limit_req zone=gupta_catalogue burst=15 nodelay;
    limit_req_status 429;
    proxy_pass http://127.0.0.1:8080;
}
location / {
    proxy_pass http://127.0.0.1:8080;
}
```

6. Smoke-test `/shop`, a product page, `/sitemap.xml` and cart revalidation through HTTPS. Verify that `/api/state`, `/api/backup`, `/api/shop` and `/legacy-shop` return 404 through the public origin and that `POST /api/shop/order` returns 405. Schedule protected backups of the database and media, then verify a restore on a private host.

[Waitress runner documentation](https://docs.pylonsproject.org/projects/waitress/en/latest/runner.html) · [NGINX rate limiting documentation](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)

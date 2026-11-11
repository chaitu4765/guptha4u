# Gupta Art Store and Stationary storefront

## Build plan

1. Preserve the ERP shell, product records, image field, sessions and stock workflows. Move the existing local order-taking demo to `/legacy-shop` and keep its APIs for existing local callers.
2. Serve a read-only public storefront at `/shop` from the same SQLite database. Select a public field allowlist and every non-archived row. Use ID-backed URLs and the image from that row across the site. Use placeholders when the image association cannot be verified.
3. Render catalogue pages in Python, and use small browser enhancements for search suggestions, saved items and the cart. Recheck prices and stock when opening the cart. Publish announcements through authenticated ERP settings.
4. Test against the shipped demo seed and temporary ERP records. This checkout has no existing SQLite file. Document how to run with an existing database, test the public-only WSGI app and document a production deployment without publishing it.

## Visual direction

The repository DESIGN.md governs the ERP. The attached storefront DESIGN.md supplies the public palette, DM Serif Display, Manrope, spacing and component hierarchy. The image reference informs the material and lighting. Its brand packaging, stock and illustrative checkout are outside the public design.

The approved concept is saved at `artifacts/storefront-concept-v1.png`. The homepage opens on a sunlit workbench with eight still lifes in the same photoreal studio panorama. Hover and keyboard focus light just the selected plinth. Selection pans and zooms the same panorama, which persists through category navigation, subcategory filtering and browser history. Mobile uses crops of that artwork and reduced motion removes the zoom transition.

The browse sequence is studio, selected category, first-level subcategories and featured discounts. Subcategory selection shows matching ERP products. The compact navbar dropdowns contain only first-level choices supported by those products. Discounts require at least 20%, with Featured discount entries first and other qualifying products ordered by their exact discount ratio. A fixed content measure, ink-on-ivory typography, restrained bronze and repeated image proportions carry through search, product, saved and cart pages.

## Integration

ERP products have brand, subcategory, variant, MRP, Featured discount, dated price source and image review fields. The private demo imports each unique Himalaya variant once and records its collection memberships separately from its ERP identity. The original 14 IDs, SKUs, stock and costs are preserved. Brands groups the same products by maker. Archived products are excluded, while unpublished products remain visible for the demonstration.

Product imagery comes from the same stable product record across catalogue, search, details, wishlist and cart. The private demo uses supplier photos where their listing and variant associations agree. Items without an exact match use placeholders. The ERP records the dated price reference and photo permission.

The Webflow MCP exposes Site, CMS, Designer, asset and audit capabilities. The application stays in the fork so inventory remains in SQLite and the public route can read it directly.

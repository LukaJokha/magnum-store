# Magnum Products Shop

Professional product catalog for Magnum. It includes a password-protected admin page for adding products, but intentionally does not include checkout, payments, or customer accounts.

## Open locally

Run `start.bat`—do not open `index.html` directly. It starts the catalog server in the background, waits for it to become available, then opens the public catalog. Use `open-admin.bat` to open the password-protected admin page directly.

## Add a product

Open the admin page, log in, add the product name, price, category, description and image, then select **პროდუქტის დამატება**. The product appears in the public catalog immediately.

The temporary development password is `magnum-admin`. Before delivery or deployment, set a unique `ADMIN_PASSWORD` and `SESSION_SECRET` environment variable (see `.env.example`).

## Refresh products

Run `sync-products.bat`. It reads the public Magnum catalog pages, downloads product images, and rewrites `data/products.json`. Review the refreshed products and prices before publishing.

## Files

- `index.html` — catalog markup
- `styles.css` — responsive design system
- `app.js` — filtering, sorting, pagination, product dialog
- `data/products.json` — locally stored catalog data
- `assets/products/` — downloaded catalog images
- `scripts/sync-products.mjs` — source sync script

The catalog data and images were captured from `http://magnum.ge/production-ka` on the date the sync script was run. The store should approve its final product information and any publishing rights before launch.

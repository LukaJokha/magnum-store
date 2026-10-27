# Magnum Store catalog

Georgian product catalog with home/contact pages, faceted product search, and Supabase-backed administration. Checkout and payments are not implemented.

Run `start.bat` locally. Open `admin.html` to sign in with an account created in the project's Supabase Authentication. There is no shared website administrator password in the frontend.

## Data and administration

- `data/products.json` is the audited offline catalog and initial import source.
- Supabase's `public.products` table becomes authoritative once the original catalog is imported. Existing product changes and deletions are respected; local metadata no longer overwrites online records.
- `brandTags`, `caliberTags`, and `barrelLengthTags` preserve multiple manufacturer/specification values on combined source listings. Scalar fields retain a primary value for compatibility. Barrel lengths use centimeters.
- `amount` is the numeric selling/from price. `sourcePrice` preserves the original price string; variant and bulk-price notes remain in `description`.
- `brandStatus: unverified` marks a manufacturer that could not be established. Do not replace it with a guessed brand.

Create the schema using `supabase-setup.sql`. Existing installations need its additional attribute columns before using the updated admin importer. The administration page's **არსებული კატალოგის იმპორტი** imports the audited original listings; new products use the same canonical option values.

## Catalog review and backups

The full review and remaining source uncertainties are documented in `data/CATALOG-AUDIT.md`. `data/catalog-metadata.json` records explicit per-product identity decisions; the three `scripts/audit-range-*.json` files provide evidence and review coverage.

Useful commands (run from this directory):

```powershell
node scripts/backup-catalog.mjs
node scripts/normalize-catalog.mjs
node scripts/verify-catalog-audit.mjs
node scripts/verify-filters.mjs
node scripts/prepare-catalog-migration.mjs
node scripts/verify-supabase-catalog.mjs
```

Backups and the generated SQL import are written to the sibling desktop folder `magnum-store-database-backup`. The migration upserts the reviewed IDs in one transaction and verifies them before committing. It does not delete unrelated products. The verification command reads Supabase again and compares every imported field with the local catalog.

`sync-products.bat` captures the public source into `data/products-source-review.json` for a new review. It does not overwrite the audited published file. New or changed source items require individual identity review before normalization/publication.

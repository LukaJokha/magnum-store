# Magnum Store catalog

Georgian product catalog with home/contact pages, faceted product search, and Supabase-backed administration. Checkout and payments are not implemented.

Run `start.bat` locally. Open `admin.html` to sign in with an account created in the project's Supabase Authentication. There is no shared website administrator password in the frontend.

## Data and administration

- `data/products.json` is the audited offline catalog and initial import source.
- Supabase's `public.products` table becomes authoritative once the original catalog is imported. Existing product changes and deletions are respected; local metadata no longer overwrites online records.
- `brandTags`, `caliberTags`, and `barrelLengthTags` preserve multiple manufacturer/specification values on combined source listings. Scalar fields retain a primary value for compatibility. Barrel lengths use centimeters.
- `amount` is the numeric selling/from price. `sourcePrice` preserves the original price string; variant and bulk-price notes remain in `description`.
- `brandStatus: unverified` marks a manufacturer that could not be established. Do not replace it with a guessed brand.

Create a new installation with `supabase-setup.sql`. Before running it, replace `REPLACE_WITH_OWNER_EMAIL` with an existing Supabase Authentication user. Existing installations should run `supabase-security-migration.sql` once and then `supabase-product-revision.sql`. The security migration rolls back if the owner account is not found; the revision migration adds an automatic concurrency counter without replacing product data.

Production administration uses an explicit `catalog_admins` allowlist. Merely having a Supabase account does not grant write access. Public visitors read only the explicit-column `storefront_products` view; internal fields and the raw `products` table are not anonymously accessible. The dashboard adds products; `manage-products.html` edits, deletes, and exports the online catalog. Bulk import is intentionally absent from the dashboard. New products use canonical option values; editing preserves all existing specification tags and leaves the image unchanged unless a replacement is selected.

Supabase is the storefront's only catalog source. A failed read shows an unavailable message and retry button instead of silently restoring outdated bundled products. Reads are paginated so catalogs larger than Supabase's default response limit remain complete. Concurrent edits use the database revision counter; a stale form cannot overwrite a newer save. Image objects are retained after replacement/deletion because listings may share them; storage cleanup requires a separate reference audit.

After creating a new staff account in Supabase Authentication, grant access only from the SQL Editor:

```sql
insert into public.catalog_admins (user_id, note)
select id, 'Store administrator'
from auth.users
where lower(email) = lower('owner@example.com')
on conflict (user_id) do nothing;
```

Keep public email signup disabled for this staff-only project. Removing an account from `catalog_admins` immediately removes catalog and image-management access. Never put a service-role key in this repository or in browser JavaScript.

Supabase Authentication manages administrator passwords. The login page provides email recovery via `reset-password`; there is no password editor in the dashboard. Keep the production Site URL and exact recovery redirect configured in Supabase Auth. Never store account passwords in this repository.

`start.bat` serves the site only on the current computer. Its optional legacy local write API is disabled unless `.env` contains a unique `ADMIN_PASSWORD` of at least 16 characters. Supabase/Vercel administration does not use this local password.

## Catalog review and backups

The full review and remaining source uncertainties are documented in `data/CATALOG-AUDIT.md`. `data/catalog-metadata.json` records explicit per-product identity decisions; the three `scripts/audit-range-*.json` files provide evidence and review coverage.

Useful commands (run from this directory):

```powershell
node scripts/backup-catalog.mjs
node scripts/normalize-catalog.mjs
node scripts/verify-catalog-audit.mjs
node scripts/verify-filters.mjs
node scripts/verify-security.mjs
node scripts/verify-product-editing.mjs
node scripts/verify-storefront-failure.mjs
node scripts/verify-password-flow.mjs
node scripts/verify-recovery-flow.mjs
node scripts/prepare-catalog-migration.mjs
node scripts/verify-supabase-catalog.mjs
```

Backups and the generated SQL import are written to the sibling desktop folder `magnum-store-database-backup`. Browser-key backup and verification scripts read the public `storefront_products` view, so private operational columns are intentionally excluded. Dashboard export includes product rows but not image bytes, Auth users, or access policies. Preserve Storage files and local assets separately. The catalog migration upserts the reviewed IDs: compare it against a fresh online backup before running it, because it can overwrite later owner edits. It does not delete unrelated products.

See `OWNER-GUIDE.md` for operation/handover and `RELEASE-TODO.md` for release status. The original catalog's unresolved manufacturer/specification evidence is listed in `data/CATALOG-AUDIT.md`; software checks do not establish current stock, selling prices, or product identity.

`sync-products.bat` captures the public source into `data/products-source-review.json` for a new review. It does not overwrite the audited published file. New or changed source items require individual identity review before normalization/publication.

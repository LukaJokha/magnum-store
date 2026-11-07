# Magnum Store catalog

Georgian product catalog with home/contact pages, faceted product search, and Supabase-backed administration. Checkout and payments are not implemented.

Run `start.bat` locally. Open `admin.html` to sign in with an account created in the project's Supabase Authentication. There is no shared website administrator password in the frontend.

## Data and administration

- `data/products.json` is the audited offline catalog and initial import source.
- Supabase's `public.products` table becomes authoritative once the original catalog is imported. Existing product changes and deletions are respected; local metadata no longer overwrites online records.
- `brandTags`, `caliberTags`, and `barrelLengthTags` preserve multiple manufacturer/specification values on combined source listings. Scalar fields retain a primary value for compatibility. Barrel lengths use centimeters.
- `amount` is the numeric selling/from price. `sourcePrice` preserves the original price string; variant and bulk-price notes remain in `description`.
- `brandStatus: unverified` marks a manufacturer that could not be established. Do not replace it with a guessed brand.

Create a new installation with `supabase-setup.sql`. Before running it, replace `REPLACE_WITH_OWNER_EMAIL` with an existing Supabase Authentication user. Existing installations should run `supabase-security-migration.sql` once instead. The migration is transactional and rolls back if the owner account is not found.

Production administration uses an explicit `catalog_admins` allowlist. Merely having a Supabase account does not grant write access. Public visitors read only the explicit-column `storefront_products` view; internal fields and the raw `products` table are not anonymously accessible. The administration page's **არსებული კატალოგის იმპორტი** imports the audited original listings; new products use the same canonical option values.

After creating a new staff account in Supabase Authentication, grant access only from the SQL Editor:

```sql
insert into public.catalog_admins (user_id, note)
select id, 'Store administrator'
from auth.users
where lower(email) = lower('owner@example.com')
on conflict (user_id) do nothing;
```

Keep public email signup disabled for this staff-only project. Removing an account from `catalog_admins` immediately removes catalog and image-management access. Never put a service-role key in this repository or in browser JavaScript.

An authenticated catalog administrator can change their own password from the security section on `admin.html`. The form verifies the current password again, requires a strong 16–128 character replacement, and asks Supabase to revoke refresh sessions globally after a successful change. Supabase Auth handles the password; it is never stored in this repository.

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
node scripts/prepare-catalog-migration.mjs
node scripts/verify-supabase-catalog.mjs
```

Backups and the generated SQL import are written to the sibling desktop folder `magnum-store-database-backup`. Browser-key backup and verification scripts read the public `storefront_products` view, so private operational columns are intentionally excluded. The catalog migration upserts the reviewed IDs in one transaction and verifies them before committing. It does not delete unrelated products.

`sync-products.bat` captures the public source into `data/products-source-review.json` for a new review. It does not overwrite the audited published file. New or changed source items require individual identity review before normalization/publication.

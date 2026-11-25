# Release work — 19 November 2026

- [x] Restore Supabase availability and verify online catalog; take a fresh backup.
- [x] Remove the dashboard bulk import and silent stale catalog fallback.
- [x] Add editing of existing products, preserving multiple specification values and images.
- [x] Validate writes, detect concurrent edits, handle unavailable services honestly.
- [x] Verify automated checks, desktop/mobile UI, and authenticated product lifecycle.
- [x] Deploy and check production.
- [ ] Owner confirmation: unresolved identities/specifications, current prices, contacts.
- [x] Write owner operation, backup, recovery and handover instructions in OWNER-GUIDE.md.
- [ ] Complete owner account and hosting/domain handover with the shop.

Evidence: 376 original online records match the audited baseline across 12 public fields after test cleanup. A disposable live record was created, updated (price and image), tested against a stale second editor, and deleted. UI clear-filters returned all 376 products. At 390px viewport, the catalog had no horizontal overflow. Product editing checks: 404; catalog audit assertions: 619; access checks: 4; recovery checks: 16. Filter and security checks passed. SDK/database outage tests confirm an explicit unavailable state and no stale-data fallback.

The SQL revision migration was applied successfully to the existing project. A prechange backup is in the desktop `magnum-store-database-backup/before-audit-2026-11-18T21-38-06-910Z` folder. Product image files are retained after replacement/deletion pending a separate shared-reference audit.

Production: https://magnum-store-demo.vercel.app — implementation commit `2f4a0a8`, Vercel deployment `dpl_cTfZrqHPNSdSvtaZbk1JJ1TptCgK`. Deployed JavaScript matches the local source. Products/admin/management/contact/recovery routes return HTTP 200 with CSP; internal guide, SQL and verification script return 404. Browser checks: LAPUA = 2 products; LAPUA + LAMBRO = 13; clear = 376. No browser console errors were observed during this production check. Authenticated writes were tested against the live database from the local version before deployment.

25 November research update: three agents reviewed all 12 missing-brand questions, 18 missing calibers and 42 missing barrel lengths. Applied 29 field-only updates (1 brand, 6 calibers, 22 lengths), with original-field guards in one transaction. User requested category-only handling for outdoor/target items; no brands applied to paddle, target sheets or catcher. 12 firearm calibers and 20 barrel lengths still require exact unit/SKU confirmation. Source evidence is in scripts/research-*-2026-11-25.json and current summary in data/CATALOG-AUDIT.md. All 376 live rows match the updated baseline across 12 public fields. Live browser checked HATSAN=1, firearms +12GA=46, 55.88cm=2 exact MKA220S records, clear=376. Prices/names/categories/photos preserved. Research, filter, catalog audit626, product editing404 and security checks passed.

Catalog vocabulary feature: added admin-only catalog_options with canonicalization and unique(kind,value). Seeded48brands/50calibers/31lengths from current products. Both create/edit forms can add and select saved options; existing variants/tags remain intact. PostgreSQL rollback tests passed for normalization, insert/read as catalog admin, duplicate rejection, invalid lengths, nonadmin and anonymous denial. Client normalization/UI regression tests passed. Product edit404, admin-access4, filters/security and376live public comparison passed. Final authenticated browser form interaction pending owner sign-in; no product rows changed by this migration.

Authenticated production browser verification completed after owner sign-in: added legitimate unused vocabulary BERETTA / .410 BORE / 51.5cm; all persisted across reload and appeared once in both create/edit forms. hatsan and12gauge reused HATSAN/12GA. In edit form, adding duplicate51.50 selected51.5 while preserving51 and both44MAG/45COLT tags. Discarded unsaved product changes; all376 products still match baseline. Unused vocabulary is absent from public facets. No browser console errors observed. Deployment29e611d / dpl_7ar9uXArRBAnrWTzmkXP64iNT1jH verified matching source. Final authenticated browser check is complete.

Contact correction: original Magnum contact page http://www.magnum.ge/contact-ka (HTTP200,25Nov2026) identifies Pharnavaz Mepe Ave1, Didi Dighomi Goodwill, Mon-Sat11:00-19:00, Sunday closed. Original phone markup is truncated. Dighomi phone0322309369 corroborated by Western partner contact https://western.ge/contact/ and Yell/BIA listings. Removed2956742 from call links because Western labels it fax. Updated address/phone across home/catalog/contact, catalog error and product-detail call link; map search updated. Local390px check passed without horizontal overflow. Operational phone/hours should still be confirmed by owner because no phone call was placed.

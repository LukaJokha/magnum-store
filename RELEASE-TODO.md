# Release work — 19 November 2026

- [x] Restore Supabase availability and verify online catalog; take a fresh backup.
- [x] Remove the dashboard bulk import and silent stale catalog fallback.
- [x] Add editing of existing products, preserving multiple specification values and images.
- [x] Validate writes, detect concurrent edits, handle unavailable services honestly.
- [x] Verify automated checks, desktop/mobile UI, and authenticated product lifecycle.
- [ ] Deploy and check production.
- [ ] Owner confirmation: unresolved identities/specifications, current prices, contacts.
- [x] Write owner operation, backup, recovery and handover instructions in OWNER-GUIDE.md.
- [ ] Complete owner account and hosting/domain handover with the shop.

Evidence: 376 original online records match the audited baseline across 12 public fields after test cleanup. A disposable live record was created, updated (price and image), tested against a stale second editor, and deleted. UI clear-filters returned all 376 products. At 390px viewport, the catalog had no horizontal overflow. Product editing checks: 404; catalog audit assertions: 619; access checks: 4; recovery checks: 16. Filter and security checks passed. SDK/database outage tests confirm an explicit unavailable state and no stale-data fallback.

The SQL revision migration was applied successfully to the existing project. A prechange backup is in the desktop `magnum-store-database-backup/before-audit-2026-11-18T21-38-06-910Z` folder. Product image files are retained after replacement/deletion pending a separate shared-reference audit.

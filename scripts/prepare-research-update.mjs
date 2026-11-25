// Apply only explicitly verified research. Produce a guarded, field-only SQL patch.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const files = ['brands', 'calibers', 'barrels'].map(topic => `scripts/research-${topic}-2026-11-25.json`);
const catalog = JSON.parse(await fs.readFile(new URL('data/products.json', root), 'utf8'));
const metadata = JSON.parse(await fs.readFile(new URL('data/catalog-metadata.json', root), 'utf8'));
const patches = new Map(), coverage = [];
const fields = { brandTags: 'brand', caliberTags: 'caliber', barrelLengthTags: 'barrelLength' };
for (const file of files) {
  const report = JSON.parse(await fs.readFile(new URL(file, root), 'utf8'));
  assert.ok(fields[report.field], 'Unexpected research field');
  const seen = new Set();
  for (const review of report.reviews) {
    assert.ok(!seen.has(review.id), 'Duplicate reviewed ID'); seen.add(review.id);
    assert.ok(catalog.products.some(row => row.id === review.id));
    if (review.status !== 'verified') continue;
    assert.ok(review.values?.length && review.values.every(value => typeof value === 'string' && value.trim() === value && value));
    assert.ok(review.sources?.length && review.sources.every(url => /^https:\/\//.test(url)) && review.evidence);
    if (report.field === 'barrelLengthTags') assert.ok(review.values.every(value => Number(value) > 0 && Number(value) <= 130));
    const row = catalog.products.find(row => row.id === review.id), scalar = fields[report.field];
    // This research pass fills missing fields only, never replaces an existing value.
    assert.ok(!row[scalar] && !row[report.field].length, `${review.id}: field is already populated`);
    let entry = patches.get(row.id);
    if (!entry) { entry = { id: row.id, expected: { name: row.name, category: row.category, image: row.image }, changes: {} }; patches.set(row.id, entry); }
    for (const key of [scalar, report.field, ...(scalar === 'brand' ? ['brandStatus'] : [])]) entry.expected[key] = row[key];
    const changes = { [scalar]: review.values[0], [report.field]: review.values };
    if (scalar === 'brand') changes.brandStatus = 'verified';
    Object.assign(entry.changes, changes); Object.assign(row, changes);
    const decision = metadata.products[row.id];
    decision[report.field] = review.values;
    if (scalar === 'brand') decision.brandStatus = 'verified';
    decision.researchSources = [...new Set([...(decision.researchSources || []), ...review.sources])];
  }
  coverage.push({ file, field: report.field, reviewed: seen.size, resolved: report.reviews.filter(r => r.status === 'verified').length });
}
const payload = [...patches.values()];
assert.ok(payload.length, 'No verified findings to apply');
metadata.reviewedAt = catalog.updatedAt = new Date().toISOString();
metadata.reviewSources = [...new Set([...metadata.reviewSources, ...files])];
const literal = value => `'${value.replaceAll("'", "''")}'`;
const sql = `-- Verified missing specifications only. No price/name/photo/category changes.\n-- Any changed source field aborts the complete transaction.\nbegin;\ndo $research$\ndeclare item jsonb; current_row jsonb; changed integer;\nbegin\n for item in select value from jsonb_array_elements(${literal(JSON.stringify(payload))}::jsonb) loop\n  select to_jsonb(p) into current_row from public.products p where p.id = item->>'id' for update;\n  if current_row is null or not (current_row @> (item->'expected')) then\n   raise exception 'Research source changed or missing: %', item->>'id';\n  end if;\n  update public.products p set\n   brand = case when item->'changes' ? 'brand' then item->'changes'->>'brand' else p.brand end,\n   "brandTags" = case when item->'changes' ? 'brandTags' then item->'changes'->'brandTags' else p."brandTags" end,\n   "brandStatus" = case when item->'changes' ? 'brandStatus' then item->'changes'->>'brandStatus' else p."brandStatus" end,\n   caliber = case when item->'changes' ? 'caliber' then item->'changes'->>'caliber' else p.caliber end,\n   "caliberTags" = case when item->'changes' ? 'caliberTags' then item->'changes'->'caliberTags' else p."caliberTags" end,\n   "barrelLength" = case when item->'changes' ? 'barrelLength' then item->'changes'->>'barrelLength' else p."barrelLength" end,\n   "barrelLengthTags" = case when item->'changes' ? 'barrelLengthTags' then item->'changes'->'barrelLengthTags' else p."barrelLengthTags" end\n  where p.id = item->>'id';\n  get diagnostics changed = row_count;\n  if changed <> 1 then raise exception 'Unexpected update count'; end if;\n end loop;\nend $research$;\ncommit;\nselect count(*) as total_products from public.products;\n`;
const out = path.resolve(fileURLToPath(root), '..', 'magnum-store-database-backup', 'research-2026-11-25');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'field-only-update.sql'), sql);
await fs.writeFile(path.join(out, 'research-patches.json'), JSON.stringify(payload, null, 2));
await fs.writeFile(new URL('data/products.json', root), JSON.stringify(catalog, null, 2) + '\n');
await fs.writeFile(new URL('data/catalog-metadata.json', root), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ out, affectedProducts: payload.length, coverage }, null, 2));

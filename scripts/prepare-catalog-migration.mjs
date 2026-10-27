import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(root, '..', 'magnum-store-database-backup');
const catalog = JSON.parse(await fs.readFile(new URL('../data/products.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(await fs.readFile(new URL('../data/catalog-metadata.json', import.meta.url), 'utf8'));
assert.equal(catalog.products.length, 376);
assert.equal(metadata.reviewedCount, 376);
const columns = ['id', 'name', 'price', 'amount', 'category', 'brand', 'caliber', 'barrelLength', 'image', 'description', 'source', 'brandTags', 'caliberTags', 'barrelLengthTags', 'brandStatus', 'sourcePrice'];
const rows = catalog.products.map(product => Object.fromEntries(columns.map(column => [column, column === 'source' ? 'magnum.ge' : product[column]])));
assert.ok(rows.every(row => Object.values(row).every(value => value !== undefined && value !== null)));
const payload = JSON.stringify(rows);
const quotedColumns = columns.map(column => `"${column}"`).join(', ');
const assignments = columns.filter(column => column !== 'id').map(column => `"${column}" = excluded."${column}"`).join(',\n  ');
const sql = `-- Reviewed Magnum catalog: ${rows.length} records. Does not delete unrelated rows.\n-- Run as one transaction in the project SQL Editor.\nbegin;\n\nalter table public.products add column if not exists "brandTags" jsonb not null default '[]'::jsonb;\nalter table public.products add column if not exists "caliberTags" jsonb not null default '[]'::jsonb;\nalter table public.products add column if not exists "barrelLengthTags" jsonb not null default '[]'::jsonb;\nalter table public.products add column if not exists "brandStatus" text not null default 'unverified';\nalter table public.products add column if not exists "sourcePrice" text not null default '';\n\ncreate temporary table reviewed_catalog_payload (data jsonb) on commit drop;\ninsert into reviewed_catalog_payload values ($magnum_catalog$${payload}$magnum_catalog$::jsonb);\n\ninsert into public.products (${quotedColumns})\nselect ${columns.map(column => `incoming."${column}"`).join(', ')}\nfrom reviewed_catalog_payload, lateral jsonb_populate_recordset(null::public.products, data) incoming\nwhere true\non conflict (id) do update set\n  ${assignments};\n\ndo $verification$\nbegin\n  if (select jsonb_array_length(data) from reviewed_catalog_payload) <> 376 then\n    raise exception 'Unexpected input count';\n  end if;\n  if exists (\n    select 1 from reviewed_catalog_payload, lateral jsonb_array_elements(data) item\n    left join public.products p on p.id = item->>'id'\n    where p.id is null or not (to_jsonb(p) @> item)\n  ) then\n    raise exception 'Catalog verification failed; transaction rolled back';\n  end if;\nend $verification$;\n\ncommit;\nnotify pgrst, 'reload schema';\nselect count(*) as reviewed_products, count(*) filter (where "brandStatus" = 'unverified') as brands_to_confirm\nfrom public.products where source = 'magnum.ge';\n`;
const summary = {
  reviewedAt: metadata.reviewedAt, productCount: rows.length,
  brands: new Set(rows.flatMap(row => row.brandTags)).size,
  unidentifiedBrands: rows.filter(row => !row.brand).map(row => ({ id: row.id, name: row.name })),
  categories: rows.reduce((counts, row) => (counts[row.category] = (counts[row.category] || 0) + 1, counts), {}),
  sha256: createHash('sha256').update(payload).digest('hex')
};
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'products.json'), `${JSON.stringify(catalog, null, 2)}\n`);
await fs.writeFile(path.join(out, 'products-supabase-import.json'), `${JSON.stringify(rows, null, 2)}\n`);
await fs.writeFile(path.join(out, 'import-reviewed-catalog.sql'), sql);
await fs.writeFile(path.join(out, 'audit-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ out, ...summary }, null, 2));

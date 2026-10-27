import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const catalogFile = new URL('../data/products.json', import.meta.url);
const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
const reports = await Promise.all([1, 2, 3].map(async number => JSON.parse(await fs.readFile(new URL(`audit-range-${number}.json`, import.meta.url), 'utf8'))));
const reviewed = reports.flatMap(report => report.reviewedIds);
assert.equal(new Set(reviewed).size, catalog.products.length, 'Every product must have an audit record');
const corrections = new Map(reports.flatMap(report => report.corrections).map(item => [item.id, item]));
const products = {};
for (const product of catalog.products) {
  const correction = corrections.get(product.id);
  if (correction) {
    for (const key of ['brand', 'category', 'name']) if (key in correction) product[key] = correction[key];
    if ('brand' in correction) product.brandTags = [correction.brand].filter(Boolean);
  }
  products[product.id] = {
    brandTags: product.brandTags,
    category: product.category,
    brandStatus: product.brand ? 'verified' : 'unverified',
    ...(correction?.caliber ? { caliberTags: [correction.caliber] } : {}),
    ...(correction?.barrelLength ? { barrelLengthTags: [correction.barrelLength] } : {})
  };
}
products['magnum-115'].caliberTags = ['44 MAG', '45 COLT'];
products['magnum-123'].barrelLengthTags = ['71', '76'];
products['magnum-260'].barrelLengthTags = ['55'];
const metadata = {
  schemaVersion: 1,
  reviewedAt: new Date().toISOString(),
  reviewedCount: reviewed.length,
  reviewSources: ['scripts/audit-range-1.json', 'scripts/audit-range-2.json', 'scripts/audit-range-3.json'],
  note: 'Explicit per-product manufacturer/category decisions. Unverifiable manufacturers are not invented. Optional specifications are populated only from source titles or cited exact-model specifications.',
  products
};
await fs.writeFile(new URL('../data/catalog-metadata.json', import.meta.url), `${JSON.stringify(metadata, null, 2)}\n`);
await fs.writeFile(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Applied ${corrections.size} documented record corrections; ${reviewed.length} product identities audited.`);

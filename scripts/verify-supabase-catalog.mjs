import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const settings = await fs.readFile(new URL('../supabase.js', import.meta.url), 'utf8');
const endpoint = settings.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
const key = settings.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
if (!endpoint || !key) throw new Error('Supabase configuration missing');
const { products } = JSON.parse(await fs.readFile(new URL('../data/products.json', import.meta.url), 'utf8'));
const remote = [];
for (let offset = 0; ; offset += 1000) {
  const response = await fetch(`${endpoint}/rest/v1/products?select=*&order=id&offset=${offset}&limit=1000`, { headers: { apikey: key } });
  if (!response.ok) throw new Error(`Supabase verification failed: HTTP ${response.status}`);
  const page = await response.json();
  remote.push(...page);
  if (page.length < 1000) break;
}
const byId = new Map(remote.map(product => [product.id, product]));
const fields = ['name', 'price', 'amount', 'category', 'brand', 'caliber', 'barrelLength', 'image', 'description', 'brandTags', 'caliberTags', 'barrelLengthTags', 'brandStatus', 'sourcePrice'];
for (const expected of products) {
  const actual = byId.get(expected.id);
  assert.ok(actual, `Missing online product ${expected.id}`);
  for (const field of fields) assert.deepEqual(actual[field], expected[field], `${expected.id}.${field} differs online`);
  assert.equal(actual.source, 'magnum.ge');
}
const report = { verifiedAt: new Date().toISOString(), expectedProducts: products.length, onlineProducts: remote.length, comparedFieldsPerProduct: fields.length + 1, matchingProducts: products.length, unknownManufacturers: remote.filter(product => product.brandStatus === 'unverified').length };
await fs.writeFile(new URL('../../magnum-store-database-backup/products-supabase-after.json', import.meta.url), `${JSON.stringify(remote, null, 2)}\n`);
await fs.writeFile(new URL('../../magnum-store-database-backup/supabase-verification.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

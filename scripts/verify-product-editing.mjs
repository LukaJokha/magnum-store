import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = await fs.readFile(new URL('../product-data.js', import.meta.url), 'utf8');
const rows = JSON.parse(await fs.readFile(new URL('../data/products.json', import.meta.url), 'utf8')).products;
const context = vm.createContext({ window: { location: { href: 'https://example.invalid/manage-products', origin: 'https://example.invalid' } }, URL });
vm.runInContext(source, context);
const api = context.window.MagnumProducts, allowed = api.choices(rows);
const input = row => ({ name: row.name, description: row.description, category: row.category, amount: String(row.amount), brand: api.tags(row, 'brand'), caliber: api.tags(row, 'caliber'), barrelLength: api.tags(row, 'barrelLength') });
let checks = 0;
function check(run) { run(); checks++; }
for (const row of rows) check(() => assert.equal(Object.keys(api.buildPatch(input(row), row, allowed)).length, 0, `${row.id} unchanged save must preserve all values`));
const multi = rows.find(row => row.caliberTags.length > 1), values = input(multi);
check(() => {
  const patch = api.buildPatch({ ...values, amount: '999.25' }, multi, allowed);
  assert.deepEqual(Object.keys(patch).sort(), ['amount', 'price']);
  assert.equal(patch.amount, 999.25); assert.equal(patch.price, '999.25 ₾');
});
check(() => assert.equal(Object.keys(api.buildPatch({ ...values, caliber: [...values.caliber].reverse() }, multi, allowed)).length, 0));
check(() => {
  const patch = api.buildPatch({ ...values, category: 'ოპტიკა' }, multi, allowed);
  assert.equal(patch.caliber, ''); assert.equal(patch.barrelLength, ''); assert.equal(patch.caliberTags.length, 0);
});
for (const amount of ['', '-1', '0', 'NaN', 'Infinity', '1.234', '100000001']) check(() => assert.throws(() => api.buildPatch({ ...values, amount }, multi, allowed)));
check(() => assert.throws(() => api.buildPatch({ ...values, caliber: ['12gauge'] }, multi, allowed)));
check(() => assert.throws(() => api.buildPatch({ ...values, name: ' ' }, multi, allowed)));
check(() => assert.throws(() => api.buildPatch({ ...values, category: 'invented' }, multi, allowed)));
check(() => assert.throws(() => api.validateImage({ type: 'text/html', size: 20 })));
check(() => assert.throws(() => api.validateImage({ type: 'image/png', size: 5000001 })));
check(() => assert.equal(api.validateImage({ type: 'image/png', size: 20 }), 'png'));
check(() => assert.equal(api.imageUrl('javascript:alert(1)'), ''));
check(() => assert.equal(api.imageUrl('https://evil.invalid/a.png'), ''));
check(() => assert.equal(api.imageUrl('assets/products/image.jpg'), 'https://example.invalid/assets/products/image.jpg'));
const many = Array.from({ length: 1205 }, (_, i) => ({ id: String(i) }));
const all = await api.readAll(() => ({ order() { return this; }, async range(a, b) { return { data: many.slice(a, b + 1) }; } }));
check(() => assert.equal(all.length, 1205));
await assert.rejects(() => api.readAll(() => ({ order() { return this; }, async range(a) { return a ? { error: new Error('offline') } : { data: many.slice(0, 200) }; } }))); checks++;
function database(record, error = null) {
  let filters = [], patch;
  return { filters, from(table) {
    assert.equal(table, 'products');
    const q = { update(value) { patch = value; return q; }, eq(k, v) { filters.push([k, v]); return q; }, is(k, v) { filters.push([k, v]); return q; },
      async select() { return { error, data: filters.every(([k, v]) => (Array.isArray(record[k]) ? JSON.stringify(record[k]) : record[k]) === v) ? [{ ...record, ...patch }] : [] }; } };
    return q;
  } };
}
const db = database(multi), patch = api.buildPatch({ ...values, name: 'Updated model' }, multi, allowed);
const updated = await api.updateProduct(db, multi, patch);
check(() => assert.equal(updated.name, 'Updated model'));
check(() => assert.deepEqual(updated.caliberTags, multi.caliberTags));
check(() => assert.equal(updated.image, multi.image));
await assert.rejects(() => api.updateProduct(database({ ...multi, amount: multi.amount + 1 }), multi, patch)); checks++;
await assert.rejects(() => api.updateProduct(database(multi, new Error('offline')), multi, patch)); checks++;
const versioned = { ...multi, revision: 3 }, versionDb = database(versioned);
await api.updateProduct(versionDb, versioned, patch);
check(() => assert.deepEqual(versionDb.filters, [['id', multi.id], ['revision', 3]]));
await assert.rejects(() => api.updateProduct(database({ ...versioned, revision: 4 }), versioned, patch)); checks++;
console.log(`Product editing checks passed: ${checks}; unchanged catalog, multi-value preservation, validation, pagination and concurrent edits.`);

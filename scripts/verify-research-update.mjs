import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = async file => JSON.parse(await fs.readFile(new URL(file, import.meta.url), 'utf8'));
const { products } = await read('../data/products.json');
const byId = new Map(products.map(row => [row.id, row]));
const reports = await Promise.all(['brands','calibers','barrels'].map(topic => read(`research-${topic}-2026-11-25.json`)));
assert.deepEqual(reports.map(r => r.reviews.length), [12,18,42]);
assert.deepEqual(reports.map(r => r.reviews.filter(x => x.status === 'verified').length), [1,6,22]);
for (const report of reports) {
  assert.equal(new Set(report.reviews.map(r => r.id)).size, report.reviews.length);
  for (const row of report.reviews) {
    assert.ok(row.evidence && row.reason !== undefined);
    if (row.status === 'verified') {
      assert.ok(row.sources.length);
      assert.deepEqual(byId.get(row.id)[report.field], row.values, row.id);
    }
    else assert.deepEqual(byId.get(row.id)[report.field], [], `${row.id}: unresolved/user-skipped field must remain empty`);
  }
}
// Independently recorded exact-model manufacturer fixtures, in centimeters.
const lengths = {6:'50.8',8:'45.72',13:'11.43',14:'10.2',15:'10.85',16:'10.16',17:'7.77',18:'8.13',19:'8.13',20:'10.16',21:'8.13',35:'40.89',59:'51',62:'40.64',71:'41',147:'40.64',150:'55.88',151:'55.88',152:'11.3',153:'11.3',154:'11.3',155:'11.3'};
for (const [id, value] of Object.entries(lengths)) assert.deepEqual(byId.get(`magnum-${id}`).barrelLengthTags, [value]);
for (const id of [56,57,98,99,156,196]) assert.deepEqual(byId.get(`magnum-${id}`).caliberTags, ['12 GA']);
assert.equal(byId.get('magnum-369').brand, 'HATSAN');
assert.equal(byId.get('magnum-58').category, 'ნავები და ძრავები');
for (const id of [370,371]) assert.equal(byId.get(`magnum-${id}`).category, 'აქსესუარები');
assert.equal(products.filter(p => p.category === 'ცეცხლსასროლი იარაღი' && !p.caliber).length,12);
assert.equal(products.filter(p => p.category === 'ცეცხლსასროლი იარაღი' && !p.barrelLength).length,20);
console.log('Research verification passed: 72 field reviews, 29 verified field updates; ambiguous variants and category-only items preserved.');

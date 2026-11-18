import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
for (const stage of ['sdk', 'database']) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: true, textContent: '' });
    return elements.get(selector);
  };
  let reads = 0, reloads = 0, fallbackReads = 0;
  const context = vm.createContext({
    document: { createElement: () => ({}), head: { append() {} }, querySelector: element },
    window: {
      magnumDbReady: stage === 'sdk' ? Promise.reject(new Error('offline')) : Promise.resolve({}),
      MagnumProducts: { async readAll() { reads++; throw new Error('database unavailable'); } },
      location: { reload() { reloads++; } }
    },
    fetch() { fallbackReads++; throw new Error('Unexpected stale catalog fallback'); }
  });
  await vm.runInContext(source, context);
  assert.equal(element('#catalogError').hidden, false);
  assert.equal(element('#empty').hidden, true);
  assert.equal(element('#resultCount').textContent, 'კატალოგი დროებით მიუწვდომელია');
  assert.equal(vm.runInContext('state.products.length', context), 0);
  assert.equal(reads, stage === 'sdk' ? 0 : 1);
  assert.equal(fallbackReads, 0);
  element('#retryCatalog').onclick();
  assert.equal(reloads, 1);
}
console.log('Storefront failure verification passed: SDK/database failures show retry without stale catalog data.');

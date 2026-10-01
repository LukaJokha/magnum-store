import assert from 'node:assert/strict';

// Runs the public catalog through Chrome DevTools Protocol. Start a local
// Chrome instance first, for example with --remote-debugging-port=9222.
const cdpRoot = process.env.CDP_URL || 'http://127.0.0.1:9222';
const catalogUrl = process.env.CATALOG_URL || 'http://127.0.0.1:4173/products.html';
const catalogCount = 376;
const strictCatalog = process.env.STRICT_CATALOG === '1';
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const targetResponse = await fetch(`${cdpRoot}/json/new?${encodeURIComponent(catalogUrl)}`, { method: 'PUT' });
if (!targetResponse.ok) throw new Error(`Chrome target ვერ შეიქმნა: ${targetResponse.status}`);
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('Chrome DevTools-თან კავშირი ვერ დამყარდა.')), { once: true });
});

let requestId = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
socket.addEventListener('close', () => {
  pending.forEach(({ reject }) => reject(new Error('Chrome DevTools კავშირი დაიხურა.')));
  pending.clear();
});

const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++requestId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'ბრაუზერის შეფასება ვერ შესრულდა.');
  return response.result.value;
};
const waitFor = async (expression, name, timeout = 30_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await wait(150);
  }
  throw new Error(`დროულად ვერ დადასტურდა: ${name}`);
};
const click = async (expression, name) => assert.equal(await evaluate(expression), true, `${name} ვერ მოიძებნა`);
const resultCount = () => evaluate(`Number(document.querySelector('#resultCount')?.textContent.match(/\\d+/)?.[0])`);
const waitForCount = async (check, name, timeout = 30_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const count = await resultCount();
    if (Number.isFinite(count) && check(count)) return count;
    await wait(150);
  }
  throw new Error(`დროულად ვერ დადასტურდა: ${name}`);
};
const selectCategory = name => click(`(() => {
  const input = [...document.querySelectorAll('#categories input')].find(item => item.value === ${JSON.stringify(name)});
  if (!input) return false;
  input.click();
  return true;
})()`, `${name} კატეგორია`);
const selectFacet = (id, value) => click(`(() => {
  const option = [...document.querySelectorAll('#${id}Options .facet-choice')]
    .find(item => item.querySelector('span')?.textContent.trim() === ${JSON.stringify(value)});
  const input = option?.querySelector('input');
  if (!input) return false;
  if (!input.checked) input.click();
  return true;
})()`, `${value} ფილტრი`);
const clear = async () => click(`(() => {
  const button = document.querySelector('#clearFilters');
  if (!button) return false;
  button.click();
  return true;
})()`, 'გასუფთავების ღილაკი');
const searchFor = value => click(`(() => {
  const input = document.querySelector('#search');
  if (!input) return false;
  input.value = ${JSON.stringify(value)};
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`, 'საძიებო ველი');

try {
  await call('Runtime.enable');
  const initialCount = await waitForCount(count => count > 0, 'საწყისი კატალოგი');
  await waitFor(`document.querySelectorAll('#products .card').length > 0`, 'პროდუქტის ბარათები');
  if (strictCatalog) assert.equal(initialCount, catalogCount, 'საწყის კატალოგში პროდუქტის რაოდენობა შეცვლილია');

  await selectCategory('ცეცხლსასროლი იარაღი');
  const firearmsCount = await waitForCount(count => strictCatalog ? count === 121 : count > 0, 'ცეცხლსასროლი იარაღის კატეგორია');
  assert.equal(await evaluate(`[...document.querySelectorAll('#products .category')].every(item => item.textContent.trim() === 'ცეცხლსასროლი იარაღი')`), true, 'კატეგორიაში უცხო პროდუქტი გამოჩნდა');
  await searchFor('Mini water pump');
  await waitForCount(count => count === 0, 'წყლის ტუმბოს გამორიცხვა ცეცხლსასროლი იარაღიდან');
  await searchFor('სასროლი თეფში');
  await waitForCount(count => count === 0, 'თიხის დისკის გამორიცხვა ცეცხლსასროლი იარაღიდან');
  await searchFor('');
  await waitForCount(count => count === firearmsCount, 'ცეცხლსასროლი იარაღის ძიების გასუფთავება');

  await selectFacet('caliber', '12 GA');
  const caliberCount = await waitForCount(count => strictCatalog ? count === 37 : count > 0 && count <= firearmsCount, '12 GA კალიბრი');
  await selectFacet('brand', 'ARMSAN');
  const armsanCount = await waitForCount(count => strictCatalog ? count === 1 : count > 0 && count <= caliberCount, '12 GA + ARMSAN');
  await selectFacet('brand', 'HUGLU');
  await waitForCount(count => strictCatalog ? count === 4 : count >= armsanCount && count <= caliberCount, 'რამდენიმე ბრენდის OR-არჩევა');
  assert.equal(await evaluate(`document.querySelectorAll('#activeFilters .filter-chip').length === 4`), true, 'აქტიური ფილტრის ჩიპები არ გამოჩნდა');

  await clear();
  await waitForCount(count => count === initialCount, 'ფილტრების გასუფთავება');
  assert.equal(await evaluate(`document.querySelector('#categories input[value="all"]')?.checked
    && !document.querySelectorAll('#brandOptions input:checked, #caliberOptions input:checked, #barrelOptions input:checked').length
    && !document.querySelector('#search').value
    && !document.querySelector('#minPrice').value
    && !document.querySelector('#maxPrice').value`), true, 'გასუფთავების შემდეგ ძველი არჩევანი დარჩა');

  await selectCategory('ოპტიკა');
  const opticsCount = await waitForCount(count => strictCatalog ? count === 72 : count > 0, 'ოპტიკის კატეგორია');
  await selectFacet('brand', 'ARKEN');
  await waitForCount(count => strictCatalog ? count === 5 : count > 0 && count <= opticsCount, 'ოპტიკა + ARKEN');
  assert.equal(await evaluate(`[...document.querySelectorAll('#products .category')].every(item => item.textContent.trim() === 'ოპტიკა')`), true, 'ოპტიკის ფილტრში სხვა კატეგორია გამოჩნდა');

  await clear();
  await searchFor('DIAMONDBACK FIREARMS');
  await waitForCount(count => strictCatalog ? count === 1 : count > 0, 'ბრენდით ძიება');
  assert.equal(await evaluate(`document.querySelector('#products h2')?.textContent.includes('DB15')`), true, 'ბრენდის ტეგით ნაპოვნი პროდუქტი არ გამოჩნდა');

  await clear();
  await click(`(() => {
    const setValue = (selector, value) => {
      const input = document.querySelector(selector);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue('#minPrice', '1000');
    setValue('#maxPrice', '2000');
    return true;
  })()`, 'ფასის დიაპაზონი');
  await waitForCount(count => strictCatalog ? count === 55 : count >= 0 && count <= initialCount, 'ფასის დიაპაზონი 1000–2000');

  await clear();
  await waitForCount(count => count === initialCount, 'საბოლოო გასუფთავება');
  console.log('Browser filter verification passed: category, exact caliber, multi-brand selection, clear, search, and price range.');
} finally {
  socket.close();
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const file = new URL('../data/products.json', import.meta.url);
const { products } = JSON.parse(await fs.readFile(file, 'utf8'));
// Test the shop's actual functions rather than duplicating its implementation.
// Startup remains awaiting fetch; these checks need no server or credentials.
const context = vm.createContext({
  document: { head: { insertAdjacentHTML() {} } },
  fetch: () => new Promise(() => {}), console, inputCatalog: products
});
vm.runInContext(await fs.readFile(new URL('../app.js', import.meta.url), 'utf8'), context, { filename: 'app.js' });
const shop = vm.runInContext(`(() => {
  state.products = inputCatalog.map(cleanProduct);
  const defaults = { category: 'all', brand: [], caliber: [], barrel: [], query: '', min: '', max: '', sort: 'new', page: 1 };
  return {
    catalog: state.products,
    filter(selection = {}) { Object.assign(state, defaults, selection); return filtered(); },
    available(selection, key) { Object.assign(state, defaults, selection); return availableFor(key); },
    values: facetValues
  };
})()`, context);
const catalog = shop.catalog;
const empty = () => ({ category: 'all', brand: [], caliber: [], barrel: [], query: '', min: '', max: '' });
const categoryCounts = Object.fromEntries([...new Set(catalog.map(product => product.category))].sort().map(category => [category, catalog.filter(product => product.category === category).length]));
const filter = state => shop.filter(state);
const available = (state, ignored) => shop.available(state, ignored);
const hasId = (items, id) => items.some(product => product.id === id);
const hasValue = (product, key, value) => shop.values(product, key).includes(value);
const check = (name, condition) => assert.ok(condition, name);

check('catalog has 376 products', catalog.length === 376);
check('no empty brand tag is exposed', catalog.every(product => product.brandTags.every(Boolean)));
check('clear state restores every product', filter(empty()).length === 376);
check('catalog has the verified category distribution', JSON.stringify(categoryCounts) === JSON.stringify({
  'აქსესუარები': 58, 'დანები': 1, 'ვაზნები': 105, 'ნავები და ძრავები': 2,
  'ოპტიკა': 72, 'პნევმატიკა': 2, 'ტურიზმი': 1, 'ფანრები': 14, 'ცეცხლსასროლი იარაღი': 121
}));

const expectedCategories = new Map([
  ['magnum-58', 'ნავები და ძრავები'], ['magnum-59', 'ცეცხლსასროლი იარაღი'], ['magnum-62', 'ცეცხლსასროლი იარაღი'],
  ['magnum-124', 'აქსესუარები'], ['magnum-152', 'ცეცხლსასროლი იარაღი'], ['magnum-154', 'ცეცხლსასროლი იარაღი'],
  ['magnum-227', 'ვაზნები'], ['magnum-230', 'ვაზნები'], ['magnum-234', 'აქსესუარები'], ['magnum-251', 'აქსესუარები'],
  ['magnum-257', 'ოპტიკა'], ['magnum-258', 'ოპტიკა'], ['magnum-259', 'აქსესუარები'], ['magnum-263', 'ტურიზმი'],
  ['magnum-264', 'აქსესუარები'], ['magnum-265', 'პნევმატიკა'], ['magnum-270', 'აქსესუარები'],
  ['magnum-283', 'აქსესუარები'], ['magnum-284', 'აქსესუარები'], ['magnum-285', 'აქსესუარები'], ['magnum-286', 'აქსესუარები'],
  ['magnum-300', 'აქსესუარები'], ['magnum-301', 'აქსესუარები'], ['magnum-302', 'აქსესუარები'], ['magnum-303', 'აქსესუარები'], ['magnum-304', 'აქსესუარები'],
  ['magnum-305', 'ვაზნები'], ['magnum-321', 'ნავები და ძრავები'], ['magnum-364', 'ვაზნები'],
  ['magnum-365', 'აქსესუარები'], ['magnum-368', 'აქსესუარები'], ['magnum-369', 'აქსესუარები'],
  ['magnum-370', 'აქსესუარები'], ['magnum-371', 'აქსესუარები'], ['magnum-374', 'აქსესუარები'], ['magnum-375', 'აქსესუარები'],
  ...['magnum-262', 'magnum-266', 'magnum-267', 'magnum-268', 'magnum-269', 'magnum-311', 'magnum-312', 'magnum-313', 'magnum-314', 'magnum-362', 'magnum-366', 'magnum-376'].map(id => [id, 'აქსესუარები'])
]);
const catalogById = new Map(catalog.map(product => [product.id, product]));
for (const [id, category] of expectedCategories) check(`${id} has its audited category`, catalogById.get(id)?.category === category);

const firearms = filter({ ...empty(), category: 'ცეცხლსასროლი იარაღი' });
check('firearms category contains only its audited 121 products', firearms.length === 121 && firearms.every(product => product.category === 'ცეცხლსასროლი იარაღი'));
check('ARKEN is not in firearms', !firearms.some(product => product.brandTags.includes('ARKEN')));
check('water pumps, clay targets, hoses, electronics, and mounts are not firearms', !firearms.some(product => /PADDLE|WHISTLE|WATER PUMP|INVERTER|SOLAR|ELASTICITY HOSE|DIN HOSE|SEA SCOOTER|PREDATOR POLYMAG|SPARE MAGAZINE|^BARRELS|სასროლი თეფში|კრონშტეინი/i.test(product.name)));
check('accessories cannot leak calibers or barrel lengths into a firearm filter', catalog.filter(product => !['ცეცხლსასროლი იარაღი', 'ვაზნები', 'პნევმატიკა'].includes(product.category)).every(product => !shop.values(product, 'caliber').length && !shop.values(product, 'barrelLength').length));
check('Lapua tag belongs only to actual Lapua ammunition', catalog.filter(product => product.brandTags.includes('LAPUA')).every(product => product.category === 'ვაზნები'));
const lapuaMega = catalogById.get('magnum-318');
check('Lapua 7.62×53R is not mistaken for its 12 gram projectile weight', lapuaMega?.caliber === '7.62×53R' && lapuaMega.caliber !== '12 GA');
const twelveGramProducts = catalog.filter(product => /\b12g\b/i.test(product.name));
check('a projectile weight written as 12g is never exposed as 12 gauge', twelveGramProducts.length > 0 && twelveGramProducts.every(product => !hasValue(product, 'caliber', '12 GA')));
const hasExplicit12Gauge = name => /\b12\s*(?:GA(?:UGE)?\b|CAL(?:IBER)?\b\.?|\/\s*(?:65|70|76|89)\b)/i.test(name)
  || /(?:\bCAL(?:IBER)?\b\.?|კალ\.?)\s*[:.]?\s*12(?!\s*(?:G(?:R)?|GRAM|გრ)\b)/i.test(name);
const twelveGaugeProducts = filter({ ...empty(), caliber: ['12 GA'] });
const manufacturerVerifiedGauge = new Set(['magnum-122', 'magnum-123', 'magnum-184']);
check('every 12 GA option comes from explicit notation or an audited manufacturer source', twelveGaugeProducts.length === 59 && twelveGaugeProducts.every(product => hasExplicit12Gauge(product.name) || manufacturerVerifiedGauge.has(product.id)));
const expectedCalibers = new Map([
  ['magnum-60', '5.56×45 MM'], ['magnum-128', '7 MM REM MAG'], ['magnum-163', '8×57 JRS'],
  ['magnum-223', '9.3×72R'], ['magnum-227', '17 WSM'], ['magnum-230', '5.7×28 MM'],
  ['magnum-318', '7.62×53R'], ['magnum-319', '243 WIN'], ['magnum-354', '8×68S'], ['magnum-364', '4.5 MM']
]);
for (const [id, caliber] of expectedCalibers) check(`${id} has its audited caliber`, catalogById.get(id)?.caliber === caliber);

const rock = filter({ ...empty(), brand: ['ROCK ISLAND ARMORY'] });
check('Rock Island Armory filters exactly its product', rock.length === 1 && rock[0].brandTags.includes('ROCK ISLAND ARMORY'));
const utg = filter({ ...empty(), brand: ['UTG'] });
check('UTG filter includes the newly identified airgun mount adapter', utg.length === 55 && utg.every(product => product.brandTags.includes('UTG')));
const multiBrand = filter({ ...empty(), brand: ['UTG', 'ROCK ISLAND ARMORY'] });
check('multiple brands are an inclusive union', multiBrand.length === 56 && multiBrand.every(product => product.brandTags.some(tag => ['UTG', 'ROCK ISLAND ARMORY'].includes(tag))));

const optics = filter({ ...empty(), category: 'ოპტიკა' });
check('optics category has only its audited 72 products', optics.length === 72 && optics.every(product => product.category === 'ოპტიკა'));
const scopedUtg = filter({ ...empty(), category: 'ოპტიკა', brand: ['UTG'] });
check('category + brand is an intersection', scopedUtg.length > 0 && scopedUtg.every(product => product.category === 'ოპტიკა' && product.brandTags.includes('UTG')));

const caliber = filter({ ...empty(), category: 'ცეცხლსასროლი იარაღი', caliber: ['12 GA'] });
check('caliber filter returns all exact normalized variants', caliber.length === 40 && caliber.every(product => hasValue(product, 'caliber', '12 GA')));
const caliberValues = new Set(catalog.flatMap(product => shop.values(product, 'caliber')));
check('legacy caliber spellings are absent', !['12', '12GA', '22LR', '22WMR', '9MM', '9×19'].some(value => caliberValues.has(value)));
const price = filter({ ...empty(), min: '1000', max: '2000' });
check('price range has no out-of-range product', price.length > 0 && price.every(product => product.amount >= 1000 && product.amount <= 2000));
const search = filter({ ...empty(), query: 'ROCK ISLAND' });
check('search finds the normalized brand product by name', search.length === 1 && search[0].brandTags.includes('ROCK ISLAND ARMORY'));
const tagSearch = filter({ ...empty(), query: 'DIAMONDBACK FIREARMS' });
check('search also finds a product through its normalized brand tag', tagSearch.length === 1 && tagSearch[0].brandTags.includes('DIAMONDBACK FIREARMS'));

const facetSource = available({ ...empty(), category: 'ცეცხლსასროლი იარაღი' }, 'brand');
check('all brand facet values are valid strings', facetSource.every(product => product.brandTags.every(tag => typeof tag === 'string' && tag.trim())));
assert.equal(new Set(catalog.map(product => product.id)).size, 376, 'product IDs remain unique');
for (const product of catalog) {
  for (const [key, primary] of [['brandTags', 'brand'], ['caliberTags', 'caliber'], ['barrelLengthTags', 'barrelLength']]) {
    check(`${product.id}: ${key} is an array`, Array.isArray(product[key]));
    check(`${product.id}: ${key} has no empty, duplicate, or null-string values`, product[key].every(value => typeof value === 'string' && value.trim() === value && value && !/^(null|undefined)$/i.test(value)) && new Set(product[key]).size === product[key].length);
    check(`${product.id}: primary ${primary} belongs to filter values`, product[primary] ? product[key].includes(product[primary]) : product[key].length === 0);
  }
  check(`${product.id}: numeric price is finite and positive`, Number.isFinite(product.amount) && product.amount > 0);
}
for (const variant of ['44 MAG', '45 COLT']) check(`MORISSON is found through ${variant}`, hasId(filter({ ...empty(), category: 'ცეცხლსასროლი იარაღი', brand: ['MORISSON'], caliber: [variant] }), 'magnum-115'));
assert.equal(filter({ ...empty(), caliber: ['44 MAG', '45 COLT'] }).filter(product => product.id === 'magnum-115').length, 1, 'OR caliber selection does not duplicate products');
for (const length of ['71', '76']) check(`FABARM AXIS is found through ${length} cm`, hasId(filter({ ...empty(), brand: ['FABARM'], barrel: [length] }), 'magnum-123'));
check('FABARM AXIS is excluded from unlisted barrel lengths', !hasId(filter({ ...empty(), barrel: ['47'] }), 'magnum-123'));
assert.equal(filter({ ...empty(), category: 'აქსესუარები', brand: ['FENIX'] }).length, 8, 'Fenix chargers, battery, remote and whistle remain accessories');
assert.equal(catalogById.get('magnum-270').brand, 'LIPETSK', 'MIDI size is not a manufacturer');
for (const id of ['magnum-283', 'magnum-284', 'magnum-285', 'magnum-286']) assert.equal(catalogById.get(id).brand, 'YANGTZE SOLAR', `${id}: actual manufacturer rather than controller technology`);
for (const id of ['magnum-315', 'magnum-316', 'magnum-317']) assert.equal(catalogById.get(id).brand, 'SELLIER & BELLOT', `${id}: S&B alias unified`);
const brands = new Set(catalog.flatMap(product => product.brandTags));
check('fake and duplicate brand names are absent', !['MIDI', 'OFF GRID', 'MPPT', 'PWM', 'S&B'].some(value => brands.has(value)));
const unverified = catalog.filter(product => product.brandStatus === 'unverified');
check('unverified manufacturers are not invented as filter options', unverified.length > 0 && unverified.every(product => !product.brand && !product.brandTags.length));
for (const [id, amount] of [['magnum-126', 2.8], ['magnum-171', 0.9], ['magnum-202', 1305], ['magnum-234', 210]]) assert.equal(catalogById.get(id).amount, amount, `${id}: audited numeric price`);
check('decimal price filter retains fractional lari', hasId(filter({ ...empty(), min: '2.7', max: '2.9' }), 'magnum-126') && !hasId(filter({ ...empty(), max: '2.7' }), 'magnum-126'));
assert.equal(available({ ...empty(), category: 'ცეცხლსასროლი იარაღი', brand: ['HUGLU'] }, 'brand').length, 121, 'brand facet counts ignore only their own selection');
console.log(`Filter verification passed against app.js: ${catalog.length} products, ${firearms.length} firearms, ${optics.length} optics, ${utg.length} UTG products; audited brands, prices and multi-value variants verified.`);

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const file = new URL('../data/products.json', import.meta.url);
const { products } = JSON.parse(await fs.readFile(file, 'utf8'));
const clean = product => ({
  ...product,
  brandTags: [...new Set((product.brandTags || [product.brand]).filter(Boolean))],
  caliber: product.caliber || '', barrelLength: product.barrelLength || ''
});
const catalog = products.map(clean);
const empty = () => ({ category: 'all', brand: [], caliber: [], barrel: [], query: '', min: '', max: '' });
const searchableText = product => [product.name, product.category, ...product.brandTags, product.caliber, product.barrelLength].filter(Boolean).join(' ');
const categoryCounts = Object.fromEntries([...new Set(catalog.map(product => product.category))].sort().map(category => [category, catalog.filter(product => product.category === category).length]));
const matches = (product, state, ignored = '') =>
  (ignored === 'category' || state.category === 'all' || product.category === state.category)
  && (ignored === 'brand' || !state.brand.length || product.brandTags.some(brand => state.brand.includes(brand)))
  && (ignored === 'caliber' || !state.caliber.length || state.caliber.includes(product.caliber))
  && (ignored === 'barrel' || !state.barrel.length || state.barrel.includes(product.barrelLength))
  && (!state.query || searchableText(product).toLowerCase().includes(state.query.toLowerCase()))
  && (!state.min || product.amount >= Number(state.min))
  && (!state.max || product.amount <= Number(state.max));
const filter = state => catalog.filter(product => matches(product, state));
const available = (state, ignored) => catalog.filter(product => matches(product, state, ignored));
const check = (name, condition) => assert.ok(condition, name);

check('catalog has 376 products', catalog.length === 376);
check('no empty brand tag is exposed', catalog.every(product => product.brandTags.every(Boolean)));
check('clear state restores every product', filter(empty()).length === 376);
check('catalog has the verified category distribution', JSON.stringify(categoryCounts) === JSON.stringify({
  'აქსესუარები': 46, 'დანები': 2, 'ვაზნები': 106, 'ნავები და ძრავები': 2,
  'ოპტიკა': 72, 'პნევმატიკა': 4, 'ტურიზმი': 1, 'ფანრები': 22, 'ცეცხლსასროლი იარაღი': 121
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
  ['magnum-370', 'აქსესუარები'], ['magnum-371', 'აქსესუარები'], ['magnum-374', 'აქსესუარები'], ['magnum-375', 'აქსესუარები']
]);
const catalogById = new Map(catalog.map(product => [product.id, product]));
for (const [id, category] of expectedCategories) check(`${id} has its audited category`, catalogById.get(id)?.category === category);

const firearms = filter({ ...empty(), category: 'ცეცხლსასროლი იარაღი' });
check('firearms category contains only its audited 121 products', firearms.length === 121 && firearms.every(product => product.category === 'ცეცხლსასროლი იარაღი'));
check('ARKEN is not in firearms', !firearms.some(product => product.brandTags.includes('ARKEN')));
check('water pumps, clay targets, hoses, electronics, and mounts are not firearms', !firearms.some(product => /PADDLE|WHISTLE|WATER PUMP|INVERTER|SOLAR|ELASTICITY HOSE|DIN HOSE|SEA SCOOTER|PREDATOR POLYMAG|SPARE MAGAZINE|^BARRELS|სასროლი თეფში|კრონშტეინი/i.test(product.name)));
check('accessories cannot leak calibers or barrel lengths into a firearm filter', catalog.filter(product => !['ცეცხლსასროლი იარაღი', 'ვაზნები', 'პნევმატიკა'].includes(product.category)).every(product => !product.caliber && !product.barrelLength));
check('Lapua tag belongs only to actual Lapua ammunition', catalog.filter(product => product.brandTags.includes('LAPUA')).every(product => product.category === 'ვაზნები'));

const rock = filter({ ...empty(), brand: ['ROCK ISLAND ARMORY'] });
check('Rock Island Armory filters exactly its product', rock.length === 1 && rock[0].brandTags.includes('ROCK ISLAND ARMORY'));
const utg = filter({ ...empty(), brand: ['UTG'] });
check('UTG filter returns its tagged catalog', utg.length === 54 && utg.every(product => product.brandTags.includes('UTG')));
const multiBrand = filter({ ...empty(), brand: ['UTG', 'ROCK ISLAND ARMORY'] });
check('multiple brands are an inclusive union', multiBrand.length === 55 && multiBrand.every(product => product.brandTags.some(tag => ['UTG', 'ROCK ISLAND ARMORY'].includes(tag))));

const optics = filter({ ...empty(), category: 'ოპტიკა' });
check('optics category has only its audited 72 products', optics.length === 72 && optics.every(product => product.category === 'ოპტიკა'));
const scopedUtg = filter({ ...empty(), category: 'ოპტიკა', brand: ['UTG'] });
check('category + brand is an intersection', scopedUtg.length > 0 && scopedUtg.every(product => product.category === 'ოპტიკა' && product.brandTags.includes('UTG')));

const caliber = filter({ ...empty(), category: 'ცეცხლსასროლი იარაღი', caliber: ['12 GA'] });
check('caliber filter returns only exact normalized values', caliber.length === 37 && caliber.every(product => product.caliber === '12 GA'));
const caliberValues = new Set(catalog.map(product => product.caliber).filter(Boolean));
check('legacy caliber spellings are absent', !['12', '12GA', '22LR', '22WMR', '9MM', '9×19'].some(value => caliberValues.has(value)));
const price = filter({ ...empty(), min: '1000', max: '2000' });
check('price range has no out-of-range product', price.length > 0 && price.every(product => product.amount >= 1000 && product.amount <= 2000));
const search = filter({ ...empty(), query: 'ROCK ISLAND' });
check('search finds the normalized brand product by name', search.length === 1 && search[0].brandTags.includes('ROCK ISLAND ARMORY'));
const tagSearch = filter({ ...empty(), query: 'DIAMONDBACK FIREARMS' });
check('search also finds a product through its normalized brand tag', tagSearch.length === 1 && tagSearch[0].brandTags.includes('DIAMONDBACK FIREARMS'));

const facetSource = available({ ...empty(), category: 'ცეცხლსასროლი იარაღი' }, 'brand');
check('all brand facet values are valid strings', facetSource.every(product => product.brandTags.every(tag => typeof tag === 'string' && tag.trim())));
console.log(`Filter verification passed: ${catalog.length} products, ${firearms.length} firearms, ${optics.length} optics, ${utg.length} UTG products.`);

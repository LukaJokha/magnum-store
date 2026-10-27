// Independent data checks. Expected values below come from the reviewed source
// titles, source price strings and cited exact-model manufacturer specifications.
// Do not import or reproduce the normalization implementation here.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const catalog = JSON.parse(await fs.readFile(new URL('../data/products.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(await fs.readFile(new URL('../data/catalog-metadata.json', import.meta.url), 'utf8'));
const audits = await Promise.all([1, 2, 3].map(async range => JSON.parse(await fs.readFile(new URL(`./audit-range-${range}.json`, import.meta.url), 'utf8'))));
const rows = catalog.products;
const byId = new Map(rows.map(row => [row.id, row]));
const expectedIds = Array.from({ length: 376 }, (_, index) => `magnum-${index + 1}`);
const failures = [];
let checks = 0;
function check(label, run) {
  checks++;
  try { run(); } catch (error) { failures.push(`${label}: ${error.message}`); }
}
function row(id) {
  const value = byId.get(id);
  assert.ok(value, `${id} must exist`);
  return value;
}
function tags(id, field, expected) {
  check(`${id}.${field}`, () => assert.deepEqual([...row(id)[field]].sort(), [...expected].sort()));
}

check('376 distinct product identities', () => {
  assert.equal(rows.length, 376);
  assert.equal(byId.size, 376);
  assert.deepEqual([...byId.keys()].sort(), [...expectedIds].sort());
});
check('376 individually reviewed records, no overlap or omission', () => {
  const reviewed = audits.flatMap(audit => audit.reviewedIds);
  assert.equal(reviewed.length, 376);
  assert.equal(new Set(reviewed).size, 376);
  assert.deepEqual([...reviewed].sort(), [...expectedIds].sort());
  assert.equal(metadata.reviewedCount, 376);
  assert.deepEqual(Object.keys(metadata.products).sort(), [...expectedIds].sort());
});

// Unknown manufacturer is an explicit review result, not a fabricated name.
const unresolvedManufacturers = new Set([58, 300, 301, 302, 303, 304, 321, 369, 370, 371, 374, 376].map(id => `magnum-${id}`));
const realBrands = new Set([
  'HUGLU', 'ROSSI', 'TAURUS', 'ARKEN', 'ROCK ISLAND ARMORY', 'GLOCK', 'RUGER', 'GUERINI', 'H&N', 'HUNT GROUP',
  'MAUSER', 'ROCK RIVER', 'DIAMONDBACK FIREARMS', 'MORISSON', 'SARSILMAZ', 'S&W', 'KRAL', 'REDWIN', 'YAF', 'HK',
  'LAMBRO', 'ELEY', 'SCHMIDT & BENDER', 'FABARM', 'SELLIER & BELLOT', 'POF USA', 'MKA', 'GGG', 'FENIX', 'CITADEL',
  'ARMED', 'ASELKON', 'ARMSAN', 'PARDUS', 'WINCHESTER', 'FN', 'UTG', 'GANZO', 'HILL', 'STEYR', 'LIPETSK',
  'YANGTZE SOLAR', 'JSB', 'LAPUA', 'SAUVESTRE', 'AIR ARMS', 'ATA ARMS'
]);
const categories = new Set(['ცეცხლსასროლი იარაღი', 'ოპტიკა', 'ვაზნები', 'აქსესუარები', 'ფანრები', 'პნევმატიკა', 'დანები', 'ნავები და ძრავები', 'ტურიზმი']);
const caliberCategories = new Set(['ცეცხლსასროლი იარაღი', 'ვაზნები', 'პნევმატიკა']);
for (const product of rows) {
  check(`${product.id} structural/identity integrity`, () => {
    for (const field of ['id', 'name', 'brand', 'category', 'caliber', 'barrelLength', 'price', 'sourcePrice', 'image', 'description']) {
      assert.equal(typeof product[field], 'string', `${field} must be a string`);
      assert.ok(!/^(?:null|undefined)$/i.test(product[field].trim()), `${field} must not contain a placeholder string`);
    }
    assert.ok(product.name.trim());
    assert.ok(categories.has(product.category), `unreviewed category ${product.category}`);
    assert.ok(Number.isFinite(product.amount) && product.amount > 0, 'numeric price must be positive');
    for (const field of ['brandTags', 'caliberTags', 'barrelLengthTags']) {
      assert.ok(Array.isArray(product[field]), `${field} must be an array`);
      assert.equal(new Set(product[field]).size, product[field].length, `${field} has duplicates`);
      assert.ok(product[field].every(value => typeof value === 'string' && value.trim()), `${field} has empty/null entries`);
    }
    assert.equal(product.brand, product.brandTags[0] || '');
    assert.equal(product.caliber, product.caliberTags[0] || '');
    assert.equal(product.barrelLength, product.barrelLengthTags[0] || '');
    if (unresolvedManufacturers.has(product.id)) {
      assert.equal(product.brand, '', 'unidentified manufacturer must not be invented');
      assert.equal(product.brandStatus, 'unverified');
    } else {
      assert.ok(product.brandTags.length, 'reviewed branded product lost its manufacturer');
      assert.equal(product.brandStatus, 'verified');
      for (const brand of product.brandTags) assert.ok(realBrands.has(brand), `unrecognized/pseudo-brand ${brand}`);
    }
    if (!caliberCategories.has(product.category)) assert.deepEqual(product.caliberTags, [], 'irrelevant item leaked into caliber facet');
    if (!['ცეცხლსასროლი იარაღი', 'პნევმატიკა'].includes(product.category)) assert.deepEqual(product.barrelLengthTags, [], 'irrelevant item leaked into barrel facet');
    for (const length of product.barrelLengthTags) assert.ok(Number(length) > 0 && Number(length) <= 130, `invalid centimeter length ${length}`);
  });
}

// Review evidence must translate to actual corrected records, including recovered titles.
for (const audit of audits) for (const correction of audit.corrections) {
  for (const field of ['name', 'brand', 'category']) if (correction[field] !== undefined) {
    check(`${correction.id} reviewed ${field}`, () => assert.equal(row(correction.id)[field], correction[field]));
  }
  for (const [field, tagField] of [['caliber', 'caliberTags'], ['barrelLength', 'barrelLengthTags']]) if (correction[field] !== undefined) {
    check(`${correction.id} reviewed ${field}`, () => assert.ok(row(correction.id)[tagField].includes(correction[field])));
  }
}

// Explicit source prices; fixtures include decimal cents, pack quantities,
// old-price discounts, model numbers and barrel lengths before monetary prices.
const priceFixtures = {
  58: 70, 70: 950, 85: 2.8, 86: 2.6, 87: 2.5, 88: 2.4, 89: 2.3, 90: 2.3, 91: 1.6, 92: 1.4,
  93: 1.5, 94: 1.5, 95: 1.4, 100: 7.4, 101: 7.2, 102: 7, 106: 2.3, 107: 2.1, 109: 1.85,
  110: 1.7, 111: 1.25, 112: 1.1, 113: 0.9, 114: 0.75, 124: 1500, 125: 6.7, 138: 500, 139: 355,
  140: 395, 141: 325, 142: 390, 171: 0.9, 187: 435, 201: 215, 202: 1305, 203: 1170, 204: 1170,
  205: 1080, 206: 630, 207: 585, 208: 585, 209: 585, 210: 450, 234: 210, 235: 820, 236: 780,
  237: 695, 238: 585, 239: 575, 240: 535, 241: 570, 242: 560, 243: 545, 244: 515, 245: 515,
  246: 515, 247: 475, 248: 435, 249: 280, 250: 260, 253: 535, 254: 400, 255: 375, 256: 280,
  257: 260, 258: 260, 270: 66, 318: 6.4, 321: 455, 346: 10.9, 347: 11.1, 355: 11.8, 360: 8.1,
  361: 9.6, 368: 420
};
for (const [id, amount] of Object.entries(priceFixtures)) check(`magnum-${id} source-grounded price`, () => assert.equal(row(`magnum-${id}`).amount, amount));
for (const id of [58, 70, 111, 112, 113, 114, 124, 201, 234, 254, 270, 368]) {
  check(`magnum-${id} variant pricing retained`, () => {
    const product = row(`magnum-${id}`);
    assert.match(product.price, /ლარიდან$/);
    assert.ok(product.description.includes(product.sourcePrice), 'full variant/pack pricing must remain readable');
  });
}
for (const id of [138, 139, 140, 141, 142, 187, 321]) {
  check(`magnum-${id} descriptive text preserved`, () => {
    const product = row(`magnum-${id}`);
    assert.match(product.price, /^\d+ ლარი$/);
    assert.ok(product.description.includes(product.sourcePrice), 'details mixed into source price must not be lost');
  });
}

const accessoryIds = [124, 234, 251, 259, 262, 264, 266, 267, 268, 269, 270, 283, 284, 285, 286,
  300, 301, 302, 303, 304, 311, 312, 313, 314, 326, 327, 328, 329, 330, 331, 332, 333, 334,
  335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 362, 365, 366, 367, 368, 369, 370,
  371, 372, 373, 374, 375, 376];
for (const id of accessoryIds) check(`magnum-${id} accessory is not a complete firearm/optic/flashlight`, () => assert.equal(row(`magnum-${id}`).category, 'აქსესუარები'));
for (const id of [27, 28, 29, 30, 31, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 257, 258, 322, 323, 324, 325]) {
  check(`magnum-${id} optical item`, () => assert.equal(row(`magnum-${id}`).category, 'ოპტიკა'));
}
for (const id of [270, 283, 284, 285, 286, 315, 316, 317]) {
  const expected = id === 270 ? 'LIPETSK' : id < 300 ? 'YANGTZE SOLAR' : 'SELLIER & BELLOT';
  check(`magnum-${id} documented manufacturer`, () => assert.equal(row(`magnum-${id}`).brand, expected));
}
tags('magnum-368', 'brandTags', ['ATA ARMS', 'ARMSAN']);
tags('magnum-115', 'caliberTags', ['44 MAG', '45 COLT']);
tags('magnum-123', 'barrelLengthTags', ['71', '76']);
tags('magnum-191', 'barrelLengthTags', ['71', '47', '61']);
tags('magnum-318', 'caliberTags', ['7.62×53R']);
tags('magnum-319', 'caliberTags', ['243 WIN']);
tags('magnum-85', 'caliberTags', ['12 GA']);
tags('magnum-101', 'caliberTags', ['12 GA']);
tags('magnum-90', 'caliberTags', ['12 GA']);
for (const id of [58, 270, 300, 301, 302, 303, 304]) tags(`magnum-${id}`, 'caliberTags', []);
check('projectile weights never become gauge values', () => {
  for (const product of rows.filter(product => /\b12\s*g(?:\.|\b)/i.test(product.name))) assert.ok(!product.caliberTags.includes('12 GA'), product.id);
  assert.ok(!rows.some(product => product.caliberTags.some(value => /^(?:50|36|33|30)\s*(?:GA|GR|G)$/.test(value))));
});

if (failures.length) {
  console.error(`Catalog audit verification failed (${failures.length}/${checks} checks):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Catalog audit verification passed: ${checks} checks, 376 individually reviewed products, ${376 - unresolvedManufacturers.size} confirmed brand records, ${unresolvedManufacturers.size} explicitly unresolved manufacturers, source-grounded category/specification/price fixtures.`);
}

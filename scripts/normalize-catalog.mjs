import fs from 'node:fs/promises';

const file = new URL('../data/products.json', import.meta.url);
const catalog = JSON.parse(await fs.readFile(file, 'utf8'));
const aliases = [
  ['ROCK ISLAND ARMORY', /^ROCK\s+ISLAND\s+ARMORY/i], ['ROCK RIVER', /^ROCK\s+RIVER/i],
  ['HUNT GROUP', /^HUNT\s+GROUP/i], ['SELLIER & BELLOT', /^SELLIER[-\s]?BELLOT/i],
  ['SCHMIDT & BENDER', /^SCHMIDT\s*&?\s*BENDER/i], ['POF USA', /^POF[-\s]?USA/i],
  ['S&W', /^S&W\b/i], ['H&N', /^H&N\b/i], ['MKA', /^MKA(?:556|919)/i]
];
const nonBrands = /^(?:\d|PADDLE|AMMUNITION|PCP|OFF|PWM|MINI|DIABOLO|ARE-|ARW-|SF-|RG|RQ|Კ|Ს|Ხ|Დ|Ო|Ა)/i;
const normalizeBrand = name => {
  for (const [brand, pattern] of aliases) if (pattern.test(name)) return brand;
  const first = name.trim().split(/[\s,]+/)[0].replace(/[^\p{L}\p{N}&.-]/gu, '');
  return !first || nonBrands.test(first) ? '' : first.toUpperCase();
};
const caliber = name => {
  const match = name.match(/(?:cal(?:iber)?\.?|კალ\.?|CAL)\s*[:.]?\s*((?:\d+(?:[.,]\d+)?\s*(?:GA|CAL|MM|LR|WMR|MAG|WIN|REM)|\d+(?:[x×]\d+)(?:\s*MM)?))/i)
    || name.match(/\b(12|16|20|28)\s*(?:GA|CAL|\/\d{2})\b/i);
  if (!match) return '';
  return match[1].toUpperCase().replace(',', '.').replace(/\s+/g, ' ').replace('X', '×');
};
const barrelLength = name => {
  const match = name.match(/(?:barrel(?:\s+length)?|ლულ[ა-ის]*)\s*[:.-]?\s*(\d+(?:[.,]\d+)?)\s*(?:cm|სმ)?/i);
  return match ? match[1].replace(',', '.') : '';
};
const opticsBrands = new Set(['ARKEN', 'REDWIN', 'SCHMIDT & BENDER']);
const ammunitionBrands = new Set(['H&N', 'SELLIER & BELLOT', 'SAUVESTRE', 'YAF', 'LAMBRO', 'ELEY', 'S&B', 'GGG']);
const classify = product => {
  if (product.category !== 'ცეცხლსასროლი იარაღი') return product.category;
  const upper = product.name.toUpperCase();
  if (opticsBrands.has(product.brand) || /\b(?:FFP|SFP|LPVO|MOA|MIL|RIFLESCOPE|SCOPE)\b|კოლიმატ/.test(upper)) return 'ოპტიკა';
  if (product.brand === 'FENIX' || /ფანარ|FLASHLIGHT/i.test(product.name)) return 'ფანრები';
  if (ammunitionBrands.has(product.brand) || /\b(?:AMMUNITION|CARTRIDGE)\b|ვაზნ/.test(upper)) return 'ვაზნები';
  if (/პნევმატ|\b(?:PCP|DIABOLO)\b/i.test(product.name)) return 'პნევმატიკა';
  if (/დან[ა-ის]/i.test(product.name)) return 'დანები';
  return 'ცეცხლსასროლი იარაღი';
};

for (const product of catalog.products) {
  product.brand = normalizeBrand(product.name);
  product.caliber = caliber(product.name) || '';
  product.barrelLength = barrelLength(product.name) || '';
  product.category = classify(product);
  delete product.sourceImage;
}
catalog.updatedAt = new Date().toISOString();
await fs.writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
const guns = catalog.products.filter(product => product.category === 'ცეცხლსასროლი იარაღი');
console.log(JSON.stringify({ firearms: guns.length, brandTagged: guns.filter(product => product.brand).length, caliberTagged: guns.filter(product => product.caliber).length, barrelTagged: guns.filter(product => product.barrelLength).length }, null, 2));

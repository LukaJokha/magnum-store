import fs from 'node:fs/promises';

const file = new URL('../data/products.json', import.meta.url);
const catalog = JSON.parse(await fs.readFile(file, 'utf8'));
const aliases = [
  ['ROCK ISLAND ARMORY', /^ROCK\s+ISLAND\s+ARMORY/i], ['ROCK RIVER', /^ROCK\s+RIVER/i],
  ['HUNT GROUP', /^HUNT\s+GROUP/i], ['SELLIER & BELLOT', /^SELLIER[-\s]?BELLOT/i],
  ['SCHMIDT & BENDER', /^SCHMIDT\s*&?\s*BENDER/i], ['POF USA', /^POF[-\s]?USA/i],
  ['S&W', /^S&W\b/i], ['H&N', /^H&N\b/i], ['MKA', /^MKA(?:556|919)/i],
  ['UTG', /\bUTG\b|\b(?:SCP|OP3|OP|OT|RB|MNT)-|\b(?:RGPM|RGWM|RG2W|RQ2W)/i],
  ['GANZO', /\bGANZO\b/i], ['HILL', /\bHILL\b/i], ['LAPUA', /\bLAPUA\b/i],
  ['AIR ARMS', /\bAIR\s+ARMS\b/i], ['ASELKON', /\bRAVELLO\b/i],
  ['DIAMONDBACK FIREARMS', /^DB15\b/i]
];
const nonBrands = /^(?:\d|PADDLE|AMMUNITION|PCP|OFF|PWM|MINI|DIABOLO|ARE-|ARW-|SF-|RG|RQ|SCP-|KNIFE|BARRELS|Კ|Ს|Ხ|Დ|Ო|Ა|Მ|Პ)/i;
const overrides = new Map([
  ...['magnum-223', 'magnum-224', 'magnum-225', 'magnum-226'].map(id => [id, ['SELLIER & BELLOT']]),
  ['magnum-234', ['REDWIN']], ['magnum-260', ['ASELKON']], ['magnum-270', ['MIDI']],
  ['magnum-283', ['OFF GRID']], ['magnum-305', ['JSB']],
  ...['magnum-311', 'magnum-312', 'magnum-313', 'magnum-314'].map(id => [id, ['FENIX']]),
  ...['magnum-318', 'magnum-319'].map(id => [id, ['LAPUA']]),
  ['magnum-365', ['AIR ARMS']], ['magnum-368', ['ATA ARMS', 'ARMSAN']], ['magnum-372', ['UTG']],
  ['magnum-373', ['UTG']], ['magnum-375', ['FABARM']]
]);
const normalizeBrands = product => {
  const explicit = overrides.get(product.id);
  if (explicit) return explicit;
  const name = product.name;
  for (const [brand, pattern] of aliases) if (pattern.test(name)) return [brand];
  const first = name.trim().split(/[\s,]+/)[0].replace(/[^\p{L}\p{N}&.-]/gu, '');
  return !first || nonBrands.test(first) ? [] : [first.toUpperCase()];
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
  const upper = product.name.toUpperCase();
  const brands = product.brandTags || [];
  if (opticsBrands.has(product.brand) || brands.includes('UTG') && /\b(?:SCP|OP3|OP|OT)-|SCOPE|DOT|MAGNIFIER|კოლიმატ|სამიზნე/.test(upper) || /\b(?:FFP|SFP|LPVO|MOA|MIL|RIFLESCOPE|SCOPE)\b|კოლიმატ/.test(upper)) return 'ოპტიკა';
  if (product.brand === 'FENIX' || /ფანარ|FLASHLIGHT/i.test(product.name)) return 'ფანრები';
  if (ammunitionBrands.has(product.brand) || /\b(?:AMMUNITION|CARTRIDGE)\b|ვაზნ/.test(upper)) return 'ვაზნები';
  if (/პნევმატ|\b(?:PCP|DIABOLO)\b/i.test(product.name)) return 'პნევმატიკა';
  if (/დან[ა-ის]|\bKNIFE\b/i.test(product.name)) return 'დანები';
  if (brands.includes('UTG') || /\b(?:MOUNT|RING|PAD|ADAPTOR)\b|კრონშტეინ|ამორტიზატ/.test(upper)) return 'აქსესუარები';
  return product.category;
};

for (const product of catalog.products) {
  product.brandTags = normalizeBrands(product);
  product.brand = product.brandTags[0] || '';
  product.caliber = caliber(product.name) || '';
  product.barrelLength = barrelLength(product.name) || '';
  product.category = classify(product);
  delete product.sourceImage;
}
catalog.updatedAt = new Date().toISOString();
await fs.writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
const guns = catalog.products.filter(product => product.category === 'ცეცხლსასროლი იარაღი');
console.log(JSON.stringify({ firearms: guns.length, brandTagged: guns.filter(product => product.brand).length, caliberTagged: guns.filter(product => product.caliber).length, barrelTagged: guns.filter(product => product.barrelLength).length }, null, 2));

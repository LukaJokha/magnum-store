import fs from 'node:fs/promises';

const file = new URL('../data/products.json', import.meta.url);
const catalog = JSON.parse(await fs.readFile(file, 'utf8'));
const metadata = JSON.parse(await fs.readFile(new URL('../data/catalog-metadata.json', import.meta.url), 'utf8'));
// All known identities use explicit audited decisions. Never derive a maker
// from the first word (MIDI, MPPT, OFF GRID are types, not manufacturers).
// The source mixes cartridge caliber with pellet head size and projectile
// weight. These aliases are deliberately specific: `12g` means 12 grams, not
// 12 gauge, so it must never become a gauge filter value.
const caliberAliases = [
  [/\b7[.,]62\s*[x×]\s*53\s*R\b/i, '7.62×53R'], [/\b7[.,]62\s*[x×]\s*39\b/i, '7.62×39 MM'], [/\b7[.,]62\s*[x×]\s*51\b/i, '7.62×51 MM'],
  [/\b5[.,]56\s*[x×]\s*45\b|\b5[.,]56\s*NATO\b/i, '5.56×45 MM'], [/\b5[.,]7\s*[x×]\s*28\b/i, '5.7×28 MM'], [/\b9[.,]3\s*[x×]\s*72\s*R\b/i, '9.3×72R'],
  [/\b8\s*[x×]\s*68\s*S\b/i, '8×68S'], [/\b8\s*[x×]\s*64\s*S\b/i, '8×64S'], [/\b8\s*[x×]\s*57\s*JRS\b/i, '8×57 JRS'], [/\b8\s*[x×]\s*57\s*JS\b/i, '8×57 JS'],
  [/\b7\s*[x×]\s*64\b/i, '7×64'], [/\b7\s*[x×]\s*57\s*R\b/i, '7×57R'], [/\b7\s*[x×]\s*57\b/i, '7×57'],
  [/\b6[.,]5\s*CREEDMOOR\b/i, '6.5 CREEDMOOR'], [/\b7\s*MM\s*REM\.?\s*MAG(?:NUM)?\b/i, '7 MM REM MAG'], [/\b30[-–]06\b/i, '30-06'], [/\b30[-–]30\s*WIN\b/i, '30-30 WIN'],
  [/\b22[-–]250\s*REM\b/i, '22-250 REM'], [/\b303\s*BRITISH\b/i, '303 BRITISH'], [/\b300\s*AAC\s*BLACKOUT\b/i, '300 AAC BLACKOUT'],
  [/\b300\s*WIN\.?\s*(?:MAG|MAGNUM)\b/i, '300 WIN MAG'], [/\b300\s*W\.S\.M\.?/i, '300 WSM'], [/\b300\s*WEATH(?:ERBY)?\.?\s*MAG\b/i, '300 WEATHERBY MAG'],
  [/\b270\s*W\.S\.M\.?/i, '270 WSM'], [/\b280\s*REM\b/i, '280 REM'], [/\b458\s*WIN\.?\s*MAG\b/i, '458 WIN MAG'],
  [/\b404\s*RIMLESS\b/i, '404 RIMLESS'], [/\b35\s*WHELEN\b/i, '35 WHELEN'], [/\b30R\s*BLASER\b/i, '30R BLASER'],
  [/\b17\s*HMR\b/i, '17 HMR'], [/\b17\s*WSM\b/i, '17 WSM'], [/\b38\s*(?:SPECIAL|SPL)\b/i, '38 SPL'],
  [/\b45\s*(?:COLT|LC)\b/i, '45 COLT'], [/\b44\s*(?:REM\.?\s*)?MAG(?:NUM)?\b/i, '44 MAG'], [/\b357\s*MAG(?:NUM)?\b/i, '357 MAG'],
  [/\b308\s*WIN\b/i, '308 WIN'], [/\b223\s*REM\b/i, '223 REM'], [/(?:^|[^0-9])\.?243\s*WIN\b/i, '243 WIN'],
  [/\b22\s*HORNET\b/i, '22 HORNET'], [/\b40\s*(?:SMITH\s*&?\s*WESSON|S&W)\b/i, '40 S&W'], [/\b4\s*MM\s*RANDZ\b/i, '4 MM RANDZ COURT'],
  [/\b9\s*MM\s*LUGER\b/i, '9×19 MM'], [/\b9\s*MM\s*BROW\.?\s*COURT\b/i, '9×17 MM'], [/\b10\s*MM\s*AUTO\b/i, '10 MM'],
  [/(?:\bCAL(?:IBER)?\.?|კალ\.?)\s*[:.]?\s*5[.,]56(?!\d)/i, '5.56×45 MM']
];
const canonicalCaliber = raw => {
  const value = raw.toUpperCase().replace(',', '.').replace(/\s+/g, '');
  const gauge = value.match(/^(12|16|20|28)(?:GA|CAL)$/);
  if (gauge) return `${gauge[1]} GA`;
  const rimfire = value.match(/^(22)(LR|WMR)$/);
  if (rimfire) return `${rimfire[1]} ${rimfire[2]}`;
  const xCaliber = value.match(/^(\d+(?:\.\d+)?)[X×](\d+(?:\.\d+)?)(R|MM)?$/);
  if (xCaliber) return `${xCaliber[1]}×${xCaliber[2]}${xCaliber[3] === 'R' ? 'R' : ' MM'}`;
  const millimeter = value.match(/^(\d+(?:\.\d+)?)MM$/);
  if (millimeter) return `${millimeter[1]} MM`;
  return '';
};
const caliber = name => {
  for (const [pattern, value] of caliberAliases) if (pattern.test(name)) return value;
  const gauge = name.match(/\b(12|16|20|28)\s*(?:GA(?:UGE)?|CAL(?:IBER)?\.?|\/\s*(?:65|70|76|89))\b/i)
    || name.match(/(?:\bCAL(?:IBER)?\.?|კალ\.?)\s*[:.]?\s*(12|16|20|28)(?!\s*(?:G|GR|GRAM|გრ))/i);
  if (gauge) return `${gauge[1]} GA`;
  const pellet = name.match(/(?:^|[^\d])(?:0?\.1775?|4[.,](?:5|50|51|52))\s*MM\b/i);
  if (pellet) return '4.5 MM';
  const marked = name.match(/(?:\bCAL(?:IBER)?\.?|კალ\.?)\s*[:.]?\s*(\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*(?:MM|R))?|\d+(?:[.,]\d+)?\s*(?:MM|LR|WMR|HMR)?)/i);
  if (marked) return canonicalCaliber(marked[1]);
  const xCaliber = name.match(/\b(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*(MM|R))?\b/i);
  return xCaliber ? canonicalCaliber(`${xCaliber[1]}×${xCaliber[2]}${xCaliber[3] || ''}`) : '';
};
const unique = values => [...new Set(values.filter(Boolean))];
const calibers = name => {
  const matches = caliberAliases.filter(([pattern]) => pattern.test(name)).map(([, value]) => value);
  return unique(matches.length ? matches : [caliber(name)]);
};
const barrelLengths = name => {
  const fragment = name.match(/(?:barrel(?:\s+length)?|ლულ[ა-ის]*)\s*[:.-]?\s*(.+)/i)?.[1];
  if (!fragment) return [];
  // Unitless values cannot be assumed to be centimeters.
  return unique([...fragment.matchAll(/(\d+(?:[.,]\d+)?)\s*(cm|mm|სმ|მმ|inch(?:es)?|″|")/gi)].map(([, number, unit]) => {
    const size = Number(number.replace(',', '.'));
    const value = /^(mm|მმ)$/i.test(unit) ? size / 10 : /^(inch|″|")/i.test(unit) ? size * 2.54 : size;
    return value > 0 && value <= 130 ? String(Number(value.toFixed(2))) : '';
  }));
};
const parsePrice = raw => {
  const range = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:ლარი|lari|₾)/i);
  const amounts = [...raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:ლარი|lari|₾)/gi)].map(match => Number(match[1].replace(',', '.')));
  if (range) amounts.push(Number(range[1].replace(',', '.')));
  if (!amounts.length || amounts.some(value => !Number.isFinite(value) || value <= 0)) throw new Error(`Unrecognized monetary price: ${raw}`);
  return { amount: Math.min(...amounts), variable: new Set(amounts).size > 1 };
};
const caliberCategories = new Set(['ცეცხლსასროლი იარაღი', 'ვაზნები', 'პნევმატიკა']);

for (const product of catalog.products) {
  const decision = metadata.products[product.id];
  if (!decision) throw new Error(`Product requires individual identity review: ${product.id}`);
  product.brandTags = unique(decision.brandTags);
  product.brand = product.brandTags[0] || '';
  product.brandStatus = decision.brandStatus;
  product.category = decision.category;
  product.caliberTags = caliberCategories.has(product.category) ? unique(decision.caliberTags || calibers(product.name)) : [];
  product.barrelLengthTags = ['ცეცხლსასროლი იარაღი', 'პნევმატიკა'].includes(product.category) ? unique(decision.barrelLengthTags || barrelLengths(product.name)) : [];
  product.caliber = product.caliberTags[0] || '';
  product.barrelLength = product.barrelLengthTags[0] || '';
  product.sourcePrice ||= product.price;
  const price = parsePrice(product.sourcePrice);
  product.amount = price.amount;
  const formatted = Number.isInteger(price.amount) ? String(price.amount) : price.amount.toFixed(2).replace('.', ',');
  product.price = `${formatted} ${price.variable ? 'ლარიდან' : 'ლარი'}`;
  product.description = String(product.description || '').trim();
  if (!/^\s*\d+(?:[.,]\d+)?\s*(?:ლარი|lari|₾)\s*$/i.test(product.sourcePrice) && !product.description.includes(product.sourcePrice)) {
    product.description = [product.description, `ფასი და ვარიანტები: ${product.sourcePrice}`].filter(Boolean).join('\n\n');
  }
  delete product.sourceImage;
}
catalog.updatedAt = new Date().toISOString();
await fs.writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
const guns = catalog.products.filter(product => product.category === 'ცეცხლსასროლი იარაღი');
console.log(JSON.stringify({ firearms: guns.length, brandTagged: guns.filter(product => product.brand).length, caliberTagged: guns.filter(product => product.caliber).length, barrelTagged: guns.filter(product => product.barrelLength).length }, null, 2));

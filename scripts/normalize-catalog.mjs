import fs from 'node:fs/promises';

const file = new URL('../data/products.json', import.meta.url);
const catalog = JSON.parse(await fs.readFile(file, 'utf8'));
const aliases = [
  ['ROCK ISLAND ARMORY', /^ROCK\s+ISLAND\s+ARMORY/i], ['ROCK RIVER', /^ROCK\s+RIVER/i],
  ['HUNT GROUP', /^HUNT\s+GROUP/i], ['SELLIER & BELLOT', /^SELLIER[-\s]?BELLOT/i],
  ['SCHMIDT & BENDER', /^SCHMIDT\s*&?\s*BENDER/i], ['POF USA', /^POF[-\s]?USA/i],
  ['S&W', /^S&W\b/i], ['H&N', /^H&N\b/i], ['MKA', /^MKA(?:556|919)/i],
  ['UTG', /\bUTG\b|\b(?:SCP|OP3|OP|OT|RB|MNT)-|\b(?:RGPM|RGWM|RG2W|RQ2W)/i],
  ['GANZO', /\bGANZO\b/i], ['HILL', /\bHILL\b/i], ['LAPUA', /^(?:AMMUNITION\s+)?LAPUA\b/i],
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
const barrelLength = name => {
  const match = name.match(/(?:barrel(?:\s+length)?|ლულ[ა-ის]*)\s*[:.-]?\s*(\d+(?:[.,]\d+)?)\s*(?:cm|სმ)?/i);
  return match ? match[1].replace(',', '.') : '';
};
const opticsBrands = new Set(['ARKEN', 'REDWIN', 'SCHMIDT & BENDER']);
const ammunitionBrands = new Set(['H&N', 'SELLIER & BELLOT', 'SAUVESTRE', 'YAF', 'LAMBRO', 'ELEY', 'S&B', 'GGG', 'JSB']);
const firearmBrands = new Set([
  'HUGLU', 'ROSSI', 'TAURUS', 'ROCK ISLAND ARMORY', 'GLOCK', 'RUGER', 'GUERINI', 'HUNT GROUP', 'ROCK RIVER', 'MORISSON',
  'SARSILMAZ', 'S&W', 'KRAL', 'HK', 'FABARM', 'POF USA', 'MKA', 'CITADEL', 'ARMED', 'ARMSAN', 'ASELKON', 'PARDUS', 'MAUSER', 'DIAMONDBACK FIREARMS'
]);
// These entries are checked individually because their original source page put
// most of the catalog in one broad section. Keep this list explicit so a later
// catalog refresh cannot silently put non-firearm goods back into firearms.
const categoryOverrides = new Map([
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
const caliberCategories = new Set(['ცეცხლსასროლი იარაღი', 'ვაზნები', 'პნევმატიკა']);
const classify = product => {
  const upper = product.name.toUpperCase();
  const brands = product.brandTags || [];
  const verified = categoryOverrides.get(product.id);
  if (verified) return verified;
  if (ammunitionBrands.has(product.brand) || /\b(?:AMMUNITION|CARTRIDGE|AMMO|FMJ|POLYMER\s+TIP)\b|ვაზნ/.test(upper)) return 'ვაზნები';
  if (product.brand === 'FENIX' || /ფანარ|FLASHLIGHT/i.test(product.name)) return 'ფანრები';
  if (/\b(?:PADDLE|SEA\s+SCOOTER|BOAT)\b|ნავი|ნიჩაბ/i.test(product.name)) return 'ნავები და ძრავები';
  if (/დან[ა-ის]|\bKNIFE\b/i.test(product.name)) return 'დანები';
  if (/პნევმატ|\b(?:PCP|AIR\s+RIFLE|COMPRESSED\s+AIR|DIABOLO)\b/i.test(product.name)) return 'პნევმატიკა';
  if (opticsBrands.has(product.brand) || brands.includes('UTG') && /\b(?:SCP|OP3|OP-|OT-|SCOPE|DOT|MAGNIFIER)\b|კოლიმატ|ოპტიკურ/.test(upper) || /\b(?:FFP|SFP|LPVO|RIFLESCOPE|SCOPE|MAGNIFIER|BINOCULAR)\b|კოლიმატ/.test(upper)) return 'ოპტიკა';
  if (firearmBrands.has(product.brand) || /\b(?:RIFLE|PISTOL|REVOLVER|SHOTGUN|SEMI[-\s]?AUTO|LEVER\s+ACTION|BOLT\s+ACTION|PUMP\s+ACTION)\b|თოფ|პისტოლ/.test(upper)) return 'ცეცხლსასროლი იარაღი';
  if (brands.includes('UTG') || /\b(?:MOUNT|RING|PAD|ADAPTOR|BARRELS?|MAGAZINE|HOSE|CYLINDER|PUMP|INVERTER|CONTROLLER|TARGET)\b|კრონშტეინ|ამორტიზატ|მჭიდ|სამიზნ/.test(upper)) return 'აქსესუარები';
  return product.category;
};

for (const product of catalog.products) {
  product.brandTags = normalizeBrands(product);
  product.brand = product.brandTags[0] || '';
  product.category = classify(product);
  product.caliber = caliberCategories.has(product.category) ? caliber(product.name) || '' : '';
  product.barrelLength = product.category === 'ცეცხლსასროლი იარაღი' ? barrelLength(product.name) || '' : '';
  delete product.sourceImage;
}
catalog.updatedAt = new Date().toISOString();
await fs.writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
const guns = catalog.products.filter(product => product.category === 'ცეცხლსასროლი იარაღი');
console.log(JSON.stringify({ firearms: guns.length, brandTagged: guns.filter(product => product.brand).length, caliberTagged: guns.filter(product => product.caliber).length, barrelTagged: guns.filter(product => product.barrelLength).length }, null, 2));

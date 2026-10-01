/* Downloads the public Magnum catalog into this project. No dependencies needed. */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

const ROOT = 'http://magnum.ge';
const OUT = resolve(process.cwd());
const IMAGE_DIR = resolve(OUT, 'assets/products');
const pageUrls = Array.from({ length: 20 }, (_, i) => i ? `${ROOT}/production-ka-all-${i + 1}` : `${ROOT}/production-ka`);
const text = (html) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
const categoryFor = (name) => /knife|blade/i.test(name) ? 'დანები' : /flash|torch|light/i.test(name) ? 'ფანრები' : /boat|motor/i.test(name) ? 'ნავები და ძრავები' : /scope|sight|optic|binocular/i.test(name) ? 'ოპტიკა' : /pellet|pneumatic|air rifle/i.test(name) ? 'პნევმატიკა' : 'ცეცხლსასროლი იარაღი';
const brands = ['HUGLU','ROSSI','TAURUS','ARMSAN','BERETTA','ATA','BENELLI','BROWNING','CZ','GLOCK','HATSAN','KONUS','LEUPOLD','SAVAGE','STOEGER','WALTHER','WINCHESTER'];
const normalizeCaliber = value => value.toUpperCase().replace(/\s+/g,' ').trim().replace(/^(\d+)GA$/,'$1 GA').replace(/^(\d+)(LR|WMR)$/,'$1 $2').replace(/^(\d+)X(\d+)(?: MM)?$/,'$1×$2 MM').replace(/^(\d+)MM$/,'$1 MM');
const detailsFor = (name) => {
  const brand = brands.find(item => new RegExp(`\\b${item}\\b`, 'i').test(name)) || '';
  const caliber = name.match(/(?:cal\.?|caliber)\s*([.]?\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\s*mm)?|GA|gauge|LR|WMR|MAG|mm))/i)?.[1]?.replace(/\s+/g,' ') || name.match(/\b(?:12|16|20|28|410)\s*(?:GA|gauge)\b/i)?.[0]?.replace(/\s+/g,' ') || '';
  const barrelLength = name.match(/barrel\s*(?:length)?\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*cm/i)?.[1]?.replace(',','.') || '';
  return { brand, caliber: caliber ? normalizeCaliber(caliber) : '', barrelLength };
};

async function get(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Magnum catalog rebuild; public data sync' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}
async function limited(items, count, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: count }, async () => { while (queue.length) await fn(queue.shift()); }));
}

await mkdir(IMAGE_DIR, { recursive: true });
const pages = await Promise.all(pageUrls.map(async url => (await get(url)).text()));
const seen = new Set();
const products = [];
for (const html of pages) {
  const rows = html.matchAll(/<a href=['"]category_images\/([^'"]+)['"][^>]*title=['"]ფასი:\s*([^'"]+)['"][^>]*>\s*<img[^>]+alt=['"]([^'"]+)['"]/gi);
  for (const row of rows) {
    const [, imagePath, rawPrice, rawName] = row;
    const name = decode(text(rawName));
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const price = decode(text(rawPrice));
    products.push({ id: `magnum-${products.length + 1}`, name, price, amount: Number((price.match(/[\d.]+/) || ['0'])[0]), category: categoryFor(name), ...detailsFor(name), sourceImage: `${ROOT}/category_images/${encodeURIComponent(imagePath)}`, image: `assets/products/${String(products.length + 1).padStart(3, '0')}-${basename(imagePath).replace(/[^a-zA-Z0-9._-]/g, '-')}` });
  }
}
await limited(products, 8, async product => {
  const target = resolve(OUT, product.image);
  try { await access(target); return; } catch {}
  try { await writeFile(target, Buffer.from(await (await get(product.sourceImage)).arrayBuffer())); }
  catch (error) { console.warn(`Image skipped: ${product.name} (${error.message})`); product.image = product.sourceImage; }
});
await writeFile(resolve(OUT, 'data/products.json'), JSON.stringify({ updatedAt: new Date().toISOString(), source: ROOT, products }, null, 2));
console.log(`Saved ${products.length} verified products and images.`);

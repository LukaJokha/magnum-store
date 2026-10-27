import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(root, '..', 'magnum-store-database-backup', `before-audit-${stamp}`);
const settings = await fs.readFile(path.join(root, 'supabase.js'), 'utf8');
const endpoint = settings.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
const key = settings.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0];
if (!endpoint || !key) throw new Error('Supabase configuration missing');
const local = await fs.readFile(path.join(root, 'data/products.json'), 'utf8');
const remote = [];
for (let offset = 0; ; offset += 1000) {
  const response = await fetch(`${endpoint}/rest/v1/products?select=*&order=id&offset=${offset}&limit=1000`, { headers: { apikey: key } });
  if (!response.ok) throw new Error(`Supabase backup failed: HTTP ${response.status}`);
  const page = await response.json();
  remote.push(...page);
  if (page.length < 1000) break;
}
await fs.mkdir(backup, { recursive: true });
await fs.writeFile(path.join(backup, 'products-local-before.json'), local);
await fs.writeFile(path.join(backup, 'products-supabase-before.json'), `${JSON.stringify(remote, null, 2)}\n`);
const manifest = { createdAt: new Date().toISOString(), project: new URL(endpoint).hostname.split('.')[0], localCount: JSON.parse(local).products.length, supabaseCount: remote.length, localSha256: createHash('sha256').update(local).digest('hex') };
await fs.writeFile(path.join(backup, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ backup, ...manifest }, null, 2));

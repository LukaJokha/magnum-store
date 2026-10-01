import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const ROOT = resolve(process.cwd());
const DATA_FILE = join(ROOT, 'data', 'products.json');
const UPLOADS = join(ROOT, 'assets', 'uploads');
const PORT = Number(process.env.PORT || 4173);
const PASSWORD = process.env.ADMIN_PASSWORD || 'magnum-admin';
const SECRET = process.env.SESSION_SECRET || randomUUID();
const sessions = new Map();
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml' };
const categoryNames = ['ცეცხლსასროლი იარაღი','პნევმატიკა','დანები','აქსესუარები','ოპტიკა','ფანრები','ნავები და ძრავები','ტურიზმი'];
const send = (res, status, body, type='application/json; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control':'no-store' }); res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body)); };
const readJson = async req => new Promise((ok, fail) => { let raw=''; req.on('data', c => { raw += c; if (raw.length > 8_000_000) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(raw || '{}')); } catch { fail(new Error('არასწორი მოთხოვნა')); } }); req.on('error', fail); });
const getCatalog = async () => JSON.parse(await readFile(DATA_FILE, 'utf8'));
const saveCatalog = async catalog => { const temp = `${DATA_FILE}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(catalog, null, 2)); await rename(temp, DATA_FILE); };
const sign = id => `${id}.${createHmac('sha256', SECRET).update(id).digest('hex')}`;
const isAdmin = req => { const cookie = req.headers.cookie?.match(/(?:^|;\s*)magnum_admin=([^;]+)/)?.[1]; if (!cookie) return false; const [id, hash] = cookie.split('.'); const expected = sign(id).split('.')[1]; if (!id || !hash || hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return false; return sessions.get(id) > Date.now(); };
const safePassword = value => { const a=Buffer.from(String(value)), b=Buffer.from(PASSWORD); return a.length===b.length && timingSafeEqual(a,b); };
async function createProduct(body) {
  const name = String(body.name || '').trim(); const category = String(body.category || '').trim(); const amount = Number(body.amount);
  if (!name || name.length > 220 || !Number.isFinite(amount) || amount < 0 || !categoryNames.includes(category)) throw new Error('შეავსეთ დასახელება, ფასი და კატეგორია.');
  let image = ''; if (body.imageData) { const match = String(body.imageData).match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/); if (!match) throw new Error('ატვირთეთ JPG, PNG, WEBP ან GIF ფაილი.'); const file = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`; await mkdir(UPLOADS, { recursive:true }); await writeFile(join(UPLOADS, file), Buffer.from(match[2], 'base64')); image=`assets/uploads/${file}`; }
  if (!image) throw new Error('ატვირთეთ პროდუქტის სურათი.'); const catalog=await getCatalog(); const product={id:`manual-${randomUUID()}`,name,category,amount,price:`${amount.toLocaleString('en-US')} ლარი`,image,description:String(body.description||'').trim().slice(0,1200),createdAt:new Date().toISOString(),source:'admin'}; catalog.products.unshift(product); catalog.updatedAt=new Date().toISOString(); await saveCatalog(catalog); return product;
}
async function deleteProduct(id) {
  const catalog = await getCatalog();
  const index = catalog.products.findIndex(product => product.id === id);
  if (index < 0) throw new Error('პროდუქტი ვერ მოიძებნა.');
  const [product] = catalog.products.splice(index, 1);
  catalog.updatedAt = new Date().toISOString();
  await saveCatalog(catalog);
  if (product.image?.startsWith('assets/uploads/')) {
    const file = resolve(ROOT, product.image);
    if (file.startsWith(`${UPLOADS}\\`) || file.startsWith(`${UPLOADS}/`)) await unlink(file).catch(() => {});
  }
  return product;
}
async function staticFile(req, res, pathname) { const file = pathname === '/' ? 'index.html' : pathname.slice(1); const target=resolve(ROOT,file); if (!target.startsWith(ROOT) || !existsSync(target)) return send(res,404,'Not found','text/plain'); send(res,200,await readFile(target),mime[extname(target).toLowerCase()]||'application/octet-stream'); }
createServer(async (req,res) => { const url=new URL(req.url,`http://${req.headers.host}`); try {
  if (req.method==='GET' && url.pathname==='/api/products') return send(res,200,await getCatalog());
  if (req.method==='POST' && url.pathname==='/api/auth/login') { const { password }=await readJson(req); if (!safePassword(password)) return send(res,401,{error:'არასწორი პაროლი'}); const id=randomUUID(); sessions.set(id,Date.now()+1000*60*60*12); res.setHeader('set-cookie',`magnum_admin=${sign(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`); return send(res,200,{ok:true}); }
  if (req.method==='POST' && url.pathname==='/api/auth/logout') { res.setHeader('set-cookie','magnum_admin=; HttpOnly; Path=/; Max-Age=0'); return send(res,200,{ok:true}); }
  if (req.method==='GET' && url.pathname==='/api/auth/status') return send(res,200,{authenticated:isAdmin(req)});
  if (req.method==='POST' && url.pathname==='/api/products') { if (!isAdmin(req)) return send(res,401,{error:'გთხოვთ გაიაროთ ავტორიზაცია'}); return send(res,201,{product:await createProduct(await readJson(req))}); }
  if (req.method==='DELETE' && /^\/api\/products\/[^/]+$/.test(url.pathname)) { if (!isAdmin(req)) return send(res,401,{error:'გთხოვთ გაიაროთ ავტორიზაცია'}); return send(res,200,{product:await deleteProduct(decodeURIComponent(url.pathname.split('/').pop()))}); }
  return staticFile(req,res,url.pathname);
} catch (error) { return send(res,400,{error:error.message||'მოთხოვნის შესრულება ვერ მოხერხდა'}); } }).listen(PORT, () => { const site=`http://localhost:${PORT}`; console.log(`Magnum catalog: ${site}`); if (!process.env.ADMIN_PASSWORD) console.log('Admin password is the temporary default: magnum-admin. Set ADMIN_PASSWORD before publishing.'); if (process.env.OPEN_BROWSER==='1' && process.platform==='win32') exec(`start "" ${site}`); });

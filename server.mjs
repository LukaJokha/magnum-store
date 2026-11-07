import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { readFile, writeFile, mkdir, rename, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, isAbsolute, extname, join } from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const ROOT = resolve(process.cwd());

async function loadLocalEnvironment() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

await loadLocalEnvironment();

const DATA_FILE = join(ROOT, 'data', 'products.json');
const UPLOADS = join(ROOT, 'assets', 'uploads');
const PORT = Number(process.env.PORT || 4173);
const HOST = '127.0.0.1';
const PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const FORBIDDEN_PASSWORDS = new Set(['magnum-admin', 'password', 'admin123', 'replace-with-a-long-unique-password']);
const ADMIN_ENABLED = PASSWORD.length >= 16 && !FORBIDDEN_PASSWORDS.has(PASSWORD.toLowerCase());
const configuredSecret = String(process.env.SESSION_SECRET || '');
const SECRET = configuredSecret.length >= 32 && configuredSecret !== 'replace-with-a-long-random-secret'
  ? configuredSecret
  : `${randomUUID()}${randomUUID()}`;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_MAX_ATTEMPTS = 5;
const sessions = new Map();
const loginAttempts = new Map();
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml' };
const categoryNames = ['ცეცხლსასროლი იარაღი','პნევმატიკა','ვაზნები','დანები','აქსესუარები','ოპტიკა','ფანრები','ნავები და ძრავები','ტურიზმი'];
const SENSITIVE_FILES = new Set(['server.mjs','launcher.ps1','start.bat','open-admin.bat','sync-products.bat','.env','.env.example','.gitignore','supabase-setup.sql','readme.md','data/catalog-audit.md','data/catalog-metadata.json']);
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://zhfvofpxqmzwbugoonmi.supabase.co wss://zhfvofpxqmzwbugoonmi.supabase.co; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY'
};

const send = (res, status, body, type='application/json; charset=utf-8', extraHeaders={}) => {
  res.writeHead(status, { ...SECURITY_HEADERS, ...extraHeaders, 'content-type':type, 'cache-control':'no-store' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

const readJson = async req => new Promise((ok, fail) => {
  let raw = '';
  let tooLarge = false;
  req.setEncoding('utf8');
  req.on('data', chunk => {
    if (tooLarge) return;
    raw += chunk;
    if (raw.length > 8_000_000) { tooLarge = true; raw = ''; }
  });
  req.on('end', () => {
    if (tooLarge) return fail(Object.assign(new Error('მოთხოვნა ზედმეტად დიდია.'), { statusCode: 413 }));
    try { ok(JSON.parse(raw || '{}')); } catch { fail(new Error('არასწორი მოთხოვნა')); }
  });
  req.on('error', fail);
});

const getCatalog = async () => JSON.parse(await readFile(DATA_FILE, 'utf8'));
const saveCatalog = async catalog => { const temp = `${DATA_FILE}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(catalog, null, 2)); await rename(temp, DATA_FILE); };
const sign = id => `${id}.${createHmac('sha256', SECRET).update(id).digest('hex')}`;

function validSessionId(req) {
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)magnum_admin=([^;]+)/)?.[1];
  if (!cookie) return null;
  const separator = cookie.indexOf('.');
  if (separator < 1) return null;
  const id = cookie.slice(0, separator);
  const hash = cookie.slice(separator + 1);
  const expected = createHmac('sha256', SECRET).update(id).digest('hex');
  if (hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null;
  return id;
}

function isAdmin(req) {
  const id = validSessionId(req);
  if (!id) return false;
  const expiresAt = sessions.get(id);
  if (!expiresAt || expiresAt <= Date.now()) { sessions.delete(id); return false; }
  return true;
}

const safePassword = value => {
  if (!ADMIN_ENABLED) return false;
  const a = Buffer.from(String(value));
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
};

function loginLimit(req) {
  const key = req.socket.remoteAddress || 'local';
  const now = Date.now();
  let record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) record = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  loginAttempts.set(key, record);
  return { key, record, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) };
}

function validImage(type, bytes) {
  if (type === 'jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (type === 'gif') return bytes.length >= 6 && ['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  if (type === 'webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

async function createProduct(body) {
  const name = String(body.name || '').trim(); const category = String(body.category || '').trim(); const amount = Number(body.amount);
  if (!name || name.length > 220 || !Number.isFinite(amount) || amount < 0 || !categoryNames.includes(category)) throw new Error('შეავსეთ დასახელება, ფასი და კატეგორია.');
  let image = '';
  if (body.imageData) {
    const match = String(body.imageData).match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('ატვირთეთ JPG, PNG, WEBP ან GIF ფაილი.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 5_000_000 || !validImage(match[1], bytes)) throw new Error('სურათი არასწორია ან 5 MB-ზე დიდია.');
    const file = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    await mkdir(UPLOADS, { recursive:true });
    await writeFile(join(UPLOADS, file), bytes, { flag: 'wx' });
    image = `assets/uploads/${file}`;
  }
  if (!image) throw new Error('ატვირთეთ პროდუქტის სურათი.');
  const catalog = await getCatalog();
  const product = {id:`manual-${randomUUID()}`,name,category,amount,price:`${amount.toLocaleString('en-US')} ლარი`,image,description:String(body.description||'').trim().slice(0,1200),createdAt:new Date().toISOString(),source:'admin'};
  catalog.products.unshift(product); catalog.updatedAt=new Date().toISOString(); await saveCatalog(catalog); return product;
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
    const relativePath = relative(UPLOADS, file);
    if (relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)) await unlink(file).catch(() => {});
  }
  return product;
}

function isSensitivePath(file) {
  const normalized = file.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  const segments = normalized.split('/');
  return !normalized || segments.some(segment => segment.startsWith('.')) ||
    segments[0] === 'scripts' || segments[0] === 'api' ||
    SENSITIVE_FILES.has(normalized) || ['.sql','.ps1','.bat','.mjs','.md'].includes(extname(normalized));
}

async function staticFile(req, res, pathname) {
  const file = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  if (isSensitivePath(file)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const target = resolve(ROOT, file);
  const relativePath = relative(ROOT, target);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath) || !existsSync(target)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  const info = await stat(target);
  if (!info.isFile()) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  return send(res, 200, await readFile(target), mime[extname(target).toLowerCase()] || 'application/octet-stream');
}

function validHost(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return host === `localhost:${PORT}` || host === `127.0.0.1:${PORT}`;
}

function validOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`;
}

const server = createServer(async (req, res) => {
  if (!validHost(req)) return send(res, 403, { error: 'მოთხოვნა უარყოფილია.' });
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/products') return send(res, 200, await getCatalog());
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      if (!validOrigin(req)) return send(res, 403, { error: 'მოთხოვნა უარყოფილია.' });
      if (!ADMIN_ENABLED) return send(res, 503, { error: 'ლოკალური ადმინისტრირება გამორთულია. დააყენეთ ძლიერი ADMIN_PASSWORD .env ფაილში.' });
      const { key, record, retryAfter } = loginLimit(req);
      if (record.count >= LOGIN_MAX_ATTEMPTS) return send(res, 429, { error: 'ძალიან ბევრი მცდელობა. სცადეთ მოგვიანებით.' }, 'application/json; charset=utf-8', { 'retry-after': String(retryAfter) });
      const { password } = await readJson(req);
      if (!safePassword(password)) { record.count += 1; return send(res, 401, { error: 'არასწორი პაროლი' }); }
      loginAttempts.delete(key);
      const id = randomUUID();
      sessions.set(id, Date.now() + SESSION_TTL_MS);
      res.setHeader('set-cookie', `magnum_admin=${sign(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200; Priority=High`);
      return send(res, 200, { ok:true });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      if (!validOrigin(req)) return send(res, 403, { error: 'მოთხოვნა უარყოფილია.' });
      const id = validSessionId(req);
      if (id) sessions.delete(id);
      res.setHeader('set-cookie', 'magnum_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Priority=High');
      return send(res, 200, { ok:true });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/status') return send(res, 200, { authenticated:isAdmin(req) });
    if (req.method === 'POST' && url.pathname === '/api/products') {
      if (!validOrigin(req)) return send(res, 403, { error: 'მოთხოვნა უარყოფილია.' });
      if (!isAdmin(req)) return send(res, 401, { error:'გთხოვთ გაიაროთ ავტორიზაცია' });
      return send(res, 201, { product:await createProduct(await readJson(req)) });
    }
    if (req.method === 'DELETE' && /^\/api\/products\/[^/]+$/.test(url.pathname)) {
      if (!validOrigin(req)) return send(res, 403, { error: 'მოთხოვნა უარყოფილია.' });
      if (!isAdmin(req)) return send(res, 401, { error:'გთხოვთ გაიაროთ ავტორიზაცია' });
      return send(res, 200, { product:await deleteProduct(decodeURIComponent(url.pathname.split('/').pop())) });
    }
    return staticFile(req, res, url.pathname);
  } catch (error) {
    return send(res, error.statusCode || 400, { error:error.message || 'მოთხოვნის შესრულება ვერ მოხერხდა' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(id);
  for (const [key, record] of loginAttempts) if (record.resetAt <= now) loginAttempts.delete(key);
}, 60_000).unref();

server.listen(PORT, HOST, () => {
  const site = `http://localhost:${PORT}`;
  console.log(`Magnum catalog: ${site}`);
  if (!ADMIN_ENABLED) console.log('Local admin API is disabled. Set an ADMIN_PASSWORD of at least 16 characters in .env to enable it.');
  if (process.env.OPEN_BROWSER === '1' && process.platform === 'win32') exec(`start "" "${site}"`);
});

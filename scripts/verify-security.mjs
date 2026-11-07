import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => fs.readFile(new URL(file, root), 'utf8');
const [app, admin, adminHtml, manage, client, setup, migration, server, ignore, vercelText] = await Promise.all([
  read('app.js'), read('admin.js'), read('admin.html'), read('manage-products.js'), read('supabase.js'),
  read('supabase-setup.sql'), read('supabase-security-migration.sql'), read('server.mjs'),
  read('.vercelignore'), read('vercel.json')
]);

assert.match(app, /from\('storefront_products'\)/, 'Storefront must use the public allowlisted view');
assert.doesNotMatch(app, /dialogContent[^\n]*\.innerHTML|innerHTML\s*=\s*`[^`]*\$\{product\./s, 'Product data must not enter innerHTML');
assert.match(app, /textContent\s*=\s*String\(product\.description\)/, 'Description must render as text');
assert.match(admin, /rpc\('is_catalog_admin'\)/, 'Admin page must verify the server-side allowlist');
assert.match(admin, /auth\.getSession\(\)/, 'Anonymous admin visits must be handled without a false connection error');
assert.match(admin, /if \(session\)[\s\S]*auth\.getUser\(\)/, 'Existing sessions must still be verified with the Auth server');
assert.match(admin, /signInWithPassword\(\{ email: currentUserEmail, password: currentPassword \}\)/, 'Password changes must reauthenticate with the current password');
assert.match(admin, /updateUser\(\{ password: newPassword, current_password: currentPassword \}\)/, 'Password changes must support server-side current-password verification');
assert.match(admin, /signOut\(\{ scope: 'global' \}\)/, 'Password changes must revoke refresh sessions globally');
assert.match(admin, /PASSWORD_MIN_LENGTH\s*=\s*16/, 'Admin password minimum must remain at least 16 characters');
assert.match(admin, /reauthenticated\.user\?\.id !== currentUserId/, 'Reauthentication must preserve the same administrator identity');
assert.match(admin, /if \(button\.disabled\) return;/, 'Password changes must reject concurrent submissions');
assert.match(admin, /signOutError \? 3200 : 1600/, 'Global sign-out failures must remain visible to the administrator');
assert.match(adminHtml, /name="currentPassword"[^>]*autocomplete="current-password"/);
assert.match(adminHtml, /name="newPassword"[^>]*autocomplete="new-password"[^>]*minlength="16"/);
assert.match(adminHtml, /name="confirmPassword"[^>]*autocomplete="new-password"/);
assert.match(manage, /rpc\('is_catalog_admin'\)/, 'Management page must verify the server-side allowlist');

const passwordContext = vm.createContext({});
vm.runInContext(admin.slice(0, admin.indexOf('function populateSelect')), passwordContext);
const acceptsPassword = value => vm.runInContext(`isStrongAdminPassword(${JSON.stringify(value)})`, passwordContext);
assert.equal(acceptsPassword('magnum-admin'), false, 'Known former default password must stay rejected');
assert.equal(acceptsPassword('ThisPasswordIsLongButHasNoDigit!'), false, 'Password must contain a digit');
assert.equal(acceptsPassword('StrongAdmin!2026Password'), true, 'A strong 16+ character password must be accepted');
assert.equal(acceptsPassword('ძლიერი!ადმინი2026'), true, 'Unicode letters must be accepted');

for (const sql of [setup, migration]) {
  assert.doesNotMatch(sql, /create\s+policy\s+"Authenticated catalog management"/i, 'Broad authenticated product policy returned');
  assert.doesNotMatch(sql, /create\s+policy\s+"Authenticated product image management"/i, 'Broad authenticated storage policy returned');
  assert.match(sql, /create table if not exists public\.catalog_admins/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /create or replace view public\.storefront_products/i);
  assert.match(sql, /allowed_mime_types/i);
  assert.match(sql, /file_size_limit/i);
}

assert.match(client, /@supabase\/supabase-js@\d+\.\d+\.\d+/, 'Supabase SDK must be exactly pinned');
assert.match(client, /sha384-[A-Za-z0-9+/=]+/, 'Supabase SDK must use SRI');

const vercel = JSON.parse(vercelText);
const globalHeaders = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
for (const name of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) {
  assert.ok(globalHeaders[name], `Missing Vercel security header: ${name}`);
}
assert.doesNotMatch(globalHeaders['content-security-policy'], /'unsafe-eval'|'unsafe-inline'/, 'Production CSP must not allow unsafe scripts/styles');
assert.match(ignore, /\*\.sql/, 'All SQL files must be excluded from Vercel');
assert.match(ignore, /data\/CATALOG-AUDIT\.md/);
assert.match(ignore, /data\/catalog-metadata\.json/);

assert.doesNotMatch(server, /process\.env\.ADMIN_PASSWORD\s*\|\|\s*['"]magnum-admin['"]/, 'Known local default password returned');
assert.match(server, /const HOST = '127\.0\.0\.1'/, 'Local server must bind only to loopback');
assert.match(server, /LOGIN_MAX_ATTEMPTS\s*=\s*5/, 'Login throttling is missing');
assert.match(server, /sessions\.delete\(id\)/, 'Logout/session revocation is missing');
assert.match(server, /SENSITIVE_FILES/, 'Sensitive static-file blocking is missing');

console.log('Security verification passed: authorization, XSS, SDK integrity, headers, deployment exclusions and local-server controls are present.');

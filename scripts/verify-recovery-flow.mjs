import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const recovery = await fs.readFile(new URL('../reset-password.js', import.meta.url), 'utf8');
const forgot = await fs.readFile(new URL('../forgot-password.js', import.meta.url), 'utf8');
const good = 'Example!RecoveryPassword2026';
async function page(options = {}) {
  const state = { admin: true, hash: '#type=recovery&access_token=fake-access&refresh_token=fake-refresh', ...options };
  const calls = [], elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: selector === '#recoveryForm', disabled: false, textContent: '', fields: {},
      reset() { this.fields = {}; }, querySelector: element
    });
    return elements.get(selector);
  };
  const db = {
    auth: {
      async setSession() { calls.push('session'); return { error: state.sessionError }; },
      async getUser() { calls.push('user'); return { data: { user: { id: state.id || 'admin' } }, error: state.userError }; },
      async updateUser(value) { calls.push('update'); assert.equal(value.password, good); return { error: state.updateError }; },
      async signOut({ scope }) { calls.push(`logout:${scope}`); return { error: state.logoutError }; },
      async resetPasswordForEmail(email, { redirectTo }) {
        calls.push('email'); assert.equal(email, 'admin@example.invalid');
        assert.equal(redirectTo, 'https://example.invalid/reset-password');
        return { error: state.emailError };
      }
    },
    async rpc(name) { assert.equal(name, 'is_catalog_admin'); calls.push('admin'); return { data: state.admin }; }
  };
  let ready;
  const context = vm.createContext({
    URLSearchParams,
    document: { querySelector: element, addEventListener(event, fn) { assert.equal(event, 'DOMContentLoaded'); ready = fn; } },
    window: { magnumDbReady: Promise.resolve(db), location: { hash: state.hash, pathname: '/reset-password', origin: 'https://example.invalid' },
      history: { replaceState(a, b, path) { assert.equal(path, '/reset-password'); calls.push('clear-url'); } } },
    FormData: class { constructor(form) { this.fields = form.fields; } get(key) { return this.fields[key]; } }
  });
  vm.runInContext(options.forgot ? forgot : recovery, context);
  if (ready) await ready();
  return { state, calls, element, async submit(fields = {}) {
    const form = element(options.forgot ? '#forgotPasswordForm' : '#recoveryForm');
    form.fields = { password: good, confirmation: good, email: ' admin@example.invalid ', ...fields };
    await form.onsubmit({ preventDefault() {} });
  } };
}
let checks = 0;
async function check(run) { await run(); checks++; }
for (const hash of ['', '#type=signup&access_token=a&refresh_token=b', '#type=recovery&access_token=a']) {
  await check(async () => { const p = await page({ hash }); assert.deepEqual(p.calls, ['clear-url']); assert.equal(p.element('#recoveryForm').hidden, true); });
}
for (const options of [{ sessionError: true }, { userError: true }, { admin: false }]) {
  await check(async () => { const p = await page(options); assert.equal(p.element('#recoveryForm').hidden, true); assert.equal(p.calls.at(-1), 'logout:local'); });
}
for (const fields of [{ confirmation: 'different' }, { password: 'short', confirmation: 'short' }, { password: 'letterswithoutanydigits!', confirmation: 'letterswithoutanydigits!' }]) {
  await check(async () => { const p = await page(); await p.submit(fields); assert.equal(p.calls.includes('update'), false); });
}
await check(async () => { const p = await page(); p.state.admin = false; await p.submit(); assert.equal(p.calls.includes('update'), false); });
await check(async () => { const p = await page(); p.state.id = 'other'; await p.submit(); assert.equal(p.calls.includes('update'), false); });
await check(async () => { const p = await page({ updateError: true }); await p.submit(); assert.equal(p.calls.includes('logout:global'), false); assert.equal(p.element('#recoveryForm').hidden, false); });
await check(async () => {
  const p = await page(); await p.submit();
  assert.deepEqual(p.calls, ['clear-url', 'session', 'user', 'admin', 'user', 'admin', 'update', 'logout:global']);
  assert.equal(p.element('#recoveryForm').hidden, true); assert.equal(p.element('#recoveryStatus').className, 'form-message success');
  await p.submit(); assert.equal(p.calls.filter(x => x === 'update').length, 1);
});
await check(async () => { const p = await page({ logoutError: true }); await p.submit(); assert.equal(p.element('#recoveryForm').hidden, true); assert.match(p.element('#recoveryStatus').textContent, /პაროლი შეიცვალა/); });
for (const emailError of [false, true]) {
  await check(async () => { const p = await page({ forgot: true, emailError }); await p.submit(); assert.deepEqual(p.calls, ['email']); assert.equal(p.element('button').disabled, false); assert.ok(p.element('#forgotPasswordMessage').textContent); });
}
console.log(`Password recovery behavioral checks passed: ${checks} (mock I/O, no real credentials or emails).`);

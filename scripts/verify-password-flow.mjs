import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../admin.js', import.meta.url), 'utf8');
const user = { id: 'test-admin-id', email: 'admin@example.invalid' };
const passwords = {
  currentPassword: 'Previous!TestPassword2025',
  newPassword: 'Replacement!TestPassword2026',
  confirmPassword: 'Replacement!TestPassword2026'
};

// Execute the real page and its submit handler; all browser and Supabase I/O stays local.
async function page(options = {}) {
  const state = { session: true, admin: true, ...options };
  const calls = [], timers = [], elements = new Map();
  let reloads = 0;
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: false, disabled: false, textContent: '', className: '', value: '',
      options: [], fields: {}, resets: 0,
      add(option) { this.options.push(option); },
      reset() { this.fields = {}; this.resets += 1; }
    });
    return elements.get(selector);
  };
  const db = {
    auth: {
      async getSession() {
        calls.push('getSession');
        return { data: { session: state.session ? { user: { id: 'unverified-cache' } } : null }, error: null };
      },
      async getUser() {
        calls.push('getUser');
        return { data: { user }, error: state.userError || null };
      },
      async signInWithPassword(credentials) {
        calls.push('reauthenticate');
        assert.equal(credentials.email, user.email, 'Use the server-verified administrator email');
        assert.equal(credentials.password, passwords.currentPassword);
        if (state.reauthenticationWait) await state.reauthenticationWait;
        return { data: { user: state.differentUser ? { ...user, id: 'other-user' } : user }, error: state.reauthenticationError || null };
      },
      async updateUser(attributes) {
        calls.push('updateUser');
        assert.equal(attributes.password, passwords.newPassword);
        assert.equal(attributes.current_password, passwords.currentPassword);
        return { error: state.updateError || null };
      },
      async signOut(options) {
        calls.push(`signOut:${options?.scope || 'default'}`);
        return { error: options?.scope === 'global' ? state.revokeError || null : null };
      }
    },
    async rpc(name) {
      assert.equal(name, 'is_catalog_admin');
      calls.push('is_catalog_admin');
      return { data: state.admin, error: state.adminError || null };
    },
    from(name) {
      assert.equal(name, 'products');
      return { async select() { return { data: [] }; } };
    }
  };
  const context = vm.createContext({
    document: { querySelector: element },
    window: { magnumDbReady: Promise.resolve(db), location: { reload() { reloads += 1; } } },
    FormData: class { constructor(form) { this.fields = { ...form.fields }; } get(name) { return this.fields[name]; } },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    fetch: async url => {
      assert.equal(url, 'data/products.json');
      return { ok: true, async json() { return { products: [] }; } };
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); }
  });
  await vm.runInContext(source, context, { filename: 'admin.js' });
  return {
    state, calls, timers, element,
    get reloads() { return reloads; },
    async submit(overrides = {}) {
      const form = element('#passwordForm');
      form.fields = { ...passwords, ...overrides };
      let prevented = false;
      await form.onsubmit({ currentTarget: form, preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    }
  };
}

let checks = 0;
async function check(name, run) {
  try { await run(); checks += 1; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

await check('anonymous visit', async () => {
  const p = await page({ session: false });
  assert.deepEqual(p.calls, ['getSession']);
  assert.equal(p.element('#loginMessage').textContent, '');
  assert.equal(p.element('#loginPanel').hidden, false);
  assert.equal(p.element('#productPanel').hidden, true);
  await p.submit();
  assert.deepEqual(p.calls, ['getSession'], 'An expired session must not change a password');
  assert.equal(p.element('#passwordMessage').className, 'form-message error');
});

await check('verified admin session', async () => {
  const p = await page();
  assert.deepEqual(p.calls, ['getSession', 'getUser', 'is_catalog_admin']);
  assert.equal(p.element('#loginPanel').hidden, true);
  assert.equal(p.element('#productPanel').hidden, false);
});

await check('unverified session', async () => {
  const p = await page({ userError: new Error('Auth verification failed') });
  assert.deepEqual(p.calls, ['getSession', 'getUser']);
  assert.equal(p.element('#loginMessage').className, 'form-message error');
  await p.submit();
  assert.equal(p.calls.includes('updateUser'), false);
});

await check('non-admin session', async () => {
  const p = await page({ admin: false });
  assert.deepEqual(p.calls, ['getSession', 'getUser', 'is_catalog_admin', 'signOut:default']);
  assert.equal(p.element('#productPanel').hidden, true);
  await p.submit();
  assert.equal(p.calls.includes('reauthenticate'), false);
});

for (const [name, fields] of [
  ['weak password', { newPassword: 'weak', confirmPassword: 'weak' }],
  ['password mismatch', { confirmPassword: 'Different!Password2026' }],
  ['unchanged password', { newPassword: passwords.currentPassword, confirmPassword: passwords.currentPassword }]
]) await check(name, async () => {
  const p = await page();
  p.calls.length = 0;
  await p.submit(fields);
  assert.deepEqual(p.calls, [], 'Invalid input must be rejected before any Auth request');
  assert.equal(p.element('#passwordMessage').className, 'form-message error');
});

for (const [name, state, expected] of [
  ['wrong current password', { reauthenticationError: new Error('Invalid credentials') }, ['reauthenticate']],
  ['different user', { differentUser: true }, ['reauthenticate']],
  ['admin permission revoked', { admin: false }, ['reauthenticate', 'is_catalog_admin']],
  ['admin check failed', { adminError: new Error('RPC unavailable') }, ['reauthenticate', 'is_catalog_admin']]
]) await check(name, async () => {
  const p = await page();
  Object.assign(p.state, state);
  p.calls.length = 0;
  await p.submit();
  assert.deepEqual(p.calls, expected, 'Failed authorization must never update the password');
  assert.equal(p.element('#passwordMessage').className, 'form-message error');
  assert.equal(p.element('#passwordForm').resets, 1, 'Clear entered passwords after an Auth attempt');
  assert.equal(p.element('#changePasswordButton').disabled, false);
});

await check('valid password change', async () => {
  const p = await page();
  p.calls.length = 0;
  await p.submit();
  assert.deepEqual(p.calls, ['reauthenticate', 'is_catalog_admin', 'updateUser', 'signOut:global']);
  assert.equal(p.element('#passwordMessage').className, 'form-message success');
  assert.equal(p.element('#passwordForm').resets, 1);
  assert.equal(p.element('#changePasswordButton').disabled, false);
  assert.equal(p.timers.length, 1);
  assert.equal(p.timers[0].delay, 1600);
  p.timers[0].callback();
  assert.equal(p.reloads, 1);
  await p.submit();
  assert.equal(p.calls.filter(call => call === 'reauthenticate').length, 1, 'Success must clear the active administrator identity');
});

await check('session revocation warning', async () => {
  const p = await page({ revokeError: new Error('Revocation unavailable') });
  p.calls.length = 0;
  await p.submit();
  assert.deepEqual(p.calls, ['reauthenticate', 'is_catalog_admin', 'updateUser', 'signOut:global', 'signOut:local']);
  assert.equal(p.element('#passwordMessage').className, 'form-message warning');
  assert.match(p.element('#passwordMessage').textContent, /პაროლი შეიცვალა.*ვერ დადასტურდა/u);
  assert.equal(p.timers[0].delay, 3200);
});

await check('double submission', async () => {
  let release;
  const p = await page({ reauthenticationWait: new Promise(resolve => { release = resolve; }) });
  p.calls.length = 0;
  const first = p.submit();
  assert.equal(p.element('#changePasswordButton').disabled, true);
  await p.submit();
  assert.deepEqual(p.calls, ['reauthenticate'], 'A second submit must not start another request');
  release();
  await first;
  assert.deepEqual(p.calls, ['reauthenticate', 'is_catalog_admin', 'updateUser', 'signOut:global']);
  assert.equal(p.element('#passwordForm').resets, 1);
});

console.log(`Password flow verification passed: ${checks} behavioral checks; no network or real accounts used.`);

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../admin.js', import.meta.url), 'utf8');
const user = { id: 'test-admin-id', email: 'admin@example.invalid' };
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
});

await check('non-admin session', async () => {
  const p = await page({ admin: false });
  assert.deepEqual(p.calls, ['getSession', 'getUser', 'is_catalog_admin', 'signOut:default']);
  assert.equal(p.element('#productPanel').hidden, true);
});

console.log(`Admin access verification passed: ${checks} behavioral checks; no network or real accounts used.`);

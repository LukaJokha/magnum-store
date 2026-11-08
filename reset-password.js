(() => {
  // Capture recovery credentials only in memory and remove them before loading resources.
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  let accessToken = fragment.get('access_token');
  let refreshToken = fragment.get('refresh_token');
  const isRecovery = fragment.get('type') === 'recovery';
  fragment.delete('access_token'); fragment.delete('refresh_token');
  window.history.replaceState(null, '', window.location.pathname);

  document.addEventListener('DOMContentLoaded', async () => {
    const status = document.querySelector('#recoveryStatus');
    const form = document.querySelector('#recoveryForm');
    const button = document.querySelector('#recoverButton');
    const show = (text, kind = 'error') => { status.textContent = text; status.className = `form-message ${kind}`; };
    let db, userId, busy = false;
    try {
      if (!isRecovery || !accessToken || !refreshToken) throw new Error();
      db = await window.magnumDbReady;
      const { error } = await db.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      accessToken = refreshToken = null;
      if (error) throw error;
      const { data: { user }, error: userError } = await db.auth.getUser();
      if (userError || !user) throw new Error();
      const { data: admin, error: adminError } = await db.rpc('is_catalog_admin');
      if (adminError || admin !== true) throw new Error();
      userId = user.id;
      form.hidden = false;
      show('ბმული დადასტურებულია. აირჩიეთ ახალი პაროლი.', 'success');
    } catch {
      accessToken = refreshToken = null;
      if (db) await db.auth.signOut({ scope: 'local' }).catch(() => {});
      show('ბმული არასწორია, ვადა გაუვიდა ან ანგარიშს ადმინისტრატორის უფლება არ აქვს. მოითხოვეთ ახალი აღდგენის წერილი.');
      return;
    }
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy || !userId) return;
      const values = new FormData(form);
      const password = String(values.get('password') || '');
      if (password !== values.get('confirmation')) return show('პაროლები ერთმანეთს არ ემთხვევა.');
      if (password.length < 16 || password.length > 128 || !/\p{L}/u.test(password) || !/\d/.test(password) || !/[^\p{L}\d]/u.test(password)) return show('გამოიყენეთ 16–128 სიმბოლო: ასო, ციფრი და სპეციალური სიმბოლო.');
      busy = true; button.disabled = true;
      let changed = false;
      try {
        const { data: { user }, error: userError } = await db.auth.getUser();
        const { data: admin, error: adminError } = await db.rpc('is_catalog_admin');
        if (userError || user?.id !== userId || adminError || admin !== true) throw new Error();
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        changed = true; userId = null; form.hidden = true;
        const { error: logoutError } = await db.auth.signOut({ scope: 'global' });
        show(logoutError ? 'პაროლი შეიცვალა. სხვა სესიების გაუქმება ვერ დადასტურდა. ახლა ახალი პაროლით შედით.' : 'პაროლი წარმატებით შეიცვალა. ახლა ახალი პაროლით შედით.', logoutError ? 'error' : 'success');
      } catch {
        show(changed ? 'პაროლი შეიცვალა. ახლა ახალი პაროლით შედით.' : 'პაროლი ვერ შეიცვალა. სცადეთ სხვა ძლიერი პაროლი ან მოითხოვეთ ახალი ბმული.');
      } finally { form.reset(); button.disabled = false; busy = false; }
    };
  });
})();

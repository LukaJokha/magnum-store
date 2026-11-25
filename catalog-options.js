(() => {
  const kinds = ['brand', 'caliber', 'barrelLength'];
  const labels = { brand: 'ბრენდი', caliber: 'კალიბრი', barrelLength: 'ლულის სიგრძე' };
  function normalize(kind, raw) {
    if (!kinds.includes(kind)) throw new Error('მახასიათებელი არასწორია.');
    let value = String(raw ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
    if (!value || value.length > 80 || /[<>\x00-\x1f\x7f]/.test(value)) throw new Error('შეიყვანეთ დასახელება, მაქსიმუმ 80 სიმბოლო.');
    if (kind === 'barrelLength') {
      value = value.replace(/\s*(CM|სმ|ᲡᲛ)$/, '').replace(',', '.').trim();
      if (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0 || Number(value) > 130) throw new Error('ლულის სიგრძე მიუთითეთ სანტიმეტრებში: 0-ზე მეტი, მაქსიმუმ 130, ორი ათწილადი.');
      return String(Number(value));
    }
    if (kind === 'caliber') {
      value = value.replace(/,/g, '.').replace(/\s*[X×]\s*(?=\d)/g, '×');
      const compact = value.replace(/\s+/g, '').replace(/^\.(?=\d)/, '');
      if (/^(410|0\.410)(BORE|GAUGE|GA|CAL)?$/.test(compact)) return '.410 BORE';
      if (compact === '9MMLUGER') return '9×19 MM';
      if (/^\d+(?:\.\d+)?×\d+(?:\.\d+)?(?:MM)?$/.test(compact)) return compact.replace(/MM$/, '') + ' MM';
      const gauge = compact.match(/^(10|12|16|20|24|28|32)(GAUGE|GA|CAL)$/);
      if (gauge) return `${gauge[1]} GA`;
      const rimfire = compact.match(/^(17|22)(LR|WMR|HMR|WSM)$/);
      if (rimfire) return `${rimfire[1]} ${rimfire[2]}`;
      value = value.replace(/^\.(?=\d)/, '').replace(/(\d)\s*MM\b/g, '$1 MM');
      // Common cartridge names: .308win -> 308 WIN; do not equate 9 MM with 9x19.
      value = value.replace(/^(\d+(?:\.\d+)?)(WIN|REM|MAG|SPL|ACP|COLT)\b/, '$1 $2');
      if (!/\d/.test(value)) throw new Error('კალიბრში მიუთითეთ რიცხვიც, მაგალითად 12 GA ან 9×19 MM.');
    }
    return value;
  }
  async function load(db) {
    const result = { brand: [], caliber: [], barrelLength: [] };
    const rows = await window.MagnumProducts.readAll(() => db.from('catalog_options').select('id,kind,value'));
    for (const row of rows) if (kinds.includes(row.kind)) result[row.kind].push(row.value);
    return result;
  }
  async function add(db, kind, raw, existing) {
    const value = normalize(kind, raw);
    const found = existing.find(item => normalize(kind, item) === value);
    if (found) return { value: found, existed: true };
    const { data, error } = await db.from('catalog_options').insert({ kind, value }).select('value');
    if (error?.code === '23505') return { value, existed: true };
    if (error || !data?.length) throw new Error('დამატება ვერ დადასტურდა. გადაამოწმეთ კავშირი და სცადეთ თავიდან.');
    return { value: data[0].value, existed: false };
  }
  function bind({ container, kind, database, values, select, busy = () => {}, canSave = () => true }) {
    const box = document.createElement('div'); box.className = 'option-create';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'text-button'; open.textContent = '+ ახლის დამატება';
    const panel = document.createElement('div'); panel.hidden = true;
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = 80; input.setAttribute('aria-label', `ახალი ${labels[kind]}`);
    input.placeholder = kind === 'barrelLength' ? 'მაგ: 51.5 (სმ)' : kind === 'caliber' ? 'მაგ: 12 GA' : 'ბრენდის დასახელება';
    const hint = document.createElement('small'); hint.className = 'file-note';
    const status = document.createElement('p'); status.className = 'form-message'; status.setAttribute('role', 'status');
    const save = document.createElement('button'); save.type = 'button'; save.className = 'edit-button'; save.textContent = 'სიაში დამატება';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.textContent = 'გაუქმება';
    open.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) input.focus(); };
    cancel.onclick = () => { panel.hidden = true; };
    input.oninput = () => { try { hint.textContent = `შეინახება: ${normalize(kind, input.value)}`; } catch { hint.textContent = ''; } };
    input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); save.click(); } };
    save.onclick = async () => {
      if (save.disabled || !canSave()) return;
      save.disabled = input.disabled = cancel.disabled = open.disabled = true;
      busy(true);
      try {
        const result = await add(database(), kind, input.value, values());
        select(result.value); status.className = 'form-message success';
        status.textContent = result.existed ? 'უკვე არსებობს — არჩეულია არსებული მნიშვნელობა.' : 'დამატებულია და არჩეულია. პროდუქტზე მისაბმელად შეინახეთ პროდუქტი.';
        input.value = ''; hint.textContent = ''; panel.hidden = true;
      } catch (error) { status.className = 'form-message error'; status.textContent = error.message; }
      finally { save.disabled = input.disabled = cancel.disabled = open.disabled = false; busy(false); }
    };
    panel.append(input, hint, save, cancel); box.append(open, panel, status); container.append(box);
  }
  window.MagnumOptions = { normalize, load, add, bind };
})();

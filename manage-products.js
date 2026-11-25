const $ = selector => document.querySelector(selector);
const catalog = window.MagnumProducts;
let products = [], db, vocabulary = {}, editing = null, saving = false, dirty = false, previewUrl = '', stagedImage = '', stagedFile = null, optionWrites = 0;
const say = (selector, text, success = false) => { const element = $(selector); element.textContent = text; element.className = `form-message ${success ? 'success' : 'error'}`; };

async function loadProducts() {
  const rows = await catalog.readAll(() => db.from('products').select('*'));
  const baseline = await fetch('data/products.json').then(response => response.ok ? response.json() : { products: [] }).catch(() => ({ products: [] }));
  vocabulary = catalog.choices([...baseline.products, ...rows]);
  const stored = await window.MagnumOptions.load(db);
  for (const key of Object.keys(stored)) vocabulary[key] = [...new Set([...vocabulary[key], ...stored[key]])].sort((a,b) => a.localeCompare(b,'en',{numeric:true}));
  products = rows; render();
}

function render() {
  const query = $('#query').value.trim().toLocaleLowerCase('ka-GE');
  const list = products.filter(product => !query || [product.name, ...catalog.tags(product, 'brand'), ...catalog.tags(product, 'caliber')].join(' ').toLocaleLowerCase('ka-GE').includes(query));
  $('#summary').textContent = `ნაჩვენებია ${list.length} პროდუქტი`;
  const container = $('#productList'); container.replaceChildren();
  list.forEach(product => {
    const row = document.createElement('article'); row.className = 'manage-row';
    const name = document.createElement('div');
    const title = document.createElement('b'); title.textContent = product.name;
    const details = document.createElement('small'); details.textContent = `${product.category} · ${product.price}`;
    name.append(title, details);
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'edit-button'; edit.textContent = 'რედაქტირება'; edit.onclick = () => openEditor(product);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-button'; remove.textContent = 'წაშლა';
    remove.onclick = async () => {
      if (!confirm(`ნამდვილად წავშალოთ „${product.name}“? ეს მოქმედება ვერ გაუქმდება.`)) return;
      remove.disabled = edit.disabled = true;
      try {
        const { data, error } = await db.from('products').delete().eq('id', product.id).select('id');
        if (error || !data?.length) throw new Error('წაშლა ვერ დადასტურდა. განაახლეთ სია და გადაამოწმეთ წვდომა.');
        // Images can be shared. Retain them until a separate storage audit.
        products = products.filter(item => item.id !== product.id); render();
        say('#managerMessage', 'პროდუქტი წაიშალა.', true);
      } catch (error) { say('#managerMessage', error.message); remove.disabled = edit.disabled = false; }
    };
    actions.append(edit, remove); row.append(name, actions); container.append(row);
  });
}

function renderSpec(selector, key, selected) {
  const container = $(selector); container.replaceChildren();
  for (const value of vocabulary[key]) {
    const label = document.createElement('label'), checkbox = document.createElement('input'), text = document.createElement('span');
    checkbox.type = 'checkbox'; checkbox.name = key; checkbox.value = value; checkbox.checked = selected.includes(value);
    text.textContent = key === 'barrelLength' ? `${value} სმ` : value;
    label.append(checkbox, text); container.append(label);
  }
}
function setSpecVisibility() {
  const category = $('#editForm').elements.category.value;
  $('#caliberField').hidden = !catalog.categories.slice(0, 3).includes(category);
  $('#caliberField').disabled = $('#caliberField').hidden;
  $('#barrelField').hidden = !catalog.categories.slice(0, 2).includes(category);
  $('#barrelField').disabled = $('#barrelField').hidden;
}
function openEditor(product) {
  editing = product; dirty = false; stagedFile = null; stagedImage = '';
  const form = $('#editForm'); form.reset();
  for (const key of ['name', 'category', 'amount', 'description']) form.elements[key].value = product[key] ?? '';
  renderSpec('#editBrands', 'brand', catalog.tags(product, 'brand'));
  renderSpec('#editCalibers', 'caliber', catalog.tags(product, 'caliber'));
  renderSpec('#editBarrels', 'barrelLength', catalog.tags(product, 'barrelLength'));
  setSpecVisibility();
  $('#editImagePreview').src = catalog.imageUrl(product.image);
  say('#editMessage', ''); $('#editDialog').showModal();
}
function closeEditor() {
  if (saving || optionWrites || dirty && !confirm('შეუნახავი ცვლილებები გაუქმდეს?')) return;
  $('#editDialog').close(); editing = null; dirty = false;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
}

$('#closeEditor').onclick = $('#cancelEdit').onclick = closeEditor;
$('#editDialog').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
$('#editForm').addEventListener('input', () => { dirty = true; });
$('#editForm').addEventListener('change', () => { dirty = true; });
$('#editForm').elements.category.onchange = setSpecVisibility;
for (const [kind, selector, field] of [['brand','#editBrands','#brandField'],['caliber','#editCalibers','#caliberField'],['barrelLength','#editBarrels','#barrelField']]) {
  window.MagnumOptions.bind({ container: $(field), kind, database: () => db, values: () => vocabulary[kind],
    canSave: () => !saving,
    busy: active => { optionWrites += active ? 1 : -1; $('#saveEdit').disabled = saving || !!optionWrites; },
    select: value => {
      const checked = [...$(selector).querySelectorAll('input:checked')].map(input => input.value);
      vocabulary[kind] = [...new Set([...vocabulary[kind], value])].sort((a,b) => a.localeCompare(b,'en',{numeric:true}));
      renderSpec(selector, kind, [...new Set([...checked,value])]); dirty = true;
    }
  });
}
for (const category of catalog.categories) $('#editForm').elements.category.add(new Option(category, category));
$('#editForm').elements.image.onchange = event => {
  const file = event.target.files[0];
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
  stagedImage = ''; stagedFile = null;
  if (!file) { $('#editImagePreview').src = catalog.imageUrl(editing.image); return; }
  try { catalog.validateImage(file); previewUrl = URL.createObjectURL(file); $('#editImagePreview').src = previewUrl; say('#editMessage', ''); }
  catch (error) { event.target.value = ''; $('#editImagePreview').src = catalog.imageUrl(editing.image); say('#editMessage', error.message); }
};
$('#editForm').onsubmit = async event => {
  event.preventDefault();
  if (saving || optionWrites || !editing) return;
  const form = event.currentTarget, values = new FormData(form);
  const input = Object.fromEntries(['name', 'category', 'amount', 'description'].map(key => [key, values.get(key)]));
  for (const key of ['brand', 'caliber', 'barrelLength']) input[key] = values.getAll(key);
  try {
    const patch = catalog.buildPatch(input, editing, vocabulary), file = values.get('image');
    if (file?.size) catalog.validateImage(file);
    if (!Object.keys(patch).length && !file?.size) { say('#editMessage', 'ცვლილება არ არის.', true); return; }
    saving = true;
    for (const control of form.elements) control.disabled = true;
    $('#closeEditor').disabled = true;
    say('#editMessage', 'ინახება…', true);
    if (file?.size) {
      if (stagedFile !== file || !stagedImage) { stagedImage = await catalog.uploadImage(db, file); stagedFile = file; }
      patch.image = stagedImage;
    }
    const updated = await catalog.updateProduct(db, editing, patch);
    products = products.map(product => product.id === updated.id ? updated : product);
    editing = updated; dirty = false; stagedFile = null; stagedImage = '';
    render(); say('#editMessage', 'ცვლილებები შენახულია.', true); say('#managerMessage', 'პროდუქტი განახლდა.', true);
    form.elements.image.value = '';
  } catch (error) { say('#editMessage', error.message || 'შენახვა ვერ დადასტურდა. განაახლეთ სია და გადაამოწმეთ პროდუქტი.'); }
  finally {
    saving = false;
    for (const control of form.elements) control.disabled = false;
    $('#closeEditor').disabled = false; setSpecVisibility();
  }
};
$('#refreshProducts').onclick = async () => {
  const button = $('#refreshProducts'); if (button.disabled) return; button.disabled = true;
  try { await loadProducts(); say('#managerMessage', 'სია განახლდა.', true); }
  catch { say('#managerMessage', 'სიის განახლება ვერ მოხერხდა. ნაჩვენებია ბოლოს ჩატვირთული მონაცემები.'); }
  finally { button.disabled = false; }
};
$('#exportProducts').onclick = async () => {
  const button = $('#exportProducts'); if (button.disabled) return; button.disabled = true;
  try {
    const rows = await catalog.readAll(() => db.from('products').select('*'));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), products: rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `magnum-catalog-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('#managerMessage', 'კატალოგის ასლი ჩამოიტვირთა. სურათების ფაილები ცალკე უნდა შეინახოთ.', true);
  } catch { say('#managerMessage', 'ასლის ჩამოტვირთვა ვერ მოხერხდა. გადაამოწმეთ კავშირი.'); }
  finally { button.disabled = false; }
};
async function init() {
  try {
    db = await window.magnumDbReady;
    const { data: { session }, error: sessionError } = await db.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) { $('#blocked').hidden = false; return; }
    const { data: { user }, error: userError } = await db.auth.getUser();
    if (userError) throw userError;
    if (!user) { $('#blocked').hidden = false; return; }
    const { data: isAdmin, error: adminError } = await db.rpc('is_catalog_admin');
    if (adminError) throw adminError;
    if (isAdmin !== true) { $('#blocked').hidden = false; return; }
    $('#manager').hidden = false; $('#query').addEventListener('input', render);
    try { await loadProducts(); } catch { say('#managerMessage', 'კატალოგი ვერ ჩაიტვირთა. გამოიყენეთ „სიის განახლება“.'); }
  } catch { $('#blocked').hidden = false; $('#accessMessage').textContent = 'ბაზასთან კავშირი ვერ დამყარდა. გადაამოწმეთ კავშირი და განაახლეთ გვერდი.'; }
}
init();

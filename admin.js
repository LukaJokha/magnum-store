const $ = selector => document.querySelector(selector);
const message = (element, text, ok = false) => { element.textContent = text; element.className = `form-message ${ok ? 'success' : 'error'}`; };
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);
let db, pendingCreateId = null, uploadedFile = null, uploadedImage = '', optionWrites = 0, creatingProduct = false;

function populateSelect(name, values, suffix = '') {
  const select = document.querySelector(`[name="${name}"]`);
  const current = select.value;
  select.innerHTML = '<option value="">არ არის მითითებული</option>';
  [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }))
    .forEach(value => select.add(new Option(`${value}${suffix}`, value)));
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

async function loadStandardProductValues() {
  const data = await window.MagnumProducts.readAll(() => db.from('products').select('*'));
  const catalog = await fetch('data/products.json').then(response => response.ok ? response.json() : { products: [] }).catch(() => ({ products: [] }));
  const options = await window.MagnumOptions.load(db);
  const choices = window.MagnumProducts.choices([...catalog.products, ...data]);
  for (const key of ['brand','caliber','barrelLength']) populateSelect(key, [...choices[key], ...options[key]], key === 'barrelLength' ? ' სმ' : '');
}

async function refreshSession() {
  const { data: { session }, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw sessionError;
  let user = null;
  if (session) {
    const { data: { user: verifiedUser }, error: userError } = await db.auth.getUser();
    if (userError) throw userError;
    user = verifiedUser;
  }
  let isAdmin = false;
  if (user) {
    const { data, error } = await db.rpc('is_catalog_admin');
    if (error) throw error;
    isAdmin = data === true;
  }
  $('#loginPanel').hidden = isAdmin;
  $('#productPanel').hidden = !isAdmin;
  if (user && !isAdmin) {
    await db.auth.signOut();
    message($('#loginMessage'), 'ამ ანგარიშს ადმინისტრატორის უფლებები არ აქვს.');
  }
  return isAdmin;
}

async function init() {
  try {
    db = await window.magnumDbReady;
    if (await refreshSession()) await loadStandardProductValues();
  }
  catch (error) { message($('#productPanel').hidden ? $('#loginMessage') : $('#productMessage'), 'ბაზასთან კავშირი ვერ დამყარდა. განაახლეთ გვერდი და სცადეთ თავიდან.'); }
}

$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    db = await window.magnumDbReady;
    const { error } = await db.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
    if (error) throw error;
    if (await refreshSession()) {
      try { await loadStandardProductValues(); }
      catch { message($('#productMessage'), 'მახასიათებლები ვერ ჩაიტვირთა. განაახლეთ გვერდი და სცადეთ თავიდან.'); }
    }
  } catch (error) { message($('#loginMessage'), 'ელფოსტა ან პაროლი არასწორია.'); }
};

$('#productForm [name=image]').onchange = event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!IMAGE_TYPES.has(file.type)) { message($('#productMessage'), 'დაშვებულია მხოლოდ JPG, PNG, WEBP ან GIF სურათი.'); event.target.value = ''; return; }
  if (file.size > 5_000_000) { message($('#productMessage'), 'სურათის ზომა უნდა იყოს მაქსიმუმ 5 MB.'); event.target.value = ''; return; }
  $('#preview img').src = URL.createObjectURL(file); $('#preview').hidden = false;
};

$('#productForm').onsubmit = async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement), file = form.get('image'), button = $('#saveButton');
  if (button.disabled || optionWrites || creatingProduct) return;
  if (!(file instanceof File) || !file.size) return message($('#productMessage'), 'აირჩიეთ პროდუქტის სურათი.');
  button.disabled = true; button.textContent = 'ინახება…';
  creatingProduct = true;
  try {
    const allowed = Object.fromEntries(['brand', 'caliber', 'barrelLength'].map(key => [key, [...formElement.elements[key].options].map(option => option.value).filter(Boolean)]));
    const input = Object.fromEntries(['name', 'amount', 'category', 'description'].map(key => [key, form.get(key)]));
    for (const key of ['brand', 'caliber', 'barrelLength']) input[key] = [form.get(key)].filter(Boolean);
    const patch = window.MagnumProducts.buildPatch(input, {}, allowed);
    window.MagnumProducts.validateImage(file);
    if (uploadedFile !== file || !uploadedImage) {
      uploadedImage = await window.MagnumProducts.uploadImage(db, file); uploadedFile = file;
    }
    pendingCreateId ||= crypto.randomUUID();
    const row = { brand: '', caliber: '', barrelLength: '', brandTags: [], caliberTags: [], barrelLengthTags: [], brandStatus: 'unverified', ...patch, id: pendingCreateId, image: uploadedImage, source: 'admin' };
    row.sourcePrice = row.price;
    const { data, error } = await db.from('products').insert(row).select('id');
    if (error?.code === '23505') throw new Error('ეს პროდუქტი უკვე შენახულია. გადაამოწმეთ პროდუქტების მართვის გვერდი; ახალი პროდუქტის დასამატებლად განაახლეთ ეს გვერდი.');
    if (error || !data?.length) throw new Error('შენახვა ვერ დადასტურდა. გადაამოწმეთ კავშირი და პროდუქტების მართვის გვერდი.');
    pendingCreateId = null; uploadedFile = null; uploadedImage = '';
    formElement.reset(); $('#preview').hidden = true; message($('#productMessage'), 'პროდუქტი წარმატებით დაემატა კატალოგს.', true);
  } catch (error) { message($('#productMessage'), `შენახვა ვერ მოხერხდა: ${error.message}`); }
  finally { creatingProduct = false; button.disabled = !!optionWrites; button.textContent = 'პროდუქტის დამატება'; }
};

$('#logout').onclick = async () => { await db.auth.signOut(); await refreshSession(); };
for (const kind of ['brand','caliber','barrelLength']) {
  const select = document.querySelector(`[name="${kind}"]`);
  window.MagnumOptions.bind({ container: select.parentElement, kind, database: () => db,
    canSave: () => !creatingProduct,
    busy: active => { optionWrites += active ? 1 : -1; $('#saveButton').disabled = creatingProduct || !!optionWrites; },
    values: () => [...select.options].map(option => option.value).filter(Boolean),
    select: value => {
      populateSelect(kind, [...select.options].map(option => option.value).filter(Boolean).concat(value), kind === 'barrelLength' ? ' სმ' : '');
      select.value = value;
    }
  });
}
init();

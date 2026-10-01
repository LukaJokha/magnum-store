const $ = selector => document.querySelector(selector);
const message = (element, text, ok = false) => { element.textContent = text; element.className = `form-message ${ok ? 'success' : 'error'}`; };
let db;

function populateSelect(name, values, suffix = '') {
  const select = document.querySelector(`[name="${name}"]`);
  const current = select.value;
  select.innerHTML = '<option value="">არ არის მითითებული</option>';
  [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }))
    .forEach(value => select.add(new Option(`${value}${suffix}`, value)));
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

async function loadStandardProductValues() {
  const catalog = await fetch('data/products.json').then(response => response.ok ? response.json() : { products: [] });
  const { data } = await db.from('products').select('brand,caliber,barrelLength');
  const products = [...catalog.products, ...(data || [])];
  populateSelect('brand', products.map(product => product.brand));
  populateSelect('caliber', products.map(product => product.caliber));
  populateSelect('barrelLength', products.map(product => product.barrelLength), ' სმ');
}

async function refreshSession() {
  const { data: { user } } = await db.auth.getUser();
  $('#loginPanel').hidden = Boolean(user);
  $('#productPanel').hidden = !user;
}

async function init() {
  try { db = await window.magnumDbReady; await refreshSession(); await loadStandardProductValues(); }
  catch (error) { message($('#loginMessage'), 'ბაზასთან კავშირი ვერ დამყარდა. შეამოწმეთ Supabase პარამეტრები.'); }
}

$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const { error } = await db.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
    if (error) throw error;
    await refreshSession();
  } catch (error) { message($('#loginMessage'), 'ელფოსტა ან პაროლი არასწორია.'); }
};

$('#productForm [name=image]').onchange = event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5_000_000) { message($('#productMessage'), 'სურათის ზომა უნდა იყოს მაქსიმუმ 5 MB.'); event.target.value = ''; return; }
  $('#preview img').src = URL.createObjectURL(file); $('#preview').hidden = false;
};

$('#productForm').onsubmit = async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement), file = form.get('image'), button = $('#saveButton');
  if (!(file instanceof File) || !file.size) return message($('#productMessage'), 'აირჩიეთ პროდუქტის სურათი.');
  button.disabled = true; button.textContent = 'ინახება…';
  try {
    const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '');
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from('product-images').upload(fileName, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: imageUrl } = db.storage.from('product-images').getPublicUrl(fileName);
    const amount = Number(form.get('amount'));
    const row = { id: crypto.randomUUID(), name: form.get('name').trim(), amount, price: `${amount} ₾`, category: form.get('category'), brand: form.get('brand') || '', caliber: form.get('caliber') || '', barrelLength: form.get('barrelLength') || '', image: imageUrl.publicUrl, description: form.get('description').trim() || '', source: 'admin' };
    const { error } = await db.from('products').insert(row);
    if (error) { await db.storage.from('product-images').remove([fileName]); throw error; }
    formElement.reset(); $('#preview').hidden = true; message($('#productMessage'), 'პროდუქტი წარმატებით დაემატა კატალოგს.', true);
  } catch (error) { message($('#productMessage'), `შენახვა ვერ მოხერხდა: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'პროდუქტის დამატება'; }
};

$('#importButton').onclick = async () => {
  const button = $('#importButton'); button.disabled = true; button.textContent = 'იმპორტდება…';
  try {
    const response = await fetch('data/products.json'); if (!response.ok) throw new Error('კატალოგის ფაილი ვერ მოიძებნა.');
    const { products } = await response.json();
    const rows = products.map(product => ({
      id: product.id, name: product.name, price: product.price, amount: product.amount,
      category: product.category, brand: product.brand || '', caliber: product.caliber || '',
      barrelLength: product.barrelLength || '', image: product.image,
      description: product.description || '', source: 'magnum.ge'
    }));
    for (let index = 0; index < rows.length; index += 50) {
      const { error } = await db.from('products').upsert(rows.slice(index, index + 50), { onConflict: 'id' });
      if (error) throw error;
    }
    message($('#importMessage'), `${products.length} პროდუქტი წარმატებით დაემატა ონლაინ ბაზას.`, true);
  } catch (error) { message($('#importMessage'), `იმპორტი ვერ მოხერხდა: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'არსებული კატალოგის იმპორტი'; }
};

$('#logout').onclick = async () => { await db.auth.signOut(); await refreshSession(); };
init();

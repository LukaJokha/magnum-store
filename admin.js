const $ = selector => document.querySelector(selector);
const message = (element, text, ok = false) => { element.textContent = text; element.className = `form-message ${ok ? 'success' : 'error'}`; };
let db;

async function refreshSession() {
  const { data: { user } } = await db.auth.getUser();
  $('#loginPanel').hidden = Boolean(user);
  $('#productPanel').hidden = !user;
}

async function init() {
  try { db = await window.magnumDbReady; await refreshSession(); }
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
  const form = new FormData(event.currentTarget), file = form.get('image'), button = $('#saveButton');
  if (!(file instanceof File) || !file.size) return message($('#productMessage'), 'აირჩიეთ პროდუქტის სურათი.');
  button.disabled = true; button.textContent = 'ინახება…';
  try {
    const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '');
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from('product-images').upload(fileName, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: imageUrl } = db.storage.from('product-images').getPublicUrl(fileName);
    const amount = Number(form.get('amount'));
    const row = { id: crypto.randomUUID(), name: form.get('name').trim(), amount, price: `${amount} ₾`, category: form.get('category'), brand: form.get('brand').trim() || null, caliber: form.get('caliber').trim() || null, barrelLength: form.get('barrelLength').trim() || null, image: imageUrl.publicUrl, description: form.get('description').trim() || null, source: 'admin' };
    const { error } = await db.from('products').insert(row);
    if (error) { await db.storage.from('product-images').remove([fileName]); throw error; }
    event.currentTarget.reset(); $('#preview').hidden = true; message($('#productMessage'), 'პროდუქტი წარმატებით დაემატა კატალოგს.', true);
  } catch (error) { message($('#productMessage'), `შენახვა ვერ მოხერხდა: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'პროდუქტის დამატება'; }
};

$('#importButton').onclick = async () => {
  const button = $('#importButton'); button.disabled = true; button.textContent = 'იმპორტდება…';
  try {
    const response = await fetch('data/products.json'); if (!response.ok) throw new Error('კატალოგის ფაილი ვერ მოიძებნა.');
    const { products } = await response.json();
    for (let index = 0; index < products.length; index += 50) {
      const { error } = await db.from('products').upsert(products.slice(index, index + 50), { onConflict: 'id' });
      if (error) throw error;
    }
    message($('#importMessage'), `${products.length} პროდუქტი წარმატებით დაემატა ონლაინ ბაზას.`, true);
  } catch (error) { message($('#importMessage'), `იმპორტი ვერ მოხერხდა: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'არსებული კატალოგის იმპორტი'; }
};

$('#logout').onclick = async () => { await db.auth.signOut(); await refreshSession(); };
init();

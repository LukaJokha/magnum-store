const $ = selector => document.querySelector(selector);
const message = (element, text, ok = false) => { element.textContent = text; element.className = `form-message ${ok ? 'success' : 'error'}`; };
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);
const PASSWORD_MIN_LENGTH = 16;
const FORBIDDEN_ADMIN_PASSWORDS = new Set(['magnum-admin', 'password', 'admin123', 'replace-with-a-long-unique-password']);
let db, currentUserEmail = '', currentUserId = '';

function isStrongAdminPassword(value) {
  return value.length >= PASSWORD_MIN_LENGTH
    && value.length <= 128
    && /\p{L}/u.test(value)
    && /\d/.test(value)
    && /[^\p{L}\d]/u.test(value)
    && !FORBIDDEN_ADMIN_PASSWORDS.has(value.toLocaleLowerCase('en-US'));
}

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
  const { data } = await db.from('products').select('brand,caliber,barrelLength,brandTags,caliberTags,barrelLengthTags');
  const products = [...catalog.products, ...(data || [])];
  populateSelect('brand', products.flatMap(product => Array.isArray(product.brandTags) ? product.brandTags : [product.brand]));
  populateSelect('caliber', products.flatMap(product => product.caliberTags?.length ? product.caliberTags : [product.caliber]));
  populateSelect('barrelLength', products.flatMap(product => product.barrelLengthTags?.length ? product.barrelLengthTags : [product.barrelLength]), ' სმ');
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
  currentUserEmail = user?.email || '';
  currentUserId = user?.id || '';
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
    currentUserEmail = '';
    currentUserId = '';
    message($('#loginMessage'), 'ამ ანგარიშს ადმინისტრატორის უფლებები არ აქვს.');
  }
  return isAdmin;
}

async function init() {
  try {
    db = await window.magnumDbReady;
    if (await refreshSession()) await loadStandardProductValues();
  }
  catch (error) { message($('#loginMessage'), 'ბაზასთან კავშირი ვერ დამყარდა. შეამოწმეთ Supabase პარამეტრები.'); }
}

$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const { error } = await db.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
    if (error) throw error;
    if (await refreshSession()) await loadStandardProductValues();
  } catch (error) { message($('#loginMessage'), 'ელფოსტა ან პაროლი არასწორია.'); }
};

$('#passwordForm').onsubmit = async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const currentPassword = String(form.get('currentPassword') || '');
  const newPassword = String(form.get('newPassword') || '');
  const confirmPassword = String(form.get('confirmPassword') || '');
  const button = $('#changePasswordButton');

  if (button.disabled) return;
  if (!currentUserEmail || !currentUserId) return message($('#passwordMessage'), 'სესია დასრულებულია. თავიდან შედით ადმინისტრირებაში.');
  if (newPassword !== confirmPassword) return message($('#passwordMessage'), 'ახალი პაროლები ერთმანეთს არ ემთხვევა.');
  if (currentPassword === newPassword) return message($('#passwordMessage'), 'ახალი პაროლი მიმდინარე პაროლისგან განსხვავებული უნდა იყოს.');
  if (!isStrongAdminPassword(newPassword)) return message($('#passwordMessage'), 'გამოიყენეთ 16–128 სიმბოლო, ასო, ციფრი და სპეციალური სიმბოლო.');

  button.disabled = true;
  button.textContent = 'იცვლება…';
  try {
    const { data: reauthenticated, error: reauthenticationError } = await db.auth.signInWithPassword({ email: currentUserEmail, password: currentPassword });
    if (reauthenticationError || reauthenticated.user?.id !== currentUserId) throw new Error('მიმდინარე პაროლი არასწორია.');

    const { data: isAdmin, error: adminError } = await db.rpc('is_catalog_admin');
    if (adminError || isAdmin !== true) throw new Error('ადმინისტრატორის უფლება ვერ დადასტურდა.');

    const { error: updateError } = await db.auth.updateUser({ password: newPassword, current_password: currentPassword });
    if (updateError) throw new Error('ახალი პაროლი ვერ შეინახა. სცადეთ სხვა ძლიერი პაროლი.');

    const { error: signOutError } = await db.auth.signOut({ scope: 'global' });
    if (signOutError) await db.auth.signOut({ scope: 'local' });
    currentUserEmail = '';
    currentUserId = '';
    if (signOutError) {
      const warning = $('#passwordMessage');
      warning.textContent = 'პაროლი შეიცვალა, მაგრამ სხვა სესიების სრულად გაუქმება ვერ დადასტურდა. შედით ახალი პაროლით.';
      warning.className = 'form-message warning';
    } else {
      message($('#passwordMessage'), 'პაროლი შეიცვალა. ახლა ახალი პაროლით შედით.', true);
    }
    setTimeout(() => window.location.reload(), signOutError ? 3200 : 1600);
  } catch (error) {
    message($('#passwordMessage'), error.message || 'პაროლის შეცვლა ვერ მოხერხდა.');
  } finally {
    formElement.reset();
    button.disabled = false;
    button.textContent = 'პაროლის შეცვლა';
  }
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
  if (!(file instanceof File) || !file.size) return message($('#productMessage'), 'აირჩიეთ პროდუქტის სურათი.');
  button.disabled = true; button.textContent = 'ინახება…';
  try {
    const extension = IMAGE_TYPES.get(file.type);
    if (!extension || file.size > 5_000_000) throw new Error('სურათის ტიპი ან ზომა დაუშვებელია.');
    const fileName = `${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from('product-images').upload(fileName, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: imageUrl } = db.storage.from('product-images').getPublicUrl(fileName);
    const amount = Number(form.get('amount'));
    const row = { id: crypto.randomUUID(), name: form.get('name').trim(), amount, price: `${amount} ₾`, category: form.get('category'), brand: form.get('brand') || '', caliber: form.get('caliber') || '', barrelLength: form.get('barrelLength') || '', image: imageUrl.publicUrl, description: form.get('description').trim() || '', source: 'admin' };
    const supportsCaliber = ['ცეცხლსასროლი იარაღი', 'პნევმატიკა', 'ვაზნები'].includes(row.category);
    const supportsBarrel = ['ცეცხლსასროლი იარაღი', 'პნევმატიკა'].includes(row.category);
    if (!supportsCaliber) row.caliber = '';
    if (!supportsBarrel) row.barrelLength = '';
    row.brandTags = [row.brand].filter(Boolean);
    row.caliberTags = [row.caliber].filter(Boolean);
    row.barrelLengthTags = [row.barrelLength].filter(Boolean);
    row.brandStatus = row.brand ? 'verified' : 'unverified';
    row.sourcePrice = row.price;
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
      description: product.description || '', source: 'magnum.ge',
      brandTags: product.brandTags || [], caliberTags: product.caliberTags || [],
      barrelLengthTags: product.barrelLengthTags || [],
      brandStatus: product.brandStatus || (product.brand ? 'verified' : 'unverified'),
      sourcePrice: product.sourcePrice || product.price
    }));
    for (let index = 0; index < rows.length; index += 50) {
      const { error } = await db.from('products').upsert(rows.slice(index, index + 50), { onConflict: 'id' });
      if (error) throw error;
    }
    message($('#importMessage'), `${products.length} პროდუქტი წარმატებით დაემატა ონლაინ ბაზას.`, true);
  } catch (error) { message($('#importMessage'), `იმპორტი ვერ მოხერხდა: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'არსებული კატალოგის იმპორტი'; }
};

$('#logout').onclick = async () => { await db.auth.signOut(); currentUserEmail = ''; currentUserId = ''; await refreshSession(); };
init();

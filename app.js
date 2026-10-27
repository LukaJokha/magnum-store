document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="filter-ui.css">');
const state = { products: [], page: 1, perPage: 18, category: 'all', brand: [], caliber: [], barrel: [], query: '', min: '', max: '', sort: 'new' };
const $ = selector => document.querySelector(selector);
const normalize = value => String(value || '').toLocaleLowerCase('ka-GE');
const filterDefinitions = [['brand', 'brand', 'ბრენდი'], ['caliber', 'caliber', 'კალიბრი'], ['barrel', 'barrelLength', 'ლულის სიგრძე']];
const tagsOrScalar = (values, scalar) => [...new Set((Array.isArray(values) && values.length ? values : [scalar]).map(value => String(value || '').trim()).filter(Boolean))];
const cleanProduct = product => {
  const brand = String(product.brand || '').trim();
  const brandTags = tagsOrScalar(product.brandTags, brand);
  const caliberTags = tagsOrScalar(product.caliberTags, product.caliber);
  const barrelLengthTags = tagsOrScalar(product.barrelLengthTags, product.barrelLength);
  return { ...product, brand, brandTags, caliberTags, barrelLengthTags, caliber: String(product.caliber || '').trim(), barrelLength: String(product.barrelLength || '').trim(), description: String(product.description || '').trim() };
};
const facetValues = (product, key) => product[key === 'brand' ? 'brandTags' : key === 'caliber' ? 'caliberTags' : 'barrelLengthTags'];
const searchableText = product => [product.name, product.category, ...product.brandTags, ...product.caliberTags, ...product.barrelLengthTags].filter(Boolean).join(' ');

function matches(product, ignored = '') {
  return (ignored === 'category' || state.category === 'all' || product.category === state.category)
    && (ignored === 'brand' || !state.brand.length || product.brandTags.some(brand => state.brand.includes(brand)))
    && (ignored === 'caliber' || !state.caliber.length || product.caliberTags.some(value => state.caliber.includes(value)))
    && (ignored === 'barrel' || !state.barrel.length || product.barrelLengthTags.some(value => state.barrel.includes(value)))
    && (!state.query || normalize(searchableText(product)).includes(normalize(state.query)))
    && (!state.min || product.amount >= Number(state.min))
    && (!state.max || product.amount <= Number(state.max));
}
function filtered() {
  return state.products.filter(product => matches(product)).sort((a, b) => {
    if (state.sort === 'low') return a.amount - b.amount;
    if (state.sort === 'high') return b.amount - a.amount;
    if (state.sort === 'az') return a.name.localeCompare(b.name, 'ka');
    const newerFirst = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (Number.isFinite(newerFirst) && newerFirst !== 0) return newerFirst;
    return String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  });
}
function availableFor(key) { return state.products.filter(product => matches(product, key)); }
function renderFacet(id, key, suffix = '') {
  const source = availableFor(id);
  const counts = source.reduce((map, product) => {
    facetValues(product, key).forEach(value => { map[value] = (map[value] || 0) + 1; });
    return map;
  }, {});
  const values = [...new Set([...Object.keys(counts), ...state[id]])].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }));
  const container = $(`#${id}Options`); container.innerHTML = '';
  const facet = container.closest('.facet');
  facet.hidden = values.length === 0;
  values.forEach(value => {
    const choice = document.createElement('label'); choice.className = 'facet-choice';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = state[id].includes(value);
    input.onchange = () => { state[id] = input.checked ? [...state[id], value] : state[id].filter(item => item !== value); state.page = 1; update(); };
    const name = document.createElement('span'); name.textContent = `${value}${suffix}`;
    const count = document.createElement('em'); count.textContent = counts[value] || 0;
    choice.append(input, name, count); container.append(choice);
  });
  $(`#${id}Count`).textContent = state[id].length ? `(${state[id].length})` : '';
}
function renderActiveFilters() {
  const active = $('#activeFilters'); active.innerHTML = '';
  const labels = { brand: 'ბრენდი', caliber: 'კალიბრი', barrel: 'ლულის სიგრძე' };
  if (state.category !== 'all') {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'filter-chip'; chip.textContent = `კატეგორია: ${state.category} ×`;
    chip.onclick = () => { state.category = 'all'; state.page = 1; update(); }; active.append(chip);
  }
  filterDefinitions.forEach(([id]) => state[id].forEach(value => {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'filter-chip'; chip.textContent = `${labels[id]}: ${value} ×`;
    chip.onclick = () => { state[id] = state[id].filter(item => item !== value); state.page = 1; update(); }; active.append(chip);
  }));
  active.hidden = !active.children.length;
}
function renderFilters() {
  const categorySource = availableFor('category');
  const counts = categorySource.reduce((map, product) => (map[product.category] = (map[product.category] || 0) + 1, map), {});
  const wrap = $('#categories'); wrap.innerHTML = '';
  const categoryChoices = [['all', 'ყველა პროდუქტი', categorySource.length], ...Object.entries(counts).map(([category, count]) => [category, category, count])];
  categoryChoices.forEach(([key, label, count]) => {
    const choice = document.createElement('label'); choice.className = 'choice';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'category'; input.value = key; input.checked = state.category === key;
    input.addEventListener('change', () => { state.category = key; state.page = 1; update(); });
    const name = document.createElement('span'); name.textContent = label;
    const total = document.createElement('span'); total.textContent = count;
    choice.append(input, name, total); wrap.append(choice);
  });
  $('#categoryCount').textContent = state.category === 'all' ? '' : '(1)';
  filterDefinitions.forEach(([id, key]) => renderFacet(id, key, key === 'barrelLength' ? ' სმ' : ''));
  $('.specs').hidden = [...document.querySelectorAll('.specs .facet')].every(facet => facet.hidden);
  renderActiveFilters();
}
function showProduct(product) {
  const dialog = $('#productDialog');
  const description = product.description ? `<p class="description">${product.description}</p>` : '';
  dialog.querySelector('#dialogContent').innerHTML = `<div class="dialog-grid"><figure><img src="${product.image}" alt="${product.name}"></figure><div class="dialog-copy"><p class="category">${product.category}</p><h2>${product.name}</h2><p class="price">${product.price}</p>${description}<a class="contact-btn" href="tel:+995322953487">დარეკე კონსულტაციისთვის</a><p class="source">ფასი და ხელმისაწვდომობა გადაამოწმეთ მაღაზიაში.</p></div></div>`;
  dialog.showModal();
}
function renderProducts() {
  const list = filtered(), totalPages = Math.max(1, Math.ceil(list.length / state.perPage));
  state.page = Math.min(state.page, totalPages);
  const visible = list.slice((state.page - 1) * state.perPage, state.page * state.perPage);
  const grid = $('#products'), template = $('#productTemplate'); grid.innerHTML = '';
  visible.forEach(product => {
    const card = template.content.cloneNode(true); const image = card.querySelector('img');
    image.src = product.image; image.alt = product.name;
    card.querySelector('.category').textContent = product.category;
    card.querySelector('h2').textContent = product.name;
    card.querySelector('.price').textContent = product.price;
    card.querySelectorAll('button').forEach(button => button.addEventListener('click', () => showProduct(product)));
    grid.append(card);
  });
  $('#empty').hidden = visible.length > 0;
  $('#resultCount').textContent = `ნაპოვნია ${list.length} პროდუქტი`;
  const navigation = $('#pagination'); navigation.innerHTML = '';
  const addPage = (label, page, disabled = false, active = false) => { const button = document.createElement('button'); button.textContent = label; button.disabled = disabled; button.className = active ? 'active' : ''; button.onclick = () => { state.page = page; renderProducts(); $('#catalog').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; navigation.append(button); };
  addPage('‹', state.page - 1, state.page === 1);
  for (let page = Math.max(1, state.page - 2); page <= Math.min(totalPages, state.page + 2); page++) addPage(page, page, false, page === state.page);
  addPage('›', state.page + 1, state.page === totalPages);
}
function update() { renderFilters(); renderProducts(); }
async function init() {
  try {
    // The bundled catalog remains the safe baseline until its one-time Supabase import is complete.
    const catalog = await fetch('data/products.json').then(response => { if (!response.ok) throw Error(); return response.json(); });
    const baseline = catalog.products.map(cleanProduct);
    try {
      const database = await window.magnumDbReady;
      const { data, error } = await database.from('products').select('*').order('createdAt', { ascending: false });
      if (error) throw error;
      const online = (data || []).map(cleanProduct);
      const importedCatalogExists = online.some(product => product.source === 'magnum.ge');
      if (importedCatalogExists) {
        // After import Supabase is authoritative, including edits and deletions.
        state.products = online;
      }
      else {
        const merged = new Map(baseline.map(product => [product.id, product]));
        online.forEach(product => merged.set(product.id, product));
        state.products = [...merged.values()];
      }
    } catch { state.products = baseline; }
    update();
  } catch { $('#resultCount').textContent = 'კატალოგის ჩატვირთვა ვერ მოხერხდა'; return; }
  $('#search').oninput = event => { state.query = event.target.value; state.page = 1; update(); };
  $('#minPrice').oninput = event => { state.min = event.target.value; state.page = 1; update(); };
  $('#maxPrice').oninput = event => { state.max = event.target.value; state.page = 1; update(); };
  $('#sort').onchange = event => { state.sort = event.target.value; renderProducts(); };
  $('#clearFilters').onclick = () => {
    $('#search').value = $('#minPrice').value = $('#maxPrice').value = '';
    Object.assign(state, { category: 'all', brand: [], caliber: [], barrel: [], query: '', min: '', max: '', page: 1 }); update();
  };
  $('#productDialog .close').onclick = () => $('#productDialog').close();
  $('#year').textContent = new Date().getFullYear();
}
init();

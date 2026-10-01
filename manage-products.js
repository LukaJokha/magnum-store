const $ = selector => document.querySelector(selector);
let products = [], db;

function storagePath(image) {
  const marker = '/storage/v1/object/public/product-images/';
  return image && image.includes(marker) ? decodeURIComponent(image.split(marker)[1].split('?')[0]) : null;
}

function render() {
  const query = $('#query').value.trim().toLocaleLowerCase('ka-GE');
  const list = products.filter(product => !query || `${product.name} ${product.brand || ''} ${product.caliber || ''}`.toLocaleLowerCase('ka-GE').includes(query));
  $('#summary').textContent = `ნაჩვენებია ${list.length} პროდუქტი`;
  const container = $('#productList'); container.innerHTML = '';
  list.forEach(product => {
    const row = document.createElement('article'); row.className = 'manage-row';
    const name = document.createElement('div'); name.innerHTML = `<b></b><small></small>`;
    name.querySelector('b').textContent = product.name;
    name.querySelector('small').textContent = `${product.category} · ${product.price}`;
    const button = document.createElement('button'); button.className = 'delete-button'; button.textContent = 'წაშლა';
    button.onclick = async () => {
      if (!confirm(`ნამდვილად წავშალოთ „${product.name}“?`)) return;
      button.disabled = true;
      try {
        const { error } = await db.from('products').delete().eq('id', product.id); if (error) throw error;
        const path = storagePath(product.image); if (path) await db.storage.from('product-images').remove([path]);
        products = products.filter(item => item.id !== product.id); render();
      } catch (error) { alert(`წაშლა ვერ მოხერხდა: ${error.message}`); button.disabled = false; }
    };
    row.append(name, button); container.append(row);
  });
}

async function init() {
  try {
    db = await window.magnumDbReady;
    const { data: { user } } = await db.auth.getUser(); if (!user) { $('#blocked').hidden = false; return; }
    const { data, error } = await db.from('products').select('*').order('createdAt', { ascending: false }); if (error) throw error;
    products = data || []; $('#manager').hidden = false; $('#query').addEventListener('input', render); render();
  } catch { $('#blocked').hidden = false; }
}
init();

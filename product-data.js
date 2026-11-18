(() => {
  const categories = ['ცეცხლსასროლი იარაღი', 'პნევმატიკა', 'ვაზნები', 'დანები', 'აქსესუარები', 'ოპტიკა', 'ფანრები', 'ნავები და ძრავები', 'ტურიზმი'];
  const specs = [['brand', 'brandTags'], ['caliber', 'caliberTags'], ['barrelLength', 'barrelLengthTags']];
  const editable = ['name', 'amount', 'price', 'category', 'description', 'image', 'brand', 'caliber', 'barrelLength', 'brandTags', 'caliberTags', 'barrelLengthTags', 'brandStatus'];
  const imageTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif']]);
  const tags = (row, key) => {
    const field = specs.find(([scalar]) => scalar === key)?.[1];
    return [...new Set((Array.isArray(row[field]) && row[field].length ? row[field] : [row[key]]).filter(value => typeof value === 'string' && value.trim()))];
  };
  async function readAll(makeQuery) {
    const rows = [], size = 200;
    for (let start = 0; ; start += size) {
      const { data, error } = await makeQuery().order('id').range(start, start + size - 1);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('ბაზის პასუხი არასწორია.');
      rows.push(...data);
      if (data.length < size) break;
    }
    return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  function choices(rows) {
    return Object.fromEntries(specs.map(([key]) => [key, [...new Set(rows.flatMap(row => tags(row, key)))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))]));
  }
  const sameTags = (a, b) => a.length === b.length && a.every(value => b.includes(value));
  function buildPatch(input, original = {}, allowed) {
    const name = String(input.name || '').trim(), description = String(input.description || '').trim();
    const amountText = String(input.amount ?? '').trim(), amount = Number(amountText);
    if (!name || name.length > 300) throw new Error('დასახელება უნდა შეიცავდეს 1–300 სიმბოლოს.');
    if (!amountText || !Number.isFinite(amount) || amount <= 0 || amount > 100000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error('მიუთითეთ დადებითი ფასი, მაქსიმუმ ორი ათწილადით.');
    if (!categories.includes(input.category)) throw new Error('აირჩიეთ კატეგორია.');
    if (description.length > 5000) throw new Error('აღწერა უნდა იყოს მაქსიმუმ 5000 სიმბოლო.');
    const next = { name, description, category: input.category };
    if (amount !== Number(original.amount)) { next.amount = amount; next.price = `${amount.toFixed(2).replace(/\.00$/, '')} ₾`; }
    for (const [key, field] of specs) {
      const supported = key === 'brand' || (key === 'caliber' ? categories.slice(0, 3) : categories.slice(0, 2)).includes(input.category);
      const selected = supported ? [...new Set(input[key] || [])] : [];
      if (selected.some(value => !allowed[key].includes(value))) throw new Error('აირჩიეთ მახასიათებელი მოცემული სიიდან.');
      if (!sameTags(selected, tags(original, key)) || !supported && original[key]) {
        next[key] = selected[0] || ''; next[field] = selected;
        if (key === 'brand') next.brandStatus = selected.length ? 'verified' : 'unverified';
      }
    }
    if (input.image && input.image !== original.image) next.image = input.image;
    return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key])));
  }
  // Guard the UPDATE with a revision; older installations compare the editable snapshot.
  async function updateProduct(db, original, patch) {
    if (!Object.keys(patch).length) return original;
    let query = db.from('products').update(patch).eq('id', original.id);
    if (original.revision != null) query = query.eq('revision', original.revision);
    else for (const key of editable) {
      const value = original[key];
      if (value === undefined) continue;
      query = value === null ? query.is(key, null) : query.eq(key, Array.isArray(value) ? JSON.stringify(value) : value);
    }
    const { data, error } = await query.select('*');
    if (error) throw new Error('შენახვა ვერ დადასტურდა. კავშირის აღდგენის შემდეგ განაახლეთ სია და გადაამოწმეთ პროდუქტი.');
    if (!data?.length) throw new Error('პროდუქტი სხვაგან შეიცვალა, წაიშალა ან წვდომა შეწყდა. განაახლეთ სია და თავიდან გახსენით.');
    return data[0];
  }
  function validateImage(file) {
    if (!file || !file.size || !imageTypes.has(file.type) || file.size > 5000000) throw new Error('აირჩიეთ JPG, PNG, WEBP ან GIF სურათი, მაქსიმუმ 5 MB.');
    return imageTypes.get(file.type);
  }
  async function uploadImage(db, file) {
    const ext = validateImage(file), path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error('სურათის ატვირთვა ვერ მოხერხდა. გადაამოწმეთ კავშირი და წვდომა.');
    return db.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }
  function imageUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith('/assets/')) return url.href;
      if (url.origin === 'https://zhfvofpxqmzwbugoonmi.supabase.co' && url.pathname.startsWith('/storage/v1/object/public/product-images/')) return url.href;
    } catch {}
    return '';
  }
  window.MagnumProducts = { categories, tags, choices, readAll, buildPatch, updateProduct, validateImage, uploadImage, imageUrl };
})();

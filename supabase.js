window.magnumDbReady = new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  script.onload = () => {
    try {
      window.magnumDb = window.supabase.createClient(
        'https://zhfvofpxqmzwbugoonmi.supabase.co',
        'sb_publishable_mJb_4HhWX-d00E9PIVc4pQ_NlOUzID2'
      );
      resolve(window.magnumDb);
    } catch (error) { reject(error); }
  };
  script.onerror = () => reject(new Error('Supabase ვერ ჩაიტვირთა.'));
  document.head.append(script);
});

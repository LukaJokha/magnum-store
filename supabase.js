window.magnumDbReady = new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
  script.integrity = 'sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK';
  script.crossOrigin = 'anonymous';
  script.referrerPolicy = 'no-referrer';
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

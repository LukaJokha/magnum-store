(() => {
  const form = document.querySelector('#forgotPasswordForm');
  const button = form.querySelector('button');
  const status = document.querySelector('#forgotPasswordMessage');
  form.onsubmit = async event => {
    event.preventDefault();
    if (button.disabled) return;
    const email = String(new FormData(form).get('email') || '').trim();
    button.disabled = true;
    status.textContent = 'იგზავნება…';
    try {
      const db = await window.magnumDbReady;
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      status.textContent = 'თუ ამ ელფოსტით ანგარიში არსებობს, აღდგენის წერილს მიიღებთ. შეამოწმეთ Spam საქაღალდეც.';
    } catch {
      status.textContent = 'წერილის გაგზავნა ვერ მოხერხდა. ცოტა ხანში სცადეთ თავიდან.';
    } finally { button.disabled = false; }
  };
})();

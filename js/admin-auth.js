(() => {
  const form = document.querySelector('#admin-form');
  const input = document.querySelector('#admin-key');
  const button = form.querySelector('button');
  const status = document.querySelector('#auth-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.className = 'status';
    status.textContent = 'Кіру жүріп жатыр…';
    try {
      const response = await apiFetch('/api/admin/session', {method: 'POST', body: {key: input.value.trim()}});
      input.value = '';
      setToken(response.token);
      location.replace('teacher.html');
    } catch (error) {
      status.textContent = error.message;
      status.className = 'status error';
      button.disabled = false;
    }
  });
})();

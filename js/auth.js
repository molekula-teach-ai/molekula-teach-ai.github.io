(() => {
  // Ссылка учителя «lesson.html?lesson=N» сохраняется через выбор роли.
  const next = /^\?lesson=\d+$/.test(location.search) ? `lesson.html${location.search}` : 'lesson.html';
  if (getToken()) { location.replace(next); return; }
  const statusBox = document.querySelector('#auth-status');
  const buttons = document.querySelectorAll('[data-role]');
  let busy = false;

  const setStatus = (text, kind = '') => {
    statusBox.textContent = text;
    statusBox.className = `status ${kind}`;
  };

  buttons.forEach(button => button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    buttons.forEach(item => { item.disabled = true; });
    setStatus('Кіру жүріп жатыр…');
    try {
      const data = await apiFetch('/api/auth/guest', {method: 'POST', body: {role: button.dataset.role}});
      setToken(data.token);
      location.href = next;
    } catch (error) {
      setStatus(error.message, 'error');
      busy = false;
      buttons.forEach(item => { item.disabled = false; });
    }
  }));
})();

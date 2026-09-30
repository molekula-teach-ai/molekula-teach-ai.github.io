(() => {
  // Ссылка учителя «lesson.html?lesson=N» сохраняется через вход.
  const next = /^\?lesson=\d+$/.test(location.search) ? `lesson.html${location.search}` : 'lesson.html';
  if (getToken()) { location.replace(next); return; }
  const find = selector => document.querySelector(selector);
  const registerForm = find('#register-form');
  const details = find('#registration-details');
  const verifyFields = find('#verify-fields');
  const statusBox = find('#auth-status');
  let regToken = null;
  let busy = false;

  find('#telegram-link').href = window.APP_CONFIG.apiBase + '/telegram';
  const setStatus = (text, kind = '') => {
    statusBox.textContent = text;
    statusBox.className = `status ${kind}`;
  };
  const setBusy = value => {
    busy = value;
    document.querySelectorAll('.auth-card button').forEach(button => { button.disabled = value; });
    registerForm.setAttribute('aria-busy', String(value));
  };
  const selectedRole = () => registerForm.querySelector('[name="role"]:checked')?.value;
  const enter = data => { setToken(data.token); location.href = next; };

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(button => {
      button.classList.toggle('active', button === tab);
      button.setAttribute('aria-pressed', String(button === tab));
    });
    find('#login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
    registerForm.classList.toggle('hidden', tab.dataset.tab !== 'register');
    setStatus('');
  }));

  function continueRegistration() {
    if (!selectedRole()) {
      setStatus('Алдымен оқушы немесе мұғалім рөлін таңдаңыз.', 'error');
      registerForm.querySelector('[name="role"]').focus();
      return;
    }
    find('#role-step').classList.add('hidden');
    details.classList.remove('hidden');
    details.disabled = false;
    find('#selected-role-label').textContent = selectedRole() === 'teacher' ? 'Мұғалім' : 'Оқушы';
    setStatus('');
    find('#change-role').focus();
  }
  find('#continue-registration').addEventListener('click', continueRegistration);
  find('#change-role').addEventListener('click', () => {
    details.classList.add('hidden');
    details.disabled = true;
    find('#role-step').classList.remove('hidden');
    setStatus('');
    registerForm.querySelector('[name="role"]:checked')?.focus();
  });

  find('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setStatus('Кіру жүріп жатыр…');
    try { enter(await apiFetch('/api/auth/login', {method: 'POST', body})); }
    catch (error) { setStatus(error.message, 'error'); }
    finally { setBusy(false); }
  });

  const usernameInput = registerForm.querySelector('[name="username"]');
  usernameInput.addEventListener('input', () => {
    regToken = null;
    verifyFields.disabled = true;
    verifyFields.classList.add('hidden');
    registerForm.querySelector('[name="code"]').value = '';
    setStatus('');
  });
  find('#request-code').addEventListener('click', async () => {
    if (busy || !usernameInput.reportValidity()) return;
    const username = usernameInput.value.trim();
    setBusy(true);
    usernameInput.readOnly = true;
    setStatus('Код жіберіліп жатыр…');
    try {
      const data = await apiFetch('/api/auth/request-code', {method: 'POST', body: {username}});
      regToken = data.reg_token;
      verifyFields.disabled = false;
      verifyFields.classList.remove('hidden');
      setStatus(data.message || 'Растау коды Telegram-ға жіберілді.', 'success');
      registerForm.querySelector('[name="code"]').focus();
    } catch (error) { setStatus(error.message, 'error'); }
    finally { usernameInput.readOnly = false; setBusy(false); }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (details.disabled) { continueRegistration(); return; }
    if (!regToken) {
      setStatus('Алдымен Telegram арқылы растау кодын алыңыз.', 'error');
      find('#request-code').focus();
      return;
    }
    const body = {...Object.fromEntries(new FormData(registerForm)), reg_token: regToken};
    setBusy(true);
    setStatus('Тіркелгі жасалып жатыр…');
    try { enter(await apiFetch('/api/auth/register', {method: 'POST', body})); }
    catch (error) { setStatus(error.message, 'error'); }
    finally { setBusy(false); }
  });
})();

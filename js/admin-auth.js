(() => {
  const form = document.querySelector('#admin-form');
  const input = document.querySelector('#admin-key');
  const button = form.querySelector('button');
  const status = document.querySelector('#auth-status');
  async function showTools(data) {
    const lessons = data || await apiFetch('/api/lesson');
    if (lessons.user.role !== 'admin') return;
    form.classList.add('hidden');
    document.querySelector('#admin-tools').classList.remove('hidden');
    const select = document.querySelector('#transcript-lesson');
    select.replaceChildren();
    lessons.lessons.forEach(lesson => {
      const option = document.createElement('option');
      option.value = lesson.id;
      option.textContent = `${lesson.id}. ${lesson.title}`;
      select.append(option);
    });
    status.textContent = 'Әкімші ретінде кірдіңіз.';
  }
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
      await showTools();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'status error';
      button.disabled = false;
    }
  });
  document.querySelector('#transcript-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button');
    const message = document.querySelector('#transcript-status');
    const file = document.querySelector('#transcript-file').files[0];
    if (!file || submit.disabled) return;
    submit.disabled = true;
    message.className = 'status';
    message.textContent = 'Сақталып жатыр…';
    try {
      if (!/\.vtt$/i.test(file.name) || file.size > 500 * 1024) throw new Error('500 КБ-тан аспайтын WebVTT файлын таңдаңыз.');
      const lesson = document.querySelector('#transcript-lesson').value;
      const result = await apiFetch(`/api/admin/lessons/${encodeURIComponent(lesson)}/transcript`, {method: 'PUT', body: {vtt: await file.text()}});
      message.textContent = `Субтитрлер сақталды: ${result.segments} үзінді.`;
      event.target.reset();
    } catch (error) {
      message.className = 'status error';
      message.textContent = error.message;
    } finally { submit.disabled = false; }
  });
  if (getToken()) apiFetch('/api/lesson').then(showTools).catch(() => {});
})();

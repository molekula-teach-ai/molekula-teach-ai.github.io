const LessonMaterials = (() => {
  const find = selector => document.querySelector(selector);
  const kinds = {kmzh: 'ҚМЖ', slides: 'Слайдтар', worksheet: 'Жұмыс парақтары', other: 'Басқа материалдар'};
  let currentLesson = null;
  let canManage = false;
  let operation = null;
  let materials = [];
  let maxFileSize = 25 * 1024 * 1024;
  let extensions = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods', 'txt', 'png', 'jpg', 'jpeg', 'webp'];

  function sizeLabel(bytes) {
    const size = Math.max(0, Number(bytes) || 0);
    return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} МБ` : `${Math.max(1, Math.ceil(size / 1024))} КБ`;
  }

  function status(text, isError = false) {
    const node = find('#materials-status');
    node.textContent = text;
    node.classList.toggle('error', isError);
  }

  function uploadStatus(text, kind = '') {
    const node = find('#upload-status');
    node.textContent = text;
    node.className = `status ${kind}`;
  }

  function makeButton(text, className = 'secondary') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button ${className}`;
    button.textContent = text;
    return button;
  }

  // List refreshes and writes share one lock so a stale GET cannot replace a
  // successful mutation or release another operation's disabled controls.
  function setOperation(value) {
    operation = value;
    const busy = operation !== null;
    find('#retry-materials').disabled = busy;
    find('#upload-fields').disabled = busy || !canManage;
    find('#materials-list').setAttribute('aria-busy', String(busy));
    find('#material-upload').setAttribute('aria-busy', String(operation === 'upload'));
    document.querySelectorAll('[data-material-mutation]').forEach(button => { button.disabled = busy; });
  }

  function beginOperation(value) {
    if (operation !== null) return false;
    setOperation(value);
    return true;
  }

  function mutationButton(text, className = 'secondary') {
    const button = makeButton(text, className);
    button.setAttribute('data-material-mutation', '');
    button.disabled = operation !== null;
    return button;
  }

  async function download(material, button, itemStatus) {
    button.disabled = true;
    button.textContent = 'Жүктеліп жатыр…';
    itemStatus.textContent = '';
    try {
      const blob = await apiFetch(`/api/materials/${encodeURIComponent(material.id)}/download`, {blob: true});
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = String(material.filename || 'material').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_');
      link.className = 'hidden';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      itemStatus.textContent = 'Файл жүктеуге жіберілді.';
      itemStatus.className = 'material-item-status success';
    } catch (error) {
      itemStatus.textContent = error.message;
      itemStatus.className = 'material-item-status error';
    } finally {
      button.disabled = false;
      button.textContent = 'Жүктеп алу';
    }
  }

  function materialCard(material) {
    const card = document.createElement('article');
    card.className = 'material-item';
    const fileType = String(material.filename || '').split('.').pop().toUpperCase().slice(0, 6);
    const icon = document.createElement('span');
    icon.className = 'material-filetype';
    icon.textContent = fileType || 'FILE';
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    copy.className = 'material-copy';
    const title = document.createElement('h4');
    title.textContent = material.title;
    const meta = document.createElement('p');
    meta.textContent = `${material.filename} · ${sizeLabel(material.size_bytes)}`;
    copy.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'material-actions';
    const itemStatus = document.createElement('p');
    itemStatus.className = 'material-item-status';
    itemStatus.setAttribute('role', 'status');
    const downloadButton = makeButton('Жүктеп алу');
    downloadButton.setAttribute('aria-label', `${material.title} — жүктеп алу`);
    downloadButton.addEventListener('click', () => download(material, downloadButton, itemStatus));
    actions.append(downloadButton);
    card.append(icon, copy, actions, itemStatus);

    if (canManage) {
      const deleteButton = mutationButton('Жою', 'danger-quiet');
      deleteButton.setAttribute('aria-label', `${material.title} — жою`);
      actions.append(deleteButton);
      const confirm = document.createElement('div');
      confirm.className = 'delete-confirmation hidden';
      confirm.setAttribute('role', 'group');
      confirm.setAttribute('aria-label', 'Материалды жоюды растау');
      const prompt = document.createElement('p');
      prompt.textContent = `«${material.title}» материалын жоясыз ба? Файл мұғалімдерге енді қолжетімді болмайды.`;
      const confirmActions = document.createElement('div');
      confirmActions.className = 'material-actions';
      const cancel = mutationButton('Бас тарту');
      const remove = mutationButton('Иә, жою', 'danger');
      confirmActions.append(cancel, remove);
      confirm.append(prompt, confirmActions);
      card.append(confirm);
      deleteButton.addEventListener('click', () => {
        if (operation !== null) return;
        confirm.classList.remove('hidden');
        deleteButton.classList.add('hidden');
        cancel.focus();
      });
      const cancelDelete = () => {
        if (operation !== null) return;
        confirm.classList.add('hidden');
        deleteButton.classList.remove('hidden');
        deleteButton.focus();
      };
      cancel.addEventListener('click', cancelDelete);
      confirm.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !cancel.disabled) { event.preventDefault(); cancelDelete(); }
      });
      remove.addEventListener('click', async () => {
        if (!canManage || !beginOperation('delete')) return;
        remove.textContent = 'Жойылып жатыр…';
        let removed = false;
        try {
          await apiFetch(`/api/materials/${encodeURIComponent(material.id)}`, {method: 'DELETE'});
          materials = materials.filter(item => item.id !== material.id);
          render();
          status('Материал жойылды.');
          removed = true;
        } catch (error) {
          itemStatus.textContent = error.message;
          itemStatus.className = 'material-item-status error';
          remove.textContent = 'Иә, жою';
        } finally {
          setOperation(null);
          if (removed) {
            const nextControl = find('#materials-list button') || find('#material-upload [name="title"]');
            nextControl?.focus();
          }
        }
      });
    }
    return card;
  }

  function render() {
    const list = find('#materials-list');
    list.replaceChildren();
    const count = find('#materials-count');
    count.textContent = `${materials.length} материал`;
    count.classList.remove('hidden');
    if (!materials.length) {
      const empty = document.createElement('div');
      empty.className = 'materials-empty';
      const title = document.createElement('b');
      title.textContent = 'Бұл сабаққа материалдар әлі қосылмаған';
      const text = document.createElement('p');
      text.textContent = canManage ? 'Алғашқы ҚМЖ, слайд немесе құжатты төмендегі форма арқылы жүктеңіз.' : 'Әкімші ҚМЖ, слайдтар немесе құжаттар қосқан кезде олар осы жерде пайда болады.';
      empty.append(title, text);
      list.append(empty);
      return;
    }
    Object.entries(kinds).forEach(([kind, label]) => {
      const files = materials.filter(material => (Object.hasOwn(kinds, material.kind) ? material.kind : 'other') === kind);
      if (!files.length) return;
      const group = document.createElement('section');
      group.className = 'material-group';
      const heading = document.createElement('h3');
      heading.textContent = label;
      group.append(heading, ...files.map(materialCard));
      list.append(group);
    });
  }

  async function refresh() {
    if (!beginOperation('refresh')) return;
    find('#retry-materials').classList.add('hidden');
    status('Сабақ материалдары жүктеліп жатыр…');
    try {
      const data = await apiFetch(`/api/lessons/${encodeURIComponent(currentLesson)}/materials`);
      materials = data.materials;
      if (Number(data.max_file_size) > 0) maxFileSize = Number(data.max_file_size);
      if (Array.isArray(data.allowed_extensions) && data.allowed_extensions.length) {
        extensions = data.allowed_extensions.map(extension => String(extension).replace(/^\./, '').toLowerCase());
      }
      find('#material-upload [name="file"]').accept = extensions.map(extension => `.${extension}`).join(',');
      find('#upload-hint').textContent = `${extensions.map(extension => extension.toUpperCase()).join(', ')}. Ең көбі ${Math.round(maxFileSize / (1024 * 1024))} МБ.`;
      status('');
      render();
    } catch (error) {
      status(error.message, true);
      find('#retry-materials').classList.remove('hidden');
    } finally {
      setOperation(null);
    }
  }

  find('#retry-materials')?.addEventListener('click', refresh);
  find('#material-upload')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!canManage || operation !== null) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = body.get('file');
    const title = String(body.get('title') || '').trim();
    if (!title) { uploadStatus('Материал атауын енгізіңіз.', 'error'); form.elements.title.focus(); return; }
    if (!file || !file.size) { uploadStatus('Бос емес файлды таңдаңыз.', 'error'); form.elements.file.focus(); return; }
    if (file.size > maxFileSize) { uploadStatus(`Файл тым үлкен. Ең көбі ${Math.round(maxFileSize / (1024 * 1024))} МБ.`, 'error'); return; }
    if (!file.name.includes('.') || !extensions.includes(file.name.split('.').pop().toLowerCase())) { uploadStatus('Бұл файл түріне рұқсат жоқ. Төменде көрсетілген пішімдердің бірін таңдаңыз.', 'error'); return; }
    body.set('title', title);
    if (!beginOperation('upload')) return;
    uploadStatus('Файл серверге жүктеліп жатыр…');
    try {
      const data = await apiFetch(`/api/lessons/${encodeURIComponent(currentLesson)}/materials`, {method: 'POST', body});
      materials.unshift(data.material);
      render();
      status('');
      form.reset();
      uploadStatus('Материал қосылды. Мұғалімдер оны жүктеп ала алады.', 'success');
    } catch (error) { uploadStatus(error.message, 'error'); }
    finally {
      setOperation(null);
    }
  });

  function load(user, lessonId) {
    const canView = user.can_view_materials === true && (user.role === 'teacher' || user.role === 'admin');
    canManage = user.can_manage_materials === true && user.role === 'admin';
    currentLesson = lessonId;
    find('#lesson-materials').classList.toggle('hidden', !canView);
    find('#material-upload').classList.toggle('hidden', !canManage);
    if (canView) return refresh();
  }

  return {load};
})();

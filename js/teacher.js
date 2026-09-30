// Главная страница учителя: обзор курса — все уроки, их материалы (ҚМЖ, слайды) и инструменты.
(() => {
  const $ = selector => document.querySelector(selector);
  const TOOL_NAMES = {lab: 'Зертхана', ar: 'AR', vr: 'VR', '3d': '3D', file: 'Файл', link: 'Сілтеме'};
  const KIND_NAMES = {kmzh: 'ҚМЖ', slides: 'Слайдтар', worksheet: 'Жұмыс парағы', other: 'Басқа'};
  let cards = [];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function renderUser(user, course) {
    const name = user.display_name || user.username;
    $('#user-name').textContent = name;
    $('#user-handle').textContent = `Мұғалім · @${user.username}`;
    $('#avatar').textContent = name[0].toUpperCase();
    $('#course-name').textContent = course;
    $('#greeting').textContent = `Сәлеметсіз бе, ${name}!`;
    if (user.has_photo) {
      apiFetch('/api/profile-photo', {blob: true}).then(blob => {
        const img = document.createElement('img');
        img.alt = ''; img.src = URL.createObjectURL(blob);
        $('#avatar').replaceChildren(img);
      }).catch(() => {});
    }
  }

  function lessonCard(lesson, meta) {
    const card = el('article', 'lesson-card');
    const head = el('div', 'lesson-card-head');
    head.append(el('span', 'lesson-number', String(lesson.id)), el('small', '', meta.duration ? `Сабақ ${lesson.id} · ${meta.duration} мин` : `Сабақ ${lesson.id}`));
    const title = el('h3', '', lesson.title);
    const badges = el('div', 'lesson-badges');
    const materialsBadges = el('span', 'lesson-badges');
    materialsBadges.append(el('span', 'badge muted-badge', 'Материалдар жүктелуде…'));
    badges.append(materialsBadges);
    (meta.tools || []).forEach(tool => badges.append(el('span', 'badge tool-badge', TOOL_NAMES[tool.type] || TOOL_NAMES.link)));
    const actions = el('div', 'lesson-card-actions');
    const open = el('a', 'button primary', 'Сабақты ашу');
    open.href = `lesson.html?lesson=${lesson.id}`;
    const test = el('a', 'button secondary', 'Сыныптық тест');
    test.href = `lesson.html?lesson=${lesson.id}#class-test`;
    actions.append(open, test);
    card.append(head, title, badges, actions);
    return {card, materialsBadges, hasKmzh: false};
  }

  function showMaterials(entry, materials) {
    entry.materialsBadges.replaceChildren();
    const counts = {};
    materials.forEach(item => { const kind = KIND_NAMES[item.kind] ? item.kind : 'other'; counts[kind] = (counts[kind] || 0) + 1; });
    entry.hasKmzh = Boolean(counts.kmzh);
    if (!materials.length) entry.materialsBadges.append(el('span', 'badge muted-badge', 'Материал жоқ'));
    Object.entries(counts).forEach(([kind, count]) => {
      entry.materialsBadges.append(el('span', 'badge material-badge', count > 1 ? `${KIND_NAMES[kind]} · ${count}` : KIND_NAMES[kind]));
    });
  }

  function applyFilter() {
    const onlyReady = $('#filter-ready').checked;
    cards.forEach(entry => entry.card.classList.toggle('hidden', onlyReady && !entry.hasKmzh));
  }

  async function boot() {
    if (!getToken()) { location.replace('index.html'); return; }
    let data;
    try { data = await apiFetch('/api/lesson?lesson=1'); }
    catch (error) { $('#dashboard-status').textContent = error.message; return; }
    const {user, lessons, course} = data;
    if (user.role !== 'teacher' && user.role !== 'admin') { location.replace('lesson.html'); return; }
    renderUser(user, course);

    let catalog = [];
    try {
      const res = await fetch('lessons.json', {cache: 'no-cache'});
      const json = await res.json();
      catalog = (Array.isArray(json) ? json : json.lessons) || [];
    } catch {}
    const metaOf = id => {
      const item = catalog[id - 1] || {};
      return {duration: item.duration, tools: (item.tools || []).filter(t => t && t.title && t.url)};
    };

    $('#stat-lessons').textContent = lessons.length;
    $('#stat-tools').textContent = lessons.reduce((sum, lesson) => sum + metaOf(lesson.id).tools.length, 0);
    const list = $('#lesson-cards');
    cards = lessons.map(lesson => lessonCard(lesson, metaOf(lesson.id)));
    list.replaceChildren(...cards.map(entry => entry.card));

    if (user.can_view_materials !== true) {
      cards.forEach(entry => entry.materialsBadges.replaceChildren());
      $('#stat-materials').textContent = '—';
      return;
    }
    let total = 0;
    await Promise.all(lessons.map(async (lesson, index) => {
      try {
        const res = await apiFetch(`/api/lessons/${encodeURIComponent(lesson.id)}/materials`);
        total += res.materials.length;
        showMaterials(cards[index], res.materials);
      } catch { cards[index].materialsBadges.replaceChildren(el('span', 'badge muted-badge', 'Жүктелмеді')); }
    }));
    $('#stat-materials').textContent = total;
    applyFilter();
  }

  $('#filter-ready').addEventListener('change', applyFilter);
  $('#logout').addEventListener('click', () => { clearToken(); location.replace('index.html'); });
  boot();
})();

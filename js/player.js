let player;
let timer;
let videoId = null;
let lessonId = 1;
let lessonData = null;
let ytReady = false;
let activeTest = null;
let lastSavedTime = -1;
const $ = (selector) => document.querySelector(selector);
const isTeacherRole = () => lessonData?.user.role === 'teacher' || lessonData?.user.role === 'admin';

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function onYouTubeIframeAPIReady() { ytReady = true; initPlayer(); }

function initPlayer() {
  if (!ytReady || !lessonData || player) return;
  player = new YT.Player('player', {
    width: '100%', height: '100%', videoId,
    playerVars: {rel: 0, modestbranding: 1, playsinline: 1},
    events: {
      onReady: () => {
        $('#video-loader')?.remove();
        updateTime();
        timer = setInterval(updateTime, 1000);
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED && !isTeacherRole()) openTest();
      }
    }
  });
}

function currentSeconds() {
  return player?.getCurrentTime ? Math.floor(player.getCurrentTime()) : 0;
}

function updateTime() {
  const time = currentSeconds();
  const label = formatTime(time);
  $('#time-label').textContent = label;
  $('#context-time').textContent = `Контекст · ${label}`;
  if (!isTeacherRole() && time > 0 && time % 10 === 0 && time !== lastSavedTime) {
    lastSavedTime = time;
    apiFetch('/api/progress', {method:'POST', body:{lesson_id:lessonId, timestamp:time}}).catch(() => {});
  }
}

function addMessage(text, type='assistant') {
  const box = $('#chat-box');
  const node = document.createElement('div');
  node.className = `message ${type}`;
  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = type === 'user' ? 'Сіз' : type === 'error' ? 'Қате' : isTeacherRole() ? 'Көмекші' : 'Тәлімгер';
  const body = document.createElement('p');

  // Если сообщение от ассистента — парсим Markdown через marked, иначе выводим как простой текст
  if (type === 'assistant') {
    body.innerHTML = renderMarkdown(text);
  } else {
    body.textContent = text;
  }

  node.append(label, body);
  box.append(node);
  box.scrollTop = box.scrollHeight;
  return node;
}

async function sendMessage(forcedText) {
  const input = $('#user-input');
  const question = (forcedText || input.value).trim();
  if (!question) return;
  const time = currentSeconds();
  addMessage(question, 'user');
  input.value = '';
  input.style.height = 'auto';
  const pending = addMessage('Үзіндіні талдап, түсініктеме дайындап жатырмын…');
  pending.classList.add('pending');
  try {
    const data = await apiFetch('/api/ask_ai', {method:'POST', body:{question, timestamp:time, lesson_id:lessonId}});
    pending.querySelector('p').innerHTML = renderMarkdown(data.answer);

    pending.classList.remove('pending');
  } catch (error) {
    pending.remove(); addMessage(error.message, 'error');
  }
}

$('#pause-ask')?.addEventListener('click', () => {
  player?.pauseVideo?.();
  const input = $('#user-input');
  const time = formatTime(currentSeconds());
  input.value = isTeacherRole()
    ? `${time} уақытындағы үзінді бойынша оқушыларға 3 талқылау сұрағын құрастыр.`
    : `Мен ${time} уақытындағы үзіндіні түсінбедім. Оны қарапайымдау түсіндір.`;
  input.focus();
});

$('#chat-form')?.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
$('#user-input')?.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
$('#user-input')?.addEventListener('input', event => {
  event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
});
$('#chat-box')?.addEventListener('click', event => {
  const button = event.target.closest('.suggestion');
  if (button) sendMessage(button.dataset.question);
});
$('#clear-chat')?.addEventListener('click', () => {
  $('#chat-box').replaceChildren();
  addMessage('Чат тазаланды. Мен сабақтың ағымдағы тайм-кодын әлі де көріп тұрмын.');
});

async function openTest() {
  if (!lessonData || isTeacherRole()) return;
  const modal = $('#test-modal');
  modal.classList.remove('hidden');
  $('#test-content').innerHTML = '<div class="loading-state">ЖИ сабақ материалдары бойынша 5 сұрақ дайындап жатыр…</div>';
  try {
    const data = await apiFetch('/api/generate_test', {method:'POST', body:{lesson_id:lessonId}});
    activeTest = data;
    renderTest(data.questions);
  } catch (error) {
    $('#test-content').textContent = error.message;
  }
}

function renderTest(questions) {
  const content = $('#test-content');
  content.replaceChildren();
  const form = document.createElement('form');
  questions.forEach((question, index) => {
    const card = document.createElement('section');
    card.className = 'question-card';
    const title = document.createElement('h3');
    title.textContent = `${index + 1}. ${question.question}`;
    card.append(title);
    question.options.forEach((option, optionIndex) => {
      const label = document.createElement('label');
      label.className = 'option';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = String(question.id); input.value = String(optionIndex); input.required = true;
      const text = document.createElement('span'); text.textContent = option;
      label.append(input, text); card.append(label);
    });
    form.append(card);
  });
  const actions = document.createElement('div'); actions.className = 'test-actions';
  const submit = document.createElement('button'); submit.className = 'button primary'; submit.type = 'submit'; submit.textContent = 'Жауаптарды тексеру →';
  actions.append(submit); form.append(actions);
  form.addEventListener('submit', submitTest);
  content.append(form);
}

async function submitTest(event) {
  event.preventDefault();
  const answers = Object.fromEntries(new FormData(event.currentTarget));
  $('#test-content').innerHTML = '<div class="loading-state">Жауаптар тексеріліп жатыр…</div>';
  try {
    renderResult(await apiFetch('/api/submit_test', {method:'POST', body:{answers, attempt_id:activeTest.attempt_id}}));
  } catch (error) { $('#test-content').textContent = error.message; }
}

function renderResult(result) {
  const content = $('#test-content'); content.replaceChildren();
  const score = document.createElement('div'); score.className = `result-score ${result.passed ? 'passed' : ''}`;
  score.innerHTML = `<strong>${result.score}%</strong><b>${result.passed ? 'Сабақ өтілді' : 'Тағы біраз жаттығу керек'}</b><p>${result.passed ? 'Келесі сабақ ашылды.' : 'Белгіленген үзінділерді қайталап, тестті қайта тапсырып көріңіз.'}</p>`;
  content.append(score);
  result.details.filter(item => !item.correct).forEach(item => {
    const review = document.createElement('div'); review.className = 'review-item';
    const title = document.createElement('b'); title.textContent = `${item.id}-сұрақ: дұрыс жауап — ${item.correct_option}`;
    const explanation = document.createElement('p'); explanation.textContent = item.explanation;
    const link = document.createElement('a'); link.href = '#'; link.textContent = `Қайталау: ${formatTime(item.timestamp)} →`;
    link.addEventListener('click', event => { event.preventDefault(); $('#test-modal').classList.add('hidden'); player?.seekTo?.(item.timestamp, true); player?.playVideo?.(); });
    review.append(title, explanation, link); content.append(review);
  });
  const actions = document.createElement('div'); actions.className = 'test-actions';
  const button = document.createElement('button'); button.className = 'button primary'; button.textContent = result.passed ? 'Әрі қарай өту →' : 'Қайта тапсыру';
  button.addEventListener('click', () => result.passed ? location.assign(`lesson.html?lesson=${Math.min(lessonId + 1, result.unlocked_lesson)}`) : openTest());
  actions.append(button); content.append(actions);
}

$('#generate-test')?.addEventListener('click', openTest);
$('#close-test')?.addEventListener('click', () => $('#test-modal').classList.add('hidden'));
$('#test-modal')?.addEventListener('click', event => { if (event.target.id === 'test-modal') event.currentTarget.classList.add('hidden'); });
window.addEventListener('beforeunload', () => clearInterval(timer));

(function initChatHeightSync() {
  const video = document.querySelector('.video-card');
  const assistant = document.querySelector('.assistant-card');
  if (!video || !assistant) return;

  function syncHeight() {
    assistant.style.height = window.matchMedia('(min-width: 1101px)').matches ? `${video.offsetHeight}px` : '';
  }

  syncHeight();
  window.addEventListener('load', syncHeight);
  window.addEventListener('resize', syncHeight);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncHeight).observe(video);
  }
})();

(function initSidebarToggle() {
  const workspace = $('#workspace');
  const toggleButton = $('#toggle-sidebar');
  if (!workspace || !toggleButton) return;
  const STORAGE_KEY = 'sidebarCollapsed';

  function applyState(collapsed) {
    workspace.classList.toggle('sidebar-collapsed', collapsed);
    toggleButton.setAttribute('aria-pressed', String(collapsed));
    toggleButton.title = collapsed ? 'Сабақтарды көрсету' : 'Сабақтарды жасыру';
  }

  applyState(localStorage.getItem(STORAGE_KEY) === '1');

  toggleButton.addEventListener('click', () => {
    const collapsed = !workspace.classList.contains('sidebar-collapsed');
    applyState(collapsed);
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  });
})();


function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(String(text)));
}

function renderLesson(data) {
  const {user, lesson, lessons} = data;
  const isTeacher = user.role === 'teacher' || user.role === 'admin';
  lessonId = data.lesson_id;
  videoId = lesson.video_id;
  const name = user.display_name || user.username;
  document.title = `${lesson.title} — Molekula`;
  $('#user-name').textContent = name;
  const roleLabel = user.role === 'admin' ? 'Әкімші' : isTeacher ? 'Мұғалім' : 'Оқушы';
  $('#user-handle').textContent = `${roleLabel} · @${user.username}`;
  $('#avatar').textContent = name[0].toUpperCase();
  if (user.has_photo) {
    apiFetch('/api/profile-photo', {blob: true}).then(blob => {
      const img = document.createElement('img');
      img.alt = ''; img.src = URL.createObjectURL(blob);
      $('#avatar').replaceChildren(img);
    }).catch(() => {});
  }
  $('#course-name').textContent = data.course;
  $('#sidebar-title').textContent = isTeacher ? 'Сабақ жоспары' : 'Сіздің үлгеріміңіз';
  $('.progress-track').classList.toggle('hidden', isTeacher);
  $('#student-completion').classList.toggle('hidden', isTeacher);
  $('#progress-bar').style.width = `${lessons.length ? Math.round(user.completed / lessons.length * 100) : 0}%`;
  $('#lesson-eyebrow').textContent = lesson.duration ? `Сабақ ${lessonId} · ${lesson.duration} минут` : `Сабақ ${lessonId}`;
  $('#lesson-title').textContent = lesson.title;
  const state = $('#lesson-state');
  state.classList.toggle('passed', !isTeacher && data.progress.passed);
  state.textContent = isTeacher ? 'Барлық сабақтар ашық' : data.progress.passed ? '✓ Өтілді' : 'Жүріп жатыр';

  const list = $('#lesson-list');
  list.replaceChildren();
  lessons.forEach(item => {
    const locked = !isTeacher && item.id > user.unlocked_lesson;
    const link = document.createElement('a');
    link.dataset.id = item.id;
    link.className = 'lesson-item' + (item.id === lessonId ? ' active' : '') + (locked ? ' locked' : '');
    if (locked) link.setAttribute('aria-disabled', 'true');
    else link.href = `lesson.html?lesson=${item.id}`;
    if (item.id === lessonId) link.setAttribute('aria-current', 'page');
    const number = document.createElement('span');
    number.className = 'lesson-number';
    number.textContent = !isTeacher && item.passed ? '✓' : locked ? '⌑' : String(item.id);
    const copy = document.createElement('span');
    const small = document.createElement('small'); small.textContent = `Сабақ ${item.id}`;
    const title = document.createElement('b'); title.textContent = item.title;
    copy.append(small, title);
    link.append(number, copy);
    list.append(link);
  });
}

// Инструменты урока (лаборатория, AR, 3D-модель…) берутся из поля "tools" урока в lessons.json.
// Бэкенд это поле не использует, поэтому оно читается напрямую с GitHub Pages.
const TOOL_ICONS = {lab: '⚗', ar: '◈', vr: '◈', '3d': '⬡', file: '⤓', link: '↗'};

let catalogPromise = null;
function loadCatalog() {
  catalogPromise ??= fetch('lessons.json', {cache: 'no-cache'})
    .then(res => res.json())
    .then(catalog => (Array.isArray(catalog) ? catalog : catalog.lessons) || [])
    .catch(() => []);
  return catalogPromise;
}

const lessonTools = lesson => (lesson?.tools || []).filter(t => t && t.title && t.url);

async function renderTools(id) {
  const box = $('#lesson-tools');
  if (!box) return;
  const tools = lessonTools((await loadCatalog())[id - 1]);
  box.classList.toggle('hidden', !tools.length);
  if (isTeacherRole()) {
    $('#nav-tools').textContent = tools.length ? `${tools.length} құрал · QR-кодпен` : 'Бұл сабақта жоқ';
    $('#nav-tools-link').classList.toggle('disabled', !tools.length);
  }
  const list = $('#tool-list');
  list.replaceChildren();
  tools.forEach(tool => {
    const link = document.createElement('a');
    link.className = 'tool';
    if (/^https?:/i.test(tool.url)) {
      link.href = tool.url; link.target = '_blank'; link.rel = 'noreferrer';
    } else {
      const url = new URL(tool.url, location.href);
      url.searchParams.set('lesson', id);   // чтобы «Сабаққа оралу» вернула в этот урок
      link.href = url.pathname + url.search + url.hash;
    }
    const icon = document.createElement('span');
    icon.className = 'tool-icon';
    icon.textContent = TOOL_ICONS[tool.type] || TOOL_ICONS.link;
    const copy = document.createElement('span');
    const title = document.createElement('b'); title.textContent = tool.title;
    copy.append(title);
    if (tool.note) { const note = document.createElement('small'); note.textContent = tool.note; copy.append(note); }
    link.append(icon, copy);
    list.append(link);
  });
  const arTool = tools.find(t => ['ar', '3d'].includes(t.type) && !/^https?:/i.test(t.url));
  if (arTool) renderToolQr(list, arTool, id);
}

// QR-код AR-инструмента: учитель открывает урок на компьютере, ученик сканирует и смотрит модель в AR на телефоне.
function loadQrLib() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
}

async function renderToolQr(list, tool, id) {
  try { await loadQrLib(); } catch { return; }
  const url = new URL(tool.url, location.href);
  url.searchParams.set('lesson', id);
  const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
  const box = document.createElement('div');
  box.className = 'tool-qr';
  box.innerHTML = qr.createSvgTag({cellSize: 3, margin: 0});
  const text = document.createElement('span');
  const title = document.createElement('b'); title.textContent = isTeacherRole() ? 'Оқушыларға экраннан көрсетіңіз' : 'Телефонмен сканерле';
  const note = document.createElement('small'); note.textContent = isTeacherRole() ? 'Оқушылар телефонмен сканерлейді — AR модель бірден ашылады' : 'AR ашылады: камераға рұқсат бер де, модельді партаға қой';
  text.append(title, note);
  box.append(text);
  list.append(box);
}

// Режим учителя: другой порядок блоков, панель быстрых действий, подготовка к уроку вместо прохождения.
const TOOL_NAMES = {lab: 'зертхана', ar: 'AR', vr: 'VR', '3d': '3D', file: 'файл', link: 'сілтеме'};

function setupTeacherMode(data) {
  document.body.classList.add('teacher-mode');
  $('#role-badge').classList.remove('hidden');
  $('#lesson-state').classList.add('hidden');
  $('#teacher-actions').classList.remove('hidden');
  $('#teacher-nav').classList.remove('hidden');
  $('#nav-duration').textContent = data.lesson.duration ? `${data.lesson.duration} мин · проекторға` : 'Проекторға шығару';
  $('#sidebar-tip').textContent = 'Сабақты таңдаңыз: бейне, ҚМЖ, слайдтар және құралдар бір бетте. Барлық сабақтар ашық.';

  // Материалы (ҚМЖ, слайды) — главное для учителя, поэтому сразу после видео.
  const area = $('.lesson-area');
  area.insertBefore($('#lesson-materials'), $('#lesson-tools'));
  $('#materials-title').textContent = 'Сабаққа дайындық материалдары';

  $('#tools-eyebrow').textContent = 'Сыныпта қолдану';
  $('#tools-title').textContent = 'Интерактив құралдар';
  $('#pause-ask').innerHTML = '<span aria-hidden="true">?</span> Осы үзінді бойынша сұрақтар';

  $('#assistant-name').textContent = 'Мұғалімнің ЖИ-көмекшісі';
  const suggestions = [
    ['Сабақ жоспары', 'Осы сабаққа 45 минуттық қысқаша сабақ жоспарын құр: мақсат, кезеңдер, уақыт.'],
    ['Талқылау сұрақтары', 'Сабақ бойынша оқушылармен талқылауға 5 сұрақ құрастыр, жауаптарымен.'],
    ['Үй тапсырмасы', 'Осы сабақ бойынша үй тапсырмасын ұсын: 3 деңгейлі (жеңіл, орташа, күрделі).'],
    ['Жиі қателер', 'Оқушылар осы тақырыпта қандай қателер жібереді және оларды қалай түзетуге болады?']
  ];
  const box = $('#chat-box');
  box.replaceChildren();
  addMessage('Мен сабаққа дайындалуға көмектесемін: жоспар, сұрақтар, үй тапсырмасы. Бейненің кез келген сәтін тоқтатып, сол үзінді туралы сұраңыз.');
  suggestions.forEach(([label, question]) => {
    const button = document.createElement('button');
    button.className = 'suggestion';
    button.dataset.question = question;
    button.textContent = `${label} `;
    const arrow = document.createElement('span'); arrow.textContent = '→';
    button.append(arrow);
    box.append(button);
  });
  $('#user-input').placeholder = 'Мысалы: осы тақырыпқа сергіту сәтін ойлап тап…';

  document.addEventListener('materials:count', event => {
    const count = event.detail;
    $('#nav-materials').textContent = count ? `${count} материал` : 'Әзірге жоқ';
  });

  loadCatalog().then(lessons => {
    document.querySelectorAll('#lesson-list .lesson-item').forEach(link => {
      const item = lessons[Number(link.dataset.id) - 1];
      if (!item) return;
      const parts = [];
      if (item.duration) parts.push(`${item.duration} мин`);
      lessonTools(item).forEach(tool => parts.push(TOOL_NAMES[tool.type] || TOOL_NAMES.link));
      link.querySelector('small').textContent = [`Сабақ ${link.dataset.id}`, ...new Set(parts)].join(' · ');
    });
  });
}

// «Сыныпта көрсету»: видео на весь экран для проектора.
$('#present-lesson')?.addEventListener('click', () => {
  const frame = $('.video-frame');
  const request = frame.requestFullscreen || frame.webkitRequestFullscreen;
  if (request) request.call(frame).catch?.(() => {});
  player?.playVideo?.();
});

function lessonShareUrl() {
  const url = new URL('lesson.html', location.href);
  url.search = `?lesson=${lessonId}`;
  return url.href;
}

$('#share-lesson')?.addEventListener('click', async () => {
  const modal = $('#share-modal');
  const url = lessonShareUrl();
  $('#share-url').value = url;
  $('#share-status').textContent = '';
  modal.classList.remove('hidden');
  $('#copy-share').focus();
  try {
    await loadQrLib();
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    $('#share-qr').innerHTML = qr.createSvgTag({cellSize: 6, margin: 0});
  } catch { $('#share-qr').classList.add('hidden'); }
});
$('#copy-share')?.addEventListener('click', async () => {
  const input = $('#share-url');
  try { await navigator.clipboard.writeText(input.value); }
  catch { input.select(); document.execCommand?.('copy'); }
  $('#share-status').textContent = 'Сілтеме көшірілді — чатқа немесе Classroom-ға қойыңыз.';
});
const closeShare = () => $('#share-modal').classList.add('hidden');
$('#close-share')?.addEventListener('click', closeShare);
$('#share-modal')?.addEventListener('click', event => { if (event.target.id === 'share-modal') closeShare(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#share-modal').classList.contains('hidden')) closeShare();
});

$('#logout')?.addEventListener('click', () => { clearToken(); location.replace('index.html'); });

(async function boot() {
  if (!getToken()) { location.replace(`index.html${location.search}`); return; }
  const requested = new URLSearchParams(location.search).get('lesson') || 1;
  try {
    lessonData = await apiFetch(`/api/lesson?lesson=${encodeURIComponent(requested)}`);
  } catch (error) {
    $('#video-loader p').textContent = error.message;
    return;
  }
  renderLesson(lessonData);
  if (isTeacherRole()) setupTeacherMode(lessonData);
  renderTools(lessonId);
  LessonMaterials.load(lessonData.user, lessonId);
  initPlayer();
})();

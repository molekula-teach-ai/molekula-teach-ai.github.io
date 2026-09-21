let player;
let timer;
let videoId = null;
let lessonId = 1;
let lessonData = null;
let ytReady = false;
let activeTest = null;
const $ = (selector) => document.querySelector(selector);

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
        if (event.data === YT.PlayerState.ENDED) openTest();
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
  if (time > 0 && time % 10 === 0) {
    apiFetch('/api/progress', {method:'POST', body:{lesson_id:lessonId, timestamp:time}}).catch(() => {});
  }
}

function addMessage(text, type='assistant') {
  const box = $('#chat-box');
  const node = document.createElement('div');
  node.className = `message ${type}`;
  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = type === 'user' ? 'Сіз' : type === 'error' ? 'Қате' : 'Тәлімгер';
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
    const data = await apiFetch('/api/ask_ai', {method:'POST', body:{question, timestamp:time, video_id:videoId, lesson_id:lessonId}});
    pending.querySelector('p').innerHTML = renderMarkdown(data.answer);

    pending.classList.remove('pending');
  } catch (error) {
    pending.remove(); addMessage(error.message, 'error');
  }
}

$('#pause-ask')?.addEventListener('click', () => {
  player?.pauseVideo?.();
  const input = $('#user-input');
  input.value = `Мен ${formatTime(currentSeconds())} уақытындағы үзіндіні түсінбедім. Оны қарапайымдау түсіндір.`;
  input.focus();
});

$('#chat-form')?.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
$('#user-input')?.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
$('#user-input')?.addEventListener('input', event => {
  event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
});
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => sendMessage(button.dataset.question)));
$('#clear-chat')?.addEventListener('click', () => {
  $('#chat-box').replaceChildren();
  addMessage('Чат тазаланды. Мен сабақтың ағымдағы тайм-кодын әлі де көріп тұрмын.');
});

async function openTest() {
  const modal = $('#test-modal');
  modal.classList.remove('hidden');
  $('#test-content').innerHTML = '<div class="loading-state">ЖИ сабақ материалдары бойынша 5 сұрақ дайындап жатыр…</div>';
  try {
    const data = await apiFetch('/api/generate_test', {method:'POST', body:{video_id:videoId, lesson_id:lessonId}});
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
    assistant.style.height = `${video.offsetHeight}px`;
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
  lessonId = data.lesson_id;
  videoId = lesson.video_id;
  const name = user.display_name || user.username;
  document.title = `${lesson.title} — Molekula`;
  $('#user-name').textContent = name;
  $('#user-handle').textContent = `@${user.username}`;
  $('#avatar').textContent = name[0].toUpperCase();
  if (user.has_photo) {
    apiFetch('/api/profile-photo', {blob: true}).then(blob => {
      const img = document.createElement('img');
      img.alt = ''; img.src = URL.createObjectURL(blob);
      $('#avatar').replaceChildren(img);
    }).catch(() => {});
  }
  $('#progress-bar').style.width = `${Math.round((user.unlocked_lesson - 1) / lessons.length * 100)}%`;
  $('#lesson-eyebrow').textContent = `Сабақ ${lessonId} · 24 минут`;
  $('#lesson-title').textContent = lesson.title;
  const state = $('#lesson-state');
  state.classList.toggle('passed', data.progress.passed);
  state.textContent = data.progress.passed ? '✓ Өтілді' : 'Жүріп жатыр';

  const list = $('#lesson-list');
  list.replaceChildren();
  lessons.forEach(item => {
    const link = document.createElement('a');
    link.className = 'lesson-item' + (item.id === lessonId ? ' active' : '') + (item.id > user.unlocked_lesson ? ' locked' : '');
    link.href = `lesson.html?lesson=${item.id}`;
    const number = document.createElement('span');
    number.className = 'lesson-number';
    number.textContent = item.id < user.unlocked_lesson ? '✓' : item.id > user.unlocked_lesson ? '⌑' : String(item.id);
    const copy = document.createElement('span');
    const small = document.createElement('small'); small.textContent = `Сабақ ${item.id}`;
    const title = document.createElement('b'); title.textContent = item.title;
    copy.append(small, title);
    link.append(number, copy);
    list.append(link);
  });
}

$('#logout')?.addEventListener('click', () => { clearToken(); location.replace('index.html'); });

(async function boot() {
  if (!getToken()) { location.replace('index.html'); return; }
  const requested = new URLSearchParams(location.search).get('lesson') || 1;
  try {
    lessonData = await apiFetch(`/api/lesson?lesson=${encodeURIComponent(requested)}`);
  } catch (error) {
    $('#video-loader p').textContent = error.message;
    return;
  }
  renderLesson(lessonData);
  initPlayer();
})();

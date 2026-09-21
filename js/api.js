const TOKEN_KEY = 'molekula_token';

const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (token) => { try { localStorage.setItem(TOKEN_KEY, token); } catch {} };
const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

async function apiFetch(path, {method = 'GET', body, blob = false} = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(window.APP_CONFIG.apiBase + path, {method, headers, body: body !== undefined ? JSON.stringify(body) : undefined});
  } catch {
    throw new Error('Серверге қосылу мүмкін болмады');
  }
  if (res.status === 401 && token) {
    clearToken();
    location.replace('index.html');
    throw new Error('Авторизация қажет');
  }
  if (blob) {
    if (!res.ok) throw new Error('Жүктеу мүмкін болмады');
    return res.blob();
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || 'Сұранысты орындау мүмкін болмады');
  return data;
}

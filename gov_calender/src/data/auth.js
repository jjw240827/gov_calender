// 인증 / 관심 API 클라이언트 (PROJECT_SPEC.md §9)
// API 서버(npm run api)가 떠 있어야 동작. 미실행 시 로그인 기능만 비활성(조회는 폴백).
const API = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_KEY = 'gov_cal_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* noop */ }
};

const NO_API =
  '로그인 서버에 연결할 수 없습니다. 터미널에서 `npm run api` 를 실행한 뒤 다시 시도하세요. ' +
  '(공고 조회는 서버 없이도 계속 동작합니다.)';

async function req(path, { method = 'GET', body, token = getToken() } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // fetch 자체 실패(서버 미실행/타임아웃/네트워크)
    throw new Error(NO_API);
  }
  // 프록시가 502/504 를 돌려주는 경우도 서버 미실행으로 간주
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new Error(NO_API);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

/** 관심 목록 배열 → { [id]: {notify} } 맵 */
export const favoritesToMap = (arr = []) =>
  Object.fromEntries(arr.map((f) => [f.announcementId, { notify: !!f.notify }]));

export async function register(email, password, profile) {
  const d = await req('/auth/register', { method: 'POST', body: { email, password, profile } });
  setToken(d.token);
  return d;
}
export async function login(email, password) {
  const d = await req('/auth/login', { method: 'POST', body: { email, password } });
  setToken(d.token);
  return d;
}
export async function logout() {
  try { await req('/auth/logout', { method: 'POST' }); } catch { /* noop */ }
  setToken(null);
}
export const fetchMe = () => req('/auth/me');
export const saveProfile = (profile) => req('/auth/profile', { method: 'PUT', body: { profile } });
export const toggleFavorite = (announcementId, on) =>
  req('/favorites', { method: 'POST', body: { announcementId, on } });
export const setNotify = (announcementId, notify) =>
  req(`/favorites/${encodeURIComponent(announcementId)}/notify`, { method: 'PUT', body: { notify } });

// 경량 조회 API — node:http (PROJECT_SPEC.md §3.5)
//   npm run api            → http://localhost:5178
// Vite dev 서버에서 /api 프록시로 연결 (vite.config.js 참조)
import { createServer } from 'node:http';
import {
  listAnnouncements, getAnnouncement, getMeta,
  createUser, verifyUser, createSession, userForToken, deleteSession, updateUserProfile,
  listFavorites, setFavorite, setFavoriteNotify,
} from './db/index.js';
import { searchAnnouncements } from './lib/match.js';

const PORT = process.env.API_PORT || 5178;

// 크롤 결과는 자주 안 바뀌므로 프로세스 캐시(60초)
let cache = { at: 0, rows: [] };
function allRows() {
  if (Date.now() - cache.at > 60_000) {
    cache = { at: Date.now(), rows: listAnnouncements({ benefitOnly: false }) };
  }
  return cache.rows;
}

const json = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(body));
};

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || null;
const requireUser = (req) => userForToken(bearer(req));

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname, searchParams } = url;

  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    if (pathname === '/api/meta') {
      return json(res, 200, {
        lastCrawlAt: getMeta('last_crawl_at'),
        stats: safe(getMeta('last_crawl_stats')),
        categories: ['welfare', 'youth', 'housing', 'job', 'childcare', 'business', 'subsidy'],
      });
    }

    const detailMatch = pathname.match(/^\/api\/announcements\/(.+)$/);
    if (detailMatch) {
      const row = getAnnouncement(decodeURIComponent(detailMatch[1]));
      return row ? json(res, 200, row) : json(res, 404, { error: 'not found' });
    }

    if (pathname === '/api/announcements' && req.method === 'GET') {
      const rows = searchAnnouncements(allRows(), {
        keyword: searchParams.get('keyword') || '',
        categories: paramList(searchParams, 'category'),
        status: searchParams.get('status') || 'all',
        month: searchParams.get('month') || null,
        benefitOnly: searchParams.get('benefitOnly') !== 'false',
      });
      return json(res, 200, { count: rows.length, announcements: rows });
    }

    if (pathname === '/api/ai-search' && req.method === 'POST') {
      const { query } = await readBody(req);
      if (!query || !query.trim()) return json(res, 400, { error: '검색어를 입력하세요.' });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return json(res, 501, { error: 'AI 검색 미설정: 서버에 GEMINI_API_KEY 환경변수가 필요합니다.' });
      }

      const rows = allRows().filter((a) => a.isBenefit);
      const catalog = rows.map((a) => ({
        id: a.id, title: a.title, category: a.category,
        department: a.department, summary: (a.bodyText || '').slice(0, 200),
      }));
      const prompt = `아래는 화성시 정부 지원금/혜택 공고 목록입니다. 사용자 질문과 가장 관련 있는 공고의 id를 관련도 높은 순으로 골라 배열로 반환하세요. 관련 있는 공고가 없으면 빈 배열을 반환하세요.\n\n질문: "${query}"\n\n공고 목록(JSON):\n${JSON.stringify(catalog)}`;

      try {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
              },
            }),
            signal: AbortSignal.timeout(20000),
          },
        );
        if (!gRes.ok) throw new Error(`Gemini HTTP ${gRes.status}`);
        const gData = await gRes.json();
        const text = gData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const ids = JSON.parse(text);
        const byId = new Map(rows.map((a) => [a.id, a]));
        const matched = ids.map((id) => byId.get(id)).filter(Boolean);
        return json(res, 200, { count: matched.length, announcements: matched });
      } catch (err) {
        return json(res, 502, { error: `AI 검색 실패: ${err.message}` });
      }
    }

    // ===== 인증 =====
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const { email, password, profile } = await readBody(req);
      try {
        const user = createUser(email, password, profile || {});
        const token = createSession(user.id);
        return json(res, 200, { token, user, favorites: [] });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = await readBody(req);
      const user = verifyUser(email, password);
      if (!user) return json(res, 401, { error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
      const token = createSession(user.id);
      return json(res, 200, { token, user, favorites: listFavorites(user.id) });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      deleteSession(bearer(req));
      return json(res, 200, {});
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = requireUser(req);
      if (!user) return json(res, 401, { error: '로그인이 필요합니다.' });
      return json(res, 200, { user, favorites: listFavorites(user.id) });
    }

    if (pathname === '/api/auth/profile' && req.method === 'PUT') {
      const user = requireUser(req);
      if (!user) return json(res, 401, { error: '로그인이 필요합니다.' });
      const { profile } = await readBody(req);
      return json(res, 200, { profile: updateUserProfile(user.id, profile || {}) });
    }

    // ===== 관심 / 알람 =====
    if (pathname === '/api/favorites') {
      const user = requireUser(req);
      if (!user) return json(res, 401, { error: '로그인이 필요합니다.' });

      if (req.method === 'GET') return json(res, 200, { favorites: listFavorites(user.id) });

      if (req.method === 'POST') {
        const { announcementId, on = true } = await readBody(req);
        if (!announcementId) return json(res, 400, { error: 'announcementId 필요' });
        return json(res, 200, { favorites: setFavorite(user.id, announcementId, !!on) });
      }
    }

    const favNotify = pathname.match(/^\/api\/favorites\/([^/]+)\/notify$/);
    if (favNotify && req.method === 'PUT') {
      const user = requireUser(req);
      if (!user) return json(res, 401, { error: '로그인이 필요합니다.' });
      const { notify } = await readBody(req);
      try {
        return json(res, 200, { favorites: setFavoriteNotify(user.id, decodeURIComponent(favNotify[1]), !!notify) });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    if (pathname === '/api/match' && req.method === 'POST') {
      const { profile = null, filters = {} } = await readBody(req);
      const rows = searchAnnouncements(allRows(), {
        ...filters,
        profile,
        interests: filters.interests || [],
        includeIneligible: filters.includeIneligible !== false,
      });
      return json(res, 200, { count: rows.length, announcements: rows });
    }

    json(res, 404, { error: 'unknown route' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message });
  }
});

const paramList = (sp, key) =>
  sp.getAll(key).flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
const safe = (s) => { try { return JSON.parse(s); } catch { return null; } };

server.listen(PORT, () => console.log(`API ▶ http://localhost:${PORT}/api/announcements`));

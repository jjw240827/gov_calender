// 경량 조회 API — node:http (PROJECT_SPEC.md §3.5)
//   npm run api            → http://localhost:5178
// Vite dev 서버에서 /api 프록시로 연결 (vite.config.js 참조)
import { createServer } from 'node:http';
import { listAnnouncements, getAnnouncement, getMeta } from './db/index.js';
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
};

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

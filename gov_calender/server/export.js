// DB → 프론트엔드 정적 JSON 덤프 (PROJECT_SPEC.md §3.5, §4.1)
//   npm run export
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAnnouncements, getMeta, closeDb } from './db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/announcements.json');

const all = listAnnouncements();
const benefits = all.filter((a) => a.isBenefit);

const payload = {
  generatedAt: new Date().toISOString(),
  lastCrawlAt: getMeta('last_crawl_at'),
  counts: { total: all.length, benefit: benefits.length },
  // 프론트는 혜택성 공고만 사용. bodyText 는 용량상 1000자로 제한.
  announcements: benefits.map((a) => ({
    ...a,
    bodyText: (a.bodyText || '').slice(0, 1000),
  })),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
console.log(`✓ ${OUT}`);
console.log(`  총 ${all.length}건 중 혜택성 ${benefits.length}건 내보냄`);
closeDb();

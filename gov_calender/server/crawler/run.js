// 크롤러 엔트리 (PROJECT_SPEC.md §2.5)
//
//   npm run crawl                 최신 공고 8건만 샘플 파싱 (기본, 빠른 검증용)
//   npm run crawl -- --limit=20   최신 20건
//   npm run crawl -- --full       페이지 전체 순회 (--pages 로 범위 지정, 기본 20p)
//   npm run crawl -- --pages=40 --full
//   npm run crawl -- --seCode=01  고시
//   npm run crawl -- --id=149606  단건 재수집
//
// 모든 항목 처리 시 [i/n] 진행 로그를 즉시 출력한다.
import * as hscity from './adapters/hscity.js';
import { classify } from './classify.js';
import { extract } from './extract.js';
import { upsertAnnouncement, setMeta, closeDb } from '../db/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a); // 즉시 flush (node stdout 는 동기)

function parseArgs(argv) {
  const args = {
    pages: null, rowPerPage: 20, seCode: '04', id: null,
    throttle: 300, limit: 8, full: false,
  };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'pages') args.pages = +v;
    else if (k === 'rowPerPage') args.rowPerPage = +v;
    else if (k === 'seCode') args.seCode = v;
    else if (k === 'id') args.id = v;
    else if (k === 'throttle') args.throttle = +v;
    else if (k === 'limit') args.limit = +v;
    else if (k === 'full') args.full = true;
  }
  if (args.full && args.pages == null) args.pages = 20;
  if (!args.full && args.pages == null) args.pages = Math.ceil(args.limit / 10) + 1;
  return args;
}

async function processOne(item, seCode) {
  const d = await hscity.detail(item.id, { seCode });
  const title = item.title || d.title;
  const { category, isBenefit } = classify(title, d.bodyText);
  const postedDate = d.postedDate || item.postedDate;
  const postedYear = postedDate ? +postedDate.slice(0, 4) : new Date().getFullYear();
  const { criteria, applyStart, applyEnd } = extract(d.bodyText, title, { postedYear });

  const record = {
    id: item.id, source: 'hscity', title, url: item.url,
    docNo: d.docNo || item.docNo || null,
    department: d.department || item.department || null,
    contact: d.contact, category, postedDate,
    applyStart: applyStart || item.postStart || postedDate,
    applyEnd: applyEnd || item.postEnd || null,
    applyEndApprox: !applyEnd && !!item.postEnd,
    bodyText: d.bodyText, attachments: d.attachments, isBenefit,
  };
  const status = upsertAnnouncement(record, criteria);
  return { status, isBenefit, category, title, applyStart: record.applyStart, applyEnd: record.applyEnd };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  log(`▶ 크롤 시작 — ${args.id ? `단건 ${args.id}`
    : args.full ? `전체(${args.pages}p)` : `샘플 최신 ${args.limit}건`}`
    + ` · 요청 타임아웃 ${hscity.REQUEST_TIMEOUT}ms · 간격 ${args.throttle}ms`);

  // 1) 목록 수집
  let items = [];
  if (args.id) {
    items = [{
      id: args.id, title: null,
      url: `${hscity.BASE}/www/gosi/BD_selectGosiDetail.do?q_notAncmtMgtNo=${args.id}&q_notAncmtSeCode=${args.seCode}`,
    }];
  } else {
    for (let p = 1; p <= args.pages; p++) {
      try {
        const pageItems = await hscity.list({ page: p, rowPerPage: args.rowPerPage, seCode: args.seCode });
        items.push(...pageItems);
        log(`  · 목록 p${p}: 누적 ${items.length}건`);
      } catch (err) {
        log(`  ! 목록 p${p} 실패: ${err.message}`);
      }
      if (!args.full && items.length >= args.limit) break;
      await sleep(args.throttle);
    }
    if (!args.full) items = items.slice(0, args.limit);
  }

  // 2) 상세 파싱 + 분류 + UPSERT (항목별 진행 로그)
  const stats = { inserted: 0, updated: 0, unchanged: 0, benefit: 0, errors: 0, total: items.length };
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tag = `[${i + 1}/${items.length}]`;
    try {
      const r = await processOne(item, args.seCode);
      stats[r.status]++;
      if (r.isBenefit) stats.benefit++;
      log(`  ${tag} ${item.id} ${r.status.padEnd(9)}`
        + ` ${r.isBenefit ? `혜택/${r.category}` : '일반'.padEnd(10)}`
        + ` ${(r.title || '').slice(0, 42)}`);
    } catch (err) {
      stats.errors++;
      log(`  ${tag} ${item.id} ERROR    ${err.message}`);
    }
    await sleep(args.throttle);
  }

  setMeta('last_crawl_at', new Date().toISOString());
  setMeta('last_crawl_stats', JSON.stringify(stats));
  log(`\n=== 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
  console.table(stats);
  closeDb();
}

main().catch((e) => { console.error('크롤 실패:', e); process.exit(1); });

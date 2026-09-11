// 기존 DB 레코드에 대해 재분류 + 조건 재추출 (재크롤 없이).
//   node server/crawler/reclassify.js
import { getDb, listAnnouncements, upsertAnnouncement, closeDb } from '../db/index.js';
import { classify } from './classify.js';
import { extract } from './extract.js';

// 네트워크 요청 없음 — 로컬 DB 재처리만 수행 (수 초 이내).
const db = getDb();
db.exec("UPDATE announcements SET content_hash = NULL"); // 조건 재추출 강제
const rows = db.prepare('SELECT * FROM announcements').all();
console.log(`재분류 대상 ${rows.length}건 (로컬 처리, 네트워크 없음)`);
let benefit = 0;
for (const [idx, r] of rows.entries()) {
  if (idx % 50 === 0 && idx) console.log(`  ...${idx}/${rows.length}`);
  const { category, isBenefit } = classify(r.title, r.body_text);
  const postedYear = r.posted_date ? +r.posted_date.slice(0, 4) : new Date().getFullYear();
  const { criteria, applyStart, applyEnd } = extract(r.body_text, r.title, { postedYear });
  if (isBenefit) benefit++;
  // 추출 실패 시 기존(크롤 시 게재기간으로 채운) 값 유지
  const keepApprox = !applyEnd && !!r.apply_end;
  upsertAnnouncement({
    id: r.id, source: r.source, title: r.title, url: r.url, docNo: r.doc_no,
    department: r.department, contact: r.contact, category,
    postedDate: r.posted_date,
    applyStart: applyStart || r.apply_start || r.posted_date,
    applyEnd: applyEnd || r.apply_end || null,
    applyEndApprox: applyEnd ? false : (keepApprox || !!r.apply_end_approx),
    bodyText: r.body_text, attachments: JSON.parse(r.attachments || '[]'), isBenefit,
  }, criteria);
}
console.log(`재분류 완료: ${rows.length}건 중 혜택성 ${benefit}건`);
void listAnnouncements;
closeDb();

// DB 접근 계층 — node:sqlite 기반 (PROJECT_SPEC.md §1)
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = resolve(__dirname, '../data/announcements.db');
const SCHEMA_PATH = resolve(__dirname, './schema.sql');

let _db = null;

/** 싱글턴 DB 핸들. 최초 호출 시 스키마 마이그레이션 수행. */
export function getDb() {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  _db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(_db);
  return _db;
}

// 기존 DB에 신규 컬럼 추가 (CREATE TABLE IF NOT EXISTS 로는 반영 안 되므로)
function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(announcements)").all().map((c) => c.name);
  const add = [
    ['apply_end_approx', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [name, def] of add) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE announcements ADD COLUMN ${name} ${def}`);
  }
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

const nowIso = () => new Date().toISOString();

function hashContent(title, body) {
  return createHash('sha1').update(`${title}\n${body || ''}`).digest('hex');
}

/**
 * 공고 + 조건 메타를 UPSERT.
 * @returns {'inserted'|'updated'|'unchanged'}
 */
export function upsertAnnouncement(record, criteria) {
  const db = getDb();
  const {
    id, source = 'hscity', title, url, docNo = null, department = null,
    contact = null, category = 'etc', postedDate = null,
    applyStart = null, applyEnd = null, applyEndApprox = false, bodyText = null,
    attachments = [], isBenefit = false,
  } = record;

  const hash = hashContent(title, bodyText);
  const existing = db.prepare('SELECT content_hash FROM announcements WHERE id = ?').get(id);
  const changed = !existing || existing.content_hash !== hash;
  const ts = nowIso();

  db.prepare(`
    INSERT INTO announcements
      (id, source, title, url, doc_no, department, contact, category,
       posted_date, apply_start, apply_end, apply_end_approx, body_text, attachments,
       is_benefit, content_hash, crawled_at, updated_at)
    VALUES
      (@id, @source, @title, @url, @docNo, @department, @contact, @category,
       @postedDate, @applyStart, @applyEnd, @applyEndApprox, @bodyText, @attachments,
       @isBenefit, @hash, @ts, @ts)
    ON CONFLICT(id) DO UPDATE SET
      source=@source, title=@title, url=@url, doc_no=@docNo,
      department=@department, contact=@contact, category=@category,
      posted_date=@postedDate, apply_start=@applyStart, apply_end=@applyEnd,
      apply_end_approx=@applyEndApprox,
      body_text=@bodyText, attachments=@attachments, is_benefit=@isBenefit,
      content_hash=@hash, crawled_at=@ts,
      updated_at=CASE WHEN announcements.content_hash <> @hash THEN @ts ELSE announcements.updated_at END
  `).run({
    id, source, title, url, docNo, department, contact, category,
    postedDate, applyStart, applyEnd, bodyText,
    attachments: JSON.stringify(attachments),
    isBenefit: isBenefit ? 1 : 0,
    applyEndApprox: applyEndApprox ? 1 : 0,
    hash, ts,
  });

  // 조건 메타는 내용이 바뀌었을 때만 재기록
  if (changed && criteria) {
    db.prepare(`
      INSERT INTO announcement_criteria
        (announcement_id, age_min, age_max, birth_year_from, birth_year_to,
         residence_required, residence_years, income_max_pct, income_note,
         household_flags, occupation_flags, raw_conditions, extraction_confidence)
      VALUES
        (@id, @ageMin, @ageMax, @birthFrom, @birthTo,
         @residence, @residenceYears, @incomePct, @incomeNote,
         @household, @occupation, @raw, @confidence)
      ON CONFLICT(announcement_id) DO UPDATE SET
        age_min=@ageMin, age_max=@ageMax, birth_year_from=@birthFrom, birth_year_to=@birthTo,
        residence_required=@residence, residence_years=@residenceYears,
        income_max_pct=@incomePct, income_note=@incomeNote,
        household_flags=@household, occupation_flags=@occupation,
        raw_conditions=@raw, extraction_confidence=@confidence
    `).run({
      id,
      ageMin: criteria.ageMin ?? null,
      ageMax: criteria.ageMax ?? null,
      birthFrom: criteria.birthYearFrom ?? null,
      birthTo: criteria.birthYearTo ?? null,
      residence: criteria.residenceRequired ?? 'none',
      residenceYears: criteria.residenceYears ?? null,
      incomePct: criteria.incomeMaxPct ?? null,
      incomeNote: criteria.incomeNote ?? null,
      household: JSON.stringify(criteria.householdFlags ?? []),
      occupation: JSON.stringify(criteria.occupationFlags ?? []),
      raw: JSON.stringify(criteria.raw ?? {}),
      confidence: criteria.confidence ?? 0,
    });
  }

  if (!existing) return 'inserted';
  return changed ? 'updated' : 'unchanged';
}

export function setMeta(key, value) {
  getDb().prepare(
    'INSERT INTO crawl_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, String(value));
}

export function getMeta(key) {
  return getDb().prepare('SELECT value FROM crawl_meta WHERE key = ?').get(key)?.value ?? null;
}

/** 조인된 공고 전체(또는 필터) 조회 — API/export 공용 */
export function listAnnouncements({ benefitOnly = false } = {}) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.*, c.age_min, c.age_max, c.birth_year_from, c.birth_year_to,
           c.residence_required, c.residence_years, c.income_max_pct, c.income_note,
           c.household_flags, c.occupation_flags, c.extraction_confidence
    FROM announcements a
    LEFT JOIN announcement_criteria c ON c.announcement_id = a.id
    ${benefitOnly ? 'WHERE a.is_benefit = 1' : ''}
    ORDER BY a.apply_start DESC
  `).all();
  return rows.map(hydrate);
}

export function getAnnouncement(id) {
  const db = getDb();
  const row = db.prepare(`
    SELECT a.*, c.age_min, c.age_max, c.birth_year_from, c.birth_year_to,
           c.residence_required, c.residence_years, c.income_max_pct, c.income_note,
           c.household_flags, c.occupation_flags, c.extraction_confidence
    FROM announcements a
    LEFT JOIN announcement_criteria c ON c.announcement_id = a.id
    WHERE a.id = ?
  `).get(id);
  return row ? hydrate(row) : null;
}

/** DB row → 프론트/매칭용 정규화 객체 */
export function hydrate(row) {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    url: row.url,
    docNo: row.doc_no,
    department: row.department,
    contact: row.contact,
    category: row.category,
    postedDate: row.posted_date,
    applyStart: row.apply_start,
    applyEnd: row.apply_end,
    applyEndApprox: !!row.apply_end_approx,
    bodyText: row.body_text,
    attachments: safeJson(row.attachments, []),
    isBenefit: !!row.is_benefit,
    updatedAt: row.updated_at,
    criteria: {
      ageMin: row.age_min,
      ageMax: row.age_max,
      birthYearFrom: row.birth_year_from,
      birthYearTo: row.birth_year_to,
      residenceRequired: row.residence_required || 'none',
      residenceYears: row.residence_years,
      incomeMaxPct: row.income_max_pct,
      incomeNote: row.income_note,
      householdFlags: safeJson(row.household_flags, []),
      occupationFlags: safeJson(row.occupation_flags, []),
      confidence: row.extraction_confidence ?? 0,
    },
  };
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

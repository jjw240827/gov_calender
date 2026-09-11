// DB 접근 계층 — node:sqlite 기반 (PROJECT_SPEC.md §1)
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
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
    ['views', 'INTEGER'],   // 조회수 (hscity 미제공 → NULL. 향후 소스 대비)
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
    attachments = [], isBenefit = false, views = null,
  } = record;

  const hash = hashContent(title, bodyText);
  const existing = db.prepare('SELECT content_hash FROM announcements WHERE id = ?').get(id);
  const changed = !existing || existing.content_hash !== hash;
  const ts = nowIso();

  db.prepare(`
    INSERT INTO announcements
      (id, source, title, url, doc_no, department, contact, category,
       posted_date, apply_start, apply_end, apply_end_approx, body_text, attachments,
       is_benefit, views, content_hash, crawled_at, updated_at)
    VALUES
      (@id, @source, @title, @url, @docNo, @department, @contact, @category,
       @postedDate, @applyStart, @applyEnd, @applyEndApprox, @bodyText, @attachments,
       @isBenefit, @views, @hash, @ts, @ts)
    ON CONFLICT(id) DO UPDATE SET
      source=@source, title=@title, url=@url, doc_no=@docNo,
      department=@department, contact=@contact, category=@category,
      posted_date=@postedDate, apply_start=@applyStart, apply_end=@applyEnd,
      apply_end_approx=@applyEndApprox,
      body_text=@bodyText, attachments=@attachments, is_benefit=@isBenefit,
      views=COALESCE(@views, announcements.views),
      content_hash=@hash, crawled_at=@ts,
      updated_at=CASE WHEN announcements.content_hash <> @hash THEN @ts ELSE announcements.updated_at END
  `).run({
    id, source, title, url, docNo, department, contact, category,
    postedDate, applyStart, applyEnd, bodyText,
    attachments: JSON.stringify(attachments),
    isBenefit: isBenefit ? 1 : 0,
    applyEndApprox: applyEndApprox ? 1 : 0,
    views: views ?? null,
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
    views: row.views ?? null,
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

// ===================== 사용자 / 세션 / 관심 (PROJECT_SPEC.md §9) =====================

const SESSION_DAYS = 30;

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return { hash, salt };
}

function passwordMatches(password, hash, salt) {
  const test = scryptSync(String(password), salt, 64);
  const want = Buffer.from(hash, 'hex');
  return test.length === want.length && timingSafeEqual(test, want);
}

const publicUser = (row) =>
  row ? { id: row.id, email: row.email, profile: safeJson(row.profile, {}) } : null;

/** @returns {{id,email,profile}} */
export function createUser(email, password, profile = {}) {
  const db = getDb();
  const clean = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('이메일 형식이 올바르지 않습니다.');
  if (String(password).length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(clean)) {
    throw new Error('이미 가입된 이메일입니다.');
  }
  const { hash, salt } = hashPassword(password);
  const info = db.prepare(
    'INSERT INTO users (email, pw_hash, pw_salt, profile, created_at) VALUES (?,?,?,?,?)'
  ).run(clean, hash, salt, JSON.stringify(profile || {}), nowIso());
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
}

/** @returns {{id,email,profile}|null} */
export function verifyUser(email, password) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!row || !passwordMatches(password, row.pw_hash, row.pw_salt)) return null;
  return publicUser(row);
}

export function getUserById(id) {
  return publicUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export function updateUserProfile(userId, profile) {
  getDb().prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile || {}), userId);
  return profile || {};
}

export function createSession(userId) {
  const token = randomBytes(24).toString('hex');
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 864e5);
  getDb().prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)'
  ).run(token, userId, now.toISOString(), exp.toISOString());
  return token;
}

/** @returns {{id,email,profile}|null} */
export function userForToken(token) {
  if (!token) return null;
  const db = getDb();
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return getUserById(s.user_id);
}

export function deleteSession(token) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function listFavorites(userId) {
  return getDb().prepare(
    'SELECT announcement_id, notify, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId).map((r) => ({
    announcementId: r.announcement_id,
    notify: !!r.notify,
    createdAt: r.created_at,
  }));
}

/** 관심 추가/삭제. on=true 추가, false 삭제. */
export function setFavorite(userId, announcementId, on) {
  const db = getDb();
  if (on) {
    db.prepare(`
      INSERT INTO favorites (user_id, announcement_id, notify, created_at)
      VALUES (?,?,0,?)
      ON CONFLICT(user_id, announcement_id) DO NOTHING
    `).run(userId, announcementId, nowIso());
  } else {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND announcement_id = ?').run(userId, announcementId);
  }
  return listFavorites(userId);
}

/** 알람 신청 여부 토글 (관심 목록에 있을 때만). */
export function setFavoriteNotify(userId, announcementId, notify) {
  const db = getDb();
  const exists = db.prepare(
    'SELECT 1 FROM favorites WHERE user_id = ? AND announcement_id = ?'
  ).get(userId, announcementId);
  if (!exists) throw new Error('먼저 관심 목록에 추가하세요.');
  db.prepare(
    'UPDATE favorites SET notify = ? WHERE user_id = ? AND announcement_id = ?'
  ).run(notify ? 1 : 0, userId, announcementId);
  return listFavorites(userId);
}

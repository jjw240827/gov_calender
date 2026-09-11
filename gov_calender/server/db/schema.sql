-- 화성시 공고 크롤링 DB 스키마 (node:sqlite)
-- PROJECT_SPEC.md §1 참조

CREATE TABLE IF NOT EXISTS announcements (
  id            TEXT PRIMARY KEY,          -- 원본 q_notAncmtMgtNo
  source        TEXT NOT NULL DEFAULT 'hscity',
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  doc_no        TEXT,
  department    TEXT,
  contact       TEXT,
  category      TEXT NOT NULL DEFAULT 'etc',
  posted_date   TEXT,                      -- YYYY-MM-DD
  apply_start   TEXT,                      -- YYYY-MM-DD (없으면 posted_date)
  apply_end     TEXT,                      -- YYYY-MM-DD (NULL = 상시)
  apply_end_approx INTEGER NOT NULL DEFAULT 0, -- 1=게재기간 기반 추정값
  body_text     TEXT,
  attachments   TEXT NOT NULL DEFAULT '[]',-- JSON [{name,url}]
  is_benefit    INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT,                      -- title+body 해시 (변경 감지)
  crawled_at    TEXT,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS announcement_criteria (
  announcement_id       TEXT PRIMARY KEY
                        REFERENCES announcements(id) ON DELETE CASCADE,
  age_min               INTEGER,
  age_max               INTEGER,
  birth_year_from       INTEGER,
  birth_year_to         INTEGER,
  residence_required    TEXT DEFAULT 'none',  -- hwaseong | hwaseong_{동} | gyeonggi | none
  residence_years       REAL,
  income_max_pct        INTEGER,
  income_note           TEXT,
  household_flags       TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  occupation_flags      TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  raw_conditions        TEXT NOT NULL DEFAULT '{}',   -- JSON
  extraction_confidence REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ann_dates   ON announcements(apply_start, apply_end);
CREATE INDEX IF NOT EXISTS idx_ann_benefit ON announcements(is_benefit, category);

-- 마지막 크롤 실행 메타
CREATE TABLE IF NOT EXISTS crawl_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ===== 사용자 / 세션 / 관심 (PROJECT_SPEC.md §9) =====
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL UNIQUE,
  pw_hash     TEXT NOT NULL,           -- scrypt hex
  pw_salt     TEXT NOT NULL,           -- hex
  profile     TEXT NOT NULL DEFAULT '{}',  -- JSON (생년월일/거주지/소득/세대·직업 태그)
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,        -- random hex
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id TEXT NOT NULL,
  notify          INTEGER NOT NULL DEFAULT 0,   -- 1 = 알람 신청함 (실제 발송은 v2)
  notified_at     TEXT,                          -- 마지막 알람 발송 시각 (v2)
  created_at      TEXT NOT NULL,
  PRIMARY KEY (user_id, announcement_id)
);
CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id);

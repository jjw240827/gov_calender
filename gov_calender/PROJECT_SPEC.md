# 화성시 공고 크롤링 & 맞춤형 혜택 추천 캘린더 — 구현 명세서

> 이 문서는 **living document**입니다. 각 단계 구현이 끝날 때마다 상태(✅/🚧/⬜)와 실제 구현 내역을 갱신합니다.
> 최초 작성: 2026-09-05

---

## 0. 개요

기존 React + Vite 캘린더 UI(`src/App.jsx`)에, 화성특례시청 공고를 자동 수집하여
사용자 프로필(나이/거주지/소득/신분 등)에 맞는 혜택만 캘린더·리스트에 노출하는 기능을 추가한다.

### 0.1 대상 사이트

- 목록: `https://www.hscity.go.kr/www/gosi/BD_selectGosiList.do`
  - 페이징 파라미터: `q_currPage`(현재 페이지), `q_rowPerPage`(페이지당 건수)
  - 구분 파라미터: `q_notAncmtSeCode` (01 고시 / 04 공고 등)
  - 총 ~9,400건 / 947페이지 (전체가 아니라 **최근 N페이지만** 수집)
- 상세: `https://www.hscity.go.kr/www/gosi/BD_selectGosiDetail.do?q_notAncmtMgtNo={id}&q_currPage=..&q_rowPerPage=..`
  - 목록의 제목 링크는 `onclick="opGosiView('{q_notAncmtMgtNo}')"` 형태
  - 상세 페이지는 `th`(라벨) / `td`(값) 테이블 + 본문 `div` + 첨부파일(`.hwpx` 등)
  - 메타 라벨: 제목 / 담당부서 / 게재일자 / 공고번호 / 담당자·연락처 / 게재기간

### 0.2 중요 제약 (수집 데이터의 성격)

고시공고 게시판 대부분은 **과태료·공시송달·세금** 등 혜택과 무관한 행정공고이다.
따라서 크롤러는 제목/본문 키워드로 **혜택성 공고(모집·지원·보조금·바우처·장학·수당·채용 등)** 만
1차 분류하고, 그 외는 `category='etc'`로 저장하되 기본 조회에서 제외한다.

---

## 1. 데이터베이스 스키마 설계  — 상태: ✅

### 1.1 스토리지

- 엔진: **`node:sqlite`** (Node 22.5+ 내장, 네이티브 빌드 불필요) — `node --experimental-sqlite`는 22.23에서 자동
- 파일: `server/data/announcements.db` (git 무시)
- 스키마 파일: `server/db/schema.sql`
- 접근 계층: `server/db/index.js` — 연결/마이그레이션/`upsertAnnouncement()`

### 1.2 테이블: `announcements`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | TEXT PK | 원본 `q_notAncmtMgtNo` (사이트 관리번호) |
| `source` | TEXT | 출처 코드. 기본 `'hscity'` |
| `title` | TEXT NOT NULL | 공고 제목 |
| `url` | TEXT NOT NULL | 상세 페이지 절대 URL |
| `doc_no` | TEXT | 공고번호 (예: `화성시 공고 제2026-3036호`) |
| `department` | TEXT | 담당부서 |
| `contact` | TEXT | 담당자/연락처 |
| `category` | TEXT | 분류: `welfare` \| `youth` \| `housing` \| `job` \| `childcare` \| `business` \| `subsidy` \| `etc` |
| `posted_date` | TEXT | 게재일자 `YYYY-MM-DD` |
| `apply_start` | TEXT | 신청 시작일 `YYYY-MM-DD` (추출 실패 시 `posted_date`) |
| `apply_end` | TEXT | 신청 종료일 `YYYY-MM-DD` (추출 실패 시 `NULL` = 상시) |
| `body_text` | TEXT | 본문 평문 (추출 원본, 매칭 재실행용) |
| `attachments` | TEXT(JSON) | `[{name, url}]` |
| `is_benefit` | INTEGER | 혜택성 공고 여부 0/1 (기본 조회 필터) |
| `crawled_at` | TEXT | 수집 시각 ISO |
| `updated_at` | TEXT | 마지막 변경 시각 ISO |

### 1.3 테이블: `announcement_criteria` (필터링용 메타데이터, 1:1)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `announcement_id` | TEXT PK FK | → `announcements.id` |
| `age_min` | INTEGER | 최소 연령(만). 없으면 NULL |
| `age_max` | INTEGER | 최대 연령(만). 없으면 NULL |
| `birth_year_from` | INTEGER | 출생연도 하한 (연령 대신 명시된 경우) |
| `birth_year_to` | INTEGER | 출생연도 상한 |
| `residence_required` | TEXT | 거주지 요건: `hwaseong` \| `hwaseong_{읍면동}` \| `gyeonggi` \| `none` |
| `residence_years` | REAL | 최소 거주 기간(년). 없으면 NULL |
| `income_max_pct` | INTEGER | 기준 중위소득 상한 % (예: 60, 180). 없으면 NULL |
| `income_note` | TEXT | 소득 조건 원문 |
| `household_flags` | TEXT(JSON) | `["무주택","다자녀","한부모","신혼부부","1인가구"]` 등 |
| `occupation_flags` | TEXT(JSON) | `["청년","대학생","소상공인","농업인","구직자","재직자","무직"]` 등 |
| `raw_conditions` | TEXT(JSON) | 추출기 원본 스니펫(디버깅/검수용) |
| `extraction_confidence` | REAL | 0~1, 규칙 매칭 강도 |

### 1.4 인덱스

- `idx_ann_dates` on `announcements(apply_start, apply_end)`
- `idx_ann_benefit` on `announcements(is_benefit, category)`

### 1.5 UPSERT 규칙

`id` 기준 `INSERT ... ON CONFLICT(id) DO UPDATE`.
`title`/`body_text` 해시가 바뀐 경우에만 `updated_at` 갱신 + criteria 재추출.
`crawled_at`은 매 실행 시 갱신.

---

## 2. 크롤러 구현  — 상태: ✅ (v1)

> **중요 한계 (실측)**: hscity.go.kr 공고 상세의 `내용` 셀은 대부분 1~3문장 요약뿐이며,
> 실제 자격요건·금액·신청기간은 **첨부 .hwpx 파일** 안에 있다. .hwpx 파싱은 v1 범위 밖.
> → 조건 추출은 요약문에 값이 노출된 경우에만 동작하고, 그 외에는 `null`(미상)으로 저장.
> → 신청 종료일은 추출 실패 시 목록의 **게재기간(공고 노출기간) 종료일**을 근사값으로 사용
>   (`apply_end_approx = 1`, UI에서 "(추정)" 표기).
> 정밀도를 높이려면 후속으로 hwpx 텍스트 추출기(별도 워커) 추가 필요.

### 2.1 구조

```
server/crawler/
  run.js                  # 엔트리. `npm run crawl -- --pages=5`
  adapters/hscity.js      # 화성시청 목록/상세 fetch + HTML 파싱 (cheerio)
  extract.js              # 비정형 본문 → 조건값 추출 (규칙 기반)
  classify.js             # 제목/본문 → category, is_benefit 판정
  normalize.js            # 날짜/공백/전각문자 정규화 유틸
```

### 2.2 의존성 (신규)

- `cheerio` — 서버측 HTML 파싱
- `iconv-lite` — 필요 시 EUC-KR 디코딩 (hscity는 UTF-8로 확인되면 미사용)

### 2.3 파이프라인

1. `adapters/hscity.list({page, rowPerPage, seCode})` → `[{id, title, url, department, postedDate}]`
2. 각 id에 대해 `adapters/hscity.detail(id)` → `{docNo, contact, bodyText, attachments}`
3. `classify(title, bodyText)` → `{category, isBenefit}`
4. `extract(bodyText, title)` → criteria 객체
5. `db.upsertAnnouncement(record, criteria)`
6. 요청 간 `throttle`(기본 400ms), 실패 시 3회 재시도(지수 백오프)

### 2.4 조건값 추출 규칙 (`extract.js`)

| 항목 | 규칙(예시 정규식/키워드) |
|---|---|
| 연령 | `만\s*(\d+)\s*세\s*(이상\|~\|부터)`, `만\s*(\d+)\s*세\s*이하`, `(\d+)\s*세\s*[~∼-]\s*(\d+)\s*세` |
| 청년 키워드 | "청년" 단독 → `age_min=19, age_max=39` (화성시 청년 기본조례 근거, confidence 0.5) |
| 출생연도 | `(\d{4})\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*[~∼]\s*(\d{4})\.` 형태 → birth_year_from/to |
| 신청기간 | `신청\s*기간[^\d]*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[~∼-]\s*(\d{4})?[.\-/]?(\d{1,2})[.\-/](\d{1,2})` |
| 거주지 | "화성시에 주민등록", "관내 거주" → `hwaseong`; 읍면동명 매칭 시 세분화; "경기도" → `gyeonggi` |
| 거주기간 | `(\d+)\s*(년\|개월)\s*이상\s*(계속\s*)?거주` |
| 소득 | `중위소득\s*(\d+)\s*%`, "소득 무관/제한 없음" → NULL + note |
| 세대 플래그 | 키워드 사전: 무주택/다자녀/한부모/신혼부부/1인가구/장애인/기초생활수급 |
| 직업/신분 플래그 | 키워드 사전: 대학생/소상공인/자영업자/농업인/어업인/구직자/재직자/실업자/프리랜서 |

추출 실패는 곧 "조건 없음(누구나)"이 아니라 **미상(NULL)** 으로 저장 → 매칭 시 별도 처리.

### 2.5 실행 (안전장치)

- **개별 요청 타임아웃**: 기본 4000ms (`CRAWL_TIMEOUT` 환경변수), 실패 시 최대 3회 재시도(지수 백오프) 후 스킵 → 절대 무한 대기 안 함
- **기본은 샘플 모드**: `npm run crawl` = 최신 8건만 파싱(빠른 검증용). 전체 수집은 `--full` 명시
- **항목별 진행 로그**: `[i/n] {id} {status} {분류} {제목}` 즉시 출력

```
npm run crawl                   # 최신 8건 샘플 (기본)
npm run crawl -- --limit=20     # 최신 20건
npm run crawl:full              # 전체 40페이지 순회
npm run crawl -- --full --pages=10
npm run crawl -- --id=149606    # 단건 재수집
npm run reclassify              # 재크롤 없이 로컬 DB만 재분류/재추출
CRAWL_TIMEOUT=6000 npm run crawl -- --limit=30
```

---

## 3. 맞춤형 매칭 & 검색  — 상태: ✅

구현: `server/lib/match.js` (순수 함수, 프론트/서버 공용)
- `ageAt(birthDate)`, `applyStatus(ann)` — 유틸
- `matchAnnouncement(ann, profile)` → `{eligible:'yes'|'maybe'|'no', score, reasons[]}`
  - 조건별 pass/fail/unknown → fail 있으면 no, unknown 있으면 maybe
- `searchAnnouncements(list, {keyword, categories, status, month, profile, ...})`
  - 키워드 공백 AND, 다중 카테고리, 신청상태, 월 겹침 필터 + score/마감일 정렬
API: `server/api.js` (`node:http`, 포트 5178) — `/api/announcements`, `/api/announcements/:id`, `/api/match`, `/api/meta`
정적 폴백: `server/export.js` → `src/data/announcements.json`

### (구) 3.x 계획

### 3.1 위치

`server/lib/match.js` — **순수 함수(isomorphic)**. Node 의존성 없음 → 프론트에서 그대로 import.

### 3.2 사용자 프로필 스키마

```js
{
  birthDate: '2001-05-01',   // → 만 나이 계산
  residence: 'hwaseong',      // 'hwaseong' | 'hwaseong_동탄1동' | 'gyeonggi' | 'other'
  residenceYears: 5,
  incomePct: 85,              // 본인 추정 기준 중위소득 %. 모르면 null
  household: ['무주택'],       // 태그 배열
  occupation: ['청년', '재직자']
}
```

### 3.3 매칭 함수

```js
matchAnnouncement(announcement, criteria, profile) → {
  eligible: 'yes' | 'maybe' | 'no',
  score: 0..100,            // 정렬용 (조건 부합 개수/신뢰도 가중)
  reasons: [{field, status, text}]   // "만 24세 → 대상(만19~34)" 등
}
```

- 규칙: 각 조건별 `pass` / `fail` / `unknown` 판정
  - 하나라도 `fail` → `eligible: 'no'`
  - `fail` 없고 `unknown` 있음 → `'maybe'`
  - 전부 `pass` → `'yes'`
- `score` = (pass 수 × 10) + (카테고리가 프로필 관심사와 일치 시 보너스) − (unknown × 2)

### 3.4 검색/필터 함수

```js
searchAnnouncements(list, {
  keyword,                   // 제목+본문+부서 부분일치 (공백 AND)
  categories: [],            // 다중 선택
  status: 'open'|'upcoming'|'closed'|'all',   // 오늘 기준 신청기간
  month: '2026-09',          // 캘린더 표시 월과 겹치는 공고
  benefitOnly: true,
  profile                    // 있으면 eligible !== 'no' 만
}) → 정렬된 배열 (score desc, apply_end asc)
```

### 3.5 API (`server/api.js`, `node:http`, 포트 5178)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/announcements?keyword=&category=&status=&month=` | 목록 |
| GET | `/api/announcements/:id` | 단건 + criteria |
| POST | `/api/match` `{profile, filters}` | 프로필 매칭 결과 포함 목록 |
| GET | `/api/meta` | 카테고리·플래그 사전, 마지막 크롤 시각 |

정적 배포용: `npm run export` → `src/data/announcements.json` (전체 덤프, 프론트 오프라인 폴백).

---

## 4. 캘린더 UI 연동  — 상태: ✅ (v2 UX 개선 반영)

구현:
- `src/data/store.jsx` — Context + useReducer (announcements/filters/profile/view/month), localStorage 저장. `filters.sort` 추가
- `src/data/api.js` — API 우선, 3초 타임아웃 시 `announcements.json` 폴백
- `src/hooks/useAnnouncements.js` — 필터·매칭 + 캘린더 **일정 마커** 배치, `normalizeProfile`
- `src/components/FilterBar.jsx` — 카테고리 칩 / 신청상태 세그먼트 / 맞춤추천 토글 / 부적격 숨기기 / **정렬 선택 + 정렬기준 캡션**
- `src/components/ProfileModal.jsx` — 생년월일·거주지·거주기간·소득·세대/직업 태그 입력. 저장 시 정렬을 `relevance`로 전환
- `src/components/AnnouncementList.jsx` — 리스트 뷰, eligible 배지 + D-day + 미충족 사유
- `src/App.jsx` — 달력/리스트 토글, 상세 페이지 매칭 배너
- `src/App.css` — 신규 컴포넌트 스타일, 반응형 보강
- `src/pages/` (react-router 기반 미사용 파일) 삭제

### 4.5 v2 UX 개선 (2026-09-06)

1. **달력 배치 깨짐 수정** — 그리드 셀 `min-width:0`, 바 텍스트 `ellipsis` 클리핑.
   전체 제목·기간은 네이티브 `title` + 커스텀 `.bar-tip` 호버 툴팁으로 노출.
2. **정렬 방식 명시** — `match.js`의 `searchAnnouncements({sort})` = `relevance | deadline | recent`.
   - `relevance` (나와 관련도순): 매칭 score desc — 프로필 있을 때만, 없으면 `deadline`로 자동 대체
   - `deadline` (마감 임박순): `apply_end` asc (기본값)
   - `recent` (최신 등록순): `posted_date` desc
   FilterBar 우측에 `23건 · 나와 관련도순` 캡션.

### 4.6 v3 캘린더 재설계 (2026-09-06)

1. **달력 상시 노출** — 프로필/카테고리 없이도 표시. `hasFilter` = 카테고리·키워드·맞춤조건 중 하나.
2. **표시 건수 상한** — 조건·카테고리 미선택 시 **최근 게재 4건**(`CAL_DEFAULT`),
   필터 걸리면 상위 **8건**(`CAL_FILTERED`). "일자별 2건"이 아니라 **달력 전체 N건**.
   > hscity는 조회수를 전혀 노출하지 않음 → 기본 대표는 `posted_date` 최신순으로 대체.
   > 향후 소스 대비 `announcements.views` (nullable) 컬럼만 미리 추가.
3. **연속 바 복원** — 신청기간(2~10일 등)을 가로로 이어 렌더 (`is-start`/`is-end`).
   레인 최대 4, 초과는 하단 캡션에 "N건 생략" 표기.
4. 카테고리(청년/복지 등) 선택 시 그에 맞는 공고가 달력에 뜬다.

### 4.8 색상 규칙 (2026-09-06)

- 달력 바·리스트 카테고리 칩 색상 = **카테고리별 고유색** (`CATEGORY_THEME[cat] = cat`, `.theme-<cat>`)
  복지=바이올렛 / 청년=블루 / 주거=로즈 / 일자리=앰버 / 보육·출산=그린 / 소상공인=오렌지 / 지원금·공모=시안 / 기타=슬레이트
- 조건 **미달**(match.eligible==='no') 공고만 `.bar-dim` (opacity 0.38 + desaturate). 충족/확인필요는 원래 색 유지
- 달력 하단에 등장 카테고리 **범례** + "조건 미달(흐리게)" 표기
- 리스트 eligible 배지(`.al-elig.elig-*`)는 별도 색(초록/노랑/빨강) — 카테고리색과 구분

### 4.7 캘린더 하단 캡션 규칙

| 상태 | 문구 |
|---|---|
| 표시 0건 | "이번 달에 표시할 공고가 없습니다. 리스트에서…" |
| 필터 없음(`recent`) | "조건·카테고리 미선택 — 최근 등록된 공고 N건을 표시 중…" |
| 필터 있음(`filtered`) | "선택한 조건에 맞는 공고 N건을 표시 중…(, M건 생략)" |

---

## 9. 로그인 / 관심 / 알람  — 상태: ✅ (v1)

### 9.1 DB (`server/db/schema.sql`)

- `users(id, email UNIQUE, pw_hash, pw_salt, profile JSON, created_at)` — 비밀번호는 `scrypt` 해시+솔트
- `sessions(token PK, user_id, created_at, expires_at)` — 30일 만료. Bearer 토큰
- `favorites(user_id, announcement_id, notify, notified_at, created_at, PK(user_id,ann_id))`
  - `notify` = 알람 신청 여부(0/1). `notified_at` = v2 발송용 예약 컬럼
- `announcements.views` INTEGER nullable — 조회수(hscity 미제공 → NULL)

### 9.2 API (`server/api.js`, 인증 필요 시 `Authorization: Bearer <token>`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/register` `{email,password,profile?}` | 가입 + 로그인. 로컬 프로필 이관 |
| POST | `/api/auth/login` `{email,password}` | `{token, user, favorites}` |
| POST | `/api/auth/logout` | 세션 삭제 |
| GET | `/api/auth/me` | 세션 복원용. `{user, favorites}` |
| PUT | `/api/auth/profile` `{profile}` | 계정 프로필 갱신 |
| GET | `/api/favorites` | 관심 목록 |
| POST | `/api/favorites` `{announcementId, on}` | 관심 추가/삭제 |
| PUT | `/api/favorites/:id/notify` `{notify}` | 알람 신청 토글(관심 등록 상태에서만) |

### 9.3 프론트

- `src/data/auth.js` — API 클라이언트. 토큰은 `localStorage['gov_cal_token']`
- `src/data/store.jsx` — `state.user`, `state.favorites{[id]:{notify}}`. `AUTH_SET`/`AUTH_CLEAR`/`SET_FAVORITES`.
  마운트 시 토큰 있으면 `fetchMe()`로 세션 복원(API 없으면 조용히 비로그인)
- `src/components/AuthModal.jsx` — 로그인/회원가입 토글. 가입·로그인 시 기존 `내 조건`을 계정으로 이관
- `src/App.jsx` DetailPage — **관심**(하트) / **알람 신청**(벨) 버튼.
  비로그인 시 클릭하면 AuthModal. 알람은 관심 등록 상태에서만 토글. 상태는 서버 저장
- `ProfileModal` — 로그인 상태면 저장 시 `PUT /api/auth/profile`도 호출

### 9.4 v2 예정

- 알람 실제 발송: `favorites.notify=1` + 접수 시작/마감 D-1 → 카카오톡 알림톡 (별도 워커 + 채널 등록)
- 소셜 로그인, 비밀번호 재설정, 이메일 인증

### (구) 4.x 계획

### 4.1 데이터 계층

```
src/data/
  announcements.json        # export 산출물 (폴백)
  store.jsx                 # Context + useReducer: {announcements, profile, filters, dispatch}
  api.js                    # fetch('/api/...') 실패 시 json 폴백
src/hooks/
  useAnnouncements.js       # 필터·매칭 적용된 목록 + 캘린더 slot 배치
```

### 4.2 상태 모델

```js
filters: { keyword, categories:[], status:'open', benefitOnly:true, useProfile:false }
profile: { ...위 3.2 } | null   // localStorage 'gov_cal_profile'에 저장
```

### 4.3 App.jsx 변경점

- `MOCK_EVENTS` 제거 → `useAnnouncements()` 결과 사용
- 캘린더 바 렌더링: 고정 `slot 0~3` 대신, 표시 월과 겹치는 공고에 **동적 slot 할당**
  (겹침 구간 계산 후 최소 레인 배치, 최대 4레인 + "외 N건")
- 상단 검색창 → `filters.keyword` 바인딩, 인기 키워드 칩 → 카테고리/키워드 필터
- 헤더 "내 지원금 관리" → 프로필 입력 모달 (나이/거주지/소득/신분 체크박스)
- 상세 페이지: `selectedEvent.targetInfo` → criteria 기반 렌더 + "내 조건 충족 여부" 배지
- 리스트 뷰 탭 추가(달력/리스트 토글), 리스트는 `eligible` 배지 + score 정렬

### 4.4 카테고리 → 기존 테마 색상 매핑

`welfare/youth → theme-gyeonggi`, `housing/childcare → theme-hwaseong`,
`job/business/subsidy → theme-gov` (App.css 재사용, 신규 클래스 최소화)

---

## 5. 디렉터리 최종 구조

```
gov_calender/
  PROJECT_SPEC.md            ← 이 문서
  package.json               ← scripts: crawl, export, api 추가
  server/
    data/announcements.db    (gitignore)
    db/{schema.sql,index.js}
    crawler/{run.js,classify.js,extract.js,normalize.js,adapters/hscity.js}
    lib/match.js
    api.js
    export.js
  src/
    App.jsx                  (수정)
    data/{store.jsx,api.js,announcements.json}
    hooks/useAnnouncements.js
    components/{ProfileModal.jsx,FilterBar.jsx,AnnouncementList.jsx}
```

---

## 6. 진행 로그

| 날짜 | 단계 | 내용 |
|---|---|---|
| 2026-09-05 | 0 | 명세서 작성, 대상 사이트(hscity.go.kr) 구조 확인 |
| 2026-09-05 | 1 | DB 스키마 확정 (`node:sqlite`), `server/db/{schema.sql,index.js}` |
| 2026-09-05 | 2 | 크롤러 구현 — `hscity` 어댑터(목록 `q_cp` 페이징 / 상세 th·td 파싱), `classify`(혜택성 분류), `extract`(연령·거주·소득·신청기간 규칙 추출). 상세 본문이 요약뿐이라 한계 발견 → 게재기간 근사값 도입 |
| 2026-09-05 | 3 | `match.js`(매칭·검색 순수함수), `api.js`(node:http API), `export.js`(정적 JSON) |
| 2026-09-05 | 4 | 프론트 상태계층(store/hook) + 필터바·프로필모달·리스트 + App.jsx 재작성 + CSS. `vite build` / `oxlint` 통과 |
| 2026-09-05 | 2+ | 크롤러 안전장치: fetch 4초 타임아웃(+재시도), `npm run crawl` 기본 샘플 8건 모드, `[i/n]` 항목별 진행 로그, `--full`/`--limit`/`crawl:full`/`reclassify` 스크립트. 신청기간 정규식에 `(요일)` 표기 대응 |
| 2026-09-06 | 4.5 | 달력 UX 개선: 셀 배치 깨짐 수정+호버 툴팁, 정렬 `relevance/deadline/recent`+캡션 |
| 2026-09-06 | 4.6 | 캘린더 재설계: 상시 노출, 표시 상한(미선택 4건=최신순 / 필터 8건), 연속 바 복원, 카테고리 선택 시 달력 반영. `views` 컬럼 추가(hscity 미제공) |
| 2026-09-06 | 9 | 로그인/회원가입(scrypt+세션토큰), 관심·알람 DB(users/sessions/favorites), `/api/auth/*`·`/api/favorites`, AuthModal, DetailPage 관심·알람 버튼. 알람은 저장까지만(발송 v2). `vite build`/`oxlint` 통과, 브라우저 E2E 확인 |

## 7. 실행 방법

```bash
npm install                     # cheerio, iconv-lite 포함
npm run refresh                  # 수집 + 프론트 반영 한 번에 (기본 최신 8건)
npm run refresh -- --limit=40    # 최신 40건
npm run refresh -- --full --pages=60   # 60페이지(약 600건) 전체 순회
npm run dev                      # 프론트. API 없으면 announcements.json 자동 폴백

# (분리 실행)
npm run crawl                    # 수집만 (DB 갱신). 플래그: --limit / --full --pages=N / --seCode=01 / --id=X
npm run export                   # DB → src/data/announcements.json
npm run api                      # 조회 API :5178 — 로그인/관심/알람 기능은 이게 떠 있어야 동작
CRAWL_TIMEOUT=6000 npm run refresh -- --limit=30   # 요청 타임아웃 조정
```

> 로그인/관심/알람을 쓰려면 `npm run api` 와 `npm run dev` 를 함께 실행. API 미실행 시 공고 조회는
> `announcements.json` 폴백으로 계속 동작하고, 로그인 관련 UI만 비활성(에러 대신 안내 문구).

크롤 갱신 주기: 수동 또는 cron(`npm run crawl && npm run export`). 최초 데이터 400건(혜택성 약 23건) 수집 완료.

## 8. 후속 과제 (v2)

- .hwpx 첨부 텍스트 추출 → 조건값 정확도 향상
- 경기도/정부24 등 다중 소스 어댑터 추가 (`adapters/` 확장)
- 소득분위 자동 추정(가구원수+소득), 첨부 OCR
- 서버 배포 시 API 상시 구동 + 증분 크롤(변경분만)

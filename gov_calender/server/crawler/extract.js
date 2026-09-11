// 비정형 본문 → 필터링 조건값 추출 (PROJECT_SPEC.md §2.4)
// 규칙 기반. 추출 실패는 "누구나"가 아니라 미상(null)으로 둔다.
import { toISODate } from './normalize.js';

const HWASEONG_DONG = [
  '동탄1동', '동탄2동', '동탄3동', '동탄4동', '동탄5동', '동탄6동', '동탄7동', '동탄8동', '동탄9동',
  '봉담읍', '남양읍', '우정읍', '향남읍', '팔탄면', '장안면', '양감면', '정남면', '마도면',
  '송산면', '서신면', '비봉면', '매송면', '진안동', '병점1동', '병점2동', '기배동', '화산동',
  '새솔동', '반월동',
];

const HOUSEHOLD_KEYWORDS = {
  무주택: ['무주택'],
  다자녀: ['다자녀', '2자녀', '3자녀', '두 자녀', '세 자녀'],
  한부모: ['한부모', '조손가정'],
  신혼부부: ['신혼부부', '예비부부', '혼인신고'],
  '1인가구': ['1인가구', '1인 가구', '독거'],
  장애인: ['장애인', '장애정도'],
  기초수급: ['기초생활수급', '수급자', '차상위'],
  임산부: ['임산부', '산모', '임신'],
};

const OCCUPATION_KEYWORDS = {
  청년: ['청년'],
  대학생: ['대학생', '대학원생', '재학생', '휴학생'],
  소상공인: ['소상공인', '자영업자', '소공인'],
  농업인: ['농업인', '농가', '경영체', '농업경영정보'],
  어업인: ['어업인', '어가'],
  구직자: ['구직자', '실업자', '미취업', '실직'],
  재직자: ['재직자', '근로자', '재직 중'],
  프리랜서: ['프리랜서', '특수형태근로', '플랫폼 종사자'],
};

/**
 * @param {string} bodyText
 * @param {string} title
 * @param {{postedYear?: number}} ctx
 * @returns {{criteria: object, applyStart: string|null, applyEnd: string|null}}
 */
export function extract(bodyText, title = '', ctx = {}) {
  const text = `${title}\n${bodyText || ''}`;
  const year = ctx.postedYear || new Date().getFullYear();
  const raw = {};
  let confidence = 0;
  const bump = (n = 0.15) => { confidence = Math.min(1, confidence + n); };

  // ---- 연령 ----
  let ageMin = null, ageMax = null, birthYearFrom = null, birthYearTo = null;

  let m = text.match(/만\s*(\d{1,2})\s*세\s*(?:이상|부터|~|∼|-)\s*만?\s*(\d{1,2})\s*세\s*(?:이하|까지|미만)?/);
  if (m) { ageMin = +m[1]; ageMax = +m[2]; raw.age = m[0]; bump(0.35); }
  if (ageMin == null) {
    m = text.match(/만\s*(\d{1,2})\s*세\s*(이상|부터)/);
    if (m) { ageMin = +m[1]; raw.ageMin = m[0]; bump(0.25); }
    m = text.match(/만\s*(\d{1,2})\s*세\s*(이하|까지|미만)/);
    if (m) { ageMax = +m[1]; raw.ageMax = m[0]; bump(0.25); }
  }
  if (ageMin == null && ageMax == null) {
    m = text.match(/(\d{2})\s*세\s*[~∼-]\s*(\d{2})\s*세/);
    if (m) { ageMin = +m[1]; ageMax = +m[2]; raw.age = m[0]; bump(0.3); }
  }

  // 출생연도 범위 (연령 대신 명시)
  m = text.match(/(\d{4})\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*[~∼-]\s*(\d{4})\.\s*\d{1,2}\.\s*\d{1,2}/);
  if (m && /출생|생년|태어난/.test(text)) {
    birthYearFrom = +m[1]; birthYearTo = +m[2]; raw.birth = m[0]; bump(0.3);
  }

  // "청년" 언급인데 연령 미상 → 화성시 청년 기본조례(만19~39) 추정
  if (ageMin == null && ageMax == null && birthYearFrom == null && /청년/.test(text)) {
    ageMin = 19; ageMax = 39; raw.ageAssumed = '청년 키워드 기반 추정(만19~39)'; bump(0.1);
  }

  // ---- 거주지 ----
  let residenceRequired = 'none', residenceYears = null;
  const dong = HWASEONG_DONG.find((d) => text.includes(d));
  if (dong && /(거주|주민등록|주소)/.test(text)) {
    residenceRequired = `hwaseong_${dong}`; raw.residence = dong; bump(0.2);
  } else if (/(화성시|관내)에?\s*(주민등록|거주|주소)/.test(text) || /화성시\s*거주/.test(text)) {
    residenceRequired = 'hwaseong'; raw.residence = '화성시'; bump(0.25);
  } else if (/경기도\s*(에\s*)?(거주|주민등록)/.test(text)) {
    residenceRequired = 'gyeonggi'; raw.residence = '경기도'; bump(0.2);
  }
  m = text.match(/(\d+)\s*(년|개월)\s*이상\s*(?:계속\s*)?거주/);
  if (m) {
    residenceYears = m[2] === '개월' ? +m[1] / 12 : +m[1];
    raw.residenceYears = m[0]; bump(0.15);
  }

  // ---- 소득 ----
  let incomeMaxPct = null, incomeNote = null;
  m = text.match(/(?:기준\s*)?중위소득\s*(\d{2,3})\s*%\s*(이하|이내)?/);
  if (m) { incomeMaxPct = +m[1]; incomeNote = m[0]; bump(0.3); }
  else if (/소득\s*(무관|제한\s*없|조건\s*없)/.test(text)) {
    incomeNote = '소득 무관'; bump(0.15);
  }

  // ---- 세대 / 직업 플래그 ----
  const householdFlags = matchFlags(text, HOUSEHOLD_KEYWORDS);
  const occupationFlags = matchFlags(text, OCCUPATION_KEYWORDS);
  if (householdFlags.length) bump(0.1);
  if (occupationFlags.length) bump(0.1);

  // ---- 신청기간 ----
  const { applyStart, applyEnd } = extractPeriod(text, year);
  if (applyStart) bump(0.2);

  return {
    applyStart,
    applyEnd,
    criteria: {
      ageMin, ageMax, birthYearFrom, birthYearTo,
      residenceRequired, residenceYears,
      incomeMaxPct, incomeNote,
      householdFlags, occupationFlags,
      raw,
      confidence: Math.round(confidence * 100) / 100,
    },
  };
}

function matchFlags(text, dict) {
  const out = [];
  for (const [flag, kws] of Object.entries(dict)) {
    if (kws.some((k) => text.includes(k))) out.push(flag);
  }
  return out;
}

/** 신청기간 추출: "신청기간 2026. 9. 1. ~ 10. 2." 등 */
export function extractPeriod(text, year) {
  const window = sliceAround(text, /(신청|접수|모집|공모|운영)\s*(기간|일정)/, 140);
  const scope = window || text;

  const WD = '(?:\\([^)]{0,4}\\))?'; // "(화)" 같은 요일 표기 허용
  const D = '\\s*[.\\-/]\\s*';

  // full ~ full  (종료 연도 생략 가능)
  let m = scope.match(new RegExp(
    `(\\d{4})${D}(\\d{1,2})${D}(\\d{1,2})\\.?\\s*${WD}\\s*[~∼\\-–]\\s*(?:(\\d{4})${D})?(\\d{1,2})${D}(\\d{1,2})`
  ));
  if (m) {
    const start = `${m[1]}-${p(m[2])}-${p(m[3])}`;
    const end = `${m[4] || m[1]}-${p(m[5])}-${p(m[6])}`;
    return { applyStart: start, applyEnd: end };
  }

  // 단일 마감일: "~ 2026. 9. 30. 까지"
  m = scope.match(new RegExp(`[~∼]\\s*(\\d{4})${D}(\\d{1,2})${D}(\\d{1,2})`));
  if (m) return { applyStart: null, applyEnd: `${m[1]}-${p(m[2])}-${p(m[3])}` };

  // "9월 30일까지"
  m = scope.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*까지/);
  if (m) return { applyStart: null, applyEnd: `${year}-${p(m[1])}-${p(m[2])}` };

  return { applyStart: null, applyEnd: null };
}

const p = (n) => String(n).padStart(2, '0');

function sliceAround(text, re, radius) {
  const idx = text.search(re);
  if (idx < 0) return null;
  return text.slice(Math.max(0, idx - 10), idx + radius);
}

// eslint 미사용 방지 (toISODate 는 향후 확장용으로 export 유지)
export { toISODate };

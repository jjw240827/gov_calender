// 맞춤형 매칭 & 검색 — 순수 함수 (PROJECT_SPEC.md §3)
// Node 의존성 없음. 프론트엔드에서 그대로 import 가능.

/** 'YYYY-MM-DD' 문자열의 만 나이 (기준일 default 오늘) */
export function ageAt(birthDate, on = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--;
  return age;
}

const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * 신청 상태 판정.
 * @returns {'open'|'upcoming'|'closed'|'always'}
 */
export function applyStatus(ann, today = todayStr()) {
  const { applyStart, applyEnd } = ann;
  if (!applyStart && !applyEnd) return 'always';
  if (applyStart && today < applyStart) return 'upcoming';
  if (applyEnd && today > applyEnd) return 'closed';
  return 'open';
}

/**
 * 공고 1건 × 프로필 매칭.
 * @param {object} ann  hydrate() 결과 (criteria 포함)
 * @param {object|null} profile
 * @returns {{eligible:'yes'|'maybe'|'no', score:number, reasons:Array}}
 */
export function matchAnnouncement(ann, profile, { today = todayStr(), interests = [] } = {}) {
  const c = ann.criteria || {};
  const reasons = [];
  let pass = 0, fail = 0, unknown = 0;

  const add = (field, status, text) => {
    reasons.push({ field, status, text });
    if (status === 'pass') pass++;
    else if (status === 'fail') fail++;
    else unknown++;
  };

  if (!profile) {
    return { eligible: 'maybe', score: 0, reasons: [{ field: 'profile', status: 'unknown', text: '프로필 미입력' }] };
  }

  // ---- 나이 ----
  const age = ageAt(profile.birthDate, new Date(today));
  if (c.ageMin != null || c.ageMax != null) {
    if (age == null) add('age', 'unknown', '생년월일 미입력');
    else if (c.ageMin != null && age < c.ageMin) add('age', 'fail', `만 ${age}세 · 대상 만 ${c.ageMin}세 이상`);
    else if (c.ageMax != null && age > c.ageMax) add('age', 'fail', `만 ${age}세 · 대상 만 ${c.ageMax}세 이하`);
    else add('age', 'pass', `만 ${age}세 · 대상 ${fmtRange(c.ageMin, c.ageMax, '세')}`);
  } else if (c.birthYearFrom != null || c.birthYearTo != null) {
    const by = profile.birthDate ? +profile.birthDate.slice(0, 4) : null;
    if (by == null) add('age', 'unknown', '생년월일 미입력');
    else if ((c.birthYearFrom != null && by < c.birthYearFrom) || (c.birthYearTo != null && by > c.birthYearTo))
      add('age', 'fail', `${by}년생 · 대상 ${c.birthYearFrom ?? ''}~${c.birthYearTo ?? ''}년생`);
    else add('age', 'pass', `${by}년생 · 대상 범위 내`);
  }

  // ---- 거주지 ----
  if (c.residenceRequired && c.residenceRequired !== 'none') {
    const r = profile.residence || 'other';
    const need = c.residenceRequired;
    const ok =
      need === 'gyeonggi' ? ['gyeonggi', 'hwaseong'].includes(r) || r.startsWith('hwaseong') :
      need === 'hwaseong' ? r === 'hwaseong' || r.startsWith('hwaseong') :
      /* hwaseong_동 */      r === need;
    if (r === 'other' && !profile.residence) add('residence', 'unknown', '거주지 미입력');
    else if (ok) add('residence', 'pass', `거주지 요건 충족 (${labelResidence(need)})`);
    else add('residence', 'fail', `${labelResidence(need)} 거주자 대상`);
  }
  if (c.residenceYears != null) {
    if (profile.residenceYears == null) add('residenceYears', 'unknown', '거주 기간 미입력');
    else if (profile.residenceYears < c.residenceYears)
      add('residenceYears', 'fail', `거주 ${profile.residenceYears}년 · ${c.residenceYears}년 이상 필요`);
    else add('residenceYears', 'pass', `거주 기간 ${c.residenceYears}년 이상 충족`);
  }

  // ---- 소득 ----
  if (c.incomeMaxPct != null) {
    if (profile.incomePct == null) add('income', 'unknown', '소득 정보 미입력');
    else if (profile.incomePct > c.incomeMaxPct)
      add('income', 'fail', `중위소득 ${profile.incomePct}% · 기준 ${c.incomeMaxPct}% 이하`);
    else add('income', 'pass', `중위소득 ${c.incomeMaxPct}% 이하 충족`);
  }

  // ---- 세대 / 직업 플래그 ----
  matchFlagGroup('household', c.householdFlags, profile.household, add);
  matchFlagGroup('occupation', c.occupationFlags, profile.occupation, add);

  // ---- 신청 가능 상태 ----
  const status = applyStatus(ann, today);
  if (status === 'closed') add('period', 'fail', '신청 마감');
  else if (status === 'upcoming') add('period', 'unknown', `신청 시작 예정 (${ann.applyStart})`);
  else add('period', 'pass', status === 'always' ? '상시 신청' : `신청 가능 (~${ann.applyEnd || '별도'})`);

  const eligible = fail > 0 ? 'no' : unknown > 0 ? 'maybe' : pass > 0 ? 'yes' : 'maybe';

  let score = pass * 10 - unknown * 2 - fail * 100;
  if (interests.includes(ann.category)) score += 15;
  score += Math.round((c.confidence || 0) * 5);
  score = Math.max(0, Math.min(100, score + 20));

  return { eligible, score, reasons };
}

function matchFlagGroup(field, required = [], have = [], add) {
  if (!required || required.length === 0) return;
  const set = new Set(have || []);
  const hit = required.filter((f) => set.has(f));
  if (hit.length) add(field, 'pass', `해당: ${hit.join(', ')}`);
  else if (!have || have.length === 0) add(field, 'unknown', `대상 조건: ${required.join(', ')}`);
  else add(field, 'fail', `대상: ${required.join(', ')} (미해당)`);
}

function fmtRange(min, max, unit) {
  if (min != null && max != null) return `만 ${min}~${max}${unit}`;
  if (min != null) return `만 ${min}${unit} 이상`;
  if (max != null) return `만 ${max}${unit} 이하`;
  return '제한 없음';
}

function labelResidence(code) {
  if (code === 'hwaseong') return '화성시';
  if (code === 'gyeonggi') return '경기도';
  if (code?.startsWith('hwaseong_')) return `화성시 ${code.slice(9)}`;
  return code;
}

/**
 * 검색 + 다중 필터 + (프로필 있으면) 매칭.
 * @returns {Array} 정렬된 결과. profile 있으면 각 항목에 `match` 필드 추가.
 */
export function searchAnnouncements(list, opts = {}) {
  const {
    keyword = '',
    categories = [],
    status = 'all',        // 'open' | 'upcoming' | 'closed' | 'always' | 'all'
    month = null,          // 'YYYY-MM' — 해당 월과 신청기간이 겹치는 공고
    benefitOnly = true,
    profile = null,
    today = todayStr(),
    interests = [],
    includeIneligible = true,
  } = opts;

  const terms = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);

  let rows = list.filter((a) => {
    if (benefitOnly && !a.isBenefit) return false;

    if (terms.length) {
      const hay = `${a.title} ${a.bodyText || ''} ${a.department || ''}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    if (categories.length && !categories.includes(a.category)) return false;

    if (status !== 'all' && applyStatus(a, today) !== status) return false;

    if (month) {
      const mStart = `${month}-01`;
      const mEnd = `${month}-31`;
      const s = a.applyStart || a.postedDate || mStart;
      const e = a.applyEnd || s;
      if (e < mStart || s > mEnd) return false;
    }
    return true;
  });

  rows = rows.map((a) => {
    if (!profile) return { ...a, match: null };
    return { ...a, match: matchAnnouncement(a, profile, { today, interests }) };
  });

  if (profile && !includeIneligible) {
    rows = rows.filter((a) => a.match.eligible !== 'no');
  }

  rows.sort((a, b) => {
    if (profile) {
      const d = (b.match?.score ?? 0) - (a.match?.score ?? 0);
      if (d) return d;
    }
    const ae = a.applyEnd || '9999-12-31';
    const be = b.applyEnd || '9999-12-31';
    return ae.localeCompare(be);
  });

  return rows;
}

export { todayStr };

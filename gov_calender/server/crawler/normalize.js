// 텍스트/날짜 정규화 유틸 (PROJECT_SPEC.md §2.3)

/** 전각공백·연속공백·제로폭 문자 정리 */
export function cleanText(s) {
  if (!s) return '';
  return String(s)
    .replace(/ /g, ' ')          // NBSP
    .replace(/　/g, ' ')          // 전각 공백
    .replace(/[​-‍﻿]/g, '') // 제로폭
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * 다양한 한국어 날짜 표기를 YYYY-MM-DD 로.
 * 지원: 2026.9.4 / 2026-09-04 / 2026. 9. 4. / 20260904 / 2026년 9월 4일
 */
export function toISODate(raw, { year } = {}) {
  if (!raw) return null;
  const s = String(raw).trim();

  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // 연도 생략된 종료일: "~ 9. 15." 형태
  m = s.match(/^\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m && year) return `${year}-${pad(m[1])}-${pad(m[2])}`;

  return null;
}

/** 오늘(로컬) YYYY-MM-DD */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

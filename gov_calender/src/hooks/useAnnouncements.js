// 필터·매칭 적용 + 캘린더 바 배치 (PROJECT_SPEC.md §4)
import { useMemo } from 'react';
import { searchAnnouncements } from '../../server/lib/match.js';
import { useStore } from '../data/store.jsx';

const MAX_LANES = 4;
const CAL_DEFAULT = 4;    // 조건·카테고리 미선택 시 달력에 띄우는 대표 공고 수
const CAL_FILTERED = 8;   // 카테고리/키워드/맞춤 조건이 걸렸을 때 상한

/** 폼 문자열 프로필 → match.js 숫자 프로필 */
export function normalizeProfile(p) {
  if (!p) return null;
  return {
    birthDate: p.birthDate || null,
    residence: p.residence || null,
    residenceYears: p.residenceYears === '' || p.residenceYears == null ? null : Number(p.residenceYears),
    incomePct: p.incomePct === '' || p.incomePct == null ? null : Number(p.incomePct),
    household: p.household || [],
    occupation: p.occupation || [],
  };
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function useAnnouncements() {
  const { state } = useStore();
  const { announcements, filters, profile, currentMonth } = state;

  const profileForMatch = filters.useProfile ? normalizeProfile(profile) : null;
  const effectiveSort =
    filters.sort === 'relevance' && !profileForMatch ? 'deadline' : filters.sort || 'deadline';

  // 리스트용: 전체 필터 반영
  const list = useMemo(
    () =>
      searchAnnouncements(announcements, {
        keyword: filters.keyword,
        categories: filters.categories,
        status: filters.status,
        benefitOnly: filters.benefitOnly,
        profile: profileForMatch,
        interests: filters.categories,
        includeIneligible: filters.includeIneligible,
        sort: effectiveSort,
      }),
    [announcements, filters, profileForMatch, effectiveSort],
  );

  // 카테고리·키워드·맞춤조건 중 하나라도 걸리면 "필터 모드"
  const hasFilter =
    filters.categories.length > 0 || filters.keyword.trim() !== '' || !!profileForMatch;

  // 캘린더용: (필터 없으면) 최신 게재 4건 / (필터 있으면) 상위 8건을 연속 바로 배치
  const { monthEvents, overflow, calMode, calShown } = useMemo(() => {
    const mk = monthKey(currentMonth);
    const mStart = `${mk}-01`;
    const mEnd = `${mk}-31`;

    const inMonth = list.filter((a) => {
      const s = a.applyStart || a.postedDate;
      if (!s) return false;
      const e = a.applyEnd || s;
      return !(e < mStart || s > mEnd);
    });

    const pool = hasFilter
      ? inMonth.slice(0, CAL_FILTERED)
      : [...inMonth]
          .sort((a, b) => (b.postedDate || '').localeCompare(a.postedDate || ''))
          .slice(0, CAL_DEFAULT);

    const withRange = pool
      .map((a) => ({
        ...a,
        _start: a.applyStart || a.postedDate || mStart,
        _end: a.applyEnd || a.applyStart || a.postedDate || mEnd,
      }))
      .sort((a, b) => a._start.localeCompare(b._start) || b._end.localeCompare(a._end));

    const laneEnds = [];
    const placed = [];
    const overflowItems = [];
    for (const ev of withRange) {
      let lane = laneEnds.findIndex((end) => end < ev._start);
      if (lane === -1) {
        if (laneEnds.length < MAX_LANES) {
          lane = laneEnds.length;
          laneEnds.push(ev._end);
        } else {
          overflowItems.push(ev);
          continue;
        }
      } else {
        laneEnds[lane] = ev._end;
      }
      placed.push({ ...ev, lane });
    }

    return {
      monthEvents: placed,
      overflow: overflowItems,
      calMode: hasFilter ? 'filtered' : 'recent',
      calShown: placed.length,
    };
  }, [list, currentMonth, hasFilter]);

  return {
    status: state.status,
    source: state.source,
    lastCrawlAt: state.lastCrawlAt,
    list,
    monthEvents,
    overflow,
    calMode,
    calShown,
    laneCount: MAX_LANES,
    sort: effectiveSort,
  };
}

// 필터·매칭 적용 + 캘린더 레인 배치 (PROJECT_SPEC.md §4.1, §4.3)
import { useMemo } from 'react';
import { searchAnnouncements } from '../../server/lib/match.js';
import { useStore } from '../data/store.jsx';

const MAX_LANES = 4;

/** 폼 문자열 프로필 → match.js 숫자 프로필 */
export function normalizeProfile(p) {
  if (!p) return null;
  return {
    birthDate: p.birthDate || null,
    residence: p.residence || null,
    residenceYears: p.residenceYears === '' ? null : Number(p.residenceYears),
    incomePct: p.incomePct === '' ? null : Number(p.incomePct),
    household: p.household || [],
    occupation: p.occupation || [],
  };
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function useAnnouncements() {
  const { state } = useStore();
  const { announcements, filters, profile, currentMonth } = state;

  const profileForMatch = filters.useProfile ? normalizeProfile(profile) : null;

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
      }),
    [announcements, filters, profileForMatch],
  );

  // 캘린더용: 리스트 결과 중 현재 월과 겹치는 것만 + 레인 배치
  const { weeksMeta, monthEvents, overflow } = useMemo(() => {
    const mk = monthKey(currentMonth);
    const inMonth = searchAnnouncements(list, { month: mk, benefitOnly: false, keyword: '' });

    // 신청기간 있는 것 우선, 시작일 순
    const withRange = inMonth
      .filter((a) => a.applyStart || a.applyEnd)
      .map((a) => ({
        ...a,
        _start: a.applyStart || a.postedDate || `${mk}-01`,
        _end: a.applyEnd || a.applyStart || a.postedDate || `${mk}-28`,
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

    return { weeksMeta: null, monthEvents: placed, overflow: overflowItems };
  }, [list, currentMonth]);

  return {
    status: state.status,
    source: state.source,
    lastCrawlAt: state.lastCrawlAt,
    list,
    monthEvents,
    overflow,
    weeksMeta,
    laneCount: MAX_LANES,
  };
}

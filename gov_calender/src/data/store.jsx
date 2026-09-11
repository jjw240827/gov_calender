// 전역 상태: 공고 / 프로필 / 필터 (PROJECT_SPEC.md §4.2)
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { loadAnnouncements } from './api.js';
import { getToken, fetchMe, favoritesToMap } from './auth.js';

const PROFILE_KEY = 'gov_cal_profile';
const FILTERS_KEY = 'gov_cal_filters';

export const CATEGORY_LABELS = {
  welfare: '복지', youth: '청년', housing: '주거', job: '일자리',
  childcare: '보육·출산', business: '소상공인', subsidy: '지원금·공모', etc: '기타',
};

// 카테고리별 고유 색상 (App.css .theme-<category>)
export const CATEGORY_THEME = {
  welfare: 'welfare', youth: 'youth', housing: 'housing', job: 'job',
  childcare: 'childcare', business: 'business', subsidy: 'subsidy', etc: 'etc',
};

const defaultFilters = {
  keyword: '',
  categories: [],
  status: 'all',      // all | open | upcoming | closed
  benefitOnly: true,
  useProfile: false,
  includeIneligible: true,
  sort: 'deadline',   // relevance | deadline | recent
};

const emptyProfile = {
  birthDate: '',
  residence: '',        // hwaseong | hwaseong_동탄1동 | gyeonggi | other
  residenceYears: '',
  incomePct: '',
  household: [],
  occupation: [],
};

// 서버 저장 프로필(null 포함) → 폼 상태(빈 문자열/배열)
const toFormProfile = (sp = {}) => ({
  birthDate: sp.birthDate || '',
  residence: sp.residence || '',
  residenceYears: sp.residenceYears ?? '',
  incomePct: sp.incomePct ?? '',
  household: Array.isArray(sp.household) ? sp.household : [],
  occupation: Array.isArray(sp.occupation) ? sp.occupation : [],
});

function load(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallbackValue, ...JSON.parse(raw) } : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

const initialState = {
  status: 'loading',      // loading | ready | error
  source: null,
  lastCrawlAt: null,
  announcements: [],
  filters: load(FILTERS_KEY, defaultFilters),
  profile: load(PROFILE_KEY, null),
  view: 'calendar',       // calendar | list
  selectedId: null,
  currentMonth: new Date(2026, 8, 1),
  user: null,             // { id, email, profile } | null
  favorites: {},          // { [announcementId]: { notify:boolean } }
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED':
      return { ...state, status: 'ready', ...action.payload };
    case 'LOAD_ERROR':
      return { ...state, status: 'error' };
    case 'SET_FILTER':
      return { ...state, filters: { ...state.filters, ...action.patch } };
    case 'TOGGLE_CATEGORY': {
      const has = state.filters.categories.includes(action.category);
      return {
        ...state,
        filters: {
          ...state.filters,
          categories: has
            ? state.filters.categories.filter((c) => c !== action.category)
            : [...state.filters.categories, action.category],
        },
      };
    }
    case 'SET_PROFILE':
      return { ...state, profile: action.profile };
    case 'CLEAR_PROFILE':
      return { ...state, profile: null, filters: { ...state.filters, useProfile: false } };
    case 'AUTH_SET': {
      // 로그인 성공: 계정 프로필이 있으면 그것을, 없으면 로컬 프로필 유지
      const sp = action.user?.profile || {};
      const hasServerProfile = Object.values(sp).some(
        (v) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0),
      );
      return {
        ...state,
        user: action.user,
        favorites: favoritesToMap(action.favorites),
        profile: hasServerProfile ? toFormProfile(sp) : state.profile,
        filters: hasServerProfile ? { ...state.filters, useProfile: true } : state.filters,
      };
    }
    case 'AUTH_CLEAR':
      return { ...state, user: null, favorites: {} };
    case 'SET_FAVORITES':
      return { ...state, favorites: favoritesToMap(action.favorites) };
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'SELECT':
      return { ...state, selectedId: action.id, view: action.id ? 'detail' : state.view };
    case 'SET_MONTH':
      return { ...state, currentMonth: action.date };
    default:
      return state;
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let alive = true;
    loadAnnouncements()
      .then((data) => alive && dispatch({ type: 'LOADED', payload: data }))
      .catch(() => alive && dispatch({ type: 'LOAD_ERROR' }));
    return () => { alive = false; };
  }, []);

  // 저장된 토큰이 있으면 세션 복원 (API 서버 미실행 시 조용히 무시)
  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    fetchMe()
      .then((d) => alive && dispatch({ type: 'AUTH_SET', user: d.user, favorites: d.favorites }))
      .catch(() => { /* 토큰 만료/서버 없음 — 비로그인 상태 유지 */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(state.filters)); } catch { /* noop */ }
  }, [state.filters]);

  useEffect(() => {
    try {
      if (state.profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
      else localStorage.removeItem(PROFILE_KEY);
    } catch { /* noop */ }
  }, [state.profile]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export { defaultFilters, emptyProfile };

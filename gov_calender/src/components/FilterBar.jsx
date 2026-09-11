// 카테고리 / 상태 / 맞춤 필터 바 (PROJECT_SPEC.md §4.3)
import { SlidersHorizontal, UserCheck } from 'lucide-react';
import { useStore, CATEGORY_LABELS, CATEGORY_THEME } from '../data/store.jsx';

const STATUS_OPTIONS = [
  ['all', '전체'],
  ['open', '신청중'],
  ['upcoming', '예정'],
  ['closed', '마감'],
];

const CATEGORIES = ['welfare', 'youth', 'housing', 'job', 'childcare', 'business', 'subsidy'];

const SORT_OPTIONS = [
  ['relevance', '나와 관련도순'],
  ['deadline', '마감 임박순'],
  ['recent', '최신 등록순'],
];
const SORT_LABELS = Object.fromEntries(SORT_OPTIONS);

export default function FilterBar({ onOpenProfile, resultCount, activeSort }) {
  const { state, dispatch } = useStore();
  const { filters, profile } = state;

  return (
    <div className="filter-bar">
      <div className="fb-line">
        <span className="fb-icon"><SlidersHorizontal size={16} /></span>
        {CATEGORIES.map((c) => (
          <button key={c}
            className={`tag-chip ${filters.categories.includes(c) ? `active theme-${CATEGORY_THEME[c]}` : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_CATEGORY', category: c })}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="fb-line">
        <div className="fb-segment">
          {STATUS_OPTIONS.map(([v, l]) => (
            <button key={v}
              className={filters.status === v ? 'seg active' : 'seg'}
              onClick={() => dispatch({ type: 'SET_FILTER', patch: { status: v } })}>
              {l}
            </button>
          ))}
        </div>

        <button
          className={`fb-profile-toggle ${filters.useProfile ? 'on' : ''}`}
          onClick={() => {
            if (!profile) return onOpenProfile();
            dispatch({ type: 'SET_FILTER', patch: { useProfile: !filters.useProfile } });
          }}>
          <UserCheck size={16} />
          {filters.useProfile ? '맞춤 추천 ON' : '맞춤 추천'}
        </button>

        {filters.useProfile && (
          <label className="fb-check">
            <input type="checkbox"
              checked={!filters.includeIneligible}
              onChange={(e) => dispatch({ type: 'SET_FILTER', patch: { includeIneligible: !e.target.checked } })} />
            부적격 숨기기
          </label>
        )}

        <label className="fb-sort">
          정렬
          <select
            value={filters.sort}
            onChange={(e) => dispatch({ type: 'SET_FILTER', patch: { sort: e.target.value } })}>
            {SORT_OPTIONS.map(([v, l]) => (
              <option key={v} value={v} disabled={v === 'relevance' && !profile}>
                {l}{v === 'relevance' && !profile ? ' (내 조건 필요)' : ''}
              </option>
            ))}
          </select>
        </label>

        <span className="fb-count">
          {resultCount}건 · {SORT_LABELS[activeSort] || SORT_LABELS.deadline}
        </span>
      </div>
    </div>
  );
}

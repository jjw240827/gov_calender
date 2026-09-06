// 카테고리 / 상태 / 맞춤 필터 바 (PROJECT_SPEC.md §4.3)
import { SlidersHorizontal, UserCheck } from 'lucide-react';
import { useStore, CATEGORY_LABELS } from '../data/store.jsx';

const STATUS_OPTIONS = [
  ['all', '전체'],
  ['open', '신청중'],
  ['upcoming', '예정'],
  ['closed', '마감'],
];

const CATEGORIES = ['welfare', 'youth', 'housing', 'job', 'childcare', 'business', 'subsidy'];

export default function FilterBar({ onOpenProfile, resultCount }) {
  const { state, dispatch } = useStore();
  const { filters, profile } = state;

  return (
    <div className="filter-bar">
      <div className="fb-line">
        <span className="fb-icon"><SlidersHorizontal size={16} /></span>
        {CATEGORIES.map((c) => (
          <button key={c}
            className={`tag-chip ${filters.categories.includes(c) ? 'active' : ''}`}
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

        <span className="fb-count">{resultCount}건</span>
      </div>
    </div>
  );
}

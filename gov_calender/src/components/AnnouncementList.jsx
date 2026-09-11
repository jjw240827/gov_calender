// 리스트 뷰 — 매칭 배지 + 마감 임박 정렬 (PROJECT_SPEC.md §4.3)
import { CalendarClock, ChevronRight } from 'lucide-react';
import { useStore, CATEGORY_LABELS, CATEGORY_THEME } from '../data/store.jsx';
import { applyStatus } from '../../server/lib/match.js';

const ELIGIBLE_BADGE = {
  yes: { text: '조건 충족', cls: 'elig-yes' },
  maybe: { text: '확인 필요', cls: 'elig-maybe' },
  no: { text: '조건 미달', cls: 'elig-no' },
};

const STATUS_TEXT = { open: '신청중', upcoming: '예정', closed: '마감', always: '상시' };

function dday(end) {
  if (!end) return null;
  const diff = Math.ceil((new Date(end) - new Date()) / 86400000);
  if (diff < 0) return null;
  return diff === 0 ? 'D-DAY' : `D-${diff}`;
}

export default function AnnouncementList({ items }) {
  const { dispatch } = useStore();

  if (!items.length) {
    return <div className="al-empty">조건에 맞는 공고가 없습니다. 필터를 조정해 보세요.</div>;
  }

  return (
    <div className="al-list">
      {items.map((a) => {
        const st = applyStatus(a);
        const badge = a.match ? ELIGIBLE_BADGE[a.match.eligible] : null;
        const d = dday(a.applyEnd);
        return (
          <button key={a.id} className="al-item" onClick={() => dispatch({ type: 'SELECT', id: a.id })}>
            <div className={`al-cat theme-${CATEGORY_THEME[a.category]}`}>{CATEGORY_LABELS[a.category]}</div>
            <div className="al-body">
              <div className="al-title-row">
                <h3>{a.title}</h3>
                {badge && <span className={`al-elig ${badge.cls}`}>{badge.text}</span>}
              </div>
              <div className="al-meta">
                <span className={`al-status s-${st}`}>{STATUS_TEXT[st]}</span>
                <span><CalendarClock size={13} /> {a.applyStart || a.postedDate} ~ {a.applyEnd || '별도 공지'}</span>
                {a.department && <span>{a.department}</span>}
                {d && <span className="al-dday">{d}</span>}
              </div>
              {a.match && a.match.reasons?.length > 0 && (
                <div className="al-reasons">
                  {a.match.reasons.filter((r) => r.status !== 'pass').slice(0, 2).map((r, i) => (
                    <span key={i} className={`al-reason r-${r.status}`}>{r.text}</span>
                  ))}
                </div>
              )}
            </div>
            <ChevronRight size={18} className="al-arrow" />
          </button>
        );
      })}
    </div>
  );
}

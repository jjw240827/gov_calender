import { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Heart, Search, MapPin, DollarSign, Wallet,
  GraduationCap, Home, Info, User, Calendar as CalendarIcon, Bell, Sparkles,
  List as ListIcon, LayoutGrid, CheckCircle2, HelpCircle, XCircle,
} from 'lucide-react';
import './App.css';
import { useStore, CATEGORY_LABELS, CATEGORY_THEME } from './data/store.jsx';
import { useAnnouncements, normalizeProfile } from './hooks/useAnnouncements.js';
import { matchAnnouncement, applyStatus } from '../server/lib/match.js';
import FilterBar from './components/FilterBar.jsx';
import AnnouncementList from './components/AnnouncementList.jsx';
import ProfileModal from './components/ProfileModal.jsx';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const formatDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = formatDate(new Date());

function App() {
  const { state, dispatch } = useStore();
  const { status, source, lastCrawlAt, list, monthEvents, overflow, laneCount } = useAnnouncements();
  const [showProfile, setShowProfile] = useState(false);

  const selected = useMemo(
    () => list.find((a) => a.id === state.selectedId) || state.announcements.find((a) => a.id === state.selectedId),
    [list, state.announcements, state.selectedId],
  );

  if (state.view === 'detail' && selected) {
    return <DetailPage announcement={selected} onBack={() => dispatch({ type: 'SELECT', id: null })} />;
  }

  return (
    <div className="container calendar-page">
      <header className="cal-hero-header">
        <div className="cal-nav-bar">
          <div className="cal-logo-group">
            <div className="cal-logo-icon"><CalendarIcon size={24} color="#ffffff" /></div>
            <div>
              <div className="service-tag"><Sparkles size={12} /> 화성시 맞춤 혜택</div>
              <h1 className="hero-title">공공 서비스 캘린더</h1>
            </div>
          </div>
          <div className="user-action-group">
            <button className="icon-badge-btn" title="알림"><Bell size={20} /><span className="dot-badge" /></button>
            <button className="user-profile-pill" onClick={() => setShowProfile(true)}>
              <User size={18} />
              <span>{state.profile ? '내 조건 수정' : '내 조건 설정'}</span>
            </button>
          </div>
        </div>

        <div className="cal-search-container">
          <div className="cal-search-box">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              placeholder="지원금 명칭 · 담당부서 · 키워드를 입력하세요 (예: 청년 이사비)"
              value={state.filters.keyword}
              onChange={(e) => dispatch({ type: 'SET_FILTER', patch: { keyword: e.target.value } })}
              autoComplete="off" spellCheck="false"
            />
            {state.filters.keyword && (
              <button className="btn-search-action" onClick={() => dispatch({ type: 'SET_FILTER', patch: { keyword: '' } })}>
                초기화
              </button>
            )}
          </div>

          <div className="quick-tags">
            <span className="tag-label">빠른 검색 :</span>
            {['청년', '이사비', '임산부', '소상공인', '장학'].map((kw) => (
              <button key={kw}
                className={`tag-chip ${state.filters.keyword === kw ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'SET_FILTER', patch: { keyword: state.filters.keyword === kw ? '' : kw } })}>
                #{kw}
              </button>
            ))}
          </div>
        </div>
      </header>

      <FilterBar onOpenProfile={() => setShowProfile(true)} resultCount={list.length} />

      <div className="view-toggle">
        <button className={state.view === 'calendar' ? 'active' : ''} onClick={() => dispatch({ type: 'SET_VIEW', view: 'calendar' })}>
          <LayoutGrid size={16} /> 달력
        </button>
        <button className={state.view === 'list' ? 'active' : ''} onClick={() => dispatch({ type: 'SET_VIEW', view: 'list' })}>
          <ListIcon size={16} /> 리스트
        </button>
        <span className="data-note">
          {status === 'loading' ? '불러오는 중…'
            : `${source === 'api' ? '실시간' : '저장된'} 데이터 · 최근 수집 ${fmtWhen(lastCrawlAt)}`}
        </span>
      </div>

      {state.view === 'calendar'
        ? <CalendarView monthEvents={monthEvents} overflow={overflow} laneCount={laneCount}
            month={state.currentMonth} dispatch={dispatch} />
        : <AnnouncementList items={list} />}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}

function CalendarView({ monthEvents, overflow, laneCount, month, dispatch }) {
  const weeks = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const startDayOfWeek = new Date(year, m, 1).getDay();
    const cursor = new Date(year, m, 1 - startDayOfWeek);
    const out = [];
    for (let w = 0; w < 6; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = formatDate(cursor);
        week.push({
          dateStr, dayNum: cursor.getDate(),
          isCurrentMonth: cursor.getMonth() === m,
          isToday: dateStr === TODAY,
          dayOfWeek: d,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      out.push(week);
      if (cursor.getMonth() !== m && w >= 4) break;
    }
    return out;
  }, [month]);

  const prev = () => dispatch({ type: 'SET_MONTH', date: new Date(month.getFullYear(), month.getMonth() - 1, 1) });
  const next = () => dispatch({ type: 'SET_MONTH', date: new Date(month.getFullYear(), month.getMonth() + 1, 1) });

  return (
    <div className="cal-card">
      <div className="cal-month-nav">
        <button className="icon-btn" onClick={prev}><ChevronLeft size={22} /></button>
        <h2>{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
        <button className="icon-btn" onClick={next}><ChevronRight size={22} /></button>
      </div>

      <div className="cal-grid-new">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-day-name ${i === 0 ? 'text-red' : i === 6 ? 'text-blue' : ''}`}>{w}</div>
        ))}

        <div className="cal-weeks-body">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="cal-week-row">
              {week.map((day, dIdx) => (
                <div key={dIdx} className={`cal-cell-new ${!day.isCurrentMonth ? 'empty' : ''} ${day.isToday ? 'today' : ''}`}>
                  <div className="day-num-label">{day.dayNum}</div>
                  <div className="bar-slot-container">
                    {Array.from({ length: laneCount }, (_, lane) => {
                      const ev = monthEvents.find(
                        (e) => e.lane === lane && day.dateStr >= e._start && day.dateStr <= e._end,
                      );
                      if (!ev) return <div key={lane} className="bar-spacer" />;
                      const isStart = day.dateStr === ev._start || day.dayOfWeek === 0;
                      const isEnd = day.dateStr === ev._end || day.dayOfWeek === 6;
                      const eligCls = ev.match ? ` elig-${ev.match.eligible}` : '';
                      return (
                        <div key={lane}
                          className={`bar-item theme-${CATEGORY_THEME[ev.category]} ${isStart ? 'is-start' : ''} ${isEnd ? 'is-end' : ''}${eligCls}`}
                          onClick={() => dispatch({ type: 'SELECT', id: ev.id })}
                          title={ev.title}>
                          {isStart && <span className="bar-text">{ev.title}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {overflow.length > 0 && (
        <div className="cal-overflow">
          이번 달 표시되지 않은 공고 {overflow.length}건 —{' '}
          <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'list' })}>리스트에서 보기</button>
        </div>
      )}
      {monthEvents.length === 0 && overflow.length === 0 && (
        <div className="cal-overflow">이 달에 해당하는 공고가 없습니다.</div>
      )}
    </div>
  );
}

const ELIG_ICON = {
  yes: <CheckCircle2 size={16} className="text-green" />,
  maybe: <HelpCircle size={16} className="text-yellow" />,
  no: <XCircle size={16} className="text-pink" />,
};

function DetailPage({ announcement: a, onBack }) {
  const { state } = useStore();
  const c = a.criteria || {};
  const profile = state.profile ? normalizeProfile(state.profile) : null;
  const match = profile ? matchAnnouncement(a, profile) : null;
  const st = applyStatus(a);
  const statusLabel = { open: '신청중', upcoming: '접수 예정', closed: '접수 마감', always: '상시 접수' }[st];

  return (
    <div className="container">
      <header className="header">
        <div className="header-top">
          <button className="icon-btn" onClick={onBack}><ChevronLeft size={28} /></button>
          <div className="title-area">
            <h1>{a.title}</h1>
            <span className="badge">{CATEGORY_LABELS[a.category]} · {a.source === 'hscity' ? '화성시' : a.source}</span>
          </div>
          <div className="date-area">
            <span>{statusLabel} · {a.applyStart || a.postedDate} ~ {a.applyEnd || '별도 공지'}{a.applyEndApprox ? ' (추정)' : ''}</span>
          </div>
        </div>

        <div className="header-bottom">
          <a className="btn-primary" href={a.url} target="_blank" rel="noreferrer">원문 공고 보기 (화성시청)</a>
          <button className="btn-outline"><Heart size={18} /> 관심</button>
        </div>
      </header>

      {match && (
        <div className={`match-banner mb-${match.eligible}`}>
          {ELIG_ICON[match.eligible]}
          <strong>
            {match.eligible === 'yes' ? '입력하신 조건에 부합합니다'
              : match.eligible === 'maybe' ? '일부 조건은 원문 확인이 필요합니다'
              : '입력하신 조건과 맞지 않는 항목이 있습니다'}
          </strong>
          <div className="match-reasons">
            {match.reasons.map((r, i) => (
              <span key={i} className={`mr r-${r.status}`}>{r.text}</span>
            ))}
          </div>
        </div>
      )}

      <main className="content-grid">
        <section className="card">
          <div className="card-header"><Info className="icon-blue" /><h2>자격 요건</h2></div>

          <div className="age-timeline">
            <p className="timeline-title">
              지원 대상 연령 : <strong>{fmtAge(c)}</strong>
            </p>
            <div className="timeline-bar" />
          </div>

          <div className="req-grid">
            <ReqItem icon={<DollarSign className="req-icon text-yellow" />} title="소득 기준"
              text={c.incomeMaxPct ? `기준 중위소득 ${c.incomeMaxPct}% 이하` : c.incomeNote || '원문 확인 필요'} />
            <ReqItem icon={<Wallet className="req-icon text-pink" />} title="세대 특성"
              text={c.householdFlags?.length ? c.householdFlags.join(', ') : '제한 없음 / 원문 확인'} />
            <ReqItem icon={<Home className="req-icon text-green" />} title="거주 요건"
              text={fmtResidence(c)} />
            <ReqItem icon={<GraduationCap className="req-icon text-blue" />} title="직업 · 신분"
              text={c.occupationFlags?.length ? c.occupationFlags.join(', ') : '제한 없음 / 원문 확인'} />
          </div>

          <p className="extract-note">
            ※ 자격 요건은 공고 본문에서 자동 추출한 값입니다(신뢰도 {Math.round((c.confidence || 0) * 100)}%).
            정확한 기준은 반드시 원문·첨부파일을 확인하세요.
          </p>
        </section>

        <section className="card">
          <div className="card-header"><MapPin className="icon-green" /><h2>신청 정보</h2></div>

          <dl className="info-dl">
            <div><dt>담당 부서</dt><dd>{a.department || '—'}</dd></div>
            <div><dt>문의</dt><dd>{a.contact || '—'}</dd></div>
            <div><dt>공고 번호</dt><dd>{a.docNo || '—'}</dd></div>
            <div><dt>게시일</dt><dd>{a.postedDate || '—'}</dd></div>
          </dl>

          {a.attachments?.length > 0 && (
            <>
              <p className="map-title" style={{ textAlign: 'left' }}>첨부파일</p>
              <ul className="attach-list">
                {a.attachments.map((f, i) => (
                  <li key={i}><a href={f.url} target="_blank" rel="noreferrer">{f.name}</a></li>
                ))}
              </ul>
            </>
          )}

          <p className="body-preview">{a.bodyText || '본문 미리보기가 없습니다.'}</p>
        </section>
      </main>
    </div>
  );
}

function ReqItem({ icon, title, text }) {
  return (
    <div className="req-item">
      {icon}
      <div><h3>{title}</h3><p>{text}</p></div>
    </div>
  );
}

function fmtAge(c) {
  if (c.ageMin != null && c.ageMax != null) return `만 ${c.ageMin} ~ ${c.ageMax}세`;
  if (c.ageMin != null) return `만 ${c.ageMin}세 이상`;
  if (c.ageMax != null) return `만 ${c.ageMax}세 이하`;
  if (c.birthYearFrom || c.birthYearTo) return `${c.birthYearFrom ?? ''} ~ ${c.birthYearTo ?? ''}년생`;
  return '연령 제한 없음 / 원문 확인';
}

function fmtResidence(c) {
  const map = { hwaseong: '화성시 거주', gyeonggi: '경기도 거주', none: '거주지 제한 없음 / 원문 확인' };
  let base = map[c.residenceRequired] || (c.residenceRequired?.startsWith('hwaseong_')
    ? `화성시 ${c.residenceRequired.slice(9)} 거주` : c.residenceRequired);
  if (c.residenceYears) base += ` · ${c.residenceYears}년 이상`;
  return base;
}

function fmtWhen(iso) {
  if (!iso) return '정보 없음';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default App;

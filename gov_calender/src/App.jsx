import { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Heart, Search, MapPin, DollarSign, Wallet,
  GraduationCap, Home, Info, User, Calendar as CalendarIcon, Sparkles,
  List as ListIcon, LayoutGrid, CheckCircle2, HelpCircle, XCircle, LogOut,
} from 'lucide-react';
import './App.css';
import { useStore, CATEGORY_LABELS, CATEGORY_THEME } from './data/store.jsx';
import { useAnnouncements, normalizeProfile } from './hooks/useAnnouncements.js';
import { matchAnnouncement, applyStatus } from '../server/lib/match.js';
import { logout, toggleFavorite } from './data/auth.js';
import { aiSearch } from './data/api.js';
import FilterBar from './components/FilterBar.jsx';
import AnnouncementList from './components/AnnouncementList.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import AuthModal from './components/AuthModal.jsx';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const formatDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = formatDate(new Date());

function App() {
  const { state, dispatch } = useStore();
  const { status, source, lastCrawlAt, list, monthEvents, overflow, calMode, calShown, laneCount, sort } =
    useAnnouncements();
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResults, setAiResults] = useState(null); // null = AI 검색 비활성
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const favoriteItems = useMemo(() => {
    const ids = Object.keys(state.favorites);
    if (!ids.length) return [];
    const profile = state.profile ? normalizeProfile(state.profile) : null;
    return state.announcements
      .filter((a) => state.favorites[a.id])
      .map((a) => (profile ? { ...a, match: matchAnnouncement(a, profile) } : a))
      .sort((a, b) => (a.applyEnd || '9999-99-99').localeCompare(b.applyEnd || '9999-99-99'));
  }, [state.announcements, state.favorites, state.profile]);

  const runAiSearch = async () => {
    if (!aiQuery.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      setAiResults(await aiSearch(aiQuery.trim()));
    } catch (e) {
      setAiError(e.message);
      setAiResults(null);
    } finally {
      setAiLoading(false);
    }
  };
  const clearAiSearch = () => { setAiResults(null); setAiError(''); setAiQuery(''); };

  const goHome = () => {
    clearAiSearch();
    setShowFavorites(false);
    dispatch({ type: 'SELECT', id: null });
    dispatch({ type: 'SET_VIEW', view: 'calendar' });
    dispatch({ type: 'SET_FILTER', patch: { keyword: '', categories: [], status: 'all' } });
    dispatch({ type: 'SET_MONTH', date: new Date() });
  };

  const openFavorites = () => {
    clearAiSearch();
    setShowFavorites(true);
  };

  const selected = useMemo(
    () => list.find((a) => a.id === state.selectedId) || state.announcements.find((a) => a.id === state.selectedId),
    [list, state.announcements, state.selectedId],
  );

  if (state.view === 'detail' && selected) {
    return (
      <>
        <DetailPage announcement={selected} onBack={() => dispatch({ type: 'SELECT', id: null })}
          onRequireAuth={() => setShowAuth(true)} />
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  return (
    <div className="container calendar-page">
      <header className="cal-hero-header">
        <div className="cal-nav-bar">
          <button className="cal-logo-group" onClick={goHome} aria-label="홈으로 이동">
            <div className="cal-logo-icon"><CalendarIcon size={24} color="#ffffff" /></div>
            <div>
              <div className="service-tag"><Sparkles size={12} /> 화성시 맞춤 혜택</div>
              <h1 className="hero-title">공공 서비스 캘린더</h1>
            </div>
          </button>
          <div className="user-action-group">
            <button className="user-profile-pill" onClick={() => setShowProfile(true)}>
              <User size={18} />
              <span>{state.profile ? '내 조건 수정' : '내 조건 설정'}</span>
            </button>
            {state.user && (
              <button className={`user-profile-pill ${showFavorites ? 'accent' : ''}`} onClick={openFavorites}>
                <Heart size={18} />
                <span>내 관심항목{Object.keys(state.favorites).length > 0 ? ` (${Object.keys(state.favorites).length})` : ''}</span>
              </button>
            )}
            {state.user ? (
              <button className="user-profile-pill" title="로그아웃"
                onClick={async () => { await logout(); dispatch({ type: 'AUTH_CLEAR' }); setShowFavorites(false); }}>
                <span className="pill-email">{state.user.email}</span>
                <LogOut size={16} />
              </button>
            ) : (
              <button className="user-profile-pill accent" onClick={() => setShowAuth(true)}>
                <User size={18} /><span>로그인</span>
              </button>
            )}
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

          <div className="cal-search-box ai-search-box">
            <Sparkles size={20} className="search-icon" />
            <input
              type="text"
              placeholder="AI 검색: 예) 화성시 사는 신혼부부가 받을 수 있는 지원금 알려줘"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runAiSearch()}
              autoComplete="off" spellCheck="false"
            />
            {aiResults ? (
              <button className="btn-search-action" onClick={clearAiSearch}>닫기</button>
            ) : (
              <button className="btn-search-action" onClick={runAiSearch} disabled={aiLoading || !aiQuery.trim()}>
                {aiLoading ? '검색 중…' : 'AI 검색'}
              </button>
            )}
          </div>
          {aiError && <div className="ai-search-error">{aiError}</div>}
        </div>
      </header>

      {showFavorites ? (
        <>
          <div className="view-toggle">
            <span className="data-note"><Heart size={14} /> 내 관심항목 {favoriteItems.length}건</span>
            <button onClick={goHome}>전체 공고로 돌아가기</button>
          </div>
          {favoriteItems.length === 0 ? (
            <div className="al-empty">아직 관심 등록한 공고가 없습니다. 공고 상세에서 <strong>관심</strong> 버튼을 눌러보세요.</div>
          ) : (
            <AnnouncementList items={favoriteItems} />
          )}
        </>
      ) : aiResults ? (
        <>
          <div className="view-toggle">
            <span className="data-note"><Sparkles size={14} /> AI 검색 결과 {aiResults.length}건</span>
          </div>
          <AnnouncementList items={aiResults} />
        </>
      ) : (
        <>
          <FilterBar onOpenProfile={() => setShowProfile(true)} resultCount={list.length} activeSort={sort} />

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
                calMode={calMode} calShown={calShown} month={state.currentMonth} dispatch={dispatch} />
            : <AnnouncementList items={list} />}
        </>
      )}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}

function CalendarView({ monthEvents, overflow, laneCount, calMode, calShown, month, dispatch }) {
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

  // 달력에 실제로 등장하는 카테고리만 범례로
  const legend = useMemo(() => {
    const seen = [];
    for (const e of monthEvents) if (!seen.includes(e.category)) seen.push(e.category);
    return seen;
  }, [monthEvents]);
  const hasIneligible = monthEvents.some((e) => e.match?.eligible === 'no');

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
                      const dimCls = ev.match?.eligible === 'no' ? ' bar-dim' : '';
                      return (
                        <div key={lane}
                          className={`bar-item theme-${CATEGORY_THEME[ev.category]} ${isStart ? 'is-start' : ''} ${isEnd ? 'is-end' : ''}${dimCls}`}
                          onClick={() => dispatch({ type: 'SELECT', id: ev.id })}
                          title={ev.title}>
                          {isStart && <span className="bar-text">{ev.title}</span>}
                          <span className="bar-tip">{ev.title} · {ev._start}~{ev._end}</span>
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

      {legend.length > 0 && (
        <div className="cal-legend">
          {legend.map((cat) => (
            <span key={cat}><i className={`theme-${CATEGORY_THEME[cat]}`} />{CATEGORY_LABELS[cat]}</span>
          ))}
          {hasIneligible && <span><i className="leg-dim" />조건 미달 (흐리게 표시)</span>}
        </div>
      )}

      <div className="cal-overflow">
        {calShown === 0
          ? <>이번 달에 표시할 공고가 없습니다. <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'list' })}>리스트</button>에서 전체를 확인하세요.</>
          : calMode === 'recent'
            ? <>조건·카테고리 미선택 — 최근 등록된 공고 {calShown}건을 표시 중입니다. 위에서 <strong>카테고리</strong>를 고르거나 <strong>내 조건</strong>을 설정하면 맞춤 공고가 나옵니다.</>
            : <>선택한 조건에 맞는 공고 {calShown}건을 표시 중입니다{overflow.length > 0 ? `, ${overflow.length}건은 겹쳐서 생략` : ''}. 전체는 <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'list' })}>리스트</button>에서 확인하세요.</>}
      </div>
    </div>
  );
}

const ELIG_ICON = {
  yes: <CheckCircle2 size={16} className="text-green" />,
  maybe: <HelpCircle size={16} className="text-yellow" />,
  no: <XCircle size={16} className="text-pink" />,
};

function DetailPage({ announcement: a, onBack, onRequireAuth }) {
  const { state, dispatch } = useStore();
  const c = a.criteria || {};
  const profile = state.profile ? normalizeProfile(state.profile) : null;
  const match = profile ? matchAnnouncement(a, profile) : null;
  const st = applyStatus(a);
  const statusLabel = { open: '신청중', upcoming: '접수 예정', closed: '접수 마감', always: '상시 접수' }[st];

  const fav = state.favorites[a.id];
  const [busy, setBusy] = useState(false);

  const onFav = async () => {
    if (!state.user) return onRequireAuth();
    setBusy(true);
    try {
      const { favorites } = await toggleFavorite(a.id, !fav);
      dispatch({ type: 'SET_FAVORITES', favorites });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

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
          <button className={`btn-outline ${fav ? 'on' : ''}`} onClick={onFav} disabled={busy}>
            <Heart size={18} fill={fav ? 'currentColor' : 'none'} /> {fav ? '관심 등록됨' : '관심'}
          </button>
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

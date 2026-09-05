import React, { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Heart, 
  Search, 
  MapPin, 
  DollarSign, 
  Wallet, 
  GraduationCap, 
  Home, 
  Info, 
  User,
  Calendar as CalendarIcon,
  Bell,
  Sparkles
} from 'lucide-react';
import './App.css';

// 💡 4가지 데이터 세팅 (슬롯 번호 포함)
const MOCK_EVENTS = [
  {
    id: 'youth_income',
    shortTitle: '청년기본소득 3분기',
    fullTitle: '2026년 3분기 경기도 청년기본소득 신청',
    startDate: '2026-09-01',
    endDate: '2026-10-02',
    category: 'gyeonggi',
    badge: '경기도',
    slot: 0,
    targetInfo: {
      age: '만 24세 청년 (2001.07.02 ~ 2002.07.01 출생)',
      income: '소득 무관 (소득·재산 심사 없음)',
      asset: '조건 없음',
      residence: '경기도 3년 이상 연속 또는 합산 10년 이상 거주'
    },
    method: '잡아바 어플라이(apply.jobaba.net) 온라인/모바일 접수',
    desc: '분기별 25만 원 (연 최대 100만 원) 지역화폐 지급',
    location: '주민등록 관할 시·군청'
  },
  {
    id: 'national_scholarship',
    shortTitle: '국가장학금 2차',
    fullTitle: '2026학년도 2학기 국가장학금 2차 신청',
    startDate: '2026-08-12',
    endDate: '2026-09-09',
    category: 'gov',
    badge: '정부',
    slot: 1,
    targetInfo: {
      age: '대학 신입생·편입생·복학생·재학생',
      income: '학자금 지원구간 8구간 이하',
      asset: '가구원 소득 및 재산 조사',
      residence: '전국 공통'
    },
    method: '한국장학재단 홈페이지 및 앱 신청',
    desc: '등록금 필수 경비 전액 또는 구간별 차등 지원',
    location: '한국장학재단'
  },
  {
    id: 'hwaseong_loan',
    shortTitle: '다자녀 대출이자',
    fullTitle: '화성시 다자녀가구 주택자금 대출이자 지원사업',
    startDate: '2026-08-18',
    endDate: '2026-09-11',
    category: 'hwaseong',
    badge: '화성시',
    slot: 2,
    targetInfo: {
      age: '제한 없음 (다자녀 가구)',
      income: '기준 중위소득 180% 이하',
      asset: '무주택 세대구성원',
      residence: '부모·자녀 모두 화성시 주민등록 거주'
    },
    method: '주소지 읍·면·동 행정복지센터 방문 신청',
    desc: '주택 대출 잔액의 1.5% 내 최대 150만 원 지원',
    location: '관할 읍면동 행정복지센터'
  },
  {
    id: 'geoje_fund',
    shortTitle: '거제·통영 특별모금',
    fullTitle: '화성시 거제·통영 호우피해 지원 특별모금',
    startDate: '2026-08-18',
    endDate: '2026-09-15',
    category: 'hwaseong',
    badge: '화성시',
    slot: 3,
    targetInfo: {
      age: '전 국민 누구나 참여 가능',
      income: '제한 없음',
      asset: '제한 없음',
      residence: '제한 없음'
    },
    method: '농협 301-0190-2998-71 (사회복지공동모금회)',
    desc: '호우 피해 지역 이재민 구호 특별 모금',
    location: '화성시복지재단'
  }
];

function App() {
  const [currentPage, setCurrentPage] = useState('calendar');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date(2026, 8, 1)); // 2026년 9월
  const [selectedEvent, setSelectedEvent] = useState(null);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // 💡 달력 그리드용 5주 날짜 계산 (구글 캘린더 방식)
  const weeks = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = firstDayOfMonth.getDay();
    
    const startDate = new Date(year, month, 1 - startDayOfWeek);
    const resultWeeks = [];
    let currentCursor = new Date(startDate);

    for (let w = 0; w < 5; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = formatDate(currentCursor);
        week.push({
          dateStr,
          dayNum: currentCursor.getDate(),
          isCurrentMonth: currentCursor.getMonth() === month,
          isToday: dateStr === '2026-09-02',
          dayOfWeek: d
        });
        currentCursor.setDate(currentCursor.getDate() + 1);
      }
      resultWeeks.push(week);
    }
    return resultWeeks;
  }, [currentDate]);

  const handleEventClick = (event) => {
    setSelectedEvent(event);
    setCurrentPage('detail');
  };

  // ================= 1. 달력 페이지 화면 =================
  if (currentPage === 'calendar') {
    return (
      <div className="container calendar-page">
        {/* 상단 통합 헤더 배너 (고객님 원본 100% 유지) */}
        <header className="cal-hero-header">
          <div className="cal-nav-bar">
            <div className="cal-logo-group">
              <div className="cal-logo-icon">
                <CalendarIcon size={24} color="#ffffff" />
              </div>
              <div>
                <div className="service-tag"><Sparkles size={12} /> 정부·지자체 맞춤 복지</div>
                <h1 className="hero-title">공공 서비스 캘린더</h1>
              </div>
            </div>
            <div className="user-action-group">
              <button className="icon-badge-btn" title="알림">
                <Bell size={20} />
                <span className="dot-badge"></span>
              </button>
              <div className="user-profile-pill">
                <User size={18} />
                <span>내 지원금 관리</span>
              </div>
            </div>
          </div>

          {/* 중앙 검색창 & 추천 검색어 (고객님 원본 100% 유지) */}
          <div className="cal-search-container">
            <div className="cal-search-box">
              <Search size={20} className="search-icon" />
              <input 
                type="text" 
                placeholder="지역명(예: 화성시 동탄) 또는 지원금 명칭을 입력하세요" 
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              <button className="btn-search-action">조회</button>
            </div>

            <div className="quick-tags">
              <span className="tag-label">인기 키워드 :</span>
              <button className="tag-chip active">#청년기본소득</button>
              <button className="tag-chip">#국가장학금</button>
              <button className="tag-chip">#다자녀지원</button>
              <button className="tag-chip">#동탄/화성시</button>
            </div>
          </div>
        </header>

        {/* 캘린더 메인 카드 (고객님 뼈대 유지 + 내부 그리드만 변경) */}
        <div className="cal-card">
          <div className="cal-month-nav">
            <button className="icon-btn" onClick={prevMonth}><ChevronLeft size={22} /></button>
            <h2>{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</h2>
            <button className="icon-btn" onClick={nextMonth}><ChevronRight size={22} /></button>
          </div>

          <div className="cal-grid-new">
            {/* 요일 헤더 */}
            <div className="cal-day-name text-red">일</div>
            <div className="cal-day-name">월</div>
            <div className="cal-day-name">화</div>
            <div className="cal-day-name">수</div>
            <div className="cal-day-name">목</div>
            <div className="cal-day-name">금</div>
            <div className="cal-day-name text-blue">토</div>

            {/* ✨ 주 단위 루프 및 연속 바 렌더링 */}
            <div className="cal-weeks-body">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="cal-week-row">
                  {week.map((day, dIdx) => (
                    <div key={dIdx} className={`cal-cell-new ${!day.isCurrentMonth ? 'empty' : ''} ${day.isToday ? 'today' : ''}`}>
                      <div className="day-num-label">{day.dayNum}</div>
                      
                      <div className="bar-slot-container">
                        {[0, 1, 2, 3].map(slotIndex => {
                          const event = MOCK_EVENTS.find(e => e.slot === slotIndex);
                          if (!event) return <div key={slotIndex} className="bar-spacer" />;

                          const isInside = day.dateStr >= event.startDate && day.dateStr <= event.endDate;
                          if (!isInside) return <div key={slotIndex} className="bar-spacer" />;

                          const isStart = day.dateStr === event.startDate || day.dayOfWeek === 0;
                          const isEnd = day.dateStr === event.endDate || day.dayOfWeek === 6;

                          return (
                            <div
                              key={slotIndex}
                              className={`bar-item theme-${event.category} ${isStart ? 'is-start' : ''} ${isEnd ? 'is-end' : ''}`}
                              onClick={() => handleEventClick(event)}
                            >
                              {isStart && <span className="bar-text">{event.shortTitle}</span>}
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
        </div>
      </div>
    );
  }

  // ================= 2. 상세 화면 (고객님 원본 UI 100% 유지 + 데이터 매핑) =================
  return (
    <div className="container">
      <header className="header">
        <div className="header-top">
          <button className="icon-btn" onClick={() => setCurrentPage('calendar')}>
            <ChevronLeft size={28} />
          </button>
          <div className="title-area">
            <h1>{selectedEvent.fullTitle}</h1>
            <span className="badge">{selectedEvent.badge} 지원사업</span>
          </div>
          <div className="date-area">
            <span>신청기간: {selectedEvent.startDate} ~ {selectedEvent.endDate}</span>
          </div>
        </div>
        
        <div className="header-bottom">
          <button className="btn-primary">온라인 신청하기 (바로가기)</button>
          <button className="btn-outline"><Heart size={18} /> 관심</button>
        </div>
      </header>

      <main className="content-grid">
        {/* 왼쪽: 자격요건 */}
        <section className="card">
          <div className="card-header">
            <Info className="icon-blue" />
            <h2>{selectedEvent.shortTitle} 자격요건</h2>
          </div>
          
          <div className="age-timeline">
            <p className="timeline-title">지원 대상 연령 : <strong>{selectedEvent.targetInfo.age}</strong></p>
            <div className="timeline-bar"></div>
          </div>

          <div className="req-grid">
            <div className="req-item">
              <DollarSign className="req-icon text-yellow" />
              <div>
                <h3>가구소득</h3>
                <p>{selectedEvent.targetInfo.income}</p>
              </div>
            </div>
            <div className="req-item">
              <Wallet className="req-icon text-pink" />
              <div>
                <h3>자산/기타</h3>
                <p>{selectedEvent.targetInfo.asset}</p>
              </div>
            </div>
            <div className="req-item">
              <Home className="req-icon text-green" />
              <div>
                <h3>거주 요건</h3>
                <p>{selectedEvent.targetInfo.residence}</p>
              </div>
            </div>
            <div className="req-item">
              <GraduationCap className="req-icon text-blue" />
              <div>
                <h3>지원 내용</h3>
                <p>{selectedEvent.desc}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 오른쪽: 신청 방법 및 지도 */}
        <section className="card">
          <div className="card-header">
            <MapPin className="icon-green" />
            <h2>신청 방법</h2>
          </div>

          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input type="text" defaultValue={selectedEvent.method} readOnly />
            <button className="btn-search">확인</button>
          </div>
          
          <p className="map-title">가장 가까운 접수처 찾기</p>
          
          <div className="map-container">
            <iframe 
              title="real-map"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3175.76!2d127.0694!3d37.2052!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x357b43a3b5a19c5b%3A0x6e9f5e135f55b9a4!2z64-Z7YOEMeqwgCDtlonsoJXrs7Xsp4DsEv7Yw!5e0!3m2!1sko!2skr!4v1700000000000!5m2!1sko!2skr" 
              width="100%" 
              height="100%" 
              style={{ border: 0 }} 
              allowFullScreen="" 
              loading="lazy" 
              referrerPolicy="no-referrer-when-downgrade">
            </iframe>
            
            <div className="map-overlay">
              <div className="map-popup">
                <h4>{selectedEvent.location}</h4>
                <p>관할 구역을 확인하세요</p>
                <button className="btn-detail">상세보기</button>
              </div>
              <div className="map-marker">
                <MapPin size={38} fill="#ef4444" color="white" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
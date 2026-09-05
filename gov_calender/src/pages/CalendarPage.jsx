import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, ChevronLeft, ChevronRight } from 'lucide-react';

function CalendarPage() {
  const navigate = useNavigate();

  // 청년월세지원 클릭 시 이동하는 함수
  const goToDetail = () => {
    navigate('/detail');
  };

  return (
    <div className="container calendar-page">
      <header className="cal-header">
        <h1>공공 서비스 캘린더</h1>
        <button className="icon-btn"><User size={24} /></button>
      </header>

      <div className="cal-search-box">
        <Search size={20} className="search-icon" />
        <input type="text" placeholder="지역명 또는 지원금 검색" />
      </div>

      <div className="cal-card">
        <div className="cal-month-nav">
          <button className="icon-btn"><ChevronLeft /></button>
          <h2>2026년 8월</h2>
          <button className="icon-btn"><ChevronRight /></button>
        </div>

        <div className="cal-grid">
          {/* 요일 헤더 */}
          <div className="cal-day-name text-red">일</div>
          <div className="cal-day-name">월</div>
          <div className="cal-day-name">화</div>
          <div className="cal-day-name">수</div>
          <div className="cal-day-name">목</div>
          <div className="cal-day-name">금</div>
          <div className="cal-day-name text-blue">토</div>

          {/* 1주차 */}
          <div className="cal-cell empty">26</div><div className="cal-cell empty">27</div>
          <div className="cal-cell empty">28</div><div className="cal-cell empty">29</div>
          <div className="cal-cell empty">30</div><div className="cal-cell empty">31</div>
          <div className="cal-cell">1</div>

          {/* 2주차 */}
          <div className="cal-cell">2</div>
          <div className="cal-cell">3</div>
          <div className="cal-cell">4
            {/* ✨ 클릭 가능한 청년월세지원 이벤트 바 */}
            <div className="event-bar bg-blue cursor-pointer" onClick={goToDetail}>
              청년월세지원 신청 기간
            </div>
          </div>
          <div className="cal-cell">5</div>
          <div className="cal-cell">6</div>
          <div className="cal-cell">7</div>
          <div className="cal-cell">8</div>

          {/* 3주차 */}
          <div className="cal-cell">9</div>
          <div className="cal-cell">10</div>
          <div className="cal-cell">11
            <div className="event-bar bg-green">기본형 공익직불금 신청 기간</div>
          </div>
          <div className="cal-cell">12</div>
          <div className="cal-cell today">13</div> {/* 강조된 날짜 */}
          <div className="cal-cell">14</div>
          <div className="cal-cell">15</div>

          {/* 4주차 */}
          <div className="cal-cell">16</div>
          <div className="cal-cell">17</div>
          <div className="cal-cell">18
            <div className="event-bar bg-yellow">에너지바우처 신청 기간</div>
          </div>
          <div className="cal-cell">19</div>
          <div className="cal-cell">20</div>
          <div className="cal-cell">21</div>
          <div className="cal-cell">22</div>

          {/* 5주차 */}
          <div className="cal-cell">23</div>
          <div className="cal-cell">24
            <div className="event-pill bg-pink">청년월세...</div>
          </div>
          <div className="cal-cell current-day">25</div> {/* 26년 8월 25일 (오늘) */}
          <div className="cal-cell">26</div>
          <div className="cal-cell">27</div>
          <div className="cal-cell">28</div>
          <div className="cal-cell">29</div>
        </div>
      </div>
    </div>
  );
}

export default CalendarPage;
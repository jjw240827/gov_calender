import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Heart, Search, MapPin, DollarSign, Wallet, GraduationCap, Home, Info } from 'lucide-react';

function DetailPage() {
  const navigate = useNavigate();

  return (
    <div className="container">
      <header className="header">
        <div className="header-top">
          {/* 뒤로 가기 버튼에 캘린더 이동 함수 연결 */}
          <button className="icon-btn" onClick={() => navigate('/')}><ChevronLeft size={28} /></button>
          <div className="title-area">
            <h1>청년월세지원</h1>
            <span className="badge">상시 신청 가능</span>
          </div>
          <div className="date-area">
            <span>2026년 8월 25일, 화요일</span>
          </div>
        </div>
        
        <div className="header-bottom">
          <button className="btn-primary">온라인 신청하기 (복지로/정부24 바로가기)</button>
          <button className="btn-outline"><Heart size={18} /> 관심</button>
        </div>
      </header>

      <main className="content-grid">
        {/* 왼쪽: 자격요건 */}
        <section className="card">
          <div className="card-header">
            <Info className="icon-blue" />
            <h2>청년월세지원 자격요건</h2>
          </div>
          
          <div className="age-timeline">
            <p className="timeline-title">지원 대상 연령 : <strong>만 19세 ~ 만 39세</strong></p>
            <div className="timeline-bar"></div>
          </div>

          <div className="req-grid">
            <div className="req-item">
              <DollarSign className="req-icon text-yellow" />
              <div>
                <h3>가구소득</h3>
                <p>기준 중위소득 60% 이하<br/>(원가구 중위소득 100% 이하)</p>
              </div>
            </div>
            <div className="req-item">
              <Wallet className="req-icon text-pink" />
              <div>
                <h3>자산</h3>
                <p>청년가구 1.22억 원 이하<br/>(원가구 4.7억 원 이하)</p>
              </div>
            </div>
            <div className="req-item">
              <Home className="req-icon text-green" />
              <div>
                <h3>주택유형</h3>
                <p>보증금 5천만원 이하 및<br/>월세 70만원 이하 주택</p>
              </div>
            </div>
            <div className="req-item">
              <GraduationCap className="req-icon text-blue" />
              <div>
                <h3>대상현황</h3>
                <p>부모와 별도 거주하는<br/>무주택 청년 (독립가구)</p>
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
            <input type="text" defaultValue="경기도 화성시 동탄동" />
            <button className="btn-search">검색</button>
          </div>
          
          <p className="map-title">가장 가까운 행정복지센터 찾기</p>
          
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
                <h4>동탄1동 행정복지센터</h4>
                <p>경기도 화성시 노작로 226-9</p>
                <button className="btn-detail">상세보기</button>
              </div>
              <div className="map-marker">
                <MapPin size={40} fill="#ef4444" color="white" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default DetailPage;
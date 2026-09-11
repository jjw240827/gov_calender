// 제목/본문 → category, is_benefit 판정 (PROJECT_SPEC.md §0.2, §1.2)

// 카테고리별 키워드 (우선순위 순서대로 평가)
const CATEGORY_RULES = [
  ['youth',     ['청년', '대학생', '청소년', '학자금', '장학']],
  ['housing',   ['전세', '월세', '임대주택', '주거급여', '보금자리', '매입임대', '전월세보증금', '이사비', '중개보수']],
  ['childcare', ['보육료', '아이돌봄', '유아학비', '출산지원', '육아', '산모신생아', '다자녀', '아동수당', '첫만남이용권', '난임']],
  ['job',       ['채용', '일자리사업', '구직활동', '취업지원', '인턴', '공공근로', '직업훈련', '고용장려', '내일채움']],
  ['business',  ['소상공인', '자영업', '창업지원', '경영안정', '소공인', '전통시장 상인']],
  ['subsidy',   ['보조금', '지원금', '바우처', '수당', '융자', '이자지원', '재난지원', '지역화폐', '장려금', '보상금 지원']],
  ['welfare',   ['기초생활', '수급자', '차상위', '저소득', '장애인 지원', '노인 지원', '한부모', '돌봄서비스', '취약계층']],
];

// 제목에 있으면 혜택성으로 강하게 판정하는 신호어
const STRONG_TITLE_SIGNALS = [
  '모집 공고', '모집공고', '모집 안내', '신청자 모집', '대상자 모집', '참여자 모집',
  '지원사업', '지원 사업', '지원자 모집', '수혜자', '장학생', '바우처',
  '수당 신청', '지원금 신청', '신청 안내', '참여기업 모집', '수강생 모집', '교육생 모집',
];

// 본문/제목 전체에서 보는 약한 신호어
const BENEFIT_SIGNALS = ['신청', '모집', '지원', '접수', '선정', '바우처', '수당', '보조금', '지원금', '장학', '융자'];

// 명백히 혜택 아님 (행정공고). 제목에 있으면 무조건 제외.
const NON_BENEFIT_SIGNALS = [
  '공시송달', '과태료', '체납', '압류', '공매', '입찰', '낙찰', '지명원', '반송',
  '고발', '행정처분', '영업정지', '도시계획', '지적재조사', '보상계획', '부담금', '단가 공고',
  '수용재결', '열람공고', '의견제출', '개발행위', '용도지역', '지구단위계획', '분뇨', '하수도',
  '건축허가', '도로구역', '실시계획', '준공', '환지', '감정평가', '경계결정', '설계용역',
  '민간위탁', '수탁기관', '위탁법인', '수탁법인', '성과평가', '성과평과', '위탁 협약',
  '선정결과', '수상작', '재결', '결과 공고', '결과공고', '지장물', '편입토지', '취소공고',
  '재산세', '취득세', '주민세', '지방소득세', '세무조사', '납세', '고지서',
  '중요재산 현황', '재산 현황 등 공시', '수요조사', '재산 취득', '처분 공고',
];

export function classify(title, bodyText) {
  const text = `${title}\n${bodyText || ''}`;

  if (NON_BENEFIT_SIGNALS.some((k) => title.includes(k))) {
    return { category: 'etc', isBenefit: false };
  }

  let category = 'etc';
  for (const [cat, keywords] of CATEGORY_RULES) {
    if (keywords.some((k) => text.includes(k))) { category = cat; break; }
  }

  const strongTitle = STRONG_TITLE_SIGNALS.some((k) => title.includes(k));
  const weakSignal = BENEFIT_SIGNALS.some((k) => text.includes(k));

  // 혜택 판정: (제목 강신호) 또는 (카테고리 잡힘 + 약신호)
  const isBenefit = strongTitle || (category !== 'etc' && weakSignal);

  if (!isBenefit) return { category: 'etc', isBenefit: false };
  return { category: category === 'etc' ? 'subsidy' : category, isBenefit: true };
}

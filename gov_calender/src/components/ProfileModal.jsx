// 사용자 프로필 입력 모달 (PROJECT_SPEC.md §4.3)
import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore, emptyProfile } from '../data/store.jsx';

const RESIDENCE_OPTIONS = [
  ['', '선택 안 함'],
  ['hwaseong', '화성시 (읍·면·동 무관)'],
  ['hwaseong_동탄1동', '화성시 동탄1동'],
  ['hwaseong_동탄2동', '화성시 동탄2동'],
  ['hwaseong_병점1동', '화성시 병점1동'],
  ['hwaseong_봉담읍', '화성시 봉담읍'],
  ['hwaseong_향남읍', '화성시 향남읍'],
  ['gyeonggi', '경기도 (화성시 외)'],
  ['other', '그 외 지역'],
];

const HOUSEHOLD = ['무주택', '다자녀', '한부모', '신혼부부', '1인가구', '장애인', '기초수급', '임산부'];
const OCCUPATION = ['청년', '대학생', '소상공인', '농업인', '어업인', '구직자', '재직자', '프리랜서'];

export default function ProfileModal({ onClose }) {
  const { state, dispatch } = useStore();
  const [form, setForm] = useState(state.profile || emptyProfile);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const save = () => {
    dispatch({ type: 'SET_PROFILE', profile: form });
    dispatch({ type: 'SET_FILTER', patch: { useProfile: true } });
    onClose();
  };

  return (
    <div className="pm-backdrop" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <h2>내 조건 설정</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="pm-sub">입력한 조건에 맞는 공고만 추천해 드려요. 정보는 이 브라우저에만 저장됩니다.</p>

        <div className="pm-row">
          <label>생년월일
            <input type="date" value={form.birthDate} onChange={(e) => set({ birthDate: e.target.value })} />
          </label>
          <label>거주지
            <select value={form.residence} onChange={(e) => set({ residence: e.target.value })}>
              {RESIDENCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="pm-row">
          <label>연속 거주 기간(년)
            <input type="number" min="0" step="0.5" value={form.residenceYears}
              onChange={(e) => set({ residenceYears: e.target.value })} placeholder="예: 3" />
          </label>
          <label>기준 중위소득(%)
            <input type="number" min="0" step="10" value={form.incomePct}
              onChange={(e) => set({ incomePct: e.target.value })} placeholder="모르면 비워두기" />
          </label>
        </div>

        <fieldset className="pm-chips">
          <legend>세대 특성</legend>
          {HOUSEHOLD.map((h) => (
            <button key={h} type="button"
              className={`tag-chip ${form.household.includes(h) ? 'active' : ''}`}
              onClick={() => toggle('household', h)}>{h}</button>
          ))}
        </fieldset>

        <fieldset className="pm-chips">
          <legend>직업 / 신분</legend>
          {OCCUPATION.map((o) => (
            <button key={o} type="button"
              className={`tag-chip ${form.occupation.includes(o) ? 'active' : ''}`}
              onClick={() => toggle('occupation', o)}>{o}</button>
          ))}
        </fieldset>

        <div className="pm-actions">
          {state.profile && (
            <button className="btn-outline" onClick={() => { dispatch({ type: 'CLEAR_PROFILE' }); onClose(); }}>
              초기화
            </button>
          )}
          <button className="btn-primary" onClick={save}>맞춤 추천 켜기</button>
        </div>
      </div>
    </div>
  );
}

// 로그인 / 회원가입 모달 (PROJECT_SPEC.md §9)
import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../data/store.jsx';
import { login, register, saveProfile } from '../data/auth.js';
import { normalizeProfile } from '../hooks/useAnnouncements.js';

export default function AuthModal({ onClose, reason }) {
  const { state, dispatch } = useStore();
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      // 회원가입 시: 지난번 지정한 '내 조건'을 계정에 그대로 이관
      const localProfile = state.profile ? normalizeProfile(state.profile) : null;
      const d = mode === 'signup'
        ? await register(email, password, localProfile || {})
        : await login(email, password);

      // 로그인인데 계정엔 조건이 없고 로컬엔 있으면 서버로 올림
      if (mode === 'login' && localProfile && !(d.user.profile && Object.keys(d.user.profile).length)) {
        try {
          const saved = await saveProfile(localProfile);
          d.user = { ...d.user, profile: saved.profile };
        } catch { /* 무시 */ }
      }

      dispatch({ type: 'AUTH_SET', user: d.user, favorites: d.favorites || [] });
      onClose();
    } catch (e2) {
      setErr(e2.message || '요청에 실패했습니다. API 서버(npm run api) 실행 여부를 확인하세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pm-backdrop" onClick={onClose}>
      <form className="pm-modal auth-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="pm-head">
          <h2>{mode === 'signup' ? '회원가입' : '로그인'}</h2>
          <button type="button" className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="pm-sub">
          {reason || '관심 공고 저장·알람 신청은 로그인 후 이용할 수 있습니다.'}
          {' '}지정해 둔 <strong>내 조건</strong>은 계정에 그대로 유지됩니다.
        </p>

        <label className="auth-field">
          이메일
          <input type="email" value={email} required autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <label className="auth-field">
          비밀번호
          <input type="password" value={password} required minLength={6}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)} placeholder="6자 이상" />
        </label>

        {err && <p className="auth-err">{err}</p>}

        <div className="pm-actions">
          <button type="button" className="btn-link"
            onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); }}>
            {mode === 'signup' ? '이미 계정이 있어요 → 로그인' : '계정이 없어요 → 회원가입'}
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '처리 중…' : mode === 'signup' ? '가입하고 시작' : '로그인'}
          </button>
        </div>
      </form>
    </div>
  );
}

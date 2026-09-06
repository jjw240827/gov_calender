// 데이터 소스: API 우선, 실패 시 정적 JSON 폴백 (PROJECT_SPEC.md §4.1)
import fallback from './announcements.json';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** 전체 혜택 공고 로드 (매칭/필터는 클라이언트에서 수행) */
export async function loadAnnouncements() {
  try {
    const res = await fetch(`${API_BASE}/announcements?benefitOnly=true`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      source: 'api',
      announcements: data.announcements,
      lastCrawlAt: data.lastCrawlAt ?? null,
    };
  } catch {
    return {
      source: 'static',
      announcements: fallback.announcements,
      lastCrawlAt: fallback.lastCrawlAt ?? fallback.generatedAt,
    };
  }
}

// 화성특례시청 공고고시 어댑터 (PROJECT_SPEC.md §2.1)
// 목록: /www/gosi/BD_selectGosiList.do  (GET, q_currPage / q_rowPerPage / q_notAncmtSeCode)
// 상세: /www/gosi/BD_selectGosiDetail.do (GET, q_notAncmtMgtNo)
import { load } from 'cheerio';
import { cleanText } from '../normalize.js';

const BASE = 'https://www.hscity.go.kr';
const LIST_PATH = '/www/gosi/BD_selectGosiList.do';
const DETAIL_PATH = '/www/gosi/BD_selectGosiDetail.do';
const UA = 'Mozilla/5.0 (compatible; gov-calendar-crawler/1.0)';

// 개별 네트워크 요청 타임아웃 (ms). CRAWL_TIMEOUT 환경변수로 조정 가능.
export const REQUEST_TIMEOUT = Number(process.env.CRAWL_TIMEOUT) || 4000;

async function fetchHtml(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err.name === 'TimeoutError' ? new Error(`timeout ${REQUEST_TIMEOUT}ms`) : err;
      if (i < tries - 1) await sleep(400 * 2 ** i);
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 공고 목록 한 페이지.
 * @returns {Promise<Array<{id,title,url,department,postedDate,postPeriod}>>}
 */
export async function list({ page = 1, rowPerPage = 20, seCode = '04' } = {}) {
  // 페이지네이션 실제 파라미터는 q_cp (q_currPage 는 표시용)
  const url = `${BASE}${LIST_PATH}?q_cp=${page}&q_currPage=${page}&q_rowPerPage=${rowPerPage}&q_notAncmtSeCode=${seCode}`;
  const $ = load(await fetchHtml(url));
  const out = [];

  $('table').first().find('tbody tr').each((_, tr) => {
    const $tds = $(tr).find('td');
    if ($tds.length < 5) return;
    const link = $(tr).find('a[href*="opGosiView"]');
    const m = link.attr('href')?.match(/opGosiView\('(\d+)'\)/);
    if (!m) return;
    const id = m[1];
    const period = cleanText($tds.eq(4).text()).match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    out.push({
      id,
      title: cleanText(link.text()),
      url: `${BASE}${DETAIL_PATH}?q_notAncmtMgtNo=${id}&q_notAncmtSeCode=${seCode}`,
      docNo: cleanText($tds.eq(0).text()),
      department: cleanText($tds.eq(2).text()),
      postedDate: cleanText($tds.eq(3).text()).slice(0, 10) || null,
      // 게재기간(공고 노출 기간) — 신청기간 추출 실패 시 근사값으로 사용
      postStart: period ? period[1] : null,
      postEnd: period ? period[2] : null,
    });
  });
  return out;
}

const LABELS = {
  제목: 'title',
  고시공고구분: 'seLabel',
  고시공고번호: 'docNo',
  '게재(공고)일자': 'postedDate',
  담당부서: 'department',
  '담당자/연락처': 'contact',
  첨부파일: 'attachmentsCell',
  내용: 'bodyCell',
};

/**
 * 공고 상세.
 * @returns {Promise<{docNo,department,contact,bodyText,attachments,seLabel,postedDate}>}
 */
export async function detail(id, { seCode = '04' } = {}) {
  const url = `${BASE}${DETAIL_PATH}?q_notAncmtMgtNo=${id}&q_notAncmtSeCode=${seCode}`;
  const $ = load(await fetchHtml(url));
  const t = $('table').first();
  const data = {};

  t.find('tr').each((_, tr) => {
    const key = LABELS[cleanText($(tr).find('th').first().text())];
    if (!key) return;
    const $td = $(tr).find('td').first();

    if (key === 'attachmentsCell') {
      data.attachments = [];
      $td.find('a[href*="goDownLoad"]').each((__, a) => {
        const args = $(a).attr('href').match(/goDownLoad\('([^']*)','([^']*)','([^']*)'\)/);
        if (!args) return;
        data.attachments.push({
          name: cleanText(args[1]),
          url: `${BASE}/component/file/ND_fileDownload.do?fileName=${encodeURIComponent(args[2])}&filePath=${encodeURIComponent(args[3])}`,
        });
      });
    } else if (key === 'bodyCell') {
      data.bodyText = cleanText($td.text());
    } else {
      data[key] = cleanText($td.text());
    }
  });

  return {
    title: data.title || null,
    docNo: data.docNo || null,
    department: data.department || null,
    contact: data.contact || null,
    seLabel: data.seLabel || null,
    postedDate: normalizePostedDate(data.postedDate),
    bodyText: data.bodyText || '',
    attachments: data.attachments || [],
  };
}

function normalizePostedDate(s) {
  if (!s) return null;
  const m = s.match(/(\d{4})[.-]?(\d{2})[.-]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export { BASE };

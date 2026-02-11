/**
 * DART 전자공시 재무제표 서비스
 * OpenDart API를 통해 5년 재무데이터(매출, 영업이익, R&D비, 인건비 등) 조회
 *
 * 사용 API:
 *   - /api/list.json      — 공시검색 (회사명 → corp_code)
 *   - /api/fnlttSinglAcnt.json — 단일회사 전체 재무제표
 *
 * 환경변수: DART_API_KEY (금융감독원 전자공시 API 키)
 */

export interface DartFinancialYear {
  year: number;
  revenue: number;           // 매출액
  operatingProfit: number;   // 영업이익
  netIncome: number;         // 당기순이익
  rndExpense: number;        // 연구개발비
  personnelExpense: number;  // 인건비(급여)
  totalAssets: number;       // 자산총계
  totalEquity: number;       // 자본총계
}

const DART_BASE = 'https://opendart.fss.or.kr/api';

function getApiKey(): string | null {
  return process.env.DART_API_KEY || null;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── corp_code 검색 ──────────────────────────────────────────

/**
 * 회사명으로 DART corp_code 검색
 * /api/list.json 공시검색을 통해 최근 공시를 가진 기업의 corp_code를 추출
 */
export async function findCorpCode(companyName: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey || !companyName) return null;

  try {
    const params = new URLSearchParams({
      crtfc_key: apiKey,
      corp_name: companyName,
      page_count: '5',
    });

    const url = `${DART_BASE}/list.json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[dartFinancialService] list.json HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    if (data.status !== '000') {
      // 000: 정상, 013: 조건에 맞는 데이터 없음
      if (data.status !== '013') {
        console.warn(`[dartFinancialService] list.json status: ${data.status} ${data.message}`);
      }
      return null;
    }

    const list = data.list as { corp_code: string; corp_name: string }[] | undefined;
    if (!list || list.length === 0) return null;

    // 정확히 이름이 일치하는 항목 우선
    const exact = list.find(item => item.corp_name === companyName);
    if (exact) return exact.corp_code;

    // 없으면 첫 번째 결과 반환
    return list[0].corp_code;
  } catch (e) {
    console.error('[dartFinancialService] findCorpCode error:', e);
    return null;
  }
}

// ─── 재무제표 조회 ──────────────────────────────────────────

// DART 계정과목 → DartFinancialYear 필드 매핑
const ACCOUNT_MAPPING: Record<string, keyof DartFinancialYear> = {
  '매출액': 'revenue',
  '수익(매출액)': 'revenue',
  '영업수익': 'revenue',
  '영업이익': 'operatingProfit',
  '영업이익(손실)': 'operatingProfit',
  '당기순이익': 'netIncome',
  '당기순이익(손실)': 'netIncome',
  '연구개발비': 'rndExpense',
  '경상연구개발비': 'rndExpense',
  '연구개발비용': 'rndExpense',
  '급여': 'personnelExpense',
  '종업원급여': 'personnelExpense',
  '인건비': 'personnelExpense',
  '자산총계': 'totalAssets',
  '자본총계': 'totalEquity',
};

/**
 * 단일 연도 재무제표 조회
 * reprt_code: 11011(사업보고서), 11014(반기), 11012(1분기), 11013(3분기)
 */
async function fetchSingleYear(
  corpCode: string,
  year: number,
  apiKey: string
): Promise<DartFinancialYear | null> {
  const params = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: corpCode,
    bsns_year: String(year),
    reprt_code: '11011', // 사업보고서
  });

  const url = `${DART_BASE}/fnlttSinglAcnt.json?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[dartFinancialService] fnlttSinglAcnt HTTP ${res.status} for ${year}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;

    // status '000': 정상, '013': 데이터 없음
    if (data.status !== '000') {
      if (data.status !== '013') {
        console.warn(`[dartFinancialService] fnlttSinglAcnt ${year}: ${data.status} ${data.message}`);
      }
      return null;
    }

    const list = data.list as {
      account_nm: string;
      thstrm_amount: string;
      sj_nm: string;
    }[] | undefined;

    if (!list || list.length === 0) return null;

    const result: DartFinancialYear = {
      year,
      revenue: 0,
      operatingProfit: 0,
      netIncome: 0,
      rndExpense: 0,
      personnelExpense: 0,
      totalAssets: 0,
      totalEquity: 0,
    };

    for (const item of list) {
      const field = ACCOUNT_MAPPING[item.account_nm];
      if (field && field !== 'year') {
        const amount = parseAmount(item.thstrm_amount);
        // 이미 값이 있으면 덮어쓰지 않음 (첫 매칭 우선)
        if (amount !== 0 && result[field] === 0) {
          (result as unknown as Record<string, number>)[field] = amount;
        }
      }
    }

    return result;
  } catch (e) {
    console.error(`[dartFinancialService] fetchSingleYear ${year} error:`, e);
    return null;
  }
}

/** 금액 문자열 파싱 (쉼표 제거, 음수 처리) */
function parseAmount(raw: string): number {
  if (!raw || raw === '-' || raw === '') return 0;
  const cleaned = raw.replace(/,/g, '').trim();
  return parseInt(cleaned, 10) || 0;
}

/**
 * 5년 재무제표 조회
 * 각 연도별 사업보고서에서 주요 계정과목 추출
 */
export async function fetchFinancialStatements(
  corpCode: string,
  years: number = 5
): Promise<DartFinancialYear[]> {
  const apiKey = getApiKey();
  if (!apiKey || !corpCode) return [];

  const currentYear = new Date().getFullYear();
  const results: DartFinancialYear[] = [];

  // 최근 연도부터 역순 조회 (사업보고서는 보통 전년도까지 존재)
  for (let i = 1; i <= years; i++) {
    const targetYear = currentYear - i;
    const data = await fetchSingleYear(corpCode, targetYear, apiKey);
    if (data) {
      results.push(data);
    }
    // rate limit 회피
    if (i < years) await delay(200);
  }

  // 연도순 정렬 (오래된 것부터)
  results.sort((a, b) => a.year - b.year);

  console.log(`[dartFinancialService] 재무제표 조회 완료: ${results.length}년분 (${corpCode})`);
  return results;
}

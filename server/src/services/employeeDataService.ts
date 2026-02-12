/**
 * 국민연금 가입 사업장 API V2 — 3단계 조회
 * Base: https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2
 *
 * V2 API는 단일 조회로 직원수/고지금액을 반환하지 않음.
 * 반드시 3단계 조회가 필요:
 *   1. /getBassInfoSearchV2  → seq(식별번호) 획득
 *   2. /getDetailInfoSearchV2 → jnngpCnt(가입자수), crrmmNtcAmt(고지금액)
 *   3. /getPdAcctoSttusInfoSearchV2 → nwAcqzrCnt(신규), lssJnngpCnt(상실)
 *
 * 파라미터: dataType=json (NOT type=json)
 * bzowrRgstNo: 앞 6자리만 전송 (응답도 앞6자리****)
 */

export interface NpsWorkplaceInfo {
  wkplNm: string;
  bzowrRgstNo: string;
  wkplRoadNmDtlAddr: string;
  ldongAddr: string;
  wkplJnngStdt: string;   // V2: adptDt (적용일자)
  nrOfJnng: number;        // V2: jnngpCnt (가입자수) — detail에서 조회
  crtmNtcAmt: number;      // V2: crrmmNtcAmt (당월고지금액) — detail에서 조회
  nwAcqzrCnt: number;      // V2: period에서 조회
  lssJnngpCnt: number;     // V2: period에서 조회
  dataCrtYm: string;
  seq?: number;            // 사업장 식별번호 (히스토리 조회용)
}

export interface NpsLookupResult {
  found: boolean;
  matchedByBusinessNumber: boolean;
  workplace: NpsWorkplaceInfo | null;
  dataCompleteness: number;
  lastUpdated: string;
  allWorkplaces?: NpsWorkplaceInfo[];
  historical?: {
    monthlyData: { dataCrtYm: string; employeeCount: number; newHires: number; departures: number }[];
    yearSummary: { year: number; avgEmployees: number; totalNewHires: number; totalDepartures: number; netChange: number }[];
    totalWorkplaces: number;
    dataRange: { from: string; to: string };
  };
}

const NPS_BASE = 'https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2';

function getApiKey(): string | null {
  return process.env.DATA_GO_KR_API_KEY || null;
}

/** 사업자등록번호 정규화 (하이픈 제거) */
function normalizeBizNo(bizNo: string): string {
  return bizNo.replace(/[^0-9]/g, '');
}

/** data.go.kr V2 JSON 응답에서 items.item[] 추출 */
function extractItems(data: Record<string, unknown>): Record<string, unknown>[] {
  const response = data?.response as Record<string, unknown> | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  const items = body?.items as Record<string, unknown> | undefined;
  const item = items?.item;

  if (Array.isArray(item)) return item as Record<string, unknown>[];
  if (item && typeof item === 'object' && !Array.isArray(item)) return [item as Record<string, unknown>];
  return [];
}

/** V2 응답 에러 체크 */
function checkApiError(data: Record<string, unknown>): string | null {
  const header = (data?.response as Record<string, unknown>)?.header as Record<string, unknown> | undefined;
  if (header?.resultCode && header.resultCode !== '00') {
    return `${header.resultCode}: ${header.resultMsg || 'Unknown error'}`;
  }
  return null;
}

// ─── Step 1: 기본정보 검색 (seq 획득) ────────────────────────

interface NpsBasicItem {
  seq: number;
  dataCrtYm: string;
  wkplNm: string;
  bzowrRgstNo: string;        // 앞6자리****
  wkplRoadNmDtlAddr: string;
  wkplJnngStcd: string;       // 1:가입, 2:탈퇴
  wkplStylDvcd: string;       // 1:법인, 2:개인
}

function parseBasicItem(raw: Record<string, unknown>): NpsBasicItem {
  return {
    seq: Number(raw.seq) || 0,
    dataCrtYm: String(raw.dataCrtYm ?? ''),
    wkplNm: String(raw.wkplNm ?? ''),
    bzowrRgstNo: String(raw.bzowrRgstNo ?? ''),
    wkplRoadNmDtlAddr: String(raw.wkplRoadNmDtlAddr ?? ''),
    wkplJnngStcd: String(raw.wkplJnngStcd ?? ''),
    wkplStylDvcd: String(raw.wkplStylDvcd ?? ''),
  };
}

/** 사업장명 또는 사업자등록번호(앞6자리)로 기본 검색 */
async function searchBasic(opts: { wkplNm?: string; bzowrRgstNo?: string }): Promise<NpsBasicItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[employeeDataService] DATA_GO_KR_API_KEY not configured');
    return [];
  }

  const params = new URLSearchParams({
    serviceKey: apiKey,
    dataType: 'json',
    pageNo: '1',
    numOfRows: '100',
  });
  if (opts.wkplNm) params.set('wkplNm', opts.wkplNm);
  if (opts.bzowrRgstNo) params.set('bzowrRgstNo', opts.bzowrRgstNo);

  const url = `${NPS_BASE}/getBassInfoSearchV2?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[employeeDataService] Basic search HTTP ${res.status}`);
      return [];
    }
    const data = await res.json() as Record<string, unknown>;
    const err = checkApiError(data);
    if (err) {
      console.warn(`[employeeDataService] Basic search API error: ${err}`);
      return [];
    }
    return extractItems(data).map(parseBasicItem);
  } catch (e) {
    console.error('[employeeDataService] Basic search error:', e);
    return [];
  }
}

// ─── Step 2: 상세정보 조회 (직원수, 고지금액) ────────────────

interface NpsDetailItem {
  jnngpCnt: number;       // 가입자수 (= 직원수)
  crrmmNtcAmt: number;    // 당월고지금액
  adptDt: string;         // 적용일자
  scsnDt: string;         // 탈퇴일자
  wkplIntpCd: string;     // 업종코드
  vldtVlKrnNm: string;    // 업종명
}

async function getDetail(seq: number): Promise<NpsDetailItem | null> {
  const apiKey = getApiKey();
  if (!apiKey || !seq) return null;

  const params = new URLSearchParams({
    serviceKey: apiKey,
    seq: String(seq),
    dataType: 'json',
  });

  const url = `${NPS_BASE}/getDetailInfoSearchV2?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const err = checkApiError(data);
    if (err) {
      console.warn(`[employeeDataService] Detail search error: ${err}`);
      return null;
    }
    const items = extractItems(data);
    if (items.length === 0) return null;

    const raw = items[0];
    return {
      jnngpCnt: Number(raw.jnngpCnt) || 0,
      crrmmNtcAmt: Number(raw.crrmmNtcAmt) || 0,
      adptDt: String(raw.adptDt ?? ''),
      scsnDt: String(raw.scsnDt ?? ''),
      wkplIntpCd: String(raw.wkplIntpCd ?? ''),
      vldtVlKrnNm: String(raw.vldtVlKrnNm ?? ''),
    };
  } catch (e) {
    console.error('[employeeDataService] Detail search error:', e);
    return null;
  }
}

// ─── Step 3: 기간별 현황 (신규/상실) ─────────────────────────

interface NpsPeriodItem {
  nwAcqzrCnt: number;     // 신규 취득자수
  lssJnngpCnt: number;    // 상실 가입자수
}

async function getPeriodStatus(seq: number, dataCrtYm?: string): Promise<NpsPeriodItem | null> {
  const apiKey = getApiKey();
  if (!apiKey || !seq) return null;

  const params = new URLSearchParams({
    serviceKey: apiKey,
    seq: String(seq),
    dataType: 'json',
  });
  if (dataCrtYm) params.set('dataCrtYm', dataCrtYm);

  const url = `${NPS_BASE}/getPdAcctoSttusInfoSearchV2?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    const err = checkApiError(data);
    if (err) {
      console.warn(`[employeeDataService] Period status error: ${err}`);
      return null;
    }
    const items = extractItems(data);
    if (items.length === 0) return null;

    const raw = items[0];
    return {
      nwAcqzrCnt: Number(raw.nwAcqzrCnt) || 0,
      lssJnngpCnt: Number(raw.lssJnngpCnt) || 0,
    };
  } catch (e) {
    console.error('[employeeDataService] Period status error:', e);
    return null;
  }
}

// ─── 공개 API ─────────────────────────────────────────────────

/** 사업자등록번호로 매칭 (V2: 앞 6자리 비교) */
function matchByBizNo(basics: NpsBasicItem[], businessNumber: string): NpsBasicItem | null {
  const prefix = normalizeBizNo(businessNumber).substring(0, 6);
  if (!prefix) return null;
  return basics.find(b => normalizeBizNo(b.bzowrRgstNo).startsWith(prefix)) || null;
}

/** 회사명 유사도 매칭 — NPS 사업장명에서 원래 회사명이 포함되는지 확인 */
function normalizeCompanyName(name: string): string {
  return name
    .replace(/^(주식회사|㈜|\(주\)|\(사\)|사단법인|재단법인|유한회사|합자회사)\s*/g, '')
    .replace(/\s*(주식회사|㈜|\(주\))$/g, '')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isCompanyNameMatch(npsName: string, targetName: string): boolean {
  const npsNorm = normalizeCompanyName(npsName);
  const targetNorm = normalizeCompanyName(targetName);
  if (!npsNorm || !targetNorm) return false;

  // 완전 일치
  if (npsNorm === targetNorm) return true;
  // 포함 관계
  if (npsNorm.includes(targetNorm) || targetNorm.includes(npsNorm)) return true;
  // 앞 3글자 일치 (짧은 이름 보호)
  if (targetNorm.length >= 2 && npsNorm.length >= 2) {
    const minLen = Math.min(3, Math.min(npsNorm.length, targetNorm.length));
    if (npsNorm.substring(0, minLen) === targetNorm.substring(0, minLen)) return true;
  }
  return false;
}

/** 데이터 완성도 점수 (0-100) */
export function calculateDataCompleteness(data: NpsWorkplaceInfo | null): number {
  if (!data) return 0;
  let score = 0;
  if (data.nrOfJnng > 0) score += 30;
  if (data.crtmNtcAmt > 0) score += 30;
  if (data.dataCrtYm) score += 15;
  if (data.wkplJnngStdt) score += 10;
  if (data.nwAcqzrCnt >= 0) score += 8;
  if (data.lssJnngpCnt >= 0) score += 7;
  return score;
}

const NOT_FOUND: NpsLookupResult = {
  found: false, matchedByBusinessNumber: false, workplace: null, dataCompleteness: 0, lastUpdated: '',
};

/**
 * 종합 조회: 3단계 (기본→상세→기간별)
 * 다중 사업장 통합: 동일 사업자번호 사업장 모두 조회 후 합산
 */
export async function fetchNpsEmployeeData(
  companyName: string,
  businessNumber?: string
): Promise<NpsLookupResult> {
  try {
    let basics: NpsBasicItem[] = [];
    let matchedByBizNo = false;

    // 1차: 사업자등록번호(앞6자리)로 검색 + 회사명 필터
    if (businessNumber) {
      const prefix = normalizeBizNo(businessNumber).substring(0, 6);
      if (prefix.length === 6) {
        const allByBizNo = await searchBasic({ bzowrRgstNo: prefix });
        // NPS V2는 앞6자리만 지원 → 다른 회사가 섞일 수 있으므로 회사명 매칭 필터
        const nameMatched = allByBizNo.filter(b => isCompanyNameMatch(b.wkplNm, companyName));
        if (nameMatched.length > 0) {
          basics = nameMatched;
          matchedByBizNo = true;
          console.log(`[employeeDataService] BizNo+Name matched: ${nameMatched.length}/${allByBizNo.length} workplaces`);
        } else if (allByBizNo.length > 0) {
          // 사업자번호는 매칭되지만 회사명이 안 맞음 → 다른 회사 가능성
          console.warn(`[employeeDataService] BizNo prefix ${prefix} returned ${allByBizNo.length} results, but none match "${companyName}". Falling through to name search.`);
        }
      }
    }

    // 2차: 사업자번호 검색 실패 또는 이름 불일치 시 사업장명으로 검색
    if (basics.length === 0) {
      basics = await searchBasic({ wkplNm: companyName });
    }

    if (basics.length === 0) return NOT_FOUND;

    // 가입 상태(1)인 사업장 필터
    const active = basics.filter(b => b.wkplJnngStcd === '1');
    const pool = active.length > 0 ? active : basics;

    // 동일 사업자번호 사업장 그룹핑 (이미 이름 필터를 거쳤으므로 안전)
    let matchedPool: NpsBasicItem[];
    if (matchedByBizNo && businessNumber) {
      const prefix = normalizeBizNo(businessNumber).substring(0, 6);
      matchedPool = pool.filter(b => normalizeBizNo(b.bzowrRgstNo).startsWith(prefix));
      if (matchedPool.length === 0) matchedPool = [pool[0]];
    } else {
      // 이름 검색으로 왔으면 첫 결과의 bzowrRgstNo로 그룹핑
      const firstBzNo = normalizeBizNo(pool[0].bzowrRgstNo).substring(0, 6);
      matchedPool = firstBzNo
        ? pool.filter(b => normalizeBizNo(b.bzowrRgstNo).startsWith(firstBzNo))
        : [pool[0]];
    }

    // 최대 5개 사업장만 조회 (rate limit 보호)
    const targetWorkplaces = matchedPool.slice(0, 5);
    console.log(`[employeeDataService] Found ${targetWorkplaces.length} workplace(s) for aggregation`);

    // 각 사업장별 상세 + 기간별 조회
    const allWorkplaces: NpsWorkplaceInfo[] = [];
    let totalEmployees = 0;
    let totalNtcAmt = 0;
    let totalNewHires = 0;
    let totalDepartures = 0;

    for (const basic of targetWorkplaces) {
      const detail = await getDetail(basic.seq);
      const period = await getPeriodStatus(basic.seq, basic.dataCrtYm);

      const wp: NpsWorkplaceInfo = {
        wkplNm: basic.wkplNm,
        bzowrRgstNo: basic.bzowrRgstNo,
        wkplRoadNmDtlAddr: basic.wkplRoadNmDtlAddr,
        ldongAddr: '',
        wkplJnngStdt: detail?.adptDt || '',
        nrOfJnng: detail?.jnngpCnt || 0,
        crtmNtcAmt: detail?.crrmmNtcAmt || 0,
        nwAcqzrCnt: period?.nwAcqzrCnt || 0,
        lssJnngpCnt: period?.lssJnngpCnt || 0,
        dataCrtYm: basic.dataCrtYm,
        seq: basic.seq,
      };

      allWorkplaces.push(wp);
      totalEmployees += wp.nrOfJnng;
      totalNtcAmt += wp.crtmNtcAmt;
      totalNewHires += wp.nwAcqzrCnt;
      totalDepartures += wp.lssJnngpCnt;
    }

    // 통합 workplace 생성 (합산)
    const primary = allWorkplaces[0];
    const workplace: NpsWorkplaceInfo = {
      wkplNm: primary.wkplNm,
      bzowrRgstNo: primary.bzowrRgstNo,
      wkplRoadNmDtlAddr: primary.wkplRoadNmDtlAddr,
      ldongAddr: '',
      wkplJnngStdt: primary.wkplJnngStdt,
      nrOfJnng: totalEmployees,
      crtmNtcAmt: totalNtcAmt,
      nwAcqzrCnt: totalNewHires,
      lssJnngpCnt: totalDepartures,
      dataCrtYm: primary.dataCrtYm,
      seq: primary.seq,
    };

    return {
      found: true,
      matchedByBusinessNumber: matchedByBizNo,
      workplace,
      dataCompleteness: calculateDataCompleteness(workplace),
      lastUpdated: primary.dataCrtYm || '',
      allWorkplaces: allWorkplaces.length > 1 ? allWorkplaces : undefined,
    };
  } catch (e) {
    console.error('[employeeDataService] fetchNpsEmployeeData error:', e);
    return NOT_FOUND;
  }
}

// 하위 호환: 기존 코드에서 import하는 함수
export async function searchNpsWorkplace(companyName: string): Promise<NpsWorkplaceInfo[]> {
  const result = await fetchNpsEmployeeData(companyName);
  return result.workplace ? [result.workplace] : [];
}

export function matchNpsWorkplaceByBizNo(
  workplaces: NpsWorkplaceInfo[],
  businessNumber: string
): NpsWorkplaceInfo | null {
  const prefix = normalizeBizNo(businessNumber).substring(0, 6);
  if (!prefix) return null;
  return workplaces.find(w => normalizeBizNo(w.bzowrRgstNo).startsWith(prefix)) || null;
}

// ─── 60개월 히스토리 조회 (5년 경정청구 대비) ─────────────────

interface NpsPeriodData {
  dataCrtYm: string;
  employeeCount: number;
  newHires: number;
  departures: number;
}

interface NpsYearSummary {
  year: number;
  avgEmployees: number;
  totalNewHires: number;
  totalDepartures: number;
  netChange: number;
}

interface NpsHistoricalTrend {
  monthlyData: NpsPeriodData[];
  yearSummary: NpsYearSummary[];
  totalWorkplaces: number;
  dataRange: { from: string; to: string };
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/** YYYYMM 기준으로 과거 N개월 생성 (최신 → 과거 순) */
function generatePastMonths(latestYm: string, count: number): string[] {
  const months: string[] = [];
  let year = parseInt(latestYm.substring(0, 4));
  let month = parseInt(latestYm.substring(4, 6));

  for (let i = 0; i < count; i++) {
    months.push(`${year}${String(month).padStart(2, '0')}`);
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }
  return months;
}

/**
 * 60개월(5년) 히스토리 조회 — 경정청구 소급분석 대비
 * 각 사업장 × 각 월에 getPeriodStatus 호출 → 합산 → 직원수 역산
 */
export async function fetchNpsHistoricalData(
  workplaces: { seq: number; wkplNm: string; dataCrtYm: string; nrOfJnng: number }[],
  monthsBack: number = 60
): Promise<NpsHistoricalTrend | null> {
  if (workplaces.length === 0) return null;

  // 최대 5개 사업장 제한
  const targets = workplaces.slice(0, 5);
  const latestYm = targets.reduce(
    (max, w) => (w.dataCrtYm > max ? w.dataCrtYm : max),
    targets[0].dataCrtYm
  );

  if (!latestYm) return null;

  const months = generatePastMonths(latestYm, monthsBack);
  console.log(`[employeeDataService] NPS 히스토리 조회 시작: ${targets.length}개 사업장 × ${months.length}개월`);

  // 월별 합산 데이터 맵 (YYYYMM → { newHires, departures })
  const monthlyAgg: Record<string, { newHires: number; departures: number }> = {};
  for (const ym of months) {
    monthlyAgg[ym] = { newHires: 0, departures: 0 };
  }

  for (let wi = 0; wi < targets.length; wi++) {
    const wp = targets[wi];
    let completed = 0;

    for (const ym of months) {
      try {
        const period = await getPeriodStatus(wp.seq, ym);
        if (period) {
          monthlyAgg[ym].newHires += period.nwAcqzrCnt;
          monthlyAgg[ym].departures += period.lssJnngpCnt;
        }
      } catch { /* skip individual month errors */ }

      completed++;
      await delay(100); // rate limit 회피
    }

    console.log(`[employeeDataService] 사업장 ${wi + 1}/${targets.length}: ${wp.wkplNm} — ${completed}/${months.length} 완료`);
  }

  // 직원수 역산: 현재 가입자수에서 역방향으로 계산
  const currentTotal = targets.reduce((sum, w) => sum + w.nrOfJnng, 0);
  const monthlyData: NpsPeriodData[] = [];
  let runningCount = currentTotal;

  for (const ym of months) {
    const agg = monthlyAgg[ym];
    monthlyData.push({
      dataCrtYm: ym,
      employeeCount: runningCount,
      newHires: agg.newHires,
      departures: agg.departures,
    });
    // 역방향: employees(M-1) = employees(M) - newHires(M) + departures(M)
    runningCount = runningCount - agg.newHires + agg.departures;
  }

  // 연도별 요약 계산
  const yearMap: Record<number, { employees: number[]; newHires: number; departures: number }> = {};
  for (const md of monthlyData) {
    const year = parseInt(md.dataCrtYm.substring(0, 4));
    if (!yearMap[year]) yearMap[year] = { employees: [], newHires: 0, departures: 0 };
    yearMap[year].employees.push(md.employeeCount);
    yearMap[year].newHires += md.newHires;
    yearMap[year].departures += md.departures;
  }

  const yearSummary: NpsYearSummary[] = Object.entries(yearMap)
    .map(([y, data]) => ({
      year: parseInt(y),
      avgEmployees: Math.round(data.employees.reduce((a, b) => a + b, 0) / data.employees.length),
      totalNewHires: data.newHires,
      totalDepartures: data.departures,
      netChange: data.newHires - data.departures,
    }))
    .sort((a, b) => a.year - b.year);

  console.log(`[employeeDataService] 히스토리 조회 완료: ${monthlyData.length} 레코드`);

  return {
    monthlyData,
    yearSummary,
    totalWorkplaces: targets.length,
    dataRange: {
      from: months[months.length - 1],
      to: months[0],
    },
  };
}

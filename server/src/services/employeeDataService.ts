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
}

export interface NpsLookupResult {
  found: boolean;
  matchedByBusinessNumber: boolean;
  workplace: NpsWorkplaceInfo | null;
  dataCompleteness: number;
  lastUpdated: string;
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
    numOfRows: '10',
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
 * 기존 인터페이스(NpsWorkplaceInfo) 유지하여 하위 호환
 */
export async function fetchNpsEmployeeData(
  companyName: string,
  businessNumber?: string
): Promise<NpsLookupResult> {
  try {
    // Step 1: 기본 검색 (사업장명)
    let basics = await searchBasic({ wkplNm: companyName });

    // 사업장명 검색 실패 시 사업자등록번호 앞6자리로 재시도
    if (basics.length === 0 && businessNumber) {
      const prefix = normalizeBizNo(businessNumber).substring(0, 6);
      if (prefix.length === 6) {
        basics = await searchBasic({ bzowrRgstNo: prefix });
      }
    }

    if (basics.length === 0) return NOT_FOUND;

    // 가입 상태(1)인 사업장 우선 필터
    const active = basics.filter(b => b.wkplJnngStcd === '1');
    const pool = active.length > 0 ? active : basics;

    // 사업자등록번호 매칭
    let best: NpsBasicItem;
    let matchedByBizNo = false;
    if (businessNumber) {
      const matched = matchByBizNo(pool, businessNumber);
      if (matched) {
        best = matched;
        matchedByBizNo = true;
      } else {
        best = pool[0];
      }
    } else {
      best = pool[0];
    }

    // Step 2: 상세정보 (가입자수, 고지금액)
    const detail = await getDetail(best.seq);

    // Step 3: 기간별 현황 (신규/상실)
    const period = await getPeriodStatus(best.seq, best.dataCrtYm);

    // NpsWorkplaceInfo로 통합 (기존 필드명 유지)
    const workplace: NpsWorkplaceInfo = {
      wkplNm: best.wkplNm,
      bzowrRgstNo: best.bzowrRgstNo,
      wkplRoadNmDtlAddr: best.wkplRoadNmDtlAddr,
      ldongAddr: '',
      wkplJnngStdt: detail?.adptDt || '',
      nrOfJnng: detail?.jnngpCnt || 0,
      crtmNtcAmt: detail?.crrmmNtcAmt || 0,
      nwAcqzrCnt: period?.nwAcqzrCnt || 0,
      lssJnngpCnt: period?.lssJnngpCnt || 0,
      dataCrtYm: best.dataCrtYm,
    };

    return {
      found: true,
      matchedByBusinessNumber: matchedByBizNo,
      workplace,
      dataCompleteness: calculateDataCompleteness(workplace),
      lastUpdated: best.dataCrtYm || '',
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

/**
 * 국민연금 가입 사업장 API V2를 통한 직원/보험료 데이터 조회
 * API: https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2
 *
 * 오퍼레이션:
 *   1. /getBassInfoSearchV2  — 사업장 기본정보 조회
 *   2. /getDetailInfoSearchV2 — 사업장 상세정보 조회
 *   3. /getPdAcctoSttusInfoSearchV2 — 기간별 현황 정보조회
 */

export interface NpsWorkplaceInfo {
  wkplNm: string;
  bzowrRgstNo: string;
  wkplRoadNmDtlAddr: string;
  ldongAddr: string;
  wkplJnngStdt: string;
  nrOfJnng: number;
  crtmNtcAmt: number;
  nwAcqzrCnt: number;
  lssJnngpCnt: number;
  dataCrtYm: string;
}

export interface NpsLookupResult {
  found: boolean;
  matchedByBusinessNumber: boolean;
  workplace: NpsWorkplaceInfo | null;
  dataCompleteness: number;
  lastUpdated: string;
}

const NPS_BASE_URL = 'https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2';

/** 사업자등록번호 정규화 (하이픈 제거) */
function normalizeBizNo(bizNo: string): string {
  return bizNo.replace(/[^0-9]/g, '');
}

/** data.go.kr JSON 응답에서 item 배열 추출 */
function extractItems(data: Record<string, unknown>): Record<string, unknown>[] {
  // 표준 응답 구조: response.body.items.item
  const response = data?.response as Record<string, unknown> | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  const items = body?.items as Record<string, unknown> | undefined;
  const item = items?.item;

  if (Array.isArray(item)) return item as Record<string, unknown>[];
  // 단건 결과: item이 객체인 경우
  if (item && typeof item === 'object' && !Array.isArray(item)) return [item as Record<string, unknown>];
  return [];
}

/** 응답 item → NpsWorkplaceInfo 변환 */
function parseWorkplaceItem(item: Record<string, unknown>): NpsWorkplaceInfo {
  return {
    wkplNm: String(item.wkplNm ?? ''),
    bzowrRgstNo: String(item.bzowrRgstNo ?? ''),
    wkplRoadNmDtlAddr: String(item.wkplRoadNmDtlAddr ?? ''),
    ldongAddr: String(item.ldongAddr ?? ''),
    wkplJnngStdt: String(item.wkplJnngStdt ?? ''),
    nrOfJnng: Number(item.nrOfJnng) || 0,
    crtmNtcAmt: Number(item.crtmNtcAmt) || 0,
    nwAcqzrCnt: Number(item.nwAcqzrCnt) || 0,
    lssJnngpCnt: Number(item.lssJnngpCnt) || 0,
    dataCrtYm: String(item.dataCrtYm ?? ''),
  };
}

/** NPS 사업장 검색 (사업장명 기반, V2 JSON) */
export async function searchNpsWorkplace(companyName: string): Promise<NpsWorkplaceInfo[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.warn('[employeeDataService] DATA_GO_KR_API_KEY not configured');
    return [];
  }

  const params = new URLSearchParams({
    serviceKey: apiKey,
    wkpl_nm: companyName,
    numOfRows: '10',
    pageNo: '1',
    type: 'json',
  });

  const url = `${NPS_BASE_URL}/getBassInfoSearchV2?${params.toString()}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[employeeDataService] NPS API HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    const data = await response.json() as Record<string, unknown>;

    // 에러 응답 체크
    const header = (data?.response as Record<string, unknown>)?.header as Record<string, unknown> | undefined;
    if (header?.resultCode && header.resultCode !== '00') {
      console.warn(`[employeeDataService] NPS API error: ${header.resultCode} - ${header.resultMsg}`);
      return [];
    }

    const items = extractItems(data);
    return items.map(parseWorkplaceItem);
  } catch (e) {
    console.error('[employeeDataService] NPS API error:', e);
    return [];
  }
}

/** 사업자등록번호로 정확 매칭 */
export function matchNpsWorkplaceByBizNo(
  workplaces: NpsWorkplaceInfo[],
  businessNumber: string
): NpsWorkplaceInfo | null {
  const normalizedBizNo = normalizeBizNo(businessNumber);
  if (!normalizedBizNo) return null;
  return workplaces.find(w => normalizeBizNo(w.bzowrRgstNo) === normalizedBizNo) || null;
}

/** 데이터 완성도 점수 (0-100) */
export function calculateDataCompleteness(data: NpsWorkplaceInfo | null): number {
  if (!data) return 0;
  let score = 0;
  if (data.nrOfJnng > 0) score += 30;       // 가입자수(직원수)
  if (data.crtmNtcAmt > 0) score += 30;     // 고지금액
  if (data.dataCrtYm) score += 15;           // 기준연월
  if (data.wkplJnngStdt) score += 10;       // 가입일
  if (data.nwAcqzrCnt >= 0) score += 8;     // 신규취득자
  if (data.lssJnngpCnt >= 0) score += 7;    // 상실가입자
  return score;
}

/** 종합 조회: 사업장명 + 사업자등록번호로 NPS 데이터 조회 */
export async function fetchNpsEmployeeData(
  companyName: string,
  businessNumber?: string
): Promise<NpsLookupResult> {
  try {
    const workplaces = await searchNpsWorkplace(companyName);

    if (workplaces.length === 0) {
      return { found: false, matchedByBusinessNumber: false, workplace: null, dataCompleteness: 0, lastUpdated: '' };
    }

    // 사업자등록번호가 있으면 정확 매칭 시도
    if (businessNumber) {
      const exactMatch = matchNpsWorkplaceByBizNo(workplaces, businessNumber);
      if (exactMatch) {
        return {
          found: true,
          matchedByBusinessNumber: true,
          workplace: exactMatch,
          dataCompleteness: calculateDataCompleteness(exactMatch),
          lastUpdated: exactMatch.dataCrtYm || '',
        };
      }
    }

    // 사업자등록번호 매칭 실패 시 첫 번째 결과 사용
    const best = workplaces[0];
    return {
      found: true,
      matchedByBusinessNumber: false,
      workplace: best,
      dataCompleteness: calculateDataCompleteness(best),
      lastUpdated: best.dataCrtYm || '',
    };
  } catch (e) {
    console.error('[employeeDataService] fetchNpsEmployeeData error:', e);
    return { found: false, matchedByBusinessNumber: false, workplace: null, dataCompleteness: 0, lastUpdated: '' };
  }
}

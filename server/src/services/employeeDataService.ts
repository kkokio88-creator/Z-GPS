/**
 * 국민연금 사업장 API를 통한 직원/보험료 데이터 조회
 * API: http://apis.data.go.kr/B552015/NpsBplcInfoInqireService/getBassInfoSearch
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

const NPS_BASE_URL = 'http://apis.data.go.kr/B552015/NpsBplcInfoInqireService/getBassInfoSearch';

/** XML 태그에서 텍스트 추출 (programFetcher.ts 패턴) */
function getXmlText(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml);
  if (cdataMatch?.[1]) return cdataMatch[1].trim();
  const tagMatch = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return tagMatch?.[1]?.trim() || '';
}

/** 사업자등록번호 정규화 (하이픈 제거) */
function normalizeBizNo(bizNo: string): string {
  return bizNo.replace(/[^0-9]/g, '');
}

/** NPS 사업장 검색 (사업장명 기반) */
export async function searchNpsWorkplace(companyName: string): Promise<NpsWorkplaceInfo[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.warn('[employeeDataService] DATA_GO_KR_API_KEY not configured');
    return [];
  }

  const url = `${NPS_BASE_URL}?serviceKey=${encodeURIComponent(apiKey)}&wkpl_nm=${encodeURIComponent(companyName)}&numOfRows=10&pageNo=1`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/xml' } });
    const xmlText = await response.text();

    const results: NpsWorkplaceInfo[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1];
      results.push({
        wkplNm: getXmlText(itemXml, 'wkplNm'),
        bzowrRgstNo: getXmlText(itemXml, 'bzowrRgstNo'),
        wkplRoadNmDtlAddr: getXmlText(itemXml, 'wkplRoadNmDtlAddr'),
        ldongAddr: getXmlText(itemXml, 'ldongAddr'),
        wkplJnngStdt: getXmlText(itemXml, 'wkplJnngStdt'),
        nrOfJnng: Number(getXmlText(itemXml, 'nrOfJnng')) || 0,
        crtmNtcAmt: Number(getXmlText(itemXml, 'crtmNtcAmt')) || 0,
        nwAcqzrCnt: Number(getXmlText(itemXml, 'nwAcqzrCnt')) || 0,
        lssJnngpCnt: Number(getXmlText(itemXml, 'lssJnngpCnt')) || 0,
        dataCrtYm: getXmlText(itemXml, 'dataCrtYm'),
      });
    }

    return results;
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

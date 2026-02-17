/**
 * 근로복지공단 고용/산재보험 사업장 조회 서비스
 * 공공데이터포털 API: 고용산재보험 토탈서비스
 *
 * 환경변수: DATA_GO_KR_API_KEY (공공데이터포털 통합 인증키)
 *
 * NPS(국민연금)는 3인 이상 법인사업장만 조회 가능하지만,
 * 고용/산재보험은 1인 이상 사업장도 조회 가능 → 더 넓은 커버리지
 */

export interface EmploymentInsuranceInfo {
  companyName: string;
  businessNumber: string;
  eiJoinDate: string;       // 고용보험 성립일
  wiJoinDate: string;       // 산재보험 성립일
  eiEmployeeCount: number;  // 고용보험 가입자수
  industryName: string;     // 업종명
  industryCode: string;     // 업종코드
  eiStatus: string;         // 고용보험 상태 (성립/소멸)
  wiStatus: string;         // 산재보험 상태
}

export interface EILookupResult {
  found: boolean;
  info: EmploymentInsuranceInfo | null;
  queriedAt: string;
}

function getApiKey(): string | null {
  return process.env.DATA_GO_KR_API_KEY || null;
}

function normalizeBizNo(bizNo: string): string {
  return bizNo.replace(/[^0-9]/g, '');
}

/** data.go.kr 표준 JSON 응답에서 items 추출 */
function extractItems(data: Record<string, unknown>): Record<string, unknown>[] {
  // 패턴 1: response.body.items.item (NPS 스타일)
  const response = data?.response as Record<string, unknown> | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  const items = body?.items as Record<string, unknown> | undefined;
  const item = items?.item;
  if (Array.isArray(item)) return item as Record<string, unknown>[];
  if (item && typeof item === 'object') return [item as Record<string, unknown>];

  // 패턴 2: data[] (odcloud 스타일)
  if (Array.isArray(data?.data)) return data.data as Record<string, unknown>[];

  return [];
}

/**
 * 고용/산재보험 사업장 정보 조회
 *
 * API: 근로복지공단 고용산재보험 토탈서비스 사업장 정보
 * 사업자등록번호로 조회
 */
export async function fetchEmploymentInsurance(
  businessNumber: string,
  companyName?: string
): Promise<EILookupResult> {
  const NOT_FOUND: EILookupResult = { found: false, info: null, queriedAt: new Date().toISOString() };

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[employmentInsuranceService] DATA_GO_KR_API_KEY not configured');
    return NOT_FOUND;
  }

  const bizNo = normalizeBizNo(businessNumber);
  if (bizNo.length < 10) {
    console.warn('[employmentInsuranceService] 사업자등록번호 형식 불량:', businessNumber);
    return NOT_FOUND;
  }

  try {
    // 고용산재보험 토탈서비스: 사업장 고용보험 조회
    const params = new URLSearchParams({
      serviceKey: apiKey,
      type: 'json',
      pageNo: '1',
      numOfRows: '10',
      bzowr_rgst_no: bizNo, // 사업자등록번호 10자리
    });

    const url = `https://apis.data.go.kr/B490001/gySjbPstateInfoService/getGySjBoheomBsshItem?${params.toString()}`;
    console.log(`[employmentInsuranceService] 고용보험 API 호출: ${companyName || bizNo}`);

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[employmentInsuranceService] HTTP ${res.status}`);
      return NOT_FOUND;
    }

    const data = await res.json() as Record<string, unknown>;
    const items = extractItems(data);

    if (items.length === 0) {
      // API 응답은 성공이지만 데이터 없음
      console.log(`[employmentInsuranceService] 조회 결과 없음: ${companyName || bizNo}`);
      return NOT_FOUND;
    }

    // 첫 번째(가장 관련성 높은) 결과 사용
    const raw = items[0];
    const info: EmploymentInsuranceInfo = {
      companyName: String(raw.wkplcNm ?? raw.bzmnNm ?? companyName ?? ''),
      businessNumber: String(raw.gyBsshBno ?? raw.bzmnBno ?? bizNo),
      eiJoinDate: String(raw.gyJnngDt ?? raw.gyJnDt ?? ''),
      wiJoinDate: String(raw.gjJnngDt ?? raw.gjJnDt ?? ''),
      eiEmployeeCount: Number(raw.gyIsPs ?? raw.jnngpCnt ?? 0),
      industryName: String(raw.jsTpbsNm ?? raw.isdNm ?? ''),
      industryCode: String(raw.jsTpbsCd ?? raw.isdCd ?? ''),
      eiStatus: String(raw.gyJnSttsCd ?? raw.gyJnngSttsCd ?? '성립'),
      wiStatus: String(raw.gjJnSttsCd ?? raw.gjJnngSttsCd ?? '성립'),
    };

    console.log(`[employmentInsuranceService] 조회 성공: ${info.companyName}, 고용보험 가입자 ${info.eiEmployeeCount}명`);

    return {
      found: true,
      info,
      queriedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[employmentInsuranceService] 조회 오류:', e);
    return NOT_FOUND;
  }
}

/** 고용/산재보험 데이터를 AI 프롬프트용 텍스트로 포맷 */
export function formatEIDataForPrompt(result: EILookupResult): string {
  if (!result.found || !result.info) return '';

  const info = result.info;
  const lines = [
    `### 고용/산재보험 데이터 (근로복지공단)`,
    `- 데이터 출처: 근로복지공단 고용산재보험 토탈서비스 API`,
    `- 사업장명: ${info.companyName}`,
    `- 고용보험 가입자수: ${info.eiEmployeeCount}명`,
    info.eiJoinDate ? `- 고용보험 성립일: ${info.eiJoinDate}` : '',
    info.wiJoinDate ? `- 산재보험 성립일: ${info.wiJoinDate}` : '',
    info.industryName ? `- 업종(고용보험): ${info.industryName} (${info.industryCode})` : '',
    `- 고용보험 상태: ${info.eiStatus}`,
    `- 산재보험 상태: ${info.wiStatus}`,
  ].filter(Boolean);

  return lines.join('\n');
}

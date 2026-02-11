/**
 * 국세청 사업자등록 상태조회 서비스
 * API: 국세청 사업자등록정보 진위확인 및 상태조회
 *
 * 환경변수: DATA_GO_KR_API_KEY (공공데이터포털 통합 인증키)
 *
 * 제공 정보:
 * - 사업자 영업 상태 (계속/휴업/폐업)
 * - 과세 유형 (일반/간이/면세)
 * - 세금 혜택 자격 기본 검증에 활용
 */

export interface BusinessStatusInfo {
  businessNumber: string;
  taxType: string;         // 과세유형 (01:일반, 02:간이, 03:면세 등)
  taxTypeName: string;     // 과세유형명
  businessStatus: string;  // 영업상태 코드 (01:계속, 02:휴업, 03:폐업)
  businessStatusName: string; // 영업상태명
  closingDate: string;     // 폐업일 (해당 시)
  unitedTaxType: string;   // 단위과세유형 코드
  invoiceApply: string;    // 세금계산서 적용여부
}

export interface BusinessStatusResult {
  found: boolean;
  info: BusinessStatusInfo | null;
  queriedAt: string;
}

function getApiKey(): string | null {
  return process.env.DATA_GO_KR_API_KEY || null;
}

function normalizeBizNo(bizNo: string): string {
  return bizNo.replace(/[^0-9]/g, '');
}

/**
 * 국세청 사업자등록 상태 조회
 *
 * POST https://api.odcloud.kr/api/nts-businessman/v1/status
 * Body: { "b_no": ["1234567890"] }
 * Query: serviceKey
 */
export async function fetchBusinessStatus(
  businessNumber: string
): Promise<BusinessStatusResult> {
  const NOT_FOUND: BusinessStatusResult = { found: false, info: null, queriedAt: new Date().toISOString() };

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[businessStatusService] DATA_GO_KR_API_KEY not configured');
    return NOT_FOUND;
  }

  const bizNo = normalizeBizNo(businessNumber);
  if (bizNo.length !== 10) {
    console.warn('[businessStatusService] 사업자등록번호 10자리 필요:', businessNumber);
    return NOT_FOUND;
  }

  try {
    const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(apiKey)}`;
    console.log(`[businessStatusService] 국세청 상태조회 호출: ${bizNo.substring(0, 3)}-**-*****`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b_no: [bizNo] }),
    });

    if (!res.ok) {
      console.warn(`[businessStatusService] HTTP ${res.status}`);
      return NOT_FOUND;
    }

    const data = await res.json() as Record<string, unknown>;
    const statusCode = data.status_code as string;

    // status_code: "OK" = 성공
    if (statusCode !== 'OK') {
      console.warn(`[businessStatusService] API status: ${statusCode}`);
      return NOT_FOUND;
    }

    const dataArr = data.data as Record<string, unknown>[];
    if (!dataArr || dataArr.length === 0) {
      console.log(`[businessStatusService] 조회 결과 없음: ${bizNo}`);
      return NOT_FOUND;
    }

    const item = dataArr[0];
    // b_stt_cd: "01" 계속사업자, "02" 휴업자, "03" 폐업자
    const bSttCd = String(item.b_stt_cd ?? '');
    const bStt = String(item.b_stt ?? '');

    // tax_type: 과세유형
    const taxType = String(item.tax_type ?? '');
    const taxTypeName = parseTaxTypeName(taxType);

    const info: BusinessStatusInfo = {
      businessNumber: bizNo,
      taxType,
      taxTypeName,
      businessStatus: bSttCd,
      businessStatusName: bStt || parseBusinessStatusName(bSttCd),
      closingDate: String(item.end_dt ?? ''),
      unitedTaxType: String(item.utcc_yn ?? ''),
      invoiceApply: String(item.invoice_apply_dt ?? ''),
    };

    console.log(`[businessStatusService] 조회 성공: 상태=${info.businessStatusName}, 과세유형=${info.taxTypeName}`);

    return {
      found: true,
      info,
      queriedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[businessStatusService] 조회 오류:', e);
    return NOT_FOUND;
  }
}

function parseTaxTypeName(code: string): string {
  const map: Record<string, string> = {
    '01': '부가가치세 일반과세자',
    '02': '부가가치세 간이과세자',
    '03': '부가가치세 면세사업자',
    '04': '비영리법인 또는 국가기관',
    '05': '수익사업 영위 법인',
    '06': '고유번호가 부여된 단체',
    '07': '부가가치세 간이과세자(세금계산서 발급사업자)',
  };
  return map[code] || code || '미확인';
}

function parseBusinessStatusName(code: string): string {
  const map: Record<string, string> = {
    '01': '계속사업자',
    '02': '휴업자',
    '03': '폐업자',
  };
  return map[code] || code || '미확인';
}

/** 사업자등록 상태를 AI 프롬프트용 텍스트로 포맷 */
export function formatBusinessStatusForPrompt(result: BusinessStatusResult): string {
  if (!result.found || !result.info) return '';

  const info = result.info;
  const lines = [
    `### 국세청 사업자등록 상태`,
    `- 데이터 출처: 국세청 사업자등록정보 상태조회 API`,
    `- 영업상태: ${info.businessStatusName}`,
    `- 과세유형: ${info.taxTypeName}`,
    info.closingDate ? `- 폐업일: ${info.closingDate}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

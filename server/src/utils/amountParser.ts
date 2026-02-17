/**
 * 금액 파싱 유틸리티 — vault.ts + programFetcher.ts 통합
 */

/** 단위 적용 헬퍼 */
export function applyUnit(num: number, unit: string): number {
  if (isNaN(num) || num === 0) return 0;
  if (unit === '억') return num * 100_000_000;
  if (unit === '천만') return num * 10_000_000;
  if (unit === '백만') return num * 1_000_000;
  if (unit === '만') return num * 10_000;
  return num;
}

/** 금액 문자열 파싱 → 숫자 (원) — 다중 패턴 매칭 */
export function parseAmountFromScale(raw: string): number {
  if (!raw) return 0;
  // 비수치 텍스트 스킵 (확장)
  if (/^(별도|공고|추후|예산|미정|해당|없음|명시|정보|사전진단|-)/i.test(raw.trim())) return 0;
  // 비금전적 지원 패턴
  if (/^(무료|무상임대|컨설팅|멘토링|교육|입주|네트워킹)/i.test(raw.trim())) return 0;
  // 순수 퍼센트 패턴 제외
  if (/^\D*\d+\s*%/.test(raw) && !/[만억천백]\s*원/.test(raw)) return 0;

  const cleaned = raw.replace(/[,\s]/g, '');

  // 범위: "1~3억원" → max값(3억) 사용
  const rangeMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*[~\-–]\s*(\d+(?:\.\d+)?)\s*(억|천만|백만|만)?\s*원?/);
  if (rangeMatch) return applyUnit(parseFloat(rangeMatch[2]), rangeMatch[3] || '');

  // "최대 X억원", "X만원 이내"
  const unitMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(억|천만|백만|만)\s*원?/);
  if (unitMatch) return applyUnit(parseFloat(unitMatch[1]), unitMatch[2]);

  // 순수 숫자+원 ("50000000원")
  const numMatch = cleaned.match(/(\d+)\s*원/);
  if (numMatch && parseInt(numMatch[1]) >= 100000) return parseInt(numMatch[1]);

  return 0;
}

/** 본문 텍스트에서 기업당 지원금 추출 */
export function extractGrantFromText(text: string): number {
  if (!text || text.length < 4) return 0;
  // 기업당/업체당/팀당/1개사당 + 최대 + 금액 패턴 우선
  const perCompanyPatterns = [
    /(?:기업당|업체당|팀당|1개사당|개사당|社당|과제당)[^0-9]{0,20}(?:최대\s*)?(\d+(?:[.,]\d+)?)\s*(억|천만|백만|만)\s*원/g,
    /(?:최대|한도)\s*(\d+(?:[.,]\d+)?)\s*(억|천만|백만|만)\s*원/g,
    /(\d+(?:[.,]\d+)?)\s*(억|천만|백만|만)\s*원\s*(?:이내|한도|내외|지원|까지)/g,
  ];

  for (const pattern of perCompanyPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      let minAmount = Infinity;
      for (const m of matches) {
        const num = parseFloat(m[1].replace(/,/g, ''));
        const unit = m[2];
        const amount = applyUnit(num, unit);
        // 상한선: 50억 초과는 총예산으로 판단 → 무시
        if (amount > 0 && amount <= 5_000_000_000 && amount < minAmount) minAmount = amount;
      }
      if (minAmount < Infinity && minAmount >= 1_000_000) return minAmount;
    }
  }

  // "X백만원" 단독 패턴
  const singleMatch = text.match(/(\d+)\s*백만\s*원/);
  if (singleMatch) {
    const amount = parseInt(singleMatch[1]) * 1_000_000;
    if (amount >= 1_000_000) return amount;
  }

  return 0;
}

/** 다중 소스에서 expectedGrant 재파싱 (5단계) */
export function reParseExpectedGrant(fm: Record<string, unknown>, bodyContent?: string, pdfText?: string): number {
  // 1. supportScale
  const fromScale = parseAmountFromScale(String(fm.supportScale || ''));
  if (fromScale > 0) return fromScale;

  // 2. totalBudget
  const fromBudget = parseAmountFromScale(String(fm.totalBudget || ''));
  if (fromBudget > 0) return fromBudget;

  // 3. fullDescription
  const fromDesc = extractGrantFromText(String(fm.fullDescription || ''));
  if (fromDesc > 0) return fromDesc;

  // 4. body content (마크다운 본문)
  if (bodyContent) {
    const fromBody = extractGrantFromText(bodyContent);
    if (fromBody > 0) return fromBody;
  }

  // 5. PDF 분석 텍스트
  if (pdfText) {
    const fromPdf = extractGrantFromText(pdfText);
    if (fromPdf > 0) return fromPdf;
  }

  return 0;
}

/** 비금전적 지원 여부 감지 */
export function isNonMonetarySupport(supportScale?: string, supportType?: string): boolean {
  const text = `${supportScale || ''} ${supportType || ''}`;
  return /무료|무상임대|무상지원|컨설팅만|교육만|멘토링만|입주\s*지원|네트워킹|판로\s*지원|홍보\s*지원|인증\s*지원/.test(text);
}

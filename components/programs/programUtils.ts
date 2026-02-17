import { VaultProgram } from '../../services/vaultService';
import { SupportProgram, EligibilityStatus } from '../../types';

export type SwipeCategory = 'interested' | 'rejected' | 'none';

export interface CategorizedProgram extends SupportProgram {
  category: SwipeCategory;
}

/** VaultProgram → SupportProgram 변환 */
export const vaultToSupportProgram = (vp: VaultProgram): SupportProgram => ({
  id: vp.slug || vp.id,
  organizer: vp.organizer,
  programName: vp.programName,
  supportType: vp.supportType,
  officialEndDate: vp.officialEndDate,
  internalDeadline: vp.internalDeadline || vp.officialEndDate,
  expectedGrant: vp.expectedGrant,
  fitScore: vp.fitScore || 0,
  eligibility: EligibilityStatus.POSSIBLE,
  priorityRank: 0,
  eligibilityReason: vp.eligibility || '',
  requiredDocuments: vp.requiredDocuments || [],
  detailUrl: vp.detailUrl,
  description: vp.fullDescription || '',
});

/** HTML 태그 제거 및 텍스트 정리 */
export const stripHtml = (html: string): string => {
  if (!html) return '';
  let text = html.replace(/<[^>]*>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};

export const summarizeText = (text: string, maxLength = 200): string => {
  const cleaned = stripHtml(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
};

/** 비금전적 지원 감지 */
export const isNonMonetary = (text: string): boolean =>
  /무료|무상|컨설팅|멘토링|교육|입주\s*지원|네트워킹|판로|홍보|인증/.test(text);

/** 금액 표시: 0이면 비금전 감지 → supportScale 텍스트 → "미정" */
export const formatGrant = (grant: number, supportScale?: string, supportType?: string): string => {
  if (grant > 0) {
    const billions = grant / 100000000;
    if (billions >= 1) return `${billions.toFixed(1)}억`;
    const tenThousands = grant / 10000;
    if (tenThousands >= 1) return `${Math.round(tenThousands)}만`;
    return `${grant.toLocaleString()}원`;
  }
  const combined = `${supportScale || ''} ${supportType || ''}`;
  if (isNonMonetary(combined)) return '비금전 지원';
  if (supportScale) {
    const clean = stripHtml(supportScale);
    if (clean.length > 0 && !/^(별도|공고|추후|미정|해당|없음|-)/i.test(clean.trim())) {
      return clean.length > 15 ? clean.slice(0, 15) + '…' : clean;
    }
  }
  return '미정';
};

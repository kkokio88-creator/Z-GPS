import type { BenefitCategory, BenefitStatus, TaxRefundDifficulty } from '../../types';

export const CATEGORIES: BenefitCategory[] = ['고용지원', 'R&D', '수출', '창업', '시설투자', '교육훈련', '기타'];

export const STATUS_LABELS: Record<BenefitStatus, { label: string; color: string }> = {
  completed: { label: '완료', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  ongoing: { label: '진행중', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  refund_eligible: { label: '환급 가능', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  claimed: { label: '청구 완료', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
};

export const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export const DIFFICULTY_LABELS: Record<TaxRefundDifficulty, { label: string; color: string }> = {
  EASY: { label: '간편', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  MODERATE: { label: '보통', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  COMPLEX: { label: '복잡', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export const OPP_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  identified: { label: '발견', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  in_progress: { label: '검토중', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  reviewing: { label: '검토중', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  filed: { label: '신고완료', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  received: { label: '환급완료', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  dismissed: { label: '해당없음', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

export const SCAN_STEPS = [
  { label: '기업 정보 수집', icon: 'business' },
  { label: '국민연금 + 고용보험 조회', icon: 'cloud_download' },
  { label: 'DART + 국세청 + 리서치', icon: 'inventory_2' },
  { label: 'AI 세금 분석', icon: 'psychology' },
  { label: '결과 정리', icon: 'checklist' },
];

export const DATA_SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  NPS_API: { label: 'NPS 실데이터', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  DART_API: { label: 'DART 공시', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  EI_API: { label: '고용보험', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  NTS_API: { label: '국세청', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  RESEARCH: { label: '리서치', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  COMPANY_PROFILE: { label: '프로필 기반', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  ESTIMATED: { label: '추정치', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

export const TAX_BENEFIT_ICONS: Record<string, string> = {
  EMPLOYMENT_INCREASE: 'group_add',
  SME_SPECIAL: 'business',
  RND_CREDIT: 'science',
  INVESTMENT_CREDIT: 'real_estate_agent',
  SOCIAL_INSURANCE: 'shield',
  PERMANENT_CONVERSION: 'swap_horiz',
  CAREER_BREAK_WOMEN: 'woman',
  ENTERTAINMENT_SPECIAL: 'restaurant',
  STARTUP_EXEMPTION: 'rocket_launch',
  AMENDED_RETURN: 'history',
  YOUTH_EMPLOYMENT: 'school',
  DISABLED_EMPLOYMENT: 'accessible',
  PARENTAL_LEAVE_RETURN: 'child_care',
  WAGE_INCREASE_CREDIT: 'payments',
  EMPLOYMENT_RETENTION: 'verified_user',
  SOCIAL_INSURANCE_INCREASE: 'trending_up',
  INTEGRATED_INVESTMENT: 'category',
  PROFIT_SHARING: 'handshake',
  SAVINGS_CREDIT: 'savings',
};

export const LINE_ITEM_SOURCE_BADGE: Record<string, { icon: string; color: string; label: string }> = {
  NPS_API: { icon: '🔵', color: 'text-blue-600 dark:text-blue-400', label: 'NPS' },
  COMPANY_PROFILE: { icon: '🏢', color: 'text-gray-600 dark:text-gray-400', label: '프로필' },
  USER_INPUT: { icon: '✏️', color: 'text-amber-600 dark:text-amber-400', label: '입력' },
  CALCULATED: { icon: '🔄', color: 'text-indigo-600 dark:text-indigo-400', label: '계산' },
  TAX_LAW: { icon: '📕', color: 'text-red-600 dark:text-red-400', label: '법정' },
};

export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 70) return 'text-green-600 dark:text-green-400';
  if (confidence >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
};

export const getConfidenceBarColor = (confidence: number): string => {
  if (confidence >= 70) return 'bg-green-500';
  if (confidence >= 40) return 'bg-amber-500';
  return 'bg-red-500';
};

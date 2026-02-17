/**
 * 공유 포매터 유틸리티
 * Dashboard, BenefitTracker, ApplicationList, ProgramExplorer에서
 * 중복 정의된 함수를 통합한 단일 구현.
 */

/**
 * 원 단위 금액을 한국 원화 형식으로 포맷.
 * @example formatKRW(500000000) => "5.0억원"
 * @example formatKRW(50000000)  => "5,000만원"
 * @example formatKRW(10000)     => "1만원"
 * @example formatKRW(9000)      => "9,000원"
 */
export const formatKRW = (amount: number): string => {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억원`;
  if (amount >= 10000000)  return `${(amount / 10000000).toFixed(0)}천만원`;
  if (amount >= 10000)     return `${(amount / 10000).toFixed(0)}만원`;
  return `${amount.toLocaleString()}원`;
};

/**
 * D-Day 계산 결과 타입.
 * - label: 표시 문자열 ("D-7", "D-Day", "마감")
 * - color: Tailwind text 색상 클래스 (Dashboard/ApplicationList 호환)
 * - bgColor: Tailwind bg+text 색상 클래스 (ProgramExplorer 배지 호환)
 * - days: 남은 일수 (음수이면 마감)
 * - urgent: 7일 이내 여부
 */
export interface DdayResult {
  label: string;
  color: string;
  bgColor: string;
  days: number;
  urgent: boolean;
}

/**
 * 날짜 문자열로 D-Day를 계산한다.
 * @param dateStr ISO 날짜 문자열 (예: "2026-03-15")
 * @example getDday('2026-03-15') => { label: "D-7", color: "text-red-500", bgColor: "bg-red-50 text-red-600", days: 7, urgent: true }
 */
export const getDday = (dateStr: string): DdayResult => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0)   return { label: '마감',       color: 'text-gray-400',  bgColor: 'bg-gray-100 text-gray-400',    days: diff, urgent: false };
  if (diff === 0) return { label: 'D-Day',      color: 'text-red-600',   bgColor: 'bg-red-500 text-white',         days: 0,    urgent: true  };
  if (diff <= 7)  return { label: `D-${diff}`,  color: 'text-red-500',   bgColor: 'bg-red-50 text-red-600',        days: diff, urgent: true  };
  if (diff <= 14) return { label: `D-${diff}`,  color: 'text-amber-600', bgColor: 'bg-amber-50 text-amber-600',    days: diff, urgent: false };
  return           { label: `D-${diff}`,  color: 'text-blue-600',  bgColor: 'bg-gray-100 text-gray-600',     days: diff, urgent: false };
};

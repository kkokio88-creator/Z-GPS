import Icon from '../ui/Icon';
import React from 'react';
import type { BenefitRecord, BenefitAnalysisResult } from '../../types';
import { formatKRW } from '../../services/utils/formatters';
import { RISK_COLORS } from './constants';

interface BenefitAnalysisProps {
  benefits: BenefitRecord[];
  analyses: Record<string, BenefitAnalysisResult>;
  analyzingAll: boolean;
  expandedAnalysis: string | null;
  onAnalyzeAll: () => void;
  onToggleAnalysis: (id: string) => void;
}

const BenefitAnalysis: React.FC<BenefitAnalysisProps> = ({
  benefits,
  analyses,
  analyzingAll,
  expandedAnalysis,
  onAnalyzeAll,
  onToggleAnalysis,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          AI가 과거 수령 지원금의 환급/추가 청구 가능 여부를 분석합니다.
        </p>
        <button
          onClick={onAnalyzeAll}
          disabled={analyzingAll || benefits.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          <span className={`material-icons-outlined text-base ${analyzingAll ? 'animate-spin' : ''}`} aria-hidden="true">
            {analyzingAll ? 'autorenew' : 'auto_awesome'}
          </span>
          {analyzingAll ? '분석 중...' : '전체 분석'}
        </button>
      </div>

      {benefits.length === 0 ? (
        <div className="text-center py-16">
          <Icon name="analytics" className="h-5 w-5" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">수령 이력을 먼저 등록해주세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {benefits.map(b => {
            const analysis = analyses[b.id];
            const isExpanded = expandedAnalysis === b.id;

            return (
              <div key={b.id} className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => onToggleAnalysis(b.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">{b.programName}</h4>
                        <span className="text-xs text-gray-400">{formatKRW(b.receivedAmount)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{b.organizer} · {b.receivedDate}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {analysis ? (
                        <>
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${analysis.isEligible ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                            {analysis.isEligible ? '환급 가능' : '해당 없음'}
                          </span>
                          {analysis.isEligible && (
                            <span className="text-sm font-bold text-green-600 dark:text-green-400">
                              {formatKRW(analysis.estimatedRefund)}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${RISK_COLORS[analysis.riskLevel] || ''}`}>
                            {analysis.riskLevel}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">미분석</span>
                      )}
                      <span className={`material-icons-outlined text-gray-400 text-base transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true">
                        expand_more
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && analysis && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                    {analysis.legalBasis.length > 0 && (
                      <div>
                        <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">법적 근거</h5>
                        <ul className="space-y-1">
                          {analysis.legalBasis.map((l, i) => (
                            <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                              <span className="text-primary mt-0.5">-</span> {l}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis.requiredDocuments.length > 0 && (
                      <div>
                        <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">필요 서류</h5>
                        <ul className="space-y-1">
                          {analysis.requiredDocuments.map((d, i) => (
                            <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                              <Icon name="description" className="h-5 w-5" /> {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis.timeline && (
                      <div>
                        <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">예상 기간</h5>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{analysis.timeline}</p>
                      </div>
                    )}
                    {analysis.risks.length > 0 && (
                      <div>
                        <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">리스크</h5>
                        <ul className="space-y-1">
                          {analysis.risks.map((r, i) => (
                            <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                              <Icon name="warning" className="h-5 w-5" /> {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis.advice && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <h5 className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">실무 조언</h5>
                        <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">{analysis.advice}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 text-right">
                      분석 시점: {analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleDateString('ko-KR') : '-'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BenefitAnalysis;

import React, { useState } from 'react';
import type { BenefitRecord, BenefitSummary as BenefitSummaryType } from '../../types';
import { formatKRW } from '../../services/utils/formatters';

interface BenefitSummaryProps {
  summary: BenefitSummaryType | null;
  benefits: BenefitRecord[];
  isLoading: boolean;
}

const BenefitSummaryPanel: React.FC<BenefitSummaryProps> = ({ summary, benefits, isLoading }) => {
  const [insight, setInsight] = useState<{ insight: string; recommendations: string[] } | null>(null);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {isLoading || !summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">총 수령액</p>
              <p className="text-2xl font-bold text-primary dark:text-green-400">{formatKRW(summary.totalReceived)}</p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">총 건수</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalCount}<span className="text-sm text-gray-400 ml-1">건</span></p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">환급 가능</p>
              <p className="text-2xl font-bold text-amber-500">{summary.refundEligible}<span className="text-sm text-gray-400 ml-1">건</span></p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">추정 환급액</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatKRW(summary.estimatedTotalRefund)}</p>
            </div>
          </div>

          {/* Category Distribution */}
          {summary.byCategory.length > 0 && (
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                <span className="material-icons-outlined text-indigo-500 mr-2 text-base" aria-hidden="true">donut_large</span>
                카테고리별 분포
              </h3>
              <div className="space-y-3">
                {summary.byCategory
                  .sort((a, b) => b.amount - a.amount)
                  .map(c => {
                    const pct = summary.totalReceived > 0 ? Math.round((c.amount / summary.totalReceived) * 100) : 0;
                    return (
                      <div key={c.category}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.category}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{c.count}건 · {formatKRW(c.amount)} ({pct}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Year Distribution */}
          {summary.byYear.length > 0 && (
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                <span className="material-icons-outlined text-emerald-500 mr-2 text-base" aria-hidden="true">bar_chart</span>
                연도별 추이
              </h3>
              <div className="flex items-end gap-3 h-40">
                {(() => {
                  const maxAmt = Math.max(...summary.byYear.map(y => y.amount), 1);
                  return summary.byYear.map(y => {
                    const h = Math.max((y.amount / maxAmt) * 100, 5);
                    return (
                      <div key={y.year} className="flex-1 flex flex-col items-center">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">{formatKRW(y.amount)}</span>
                        <div className="w-full flex justify-center">
                          <div
                            className="w-8 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-t-lg transition-all duration-500"
                            style={{ height: `${h}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-2">{y.year}</span>
                        <span className="text-[10px] text-gray-400">{y.count}건</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* AI Insight */}
          <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center">
                <span className="material-icons-outlined text-amber-500 mr-2 text-base" aria-hidden="true">auto_awesome</span>
                AI 포트폴리오 인사이트
              </h3>
              {!insight && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/vault/benefits/summary-insight', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      });
                      const data = await res.json();
                      setInsight(data);
                    } catch { /* skip */ }
                  }}
                  disabled={benefits.length === 0}
                  className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
                >
                  인사이트 생성
                </button>
              )}
            </div>
            {insight ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{insight.insight}</p>
                {insight.recommendations.length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">추천 전략</h5>
                    <ul className="space-y-1.5">
                      {insight.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-6">
                수령 이력을 등록한 후 AI 인사이트를 생성해보세요
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BenefitSummaryPanel;

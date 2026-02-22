import Icon from '../ui/Icon';
import React from 'react';
import type {
  TaxRefundOpportunity,
  TaxCalculationLineItem,
  TaxScanResult,
} from '../../types';
import { formatKRW } from '../../services/utils/formatters';
import {
  OPP_STATUS_LABELS,
  DIFFICULTY_LABELS,
  TAX_BENEFIT_ICONS,
  DATA_SOURCE_BADGES,
  LINE_ITEM_SOURCE_BADGE,
  getConfidenceColor,
  getConfidenceBarColor,
} from './constants';

interface TaxOpportunityCardProps {
  opp: TaxRefundOpportunity;
  taxScan: TaxScanResult;
  isExpanded: boolean;
  generatingWorksheet: string | null;
  onToggle: () => void;
  onGenerateWorksheet: (oppId: string) => void;
  onUpdateWorksheetInput: (oppId: string, key: string, value: number | string) => void;
  onUpdateOppStatus: (oppId: string, newStatus: TaxRefundOpportunity['status']) => void;
}

const TaxOpportunityCard: React.FC<TaxOpportunityCardProps> = ({
  opp,
  taxScan,
  isExpanded,
  generatingWorksheet,
  onToggle,
  onGenerateWorksheet,
  onUpdateWorksheetInput,
  onUpdateOppStatus,
}) => {
  const icon = TAX_BENEFIT_ICONS[opp.taxBenefitCode] || 'payments';
  const diff = DIFFICULTY_LABELS[opp.difficulty] || DIFFICULTY_LABELS.MODERATE;
  const hasNpsVerify = opp.dataSource === 'NPS_API';
  const hasDartVerify = opp.dataSource === 'DART_API';

  return (
    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors" onClick={onToggle}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
            <Icon name={icon} className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">{opp.taxBenefitName}</h4>
              {opp.isAmendedReturn && (
                <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[10px] font-bold">경정청구</span>
              )}
              {opp.status && OPP_STATUS_LABELS[opp.status] && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${OPP_STATUS_LABELS[opp.status].color}`}>
                  {OPP_STATUS_LABELS[opp.status].label}
                </span>
              )}
              {opp.dataSource && DATA_SOURCE_BADGES[opp.dataSource] && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${DATA_SOURCE_BADGES[opp.dataSource].color}`}>
                  {DATA_SOURCE_BADGES[opp.dataSource].label}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {opp.legalBasis[0] || ''} · {opp.applicableYears[0]}-{opp.applicableYears[opp.applicableYears.length - 1]}년
            </p>
            <div className="flex items-center gap-4 mt-2">
              <div>
                <p className="text-[10px] text-gray-400">추정 환급액</p>
                <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatKRW(opp.estimatedRefund)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400">신뢰도</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-sm font-bold ${getConfidenceColor(opp.confidence)}`}>{opp.confidence}%</span>
                  <div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${getConfidenceBarColor(opp.confidence)}`} style={{ width: `${Math.min(opp.confidence, 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {hasNpsVerify && taxScan.npsData?.historical && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400">
                  <Icon name="check_circle" className="h-5 w-5" />
                  NPS {taxScan.npsData.historical.monthlyData.length}개월 검증
                </span>
              )}
              {hasDartVerify && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <Icon name="check_circle" className="h-5 w-5" />
                  DART 재무 검증
                </span>
              )}
              {!hasNpsVerify && !hasDartVerify && opp.dataSource === 'ESTIMATED' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
                  <Icon name="change_history" className="h-5 w-5" />
                  추정치 (실데이터 연결 시 정확도 향상)
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${diff.color}`}>난이도: {diff.label}</span>
            <span className="text-[10px] text-gray-400">{opp.estimatedProcessingTime}</span>
            <span className={`material-icons-outlined text-gray-400 text-base transition-transform mt-1 ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true">expand_more</span>
          </div>
        </div>
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">{opp.description}</p>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
            <h5 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">적용 사유</h5>
            <p className="text-xs text-indigo-600 dark:text-indigo-300">{opp.eligibilityReason}</p>
          </div>

          {/* 연도별 분석 */}
          {opp.applicableYears.length > 1 && (
            <div>
              <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">연도별 환급 가능액</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-1.5 pr-3 font-medium text-gray-500">연도</th>
                      <th className="text-right py-1.5 px-2 font-medium text-gray-500">환급 가능액</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-500">근거</th>
                      <th className="text-left py-1.5 pl-2 font-medium text-gray-500">유형</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opp.applicableYears.map(yr => {
                      const currentYr = new Date().getFullYear();
                      const perYearAmount = Math.round(opp.estimatedRefund / opp.applicableYears.length);
                      const npsYs = taxScan.npsData?.historical?.yearSummary?.find(y => y.year === yr);
                      const basis = npsYs ? `NPS ${npsYs.netChange >= 0 ? '+' : ''}${npsYs.netChange}명` : opp.dataSource === 'DART_API' ? 'DART 공시' : '추정';
                      const filingType = yr < currentYr - 1 ? '경정청구' : yr === currentYr - 1 ? '수정신고' : '당기신고';
                      return (
                        <tr key={yr} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white">{yr}년</td>
                          <td className="py-1.5 px-2 text-right font-medium text-indigo-600 dark:text-indigo-400">{formatKRW(perYearAmount)}</td>
                          <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400">{basis}</td>
                          <td className="py-1.5 pl-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              filingType === '경정청구' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : filingType === '수정신고' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>{filingType}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {opp.legalBasis.length > 0 && (
            <div>
              <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">법적 근거</h5>
              <ul className="space-y-1">
                {opp.legalBasis.map((l, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                    <span className="text-indigo-500 mt-0.5">-</span> {l}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {opp.requiredActions.length > 0 && (
            <div>
              <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">실행 단계</h5>
              <ol className="space-y-1">
                {opp.requiredActions.map((a, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {opp.requiredDocuments.length > 0 && (
            <div>
              <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">필요 서류</h5>
              <ul className="space-y-1">
                {opp.requiredDocuments.map((d, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                    <Icon name="description" className="h-5 w-5" /> {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {opp.filingDeadline && (
              <div>
                <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">신고 기한</h5>
                <p className="text-xs text-gray-600 dark:text-gray-400">{opp.filingDeadline}</p>
              </div>
            )}
            <div>
              <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">예상 처리 기간</h5>
              <p className="text-xs text-gray-600 dark:text-gray-400">{opp.estimatedProcessingTime}</p>
            </div>
          </div>

          {opp.risks.length > 0 && (
            <div>
              <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">리스크</h5>
              <ul className="space-y-1">
                {opp.risks.map((r, i) => (
                  <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                    <Icon name="warning" className="h-5 w-5" /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Worksheet */}
          {opp.worksheet && (opp.status === 'reviewing' || opp.status === 'in_progress') && (
            <div className="border border-purple-200 dark:border-purple-800/40 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 flex items-center gap-2">
                <Icon name="calculate" className="h-5 w-5" />
                <h5 className="text-xs font-bold text-purple-700 dark:text-purple-400">{opp.worksheet.title}</h5>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">항목</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">값</th>
                      <th className="text-center px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400 w-16">출처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opp.worksheet.lineItems.map((item: TaxCalculationLineItem) => {
                      const srcBadge = LINE_ITEM_SOURCE_BADGE[item.source] || LINE_ITEM_SOURCE_BADGE.CALCULATED;
                      return (
                        <tr key={item.key} className="border-t border-gray-100 dark:border-gray-700/50">
                          <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{item.label}</td>
                          <td className="px-3 py-1.5 text-right">
                            {item.editable ? (
                              <input
                                type="number"
                                defaultValue={typeof item.value === 'number' ? item.value : parseFloat(String(item.value)) || 0}
                                onBlur={(e) => {
                                  e.stopPropagation();
                                  const v = parseFloat(e.target.value);
                                  if (!isNaN(v)) onUpdateWorksheetInput(opp.id, item.key, v);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-20 px-1.5 py-0.5 text-right border border-amber-300 dark:border-amber-600 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs font-medium focus:ring-1 focus:ring-amber-400"
                              />
                            ) : (
                              <span className="font-medium text-gray-900 dark:text-white">
                                {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                              </span>
                            )}
                            <span className="text-gray-400 ml-1">{item.unit}</span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`text-[10px] ${srcBadge.color}`} title={srcBadge.label}>{srcBadge.icon}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {opp.worksheet.subtotals.length > 0 && (
                    <tfoot>
                      {opp.worksheet.subtotals.map((sub, i) => (
                        <tr key={i} className="border-t-2 border-purple-200 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10">
                          <td className="px-3 py-1.5 font-bold text-purple-700 dark:text-purple-400">{sub.label}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-purple-700 dark:text-purple-400" colSpan={2}>{formatKRW(sub.amount)}</td>
                        </tr>
                      ))}
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="px-3 py-2 bg-purple-50/50 dark:bg-purple-900/10 border-t border-purple-200 dark:border-purple-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">예상 공제/환급액</span>
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-400">{formatKRW(opp.worksheet.totalRefund)}</span>
                </div>
              </div>
              {opp.worksheet.assumptions.length > 0 && (
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">가정:</p>
                  <ul className="space-y-0.5">
                    {opp.worksheet.assumptions.map((a, i) => (
                      <li key={i} className="text-[10px] text-gray-400 dark:text-gray-500">{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800/30">
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  <Icon name="warning" className="h-5 w-5" />
                  본인 책임하에 검토 및 신고하시기 바랍니다.
                </p>
              </div>
            </div>
          )}

          {/* CTA Buttons */}
          {opp.status !== 'received' && opp.status !== 'dismissed' && (
            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {opp.status === 'identified' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateWorksheet(opp.id); }}
                  disabled={generatingWorksheet === opp.id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-200 transition-colors disabled:opacity-50"
                >
                  <span className={`material-icons-outlined text-sm ${generatingWorksheet === opp.id ? 'animate-spin' : ''}`} aria-hidden="true">
                    {generatingWorksheet === opp.id ? 'autorenew' : 'calculate'}
                  </span>
                  {generatingWorksheet === opp.id ? '생성 중...' : '셀프 검토 시작'}
                </button>
              )}
              {(opp.status === 'reviewing' || opp.status === 'in_progress') && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateOppStatus(opp.id, 'filed'); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-200 transition-colors"
                >
                  <Icon name="send" className="h-5 w-5" />
                  신고 완료
                </button>
              )}
              {opp.status === 'filed' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateOppStatus(opp.id, 'received'); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium hover:bg-green-200 transition-colors"
                >
                  <Icon name="check_circle" className="h-5 w-5" />
                  환급 확인
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateOppStatus(opp.id, 'dismissed'); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors ml-auto"
              >
                <Icon name="block" className="h-5 w-5" />
                해당 없음
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TaxOpportunityCard;

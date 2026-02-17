import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { TaxScanResult, TaxRefundOpportunity } from '../../types';
import { formatKRW } from '../../services/utils/formatters';
import { SCAN_STEPS, DATA_SOURCE_BADGES } from './constants';
import TaxOpportunityCard from './TaxOpportunityCard';
import TaxDataBadges from './TaxDataBadges';

interface TaxRefundProps {
  taxScan: TaxScanResult | null;
  taxScanning: boolean;
  taxError: string | null;
  taxErrorCode: number | null;
  scanStep: 0 | 1 | 2 | 3;
  sortedOpportunities: TaxRefundOpportunity[];
  taxSortBy: 'refund' | 'confidence' | 'difficulty';
  taxFilterStatus: string;
  taxFilterSource: string;
  expandedOpportunity: string | null;
  generatingWorksheet: string | null;
  showNpsTrend: boolean;
  showDartSummary: boolean;
  onRunScan: () => void;
  onSetTaxSortBy: (v: 'refund' | 'confidence' | 'difficulty') => void;
  onSetTaxFilterStatus: (v: string) => void;
  onSetTaxFilterSource: (v: string) => void;
  onToggleOpportunity: (id: string) => void;
  onGenerateWorksheet: (oppId: string) => void;
  onUpdateWorksheetInput: (oppId: string, key: string, value: number | string) => void;
  onUpdateOppStatus: (oppId: string, newStatus: TaxRefundOpportunity['status']) => void;
  onToggleNpsTrend: () => void;
  onToggleDartSummary: () => void;
}

const TaxRefund: React.FC<TaxRefundProps> = ({
  taxScan, taxScanning, taxError, taxErrorCode, scanStep,
  sortedOpportunities, taxSortBy, taxFilterStatus, taxFilterSource,
  expandedOpportunity, generatingWorksheet, showNpsTrend, showDartSummary,
  onRunScan, onSetTaxSortBy, onSetTaxFilterStatus, onSetTaxFilterSource,
  onToggleOpportunity, onGenerateWorksheet, onUpdateWorksheetInput,
  onUpdateOppStatus, onToggleNpsTrend, onToggleDartSummary,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            AI가 기업 프로필과 수령 이력을 분석하여 놓치고 있는 세금 혜택을 스캔합니다.
          </p>
          {taxScan && (
            <p className="text-[10px] text-gray-400 mt-1">마지막 스캔: {new Date(taxScan.scannedAt).toLocaleString('ko-KR')}</p>
          )}
        </div>
        <button onClick={onRunScan} disabled={taxScanning}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <span className={`material-icons-outlined text-base ${taxScanning ? 'animate-spin' : ''}`} aria-hidden="true">
            {taxScanning ? 'autorenew' : 'search'}
          </span>
          {taxScanning ? '스캔 중...' : '스캔 시작'}
        </button>
      </div>

      {/* Scanning Stepper */}
      {taxScanning && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-6">
          <div className="flex items-center justify-center gap-2 mb-5">
            {SCAN_STEPS.map((step, i) => {
              const stepNum = i + 1;
              const isActive = scanStep === stepNum;
              const isDone = scanStep > stepNum;
              return (
                <React.Fragment key={i}>
                  {i > 0 && <div className={`w-8 h-0.5 rounded ${isDone ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      isDone ? 'bg-indigo-500 text-white' : isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                    }`}>
                      <span className={`material-icons-outlined text-base ${isActive ? 'animate-spin' : ''}`} aria-hidden="true">
                        {isDone ? 'check' : isActive ? 'autorenew' : step.icon}
                      </span>
                    </div>
                    <span className={`text-[10px] font-medium whitespace-nowrap ${isDone ? 'text-indigo-600 dark:text-indigo-400' : isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-400'}`}>
                      {step.label}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-xs text-indigo-500 dark:text-indigo-400 text-center">기업 정보와 수령 이력을 기반으로 적용 가능한 혜택을 탐색합니다</p>
        </div>
      )}

      {/* Error */}
      {!taxScanning && taxError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-5 text-center">
          <span className="material-icons-outlined text-3xl text-red-400 block mb-2" aria-hidden="true">error_outline</span>
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{taxError}</p>
          {taxErrorCode === 503 && <p className="text-xs text-red-500 dark:text-red-400/70 mt-1">Gemini API 키를 설정해야 AI 스캔을 이용할 수 있습니다.</p>}
          {taxErrorCode === 400 && <p className="text-xs text-red-500 dark:text-red-400/70 mt-1">기업 프로필을 먼저 등록해주세요.</p>}
          {(taxErrorCode === 503 || taxErrorCode === 400) && (
            <button onClick={() => navigate('/settings')}
              className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
            >
              <span className="material-icons-outlined text-sm align-middle mr-1" aria-hidden="true">settings</span>설정으로 이동
            </button>
          )}
          {(!taxErrorCode || taxErrorCode >= 500) && taxErrorCode !== 503 && (
            <button onClick={onRunScan}
              className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
            >
              <span className="material-icons-outlined text-sm align-middle mr-1" aria-hidden="true">refresh</span>다시 시도
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {!taxScanning && taxScan && (
        <>
          <TaxDataBadges taxScan={taxScan} showNpsTrend={showNpsTrend} showDartSummary={showDartSummary}
            onToggleNpsTrend={onToggleNpsTrend} onToggleDartSummary={onToggleDartSummary}
          />

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">추정 총 환급액</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatKRW(taxScan.totalEstimatedRefund)}</p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">발견 기회</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{taxScan.opportunityCount}<span className="text-sm text-gray-400 ml-1">건</span></p>
            </div>
            <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">경정청구 대상</p>
              <p className="text-2xl font-bold text-amber-500">
                {taxScan.opportunities.filter(o => o.isAmendedReturn).length}<span className="text-sm text-gray-400 ml-1">건</span>
              </p>
            </div>
          </div>

          {/* AI Summary */}
          {taxScan.summary && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-outlined text-indigo-500 text-base" aria-hidden="true">auto_awesome</span>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">AI 분석 요약</h3>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{taxScan.summary}</p>
            </div>
          )}

          {/* Sort/Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-3">
            <span className="text-[10px] text-gray-400 font-medium mr-1">정렬</span>
            {([['refund', '환급액순'], ['confidence', '신뢰도순'], ['difficulty', '난이도순']] as const).map(([key, label]) => (
              <button key={key} onClick={() => onSetTaxSortBy(key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${taxSortBy === key ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >{label}</button>
            ))}
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
            <span className="text-[10px] text-gray-400 font-medium mr-1">상태</span>
            <select value={taxFilterStatus} onChange={e => onSetTaxFilterStatus(e.target.value)}
              className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="all">전체</option>
              <option value="identified">발견</option>
              <option value="reviewing">검토중</option>
              <option value="filed">신고완료</option>
              <option value="received">환급완료</option>
              <option value="dismissed">해당없음</option>
            </select>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
            <span className="text-[10px] text-gray-400 font-medium mr-1">데이터</span>
            <select value={taxFilterSource} onChange={e => onSetTaxFilterSource(e.target.value)}
              className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="all">전체</option>
              <option value="real">실데이터</option>
              <option value="estimated">추정치</option>
            </select>
          </div>

          {/* Opportunity Cards */}
          {sortedOpportunities.length > 0 ? (
            <div className="space-y-3">
              {sortedOpportunities.map(opp => (
                <TaxOpportunityCard key={opp.id} opp={opp} taxScan={taxScan}
                  isExpanded={expandedOpportunity === opp.id} generatingWorksheet={generatingWorksheet}
                  onToggle={() => onToggleOpportunity(opp.id)} onGenerateWorksheet={onGenerateWorksheet}
                  onUpdateWorksheetInput={onUpdateWorksheetInput} onUpdateOppStatus={onUpdateOppStatus}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="material-icons-outlined text-4xl text-gray-300 dark:text-gray-600 block mb-2" aria-hidden="true">check_circle</span>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {taxFilterStatus !== 'all' || taxFilterSource !== 'all'
                  ? '필터 조건에 맞는 항목이 없습니다.'
                  : '분석 결과 추가 적용 가능한 세금 혜택이 발견되지 않았습니다.'}
              </p>
            </div>
          )}

          {taxScan.disclaimer && (
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                <span className="material-icons-outlined text-[10px] align-middle mr-1" aria-hidden="true">info</span>
                {taxScan.disclaimer}
              </p>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!taxScanning && !taxScan && !taxError && (
        <div className="text-center py-16">
          <span className="material-icons-outlined text-5xl text-gray-300 dark:text-gray-600 mb-3 block" aria-hidden="true">account_balance</span>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">자동으로 스캔을 시작합니다...</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">기업 프로필을 기반으로 놓치고 있는 세금 혜택을 찾아보세요</p>
        </div>
      )}
    </div>
  );
};

export { DATA_SOURCE_BADGES };
export default TaxRefund;

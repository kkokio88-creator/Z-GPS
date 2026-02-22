import Icon from '../ui/Icon';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { TaxScanResult, NpsHistoricalTrend, DartFinancialYear } from '../../types';
import { formatKRW } from '../../services/utils/formatters';

// NPS 미연결 배너
export const NpsDisconnectedBanner: React.FC = () => {
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = React.useState(false);
  return (
    <div className="px-3 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg space-y-2">
      <div className="flex items-start gap-2">
        <Icon name="warning" className="h-5 w-5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">국민연금 데이터 미연결 — 추정치 기반 분석</p>
          <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 mt-0.5">국민연금 API를 연결하면 직원수·보험료 실데이터로 정확한 세금 분석이 가능합니다.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-6">
        <button onClick={() => navigate('/settings', { state: { tab: 'api' } })}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
        >
          <Icon name="settings" className="h-5 w-5" />API 설정하기
        </button>
        <a href="https://www.data.go.kr/data/15083277/openapi.do" target="_blank" rel="noopener noreferrer"
          className="px-3 py-1.5 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-xs font-medium rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-1"
        >
          신청 페이지<Icon name="open_in_new" className="h-5 w-5" />
        </a>
        <button onClick={() => setGuideOpen(v => !v)} className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 flex items-center gap-0.5">
          <Icon name={guideOpen ? 'expand_less' : 'play_arrow'} className="h-4 w-4" />연결 방법 안내
        </button>
      </div>
      {guideOpen && (
        <ol className="ml-7 text-[11px] text-amber-600/80 dark:text-amber-400/70 space-y-0.5 list-decimal">
          <li>data.go.kr 회원가입 (공공데이터포털)</li>
          <li>'국민연금 사업장 정보' API 신청 (즉시 승인)</li>
          <li>설정 → API 연동에서 키 입력 후 저장</li>
          <li>이 페이지에서 재스캔</li>
        </ol>
      )}
    </div>
  );
};

interface NpsTrendDetailProps {
  hist: NpsHistoricalTrend;
}

const NpsTrendDetail: React.FC<NpsTrendDetailProps> = ({ hist }) => {
  const recent12 = hist.monthlyData.slice(0, 12).reverse();
  const maxEmp = Math.max(...recent12.map(d => d.employeeCount), 1);
  return (
    <div className="mt-2 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-lg p-4 space-y-4">
      {hist.yearSummary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {hist.yearSummary.map(ys => (
            <div key={ys.year} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-100 dark:border-blue-800/30">
              <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{ys.year}년</p>
              <div className="space-y-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                <p>평균 <span className="font-medium text-gray-900 dark:text-white">{ys.avgEmployees}</span>명</p>
                <p>순증감 <span className={`font-medium ${ys.netChange > 0 ? 'text-green-600 dark:text-green-400' : ys.netChange < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>{ys.netChange >= 0 ? '+' : ''}{ys.netChange}명</span></p>
                <p className="text-[10px] text-gray-400">+{ys.totalNewHires} / -{ys.totalDepartures}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div>
        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-2">최근 12개월 직원수 추이</p>
        <div className="flex items-end gap-1 h-24">
          {recent12.map(md => {
            const h = Math.max((md.employeeCount / maxEmp) * 100, 3);
            return (
              <div key={md.dataCrtYm} className="flex-1 flex flex-col items-center group relative">
                <div className="absolute -top-5 hidden group-hover:block z-10 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                  {md.employeeCount}명 (+{md.newHires}/-{md.departures})
                </div>
                <div className="w-full bg-blue-400 dark:bg-blue-500 rounded-t transition-all hover:bg-blue-500 dark:hover:bg-blue-400" style={{ height: `${h}%` }} />
                <span className="text-[8px] text-gray-400 mt-1 leading-none">{md.dataCrtYm.substring(4)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface TaxDataBadgesProps {
  taxScan: TaxScanResult;
  showNpsTrend: boolean;
  showDartSummary: boolean;
  onToggleNpsTrend: () => void;
  onToggleDartSummary: () => void;
}

const TaxDataBadges: React.FC<TaxDataBadgesProps> = ({
  taxScan, showNpsTrend, showDartSummary, onToggleNpsTrend, onToggleDartSummary,
}) => {
  const dartFinancials = (taxScan as TaxScanResult & { dartFinancials?: DartFinancialYear[] }).dartFinancials;

  return (
    <div className="space-y-2">
      {/* NPS 배지 */}
      {taxScan.npsData?.found ? (
        <div>
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-lg">
            <Icon name="verified" className="h-5 w-5" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
              NPS 실데이터 ({taxScan.npsData.allWorkplaces ? `${taxScan.npsData.allWorkplaces.length}개 사업장 · ` : ''}{taxScan.npsData.workplace?.nrOfJnng}명)
              {taxScan.npsData.historical ? ` · ${taxScan.npsData.historical.monthlyData.length}개월` : ''}
              {taxScan.npsData.matchedByBusinessNumber && ' · 사업자번호 매칭'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {typeof taxScan.dataCompleteness === 'number' && (
                <span className="text-[10px] text-blue-500 dark:text-blue-400">완성도 {taxScan.dataCompleteness}%</span>
              )}
              {taxScan.npsData.historical && (
                <button onClick={onToggleNpsTrend} className="px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors flex items-center gap-0.5">
                  <Icon name={showNpsTrend ? 'expand_less' : 'bar_chart'} className="h-3 w-3" />추이
                </button>
              )}
            </div>
          </div>
          {showNpsTrend && taxScan.npsData.historical && (
            <NpsTrendDetail hist={taxScan.npsData.historical as NpsHistoricalTrend} />
          )}
        </div>
      ) : (
        <NpsDisconnectedBanner />
      )}

      {/* DART 재무 배지 */}
      {dartFinancials?.length ? (
        <div>
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg">
            <Icon name="verified" className="h-5 w-5" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              DART 공시 재무데이터 ({dartFinancials.length}년분)
            </span>
            <button onClick={onToggleDartSummary} className="ml-auto px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded transition-colors flex items-center gap-0.5">
              <Icon name={showDartSummary ? 'expand_less' : 'table_chart'} className="h-3 w-3" />재무 요약
            </button>
          </div>
          {showDartSummary && (
            <div className="mt-2 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-lg p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-emerald-200 dark:border-emerald-800/40">
                    <th className="text-left py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">연도</th>
                    <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">매출액</th>
                    <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">영업이익</th>
                    <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">R&D비</th>
                    <th className="text-right py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">인건비</th>
                  </tr></thead>
                  <tbody>
                    {dartFinancials.map(f => (
                      <tr key={f.year} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white">{f.year}년</td>
                        <td className="py-1.5 px-2 text-right">{f.revenue ? formatKRW(f.revenue) : '-'}</td>
                        <td className="py-1.5 px-2 text-right">{f.operatingProfit ? formatKRW(f.operatingProfit) : '-'}</td>
                        <td className="py-1.5 px-2 text-right text-emerald-600 dark:text-emerald-400">{f.rndExpense ? formatKRW(f.rndExpense) : '-'}</td>
                        <td className="py-1.5 px-2 text-right text-blue-600 dark:text-blue-400">{f.personnelExpense ? formatKRW(f.personnelExpense) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* 데이터 소스 배너 */}
      {taxScan.dataSources && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/40 rounded-lg">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 mr-1">분석 데이터:</span>
          {Object.entries(taxScan.dataSources).filter(([, v]) => v).map(([key]) => {
            const labelMap: Record<string, { label: string; cls: string }> = {
              nps: { label: 'NPS', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
              dart: { label: 'DART', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
              ei: { label: '고용보험', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
              bizStatus: { label: '국세청', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
              research: { label: '리서치', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
              documents: { label: '문서', cls: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
              programFit: { label: '적합도', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
            };
            const info = labelMap[key];
            return info ? <span key={key} className={`text-[10px] px-1.5 py-0.5 rounded ${info.cls} font-medium`}>{info.label}</span> : null;
          })}
        </div>
      )}
    </div>
  );
};

export default TaxDataBadges;

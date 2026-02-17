import React from 'react';
import { DeepResearchResult } from '../../types';
import CompanyResearchAnalysis from './CompanyResearchAnalysis';

const formatCurrency = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000000000000) return `${sign}${(abs / 1000000000000).toFixed(1)}조원`;
  if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(1)}억원`;
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(0)}만원`;
  return `${sign}${abs.toLocaleString()}원`;
};

interface CompanyResearchProps {
  data: DeepResearchResult;
  onReset: () => void;
  onSave: () => void;
}

const CompanyResearch: React.FC<CompanyResearchProps> = ({ data, onReset, onSave }) => {
  const {
    basicInfo, financialInfo, businessInfo, certifications, ipList,
    marketPosition, history, coreCompetencies, strategicAnalysis,
    industryInsights, governmentFundingFit, executiveSummary, sources,
    employmentInfo, investmentInfo, dataSources
  } = data;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold flex items-center">
              {basicInfo.name}
              <span className="ml-2 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                리서치 완료
              </span>
            </h2>
            {basicInfo.representativeName && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">대표: {basicInfo.representativeName}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onReset}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              다시 검색
            </button>
            <button
              onClick={onSave}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-colors"
            >
              <span className="material-icons-outlined text-sm mr-1" aria-hidden="true">save</span>
              기업정보 저장
            </button>
          </div>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          <span className="material-icons-outlined text-blue-600 mr-2" aria-hidden="true">badge</span>
          기본 정보
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {basicInfo.businessNumber && (
            <div><p className="text-gray-500 dark:text-gray-400">사업자번호</p><p className="font-medium">{basicInfo.businessNumber}</p></div>
          )}
          {basicInfo.establishedDate && (
            <div><p className="text-gray-500 dark:text-gray-400">설립일</p><p className="font-medium">{basicInfo.establishedDate}</p></div>
          )}
          {basicInfo.employeeCount && (
            <div><p className="text-gray-500 dark:text-gray-400">직원 수</p><p className="font-medium">{basicInfo.employeeCount}명</p></div>
          )}
          {basicInfo.address && (
            <div className="col-span-2"><p className="text-gray-500 dark:text-gray-400">주소</p><p className="font-medium">{basicInfo.address}</p></div>
          )}
          {basicInfo.website && (
            <div>
              <p className="text-gray-500 dark:text-gray-400">웹사이트</p>
              <a href={basicInfo.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {basicInfo.website}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 재무 현황 */}
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          <span className="material-icons-outlined text-green-600 mr-2" aria-hidden="true">payments</span>
          재무 현황
        </h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {financialInfo.recentRevenue && (
            <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400 text-sm">최근 매출</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(financialInfo.recentRevenue)}</p>
            </div>
          )}
          {financialInfo.revenueGrowth && (
            <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400 text-sm">성장률</p>
              <p className={`text-2xl font-bold ${financialInfo.revenueGrowth.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                {financialInfo.revenueGrowth}
              </p>
            </div>
          )}
        </div>
        {financialInfo.financials && financialInfo.financials.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">연도</th>
                  <th className="px-4 py-2 text-right">매출액</th>
                  <th className="px-4 py-2 text-right">영업이익</th>
                  <th className="px-4 py-2 text-right">당기순이익</th>
                  <th className="px-4 py-2 text-right">총자산</th>
                </tr>
              </thead>
              <tbody>
                {financialInfo.financials.map((f, i) => (
                  <tr key={i} className="border-t dark:border-gray-700">
                    <td className="px-4 py-2">{f.year}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(f.revenue)}</td>
                    <td className={`px-4 py-2 text-right ${f.operatingProfit < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{formatCurrency(f.operatingProfit)}</td>
                    <td className={`px-4 py-2 text-right ${f.netIncome && f.netIncome < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{f.netIncome !== undefined ? formatCurrency(f.netIncome) : '-'}</td>
                    <td className="px-4 py-2 text-right">{f.totalAssets ? formatCurrency(f.totalAssets) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 사업 영역 */}
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          <span className="material-icons-outlined text-purple-600 mr-2" aria-hidden="true">business</span>
          사업 영역
        </h3>
        <div className="mb-4">
          <span className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-3 py-1 rounded-full text-sm font-medium">
            {businessInfo.industry}
          </span>
        </div>
        {businessInfo.mainProducts.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">주요 제품/서비스</p>
            <div className="flex flex-wrap gap-2">
              {businessInfo.mainProducts.map((product, i) => (
                <span key={i} className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-sm">{product}</span>
              ))}
            </div>
          </div>
        )}
        {businessInfo.businessDescription && (
          <p className="text-gray-600 dark:text-gray-400">{businessInfo.businessDescription}</p>
        )}
        {businessInfo.distributionChannels && businessInfo.distributionChannels.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">유통 채널</p>
            <div className="flex flex-wrap gap-2">
              {businessInfo.distributionChannels.map((channel, i) => (
                <span key={i} className="bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 px-3 py-1 rounded-full text-sm">{channel}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 핵심 역량 */}
      {coreCompetencies.length > 0 && (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-yellow-600 mr-2" aria-hidden="true">emoji_events</span>
            AI 분석 핵심 역량
          </h3>
          <div className="space-y-2">
            {coreCompetencies.map((comp, i) => (
              <div key={i} className="flex items-start">
                <span className="material-icons-outlined text-yellow-500 mr-2 mt-0.5 text-sm" aria-hidden="true">star</span>
                <span>{comp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 인증 & 특허 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {certifications.length > 0 && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-blue-600 mr-2" aria-hidden="true">verified</span>
              보유 인증
            </h3>
            <div className="flex flex-wrap gap-2">
              {certifications.map((cert, i) => (
                <span key={i} className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm">{cert}</span>
              ))}
            </div>
          </div>
        )}
        {ipList.length > 0 && (
          <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
            <h3 className="font-bold text-lg mb-4 flex items-center">
              <span className="material-icons-outlined text-orange-600 mr-2" aria-hidden="true">lightbulb</span>
              지적재산권 ({ipList.length}건)
            </h3>
            <div className="space-y-2">
              {ipList.slice(0, 5).map((ip, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1">{ip.title}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${ip.status === '등록' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {ip.type} ({ip.status})
                  </span>
                </div>
              ))}
              {ipList.length > 5 && <p className="text-xs text-gray-500">외 {ipList.length - 5}건</p>}
            </div>
          </div>
        )}
      </div>

      {/* 고용 & 복지 정보 */}
      {employmentInfo && (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-cyan-600 mr-2" aria-hidden="true">groups</span>
            고용 & 복지 정보
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {employmentInfo.averageSalary && (
              <div className="bg-cyan-50 dark:bg-cyan-900/30 p-4 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">평균 연봉</p>
                <p className="text-xl font-bold text-cyan-700 dark:text-cyan-400">{formatCurrency(employmentInfo.averageSalary)}</p>
              </div>
            )}
            {employmentInfo.creditRating && (
              <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">신용등급</p>
                <span className="inline-block mt-1 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-3 py-1 rounded-full text-sm font-bold">
                  {employmentInfo.creditRating}
                </span>
              </div>
            )}
            {employmentInfo.reviewRating !== undefined && (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">{employmentInfo.reviewSource || '리뷰'} 평점</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{employmentInfo.reviewRating}</span>
                  <span className="text-gray-400">/5.0</span>
                </div>
                <div className="flex justify-center mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className={`text-sm ${star <= Math.round(employmentInfo.reviewRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                  ))}
                </div>
                {employmentInfo.reviewCount && <p className="text-xs text-gray-400 mt-1">{employmentInfo.reviewCount}건</p>}
              </div>
            )}
            {employmentInfo.turnoverRate && (
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">이직률</p>
                <p className="text-lg font-bold mt-1">{employmentInfo.turnoverRate}</p>
              </div>
            )}
          </div>
          {employmentInfo.benefits && employmentInfo.benefits.length > 0 && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">복리후생</p>
              <div className="flex flex-wrap gap-2">
                {employmentInfo.benefits.map((benefit, i) => (
                  <span key={i} className="bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 px-3 py-1 rounded-full text-sm">{benefit}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 투자 현황 */}
      {investmentInfo && (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-emerald-600 mr-2" aria-hidden="true">account_balance</span>
            투자 현황
          </h3>
          {investmentInfo.isBootstrapped ? (
            <div className="flex items-center gap-3">
              <span className="bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-4 py-2 rounded-full text-sm font-bold">Bootstrapped</span>
              <p className="text-gray-600 dark:text-gray-400 text-sm">외부 VC 투자 없이 자체 매출로 성장한 기업입니다.</p>
            </div>
          ) : (
            <div>
              {investmentInfo.totalRaised && (
                <div className="mb-4">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">누적 투자유치</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{investmentInfo.totalRaised}</p>
                </div>
              )}
              {investmentInfo.fundingRounds && investmentInfo.fundingRounds.length > 0 && (
                <div className="space-y-3">
                  {investmentInfo.fundingRounds.map((round, i) => (
                    <div key={i} className="flex items-center gap-4 border-l-2 border-emerald-400 pl-4">
                      <div><p className="font-medium">{round.round}</p><p className="text-sm text-gray-500">{round.date}</p></div>
                      <p className="font-bold text-emerald-600">{round.amount}</p>
                      {round.investor && <p className="text-sm text-gray-400">{round.investor}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 시장 위치 */}
      {(marketPosition.competitors.length > 0 || marketPosition.uniqueSellingPoints.length > 0) && (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-indigo-600 mr-2" aria-hidden="true">analytics</span>
            시장 위치
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {marketPosition.competitors.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">주요 경쟁사</p>
                <div className="flex flex-wrap gap-2">
                  {marketPosition.competitors.map((comp, i) => (
                    <span key={i} className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded text-sm">{comp}</span>
                  ))}
                </div>
              </div>
            )}
            {marketPosition.uniqueSellingPoints.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">차별화 포인트</p>
                <ul className="space-y-1">
                  {marketPosition.uniqueSellingPoints.map((point, i) => (
                    <li key={i} className="text-sm flex items-center">
                      <span className="material-icons-outlined text-green-500 text-sm mr-1" aria-hidden="true">check</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {marketPosition.marketShare && (
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              시장 점유율: <strong>{marketPosition.marketShare}</strong>
            </p>
          )}
        </div>
      )}

      {/* 연혁 */}
      {history && (
        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined text-gray-600 mr-2" aria-hidden="true">history</span>
            주요 연혁
          </h3>
          <p className="text-gray-600 dark:text-gray-400 whitespace-pre-line">{history}</p>
        </div>
      )}

      {/* Executive Summary */}
      {executiveSummary && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-lg shadow text-white">
          <h3 className="font-bold text-lg mb-4 flex items-center">
            <span className="material-icons-outlined mr-2" aria-hidden="true">summarize</span>
            Executive Summary
          </h3>
          <p className="text-blue-50 leading-relaxed">{executiveSummary}</p>
        </div>
      )}

      <CompanyResearchAnalysis
        strategicAnalysis={strategicAnalysis}
        industryInsights={industryInsights}
        governmentFundingFit={governmentFundingFit}
        dataSources={dataSources}
        sources={sources}
      />
    </div>
  );
};

export default CompanyResearch;

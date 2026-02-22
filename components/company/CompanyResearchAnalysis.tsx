import Icon from '../ui/Icon';
import React from 'react';
import { DeepResearchResult } from '../../types';

type AnalysisProps = Pick<DeepResearchResult,
  'strategicAnalysis' | 'industryInsights' | 'governmentFundingFit' | 'dataSources' | 'sources'
>;

const CompanyResearchAnalysis: React.FC<AnalysisProps> = ({
  strategicAnalysis, industryInsights, governmentFundingFit, dataSources, sources
}) => (
  <>
    {/* SWOT 분석 */}
    {strategicAnalysis?.swot && (
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          <Icon name="grid_view" className="h-5 w-5" />
          SWOT 분석
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border-l-4 border-green-500">
            <h4 className="font-bold text-green-700 dark:text-green-400 mb-2 flex items-center"><Icon name="thumb_up" className="h-5 w-5" />강점 (Strengths)</h4>
            <ul className="space-y-1 text-sm">{strategicAnalysis.swot.strengths?.map((item, i) => <li key={i} className="flex items-start"><span className="text-green-500 mr-2">•</span><span>{item}</span></li>)}</ul>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border-l-4 border-red-500">
            <h4 className="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center"><Icon name="thumb_down" className="h-5 w-5" />약점 (Weaknesses)</h4>
            <ul className="space-y-1 text-sm">{strategicAnalysis.swot.weaknesses?.map((item, i) => <li key={i} className="flex items-start"><span className="text-red-500 mr-2">•</span><span>{item}</span></li>)}</ul>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-l-4 border-blue-500">
            <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-2 flex items-center"><Icon name="trending_up" className="h-5 w-5" />기회 (Opportunities)</h4>
            <ul className="space-y-1 text-sm">{strategicAnalysis.swot.opportunities?.map((item, i) => <li key={i} className="flex items-start"><span className="text-blue-500 mr-2">•</span><span>{item}</span></li>)}</ul>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border-l-4 border-orange-500">
            <h4 className="font-bold text-orange-700 dark:text-orange-400 mb-2 flex items-center"><Icon name="warning" className="h-5 w-5" />위협 (Threats)</h4>
            <ul className="space-y-1 text-sm">{strategicAnalysis.swot.threats?.map((item, i) => <li key={i} className="flex items-start"><span className="text-orange-500 mr-2">•</span><span>{item}</span></li>)}</ul>
          </div>
        </div>
      </div>
    )}

    {/* 전략적 분석 */}
    {strategicAnalysis && (strategicAnalysis.competitiveAdvantage || strategicAnalysis.growthPotential) && (
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          <Icon name="insights" className="h-5 w-5" />전략적 분석
        </h3>
        <div className="space-y-4">
          {strategicAnalysis.competitiveAdvantage && (
            <div>
              <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">경쟁 우위</h4>
              <p className="text-gray-600 dark:text-gray-400 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded">{strategicAnalysis.competitiveAdvantage}</p>
            </div>
          )}
          {strategicAnalysis.growthPotential && (
            <div>
              <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">성장 잠재력</h4>
              <p className="text-gray-600 dark:text-gray-400 bg-green-50 dark:bg-green-900/20 p-3 rounded">{strategicAnalysis.growthPotential}</p>
            </div>
          )}
          {strategicAnalysis.riskFactors && strategicAnalysis.riskFactors.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">주요 리스크 요인</h4>
              <div className="flex flex-wrap gap-2">
                {strategicAnalysis.riskFactors.map((risk, i) => (
                  <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded-full text-sm">{risk}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {/* 산업 인사이트 */}
    {industryInsights && (
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          <Icon name="trending_up" className="h-5 w-5" />산업 인사이트
        </h3>
        <div className="space-y-4">
          {industryInsights.marketTrends && industryInsights.marketTrends.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">시장 트렌드</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {industryInsights.marketTrends.map((trend, i) => (
                  <div key={i} className="flex items-center bg-teal-50 dark:bg-teal-900/20 p-2 rounded">
                    <Icon name="arrow_forward" className="h-5 w-5" />
                    <span className="text-sm">{trend}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {industryInsights.industryOutlook && (
            <div>
              <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">산업 전망</h4>
              <p className="text-gray-600 dark:text-gray-400 text-sm">{industryInsights.industryOutlook}</p>
            </div>
          )}
          {industryInsights.technologyTrends && industryInsights.technologyTrends.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">기술 트렌드</h4>
              <div className="flex flex-wrap gap-2">
                {industryInsights.technologyTrends.map((tech, i) => (
                  <span key={i} className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded text-sm">{tech}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {/* 정부지원사업 적합성 */}
    {governmentFundingFit && (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 rounded-lg shadow border border-amber-200 dark:border-amber-800">
        <h3 className="font-bold text-lg mb-4 flex items-center text-amber-800 dark:text-amber-300">
          <Icon name="policy" className="h-5 w-5" />정부지원사업 적합성 분석
        </h3>
        <div className="space-y-4">
          {governmentFundingFit.recommendedPrograms && governmentFundingFit.recommendedPrograms.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-2">추천 지원사업 유형</h4>
              <div className="flex flex-wrap gap-2">
                {governmentFundingFit.recommendedPrograms.map((prog, i) => (
                  <span key={i} className="bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-3 py-1 rounded-full text-sm font-medium">{prog}</span>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {governmentFundingFit.eligibilityStrengths && governmentFundingFit.eligibilityStrengths.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm text-green-700 dark:text-green-400 mb-2">어필 포인트</h4>
                <ul className="space-y-1 text-sm">
                  {governmentFundingFit.eligibilityStrengths.map((str, i) => (
                    <li key={i} className="flex items-start"><Icon name="check_circle" className="h-5 w-5" /><span>{str}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {governmentFundingFit.potentialChallenges && governmentFundingFit.potentialChallenges.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm text-red-700 dark:text-red-400 mb-2">보완 필요 사항</h4>
                <ul className="space-y-1 text-sm">
                  {governmentFundingFit.potentialChallenges.map((ch, i) => (
                    <li key={i} className="flex items-start"><Icon name="error_outline" className="h-5 w-5" /><span>{ch}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {governmentFundingFit.applicationTips && (
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-amber-300 dark:border-amber-700">
              <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-400 mb-2 flex items-center">
                <Icon name="lightbulb" className="h-5 w-5" />지원서 작성 전략
              </h4>
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{governmentFundingFit.applicationTips}</p>
            </div>
          )}
        </div>
      </div>
    )}

    {/* 데이터 출처 */}
    {dataSources && dataSources.length > 0 && (
      <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
        <h3 className="font-bold text-lg mb-4 flex items-center">
          <Icon name="source" className="h-5 w-5" />데이터 출처 ({dataSources.length}개)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {dataSources.map((ds, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary transition-colors">
              <div className="flex items-center justify-between mb-2">
                <a href={ds.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{ds.name}</a>
                <span className="text-xs text-gray-400">{ds.lastUpdated}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {ds.dataTypes.map((dt, j) => (
                  <span key={j} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{dt}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* 출처 링크 */}
    {sources && sources.length > 0 && (
      <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
        <h4 className="font-medium text-sm mb-2 flex items-center text-gray-600 dark:text-gray-400">
          <Icon name="link" className="h-5 w-5" />출처 ({sources.length}건)
        </h4>
        <div className="flex flex-wrap gap-2">
          {sources.filter(s => s.uri && s.uri !== 'demo://local').slice(0, 10).map((source, i) => (
            <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline bg-white dark:bg-gray-700 px-2 py-1 rounded">
              {source.title || source.uri}
            </a>
          ))}
        </div>
      </div>
    )}
  </>
);

export default CompanyResearchAnalysis;

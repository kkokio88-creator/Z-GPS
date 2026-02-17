import React from 'react';
import { ResearchProgress } from '../../types';

interface CompanyResearchProgressProps {
  companyName: string;
  progress: ResearchProgress;
}

const CompanyResearchProgress: React.FC<CompanyResearchProgressProps> = ({
  companyName,
  progress,
}) => (
  <div className="bg-white dark:bg-surface-dark p-8 rounded-lg shadow border border-border-light dark:border-border-dark">
    <div className="text-center">
      <span className="material-icons-outlined text-5xl text-primary animate-pulse mb-4" aria-hidden="true">biotech</span>
      <h2 className="text-xl font-bold mb-2">
        {companyName} 딥 리서치 진행 중
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">{progress.message}</p>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
        <div
          className="bg-primary h-3 rounded-full transition-all duration-500"
          style={{ width: `${progress.progress}%` }}
        />
      </div>
      <p className="text-sm text-gray-500">{progress.progress}%</p>

      <div className="mt-6 text-xs text-gray-400 space-y-1">
        <p>• 기본 정보 수집 (회사명, 대표자, 설립일)</p>
        <p>• 재무 정보 분석 (매출, 영업이익)</p>
        <p>• 사업 영역 및 인증/특허 조사</p>
        <p>• 시장 위치 및 핵심 역량 분석</p>
      </div>
    </div>
  </div>
);

export default CompanyResearchProgress;

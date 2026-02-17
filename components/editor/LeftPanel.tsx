import React from 'react';
import { SupportProgram } from '../../types';

interface GapAnalysisData {
  strengths: string[];
  gaps: string[];
  advice: string;
}

interface LeftPanelProps {
  program: SupportProgram;
  documentStatus: Record<string, boolean>;
  onDocumentToggle: (doc: string) => void;
  gapAnalysisData: GapAnalysisData | null;
  showContextPanel: boolean;
  onToggleContextPanel: () => void;
  onBudgetPlan: () => void;
  onGenerateGantt: () => void;
  onConsistencyCheck: () => void;
  onDefensePrep: () => void;
  onStartInterview: () => void;
  onCalendarSync: () => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  program, documentStatus, onDocumentToggle,
  gapAnalysisData, showContextPanel, onToggleContextPanel,
  onBudgetPlan, onGenerateGantt, onConsistencyCheck, onDefensePrep,
  onStartInterview, onCalendarSync,
}) => {
  return (
    <div className="col-span-12 lg:col-span-4 space-y-6">
      {/* Program Info Card */}
      <div className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-border-light dark:border-border-dark p-6">
        <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded mb-2">{program.supportType}</span>
        <h2 className="text-lg font-bold leading-tight mb-2">{program.programName}</h2>
        <p className="text-xs text-gray-500 mb-4">{program.organizer}</p>

        <div className="grid grid-cols-2 gap-4 mb-4 border-t border-gray-100 pt-4">
          <div>
            <span className="text-xs text-gray-400 block mb-1">지원금액</span>
            <span className="text-lg font-bold text-indigo-600">{(program.expectedGrant / 100000000).toFixed(1)}억원</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-1">마감일</span>
            <span className="text-sm font-bold text-gray-800">{new Date(program.officialEndDate).toLocaleDateString()}</span>
          </div>
        </div>

        <button onClick={onCalendarSync} className="w-full py-2 border rounded text-sm flex items-center justify-center hover:bg-gray-50 mb-2">
          <span className="material-icons-outlined text-sm mr-2" aria-hidden="true">event</span>캘린더 등록
        </button>

        {program.detailUrl && (
          <a href={program.detailUrl} target="_blank" rel="noreferrer" className="w-full py-2 bg-gray-50 border border-gray-300 rounded text-sm flex items-center justify-center hover:bg-gray-100 text-gray-700 font-medium">
            <span className="material-icons-outlined text-sm mr-2" aria-hidden="true">open_in_new</span>공고 원문 보기
          </a>
        )}

        <h4 className="font-bold text-xs text-gray-500 mt-4 mb-2">제출 필요 서류</h4>
        <ul className="text-xs space-y-1 text-gray-600 bg-gray-50 p-3 rounded">
          {program.requiredDocuments.length > 0 ? program.requiredDocuments.map((doc, idx) => (
            <li key={idx} className="flex items-center">
              <input type="checkbox" checked={documentStatus[doc] || false} onChange={() => onDocumentToggle(doc)} className="mr-2 h-3 w-3 rounded text-primary focus:ring-0" />
              {doc}
            </li>
          )) : <li className="text-gray-400">명시된 서류 없음</li>}
        </ul>
      </div>

      {/* Strategy Guide */}
      {gapAnalysisData && (
        <div className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-indigo-200 dark:border-indigo-800 p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={onToggleContextPanel}>
            <h3 className="text-sm font-bold flex items-center text-indigo-700 dark:text-indigo-300">
              <span className="material-icons-outlined mr-2 text-sm" aria-hidden="true">strategy</span> 전략 가이드
            </h3>
            <span className="material-icons-outlined text-sm" aria-hidden="true">{showContextPanel ? 'expand_less' : 'expand_more'}</span>
          </div>
          {showContextPanel && (
            <div className="text-xs space-y-2 animate-fade-in">
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                <strong className="text-green-700 dark:text-green-300 block mb-1">강조 포인트</strong>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                  {gapAnalysisData.strengths.slice(0, 2).map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
                <strong className="text-red-700 dark:text-red-300 block mb-1">보완 필요</strong>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                  {gapAnalysisData.gaps.slice(0, 2).map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <p className="text-gray-500 italic mt-2 border-t pt-2">
                * 이 전략은 AI 초안 생성 시 자동으로 반영됩니다.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action Cards */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onBudgetPlan} className="p-3 bg-teal-50 text-teal-700 border border-teal-200 rounded text-xs font-bold hover:bg-teal-100 flex flex-col items-center">
          <span className="material-icons-outlined mb-1" aria-hidden="true">attach_money</span>예산 설계
        </button>
        <button onClick={onGenerateGantt} className="p-3 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded text-xs font-bold hover:bg-cyan-100 flex flex-col items-center">
          <span className="material-icons-outlined mb-1" aria-hidden="true">calendar_view_week</span>일정 차트
        </button>
        <button onClick={onConsistencyCheck} className="p-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-xs font-bold hover:bg-indigo-100 flex flex-col items-center">
          <span className="material-icons-outlined mb-1" aria-hidden="true">rule</span>정합성 검사
        </button>
        <button onClick={onDefensePrep} className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-bold hover:bg-red-100 flex flex-col items-center">
          <span className="material-icons-outlined mb-1" aria-hidden="true">security</span>실사 방어
        </button>
        <button onClick={onStartInterview} className="col-span-2 p-2 bg-purple-50 text-purple-700 border border-purple-200 rounded text-xs font-bold hover:bg-purple-100 flex items-center justify-center">
          <span className="material-icons-outlined mr-1" aria-hidden="true">record_voice_over</span>모의 면접
        </button>
      </div>
    </div>
  );
};

export default LeftPanel;

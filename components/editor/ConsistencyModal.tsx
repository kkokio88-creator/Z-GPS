import React from 'react';
import { ConsistencyCheckResult } from '../../types';

interface ConsistencyModalProps {
  result: ConsistencyCheckResult | null;
  isLoading: boolean;
  onClose: () => void;
  onScrollToSection: (sectionTitle: string) => void;
}

const ConsistencyModal: React.FC<ConsistencyModalProps> = ({ result, isLoading, onClose, onScrollToSection }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="consistency-modal-title" className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-fade-in-up max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 bg-indigo-700 text-white flex justify-between items-center">
          <h3 id="consistency-modal-title" className="text-lg font-bold flex items-center">
            <span className="material-icons-outlined mr-2" aria-hidden="true">rule</span>AI 문서 정합성 검사
          </h3>
          <button onClick={onClose} aria-label="닫기" className="text-white hover:text-gray-200">
            <span className="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="p-8 bg-gray-50 dark:bg-gray-900 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-20">
              <span className="material-icons-outlined animate-spin text-5xl text-indigo-600 mb-4" aria-hidden="true">find_in_page</span>
              <p className="text-gray-600">사업비, 일정, 목표 간의 논리적 모순을 찾는 중입니다...</p>
            </div>
          ) : result ? (
            <div>
              <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-lg shadow-sm">
                <div>
                  <span className="text-sm text-gray-500">논리적 완성도 점수</span>
                  <div className="text-3xl font-bold text-indigo-600">{result.score}점</div>
                </div>
                <div className="text-right max-w-md">
                  <span className="text-xs font-bold text-gray-500 block mb-1">종합 제안</span>
                  <p className="text-sm text-gray-800">{result.suggestion}</p>
                </div>
              </div>
              <h4 className="font-bold text-sm text-gray-700 mb-3">발견된 이슈 ({result.issues.length})</h4>
              <div className="space-y-3">
                {result.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    onClick={() => onScrollToSection(issue.section)}
                    className="bg-white border-l-4 border-red-500 p-4 rounded shadow-sm hover:bg-gray-50 cursor-pointer group transition-colors"
                  >
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-sm text-red-600 flex items-center">
                        [{issue.section}]
                        <span className="material-icons-outlined text-xs ml-1 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">open_in_new</span>
                      </span>
                      <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">{issue.severity}</span>
                    </div>
                    <p className="text-sm text-gray-700">{issue.description}</p>
                  </div>
                ))}
                {result.issues.length === 0 && (
                  <div className="text-center text-gray-400 py-4">발견된 논리적 오류가 없습니다. 완벽합니다!</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ConsistencyModal;

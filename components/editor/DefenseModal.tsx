import React from 'react';
import { AuditDefenseResult } from '../../types';

interface DefenseModalProps {
  result: AuditDefenseResult | null;
  isLoading: boolean;
  onClose: () => void;
}

const DefenseModal: React.FC<DefenseModalProps> = ({ result, isLoading, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="defense-modal-title" className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 bg-red-700 text-white flex justify-between items-center">
          <h3 id="defense-modal-title" className="text-lg font-bold flex items-center">
            <span className="material-icons-outlined mr-2" aria-hidden="true">security</span>현장 실사 방어 솔루션
          </h3>
          <button onClick={onClose} aria-label="닫기" className="text-white hover:text-gray-200">
            <span className="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="p-8 bg-gray-50 dark:bg-gray-900 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-20">
              <span className="material-icons-outlined animate-spin text-5xl text-red-600 mb-4" aria-hidden="true">gavel</span>
              <p className="text-gray-600">평가위원 페르소나로 빙의하여 약점을 분석 중입니다...</p>
            </div>
          ) : result ? (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-sm text-red-800">
                <strong>경고:</strong> 아래 질문들은 평가위원이 실제 현장에서 가장 뼈아프게 질문할 수 있는 내용들입니다. 반드시 숙지하세요.
              </div>
              {result.questions.map((q, idx) => (
                <div key={idx} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <h4 className="font-bold text-lg text-gray-800 mb-2 flex items-start">
                    <span className="text-red-600 mr-2">Q{idx + 1}.</span> {q.question}
                  </h4>
                  <div className="text-xs text-gray-500 mb-4 bg-gray-100 inline-block px-2 py-1 rounded">
                    의도: {q.intent}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded border border-blue-100">
                      <span className="font-bold text-blue-700 text-xs block mb-1">방어 논리</span>
                      <p className="text-sm text-blue-900 leading-relaxed">{q.defenseStrategy}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded border border-green-100">
                      <span className="font-bold text-green-700 text-xs block mb-1">모범 답변 (Script)</span>
                      <p className="text-sm text-green-900 leading-relaxed">"{q.sampleAnswer}"</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default DefenseModal;

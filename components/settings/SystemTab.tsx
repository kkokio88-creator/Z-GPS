import React from 'react';
import { startQA, resetQA } from '../../services/qaService';
import { useQAStore } from '../../services/stores/qaStore';

interface SystemTabProps {
  onResetData: (type: 'selective' | 'all') => void;
}

const SystemTab: React.FC<SystemTabProps> = ({ onResetData }) => {
  const isQaRunning = useQAStore(s => s.qaState.isActive);

  const handleStartQA = () => {
    if (!window.confirm('시스템 자가 진단을 시작하시겠습니까?')) return;
    resetQA();
    startQA();
  };

  return (
    <div className="space-y-6">
      {/* QA */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <span className="material-icons-outlined text-8xl text-indigo-500" aria-hidden="true">health_and_safety</span>
        </div>
        <div className="relative z-10">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
            <span className="material-icons-outlined" aria-hidden="true">build</span>
            시스템 자가 진단
          </h3>
          <p className="text-sm text-gray-500 mb-4 max-w-lg">
            전체 기능을 순차적으로 실행하고, 오류 발생 시 수정 코드를 제안합니다.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleStartQA}
              disabled={isQaRunning}
              className={`px-5 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                isQaRunning
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isQaRunning ? (
                <span className="material-icons-outlined animate-spin text-sm" aria-hidden="true">refresh</span>
              ) : (
                <span className="material-icons-outlined text-sm" aria-hidden="true">play_arrow</span>
              )}
              {isQaRunning ? '진행 중...' : '진단 시작'}
            </button>
            <button
              onClick={() => { resetQA(); }}
              className="px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {/* 데이터 관리 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <span className="material-icons-outlined" aria-hidden="true">delete_sweep</span>
          데이터 관리
        </h3>
        <div className="space-y-3">
          <button
            onClick={() => onResetData('selective')}
            className="w-full px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors text-left flex items-center gap-3"
          >
            <span className="material-icons-outlined" aria-hidden="true">cleaning_services</span>
            <div>
              <div className="font-bold text-sm">캐시 초기화</div>
              <div className="text-xs opacity-75">프로그램 캐시, 리서치 결과만 삭제</div>
            </div>
          </button>
          <button
            onClick={() => onResetData('all')}
            className="w-full px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-left flex items-center gap-3"
          >
            <span className="material-icons-outlined" aria-hidden="true">warning</span>
            <div>
              <div className="font-bold text-sm">전체 초기화</div>
              <div className="text-xs opacity-75">모든 로컬 데이터 삭제 (복구 불가)</div>
            </div>
          </button>
        </div>
      </div>

      {/* 앱 정보 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
          <span className="material-icons-outlined" aria-hidden="true">info</span>
          앱 정보
        </h3>
        <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex justify-between"><span>버전</span><span className="font-mono">2.1.0-vault</span></div>
          <div className="flex justify-between"><span>빌드</span><span className="font-mono">2026.02.08</span></div>
          <div className="flex justify-between"><span>프레임워크</span><span>React 19 + Vite 6</span></div>
          <div className="flex justify-between"><span>AI 엔진</span><span>Google Gemini</span></div>
        </div>
      </div>
    </div>
  );
};

export default SystemTab;

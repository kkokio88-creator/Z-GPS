import React from 'react';
import { startQA, resetQA } from '../../services/qaService';
import { useQAStore } from '../../services/stores/qaStore';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Wrench, ShieldCheck, Play, RefreshCw, ListX, Brush, AlertTriangle, Info } from 'lucide-react';

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
      <Card className="border-indigo-100 dark:border-indigo-900 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <ShieldCheck className="h-20 w-20 text-indigo-500" />
        </div>
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wrench className="h-5 w-5" />
            시스템 자가 진단
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10">
          <p className="text-sm text-muted-foreground mb-4 max-w-lg">
            전체 기능을 순차적으로 실행하고, 오류 발생 시 수정 코드를 제안합니다.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={handleStartQA}
              disabled={isQaRunning}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isQaRunning ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isQaRunning ? '진행 중...' : '진단 시작'}
            </Button>
            <Button
              variant="outline"
              onClick={() => { resetQA(); }}
            >
              초기화
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 데이터 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListX className="h-5 w-5" />
            데이터 관리
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            onClick={() => onResetData('selective')}
            className="w-full px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors text-left flex items-center gap-3 cursor-pointer"
          >
            <Brush className="h-5 w-5 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">캐시 초기화</div>
              <div className="text-xs opacity-75">프로그램 캐시, 리서치 결과만 삭제</div>
            </div>
          </button>
          <button
            onClick={() => onResetData('all')}
            className="w-full px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-left flex items-center gap-3 cursor-pointer"
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <div className="font-bold text-sm">전체 초기화</div>
              <div className="text-xs opacity-75">모든 로컬 데이터 삭제 (복구 불가)</div>
            </div>
          </button>
        </CardContent>
      </Card>

      {/* 앱 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5" />
            앱 정보
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between"><span>버전</span><span className="font-mono">2.1.0-vault</span></div>
            <div className="flex justify-between"><span>빌드</span><span className="font-mono">2026.02.08</span></div>
            <div className="flex justify-between"><span>프레임워크</span><span>React 19 + Vite 6</span></div>
            <div className="flex justify-between"><span>AI 엔진</span><span>Google Gemini</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemTab;

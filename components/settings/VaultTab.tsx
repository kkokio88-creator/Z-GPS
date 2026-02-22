import React from 'react';
import type { VaultStats, VaultFolder } from '../../services/vaultService';
import type { SSEProgressEvent } from '../../services/sseClient';
import type { CrawlingConfig } from './CrawlingTab';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle2, Save } from 'lucide-react';

const FOLDER_ICONS: Record<string, string> = {
  programs: 'description',
  analysis: 'analytics',
  applications: 'edit_document',
  attachments: 'attach_file',
  company: 'business',
};

const PHASE_LABELS = ['', 'API 수집', 'AI 사전심사', 'URL 크롤링', 'AI 강화', '적합도 분석'];
const PHASE_COLORS = ['', 'bg-blue-500', 'bg-cyan-500', 'bg-amber-500', 'bg-purple-500', 'bg-emerald-500'];

const StatusDot: React.FC<{ connected: boolean }> = ({ connected }) => (
  <span className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
);

const StatCard: React.FC<{ label: string; value: number | string; icon: string }> = ({ label, value, icon }) => (
  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
    <Icon name={icon} className="h-6 w-6 text-indigo-500 mb-1 mx-auto" />
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    <div className="text-xs text-gray-500 mt-1">{label}</div>
  </div>
);

const ProgressBar: React.FC<{
  active: boolean;
  label: string;
  progress?: SSEProgressEvent | null;
}> = ({ active, label, progress }) => {
  if (!active) return null;
  const percent = progress?.percent ?? 0;
  const hasProgress = progress && progress.total > 0;
  const phase = progress?.phase ?? 0;
  return (
    <div className="mt-3">
      {phase > 0 && (
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((step) => (
            <div key={step} className="flex items-center gap-1">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                step < phase ? 'bg-green-500 text-white' :
                step === phase ? `${PHASE_COLORS[step]} text-white animate-pulse` :
                'bg-gray-200 dark:bg-gray-700 text-gray-400'
              }`}>
                {step < phase ? '\u2713' : step}
              </div>
              <span className={`text-[9px] ${step === phase ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400'}`}>
                {PHASE_LABELS[step]}
              </span>
              {step < 5 && <div className={`w-2 h-0.5 ${step < phase ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-indigo-600 dark:text-indigo-400 mb-1">
        <div className="flex items-center gap-2">
          <Icon name="refresh" className="h-4 w-4 animate-spin" />
          {hasProgress ? progress.stage : label}
        </div>
        {hasProgress && (
          <span className="text-xs font-mono">
            {progress.current}/{progress.total} ({percent}%)
          </span>
        )}
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
        <div
          className={`${phase > 0 ? PHASE_COLORS[phase] : 'bg-indigo-500'} h-2.5 rounded-full transition-all duration-300`}
          style={{ width: hasProgress ? `${percent}%` : '100%' }}
        />
      </div>
      {hasProgress && progress.programName && (
        <p className="text-xs text-gray-400 mt-1 truncate">{progress.programName}</p>
      )}
    </div>
  );
};

const formatDate = (iso: string): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

interface VaultTabProps {
  vaultStats: VaultStats | null;
  syncing: boolean;
  syncResult: string;
  syncProgress: SSEProgressEvent | null;
  onSync: () => void;
  onForceReanalyze: () => void;
  onCopyPath: (path: string) => void;
  crawlingConfig: CrawlingConfig;
  crawlingSaved: boolean;
  onCrawlingConfigChange: (config: CrawlingConfig) => void;
  onSaveCrawling: () => void;
}

const InlineSaveMessage: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400 ml-3 animate-pulse">
      <CheckCircle2 className="h-4 w-4 mr-1" />
      저장되었습니다
    </span>
  );
};

const PIPELINE_STEPS = [
  { step: 1, label: 'API 수집', desc: '공공 API 데이터', icon: 'cloud_download', color: 'blue' },
  { step: 2, label: 'URL 크롤링', desc: '상세페이지 파싱', icon: 'language', color: 'amber' },
  { step: 3, label: 'AI 강화', desc: '첨부파일 + Gemini', icon: 'auto_awesome', color: 'purple' },
  { step: 4, label: '적합도 분석', desc: '5차원 평가', icon: 'psychology', color: 'emerald' },
];

const DATA_SOURCES = [
  { key: 'incheon' as const, label: '인천 BizOK', desc: 'ODCLOUD API' },
  { key: 'mss' as const, label: '중소벤처기업부', desc: 'data.go.kr' },
  { key: 'kstartup' as const, label: 'K-Startup', desc: '창업진흥원' },
];

const VaultTab: React.FC<VaultTabProps> = ({
  vaultStats,
  syncing,
  syncResult,
  syncProgress,
  onSync,
  onForceReanalyze,
  onCopyPath,
  crawlingConfig,
  crawlingSaved,
  onCrawlingConfigChange,
  onSaveCrawling,
}) => (
  <div className="space-y-6">
    {/* 섹션 1: 데이터 저장소 연결 */}
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Icon name="cloud_done" className="h-5 w-5" />
          데이터 저장소 연결
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <StatusDot connected={vaultStats?.connected ?? false} />
          <span className={vaultStats?.connected ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}>
            {vaultStats?.connected ? '연결됨' : '미연결'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400 font-mono truncate flex-1">
          {vaultStats?.vaultPath || '경로 확인 중...'}
        </p>
        {vaultStats?.vaultPath && (
          <button
            onClick={() => onCopyPath(vaultStats.vaultPath)}
            className="shrink-0 p-1.5 text-gray-400 hover:text-indigo-500 transition-colors"
            title="경로 복사"
          >
            <Icon name="content_copy" className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
        <Icon name="info" className="h-5 w-5" />
        공고 데이터는 Obsidian(무료 문서 편집기)과 호환되는 형식으로 저장됩니다.
      </div>
    </div>

    {/* 섹션 2: 폴더 구조 */}
    {vaultStats?.folders && vaultStats.folders.length > 0 && (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <Icon name="folder_open" className="h-5 w-5" />
          데이터 구조
        </h3>
        <div className="space-y-2">
          {vaultStats.folders.map((folder: VaultFolder) => (
            <div key={folder.name} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <Icon name={FOLDER_ICONS[folder.name] || 'folder'} className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-medium">{folder.label}</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300">
                {folder.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* 섹션 3: 통계 요약 */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="총 공고" value={vaultStats?.totalPrograms ?? 0} icon="description" />
      <StatCard label="분석 완료" value={vaultStats?.analyzedPrograms ?? 0} icon="analytics" />
      <StatCard label="지원서" value={vaultStats?.applications ?? 0} icon="edit_document" />
      <StatCard label="첨부파일" value={vaultStats?.attachments ?? 0} icon="attach_file" />
    </div>

    {/* 섹션 4: 동기화 파이프라인 */}
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <Icon name="sync" className="h-5 w-5" />
        공고 동기화
      </h3>

      {/* 4단계 파이프라인 시각화 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {PIPELINE_STEPS.map(({ step, label, desc, icon, color }) => (
          <div key={step} className={`p-3 rounded-xl border border-${color}-200 dark:border-${color}-800 bg-${color}-50 dark:bg-${color}-900/20 text-center`}>
            <Icon name={icon} className="h-5 w-5" />
            <div className="font-bold text-xs mt-1">{step}. {label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onSync}
          disabled={syncing}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Icon name="cloud_download" className="h-5 w-5" />
          공고 동기화
        </button>
        <button
          onClick={onForceReanalyze}
          disabled={syncing}
          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Icon name="refresh" className="h-5 w-5" />
          전체 재분석
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">동기화 버튼 하나로 4단계를 자동 진행합니다. 이미 처리된 단계는 건너뜁니다.</p>
      <p className="text-xs text-orange-400 mt-0.5">전체 재분석: 이미 분석된 공고도 강제로 다시 분석합니다</p>
      <ProgressBar active={syncing} label="동기화 진행 중..." progress={syncProgress} />
      {syncResult && (
        <p className={`mt-3 text-sm ${syncResult.includes('실패') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
          {syncResult}
        </p>
      )}
      <div className="mt-3 text-xs text-gray-400 space-y-1">
        <div>마지막 동기화: {formatDate(vaultStats?.latestSyncedAt || '')}</div>
        <div>마지막 분석: {formatDate(vaultStats?.latestAnalyzedAt || '')}</div>
      </div>
    </div>

    {/* 섹션 5: 수집 설정 */}
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold flex items-center gap-2">
          <Icon name="travel_explore" className="h-5 w-5" />
          수집 설정
        </h3>
        <InlineSaveMessage show={crawlingSaved} />
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">데이터 소스</label>
          <div className="space-y-2">
            {DATA_SOURCES.map(source => (
              <label key={source.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer">
                <div>
                  <div className="font-medium text-sm">{source.label}</div>
                  <div className="text-xs text-gray-400">{source.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={crawlingConfig.sources[source.key]}
                  onChange={e => onCrawlingConfigChange({
                    ...crawlingConfig,
                    sources: { ...crawlingConfig.sources, [source.key]: e.target.checked },
                  })}
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                />
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer">
          <div>
            <div className="font-medium text-sm">첨부파일 자동 다운로드</div>
            <div className="text-xs text-gray-400">PDF, HWP 등 공고문 첨부파일 자동 저장</div>
          </div>
          <input
            type="checkbox"
            checked={crawlingConfig.autoDownloadAttachments}
            onChange={e => onCrawlingConfigChange({ ...crawlingConfig, autoDownloadAttachments: e.target.checked })}
            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
          />
        </label>

        <button
          onClick={onSaveCrawling}
          className="w-full bg-gray-800 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Icon name="save" className="h-5 w-5" />
          수집 설정 저장
        </button>
      </div>
    </div>
  </div>
);

export default VaultTab;

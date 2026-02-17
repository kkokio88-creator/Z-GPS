import React from 'react';
import type { VaultStats, VaultFolder } from '../../services/vaultService';
import type { SSEProgressEvent } from '../../services/sseClient';

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
    <span className="material-icons-outlined text-2xl text-indigo-500 mb-1 block" aria-hidden="true">{icon}</span>
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
          <span className="material-icons-outlined text-sm animate-spin" aria-hidden="true">refresh</span>
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
  onCopyPath: (path: string) => void;
}

const VaultTab: React.FC<VaultTabProps> = ({
  vaultStats,
  syncing,
  syncResult,
  syncProgress,
  onSync,
  onCopyPath,
}) => (
  <div className="space-y-6">
    {/* 섹션 1: 데이터 저장소 연결 */}
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <span className="material-icons-outlined" aria-hidden="true">cloud_done</span>
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
            <span className="material-icons-outlined text-sm" aria-hidden="true">content_copy</span>
          </button>
        )}
      </div>
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
        <span className="material-icons-outlined text-sm align-text-bottom mr-1" aria-hidden="true">info</span>
        공고 데이터는 Obsidian(무료 문서 편집기)과 호환되는 형식으로 저장됩니다.
      </div>
    </div>

    {/* 섹션 2: 폴더 구조 */}
    {vaultStats?.folders && vaultStats.folders.length > 0 && (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <span className="material-icons-outlined" aria-hidden="true">folder_open</span>
          데이터 구조
        </h3>
        <div className="space-y-2">
          {vaultStats.folders.map((folder: VaultFolder) => (
            <div key={folder.name} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <span className="material-icons-outlined text-indigo-500" aria-hidden="true">
                  {FOLDER_ICONS[folder.name] || 'folder'}
                </span>
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

    {/* 섹션 4: 동기화 */}
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <span className="material-icons-outlined" aria-hidden="true">sync</span>
        공고 동기화
      </h3>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onSync}
          disabled={syncing}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <span className="material-icons-outlined text-sm" aria-hidden="true">cloud_download</span>
          공고 동기화
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">API 수집 → URL 크롤링 → AI 강화 → 적합도 분석 (4단계 자동 진행)</p>
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
  </div>
);

export default VaultTab;

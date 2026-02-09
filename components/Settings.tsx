
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './Header';
import { vaultService, VaultStats, VaultFolder, VaultDocumentMeta } from '../services/vaultService';
import {
  getStoredCompany,
  saveStoredCompany,
  getStoredApiKey,
  saveStoredApiKey,
  getStoredAiModel,
  saveStoredAiModel,
  getStoredDartApiKey,
  saveStoredDartApiKey,
} from '../services/storageService';
import { Company } from '../types';
import { startQA, resetQA, getQAState } from '../services/qaService';

type TabId = 'vault' | 'company' | 'api' | 'crawling' | 'system';

interface CrawlingConfig {
  mode: 'basic' | 'deep';
  sources: { incheon: boolean; mss: boolean; kstartup: boolean };
  autoDownloadAttachments: boolean;
}

const DEFAULT_CRAWLING_CONFIG: CrawlingConfig = {
  mode: 'basic',
  sources: { incheon: true, mss: true, kstartup: true },
  autoDownloadAttachments: false,
};

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'vault', label: '공고 데이터', icon: 'folder_open' },
  { id: 'company', label: '우리 기업', icon: 'business' },
  { id: 'api', label: 'API 연동', icon: 'vpn_key' },
  { id: 'crawling', label: '공고 수집', icon: 'travel_explore' },
  { id: 'system', label: '시스템', icon: 'settings' },
];

const FOLDER_ICONS: Record<string, string> = {
  programs: 'description',
  analysis: 'analytics',
  applications: 'edit_document',
  attachments: 'attach_file',
  company: 'business',
};

const FILE_TYPE_STYLES: Record<string, { color: string; icon: string }> = {
  PDF: { color: 'text-red-500', icon: 'picture_as_pdf' },
  HWP: { color: 'text-blue-500', icon: 'article' },
  DOC: { color: 'text-blue-600', icon: 'article' },
  DOCX: { color: 'text-blue-600', icon: 'article' },
  IMAGE: { color: 'text-green-500', icon: 'image' },
  EXCEL: { color: 'text-green-600', icon: 'table_chart' },
  ZIP: { color: 'text-yellow-600', icon: 'folder_zip' },
  OTHER: { color: 'text-gray-400', icon: 'insert_drive_file' },
};

const ACCEPTED_FILE_TYPES = '.pdf,.hwp,.doc,.docx,.jpg,.jpeg,.png,.zip,.xlsx,.xls';

const loadCrawlingConfig = (): CrawlingConfig => {
  try {
    const stored = localStorage.getItem('zmis_crawling_config');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_CRAWLING_CONFIG;
};

const saveCrawlingConfig = (config: CrawlingConfig) => {
  localStorage.setItem('zmis_crawling_config', JSON.stringify(config));
};

// ─── Sub-components ──────────────────────────────────────────

const StatusDot: React.FC<{ connected: boolean }> = ({ connected }) => (
  <span className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
);

const StatCard: React.FC<{ label: string; value: number | string; icon: string }> = ({ label, value, icon }) => (
  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
    <span className="material-icons-outlined text-2xl text-indigo-500 mb-1 block">{icon}</span>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
    <div className="text-xs text-gray-500 mt-1">{label}</div>
  </div>
);

const ProgressBar: React.FC<{ active: boolean; label: string }> = ({ active, label }) => {
  if (!active) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 mb-1">
        <span className="material-icons-outlined text-sm animate-spin">refresh</span>
        {label}
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div className="bg-indigo-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
      </div>
    </div>
  );
};

const InlineSaveMessage: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400 ml-3 animate-pulse">
      <span className="material-icons-outlined text-sm mr-1">check_circle</span>
      저장되었습니다
    </span>
  );
};

const ChipInput: React.FC<{
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => {
  const [input, setInput] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      if (!value.includes(input.trim())) {
        onChange([...value, input.trim()]);
      }
      setInput('');
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg bg-gray-50 dark:bg-gray-800 min-h-[42px]">
      {value.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
        >
          {chip}
          <button
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="ml-1 hover:text-red-500"
          >
            &times;
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] bg-transparent outline-none text-sm"
      />
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('vault');

  // Vault
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');
  const [analyzeResult, setAnalyzeResult] = useState<string>('');

  // Company
  const [company, setCompany] = useState<Company>(getStoredCompany());
  const [companySaved, setCompanySaved] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [researchQuery, setResearchQuery] = useState('');
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState('');

  // Company Documents
  const [documents, setDocuments] = useState<VaultDocumentMeta[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docName, setDocName] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API
  const [apiKey, setApiKey] = useState('');
  const [dartApiKey, setDartApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash-preview');
  const [apiSaved, setApiSaved] = useState(false);

  // Crawling
  const [crawlingConfig, setCrawlingConfig] = useState<CrawlingConfig>(loadCrawlingConfig());
  const [crawlingSaved, setCrawlingSaved] = useState(false);

  // System / QA
  const [isQaRunning, setIsQaRunning] = useState(false);

  // ─── Effects ─────────────────────────────────

  useEffect(() => {
    setApiKey(getStoredApiKey());
    setDartApiKey(getStoredDartApiKey());
    setAiModel(getStoredAiModel());

    const handleUpdate = () => setIsQaRunning(getQAState().isActive);
    window.addEventListener('zmis-qa-update', handleUpdate);
    handleUpdate();

    return () => window.removeEventListener('zmis-qa-update', handleUpdate);
  }, []);

  const loadVaultStats = useCallback(async () => {
    try {
      const stats = await vaultService.getVaultStats();
      setVaultStats(stats);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Settings] Vault stats error:', e);
      setVaultStats({
        vaultPath: '',
        connected: false,
        totalPrograms: 0,
        analyzedPrograms: 0,
        applications: 0,
        attachments: 0,
        latestSyncedAt: '',
        latestAnalyzedAt: '',
        folders: [],
      });
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'vault') {
      loadVaultStats();
    }
  }, [activeTab, loadVaultStats]);

  // Company load from vault
  useEffect(() => {
    if (activeTab === 'company') {
      setCompanyLoading(true);
      vaultService.getCompany().then(result => {
        if (result.company) {
          const c = result.company;
          setCompany(prev => ({
            ...prev,
            name: (c.name as string) || prev.name,
            businessNumber: (c.businessNumber as string) || prev.businessNumber,
            industry: (c.industry as string) || prev.industry,
            address: (c.address as string) || prev.address,
            revenue: (c.revenue as number) || prev.revenue,
            employees: (c.employees as number) || prev.employees,
            description: (c.description as string) || prev.description,
            coreCompetencies: (c.coreCompetencies as string[]) || prev.coreCompetencies,
            certifications: (c.certifications as string[]) || prev.certifications,
          }));
        }
      }).catch(() => {
        // vault 연결 실패 시 localStorage fallback
      }).finally(() => setCompanyLoading(false));

      // 서류 목록 로드
      loadDocuments();
    }
  }, [activeTab]);

  const loadDocuments = async () => {
    setDocsLoading(true);
    try {
      const docs = await vaultService.getCompanyDocuments();
      setDocuments(docs);
    } catch {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  // ─── Handlers ────────────────────────────────

  const handleSync = async (deepCrawl: boolean) => {
    setSyncing(true);
    setSyncResult('');
    try {
      const result = await vaultService.syncPrograms(deepCrawl);
      setSyncResult(
        `동기화 완료: ${result.totalFetched}건 수집, ${result.created}건 생성, ${result.updated}건 갱신` +
        (result.deepCrawled ? `, ${result.deepCrawled}건 딥크롤` : '') +
        (result.attachmentsDownloaded ? `, 첨부 ${result.attachmentsDownloaded}건` : '')
      );
      loadVaultStats();
    } catch (e) {
      setSyncResult(`동기화 실패: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    setAnalyzeResult('');
    try {
      const result = await vaultService.analyzeAll();
      setAnalyzeResult(`분석 완료: ${result.analyzed}건 성공, ${result.errors}건 실패`);
      loadVaultStats();
    } catch (e) {
      setAnalyzeResult(`분석 실패: ${String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleResearchCompany = async () => {
    if (!researchQuery.trim() || researchQuery.trim().length < 2) return;
    setResearching(true);
    setResearchError('');
    try {
      const result = await vaultService.researchCompany(researchQuery.trim());
      if (result.success && result.company) {
        const c = result.company;
        setCompany(prev => ({
          ...prev,
          name: (c.name as string) || prev.name,
          businessNumber: (c.businessNumber as string) || prev.businessNumber,
          industry: (c.industry as string) || prev.industry,
          address: (c.address as string) || prev.address,
          revenue: (c.revenue as number) || prev.revenue,
          employees: (c.employees as number) || prev.employees,
          description: (c.description as string) || prev.description,
          coreCompetencies: (c.coreCompetencies as string[]) || prev.coreCompetencies,
          certifications: (c.certifications as string[]) || prev.certifications,
        }));
        setResearchQuery('');
      }
    } catch (e) {
      setResearchError(`리서치 실패: ${String(e)}`);
    } finally {
      setResearching(false);
    }
  };

  const handleSaveCompany = async () => {
    saveStoredCompany(company);
    try {
      await vaultService.saveCompany({
        name: company.name,
        businessNumber: company.businessNumber,
        industry: company.industry,
        address: company.address,
        revenue: company.revenue,
        employees: company.employees,
        description: company.description,
        coreCompetencies: company.coreCompetencies,
        certifications: company.certifications,
      });
    } catch {
      // vault 저장 실패 시 localStorage 에만 저장
    }
    setCompanySaved(true);
    setTimeout(() => setCompanySaved(false), 2000);
  };

  const handleUploadDocument = async () => {
    if (!docName.trim() || !docFile) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // data:application/pdf;base64,... → base64 부분만 추출
          const base64Data = result.split(',')[1] || result;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(docFile);
      });

      await vaultService.uploadCompanyDocument(docName.trim(), docFile.name, base64);
      setDocName('');
      setDocFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();

      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '서류가 등록되었습니다.', type: 'success' },
      }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: `서류 등록 실패: ${String(e)}`, type: 'error' },
      }));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string, docName: string) => {
    if (!window.confirm(`"${docName}" 서류를 삭제하시겠습니까?`)) return;
    try {
      await vaultService.deleteCompanyDocument(docId);
      await loadDocuments();
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '서류가 삭제되었습니다.', type: 'success' },
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '서류 삭제에 실패했습니다.', type: 'error' },
      }));
    }
  };

  const handleSaveApi = () => {
    saveStoredApiKey(apiKey);
    saveStoredDartApiKey(dartApiKey);
    saveStoredAiModel(aiModel);
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
  };

  const handleSaveCrawling = () => {
    saveCrawlingConfig(crawlingConfig);
    setCrawlingSaved(true);
    setTimeout(() => setCrawlingSaved(false), 2000);
  };

  const handleStartQA = () => {
    if (!window.confirm('시스템 자가 진단을 시작하시겠습니까?')) return;
    resetQA();
    startQA();
  };

  const handleResetData = (type: 'selective' | 'all') => {
    if (type === 'all') {
      if (!window.confirm('모든 로컬 데이터를 삭제합니다. 계속하시겠습니까?')) return;
      localStorage.clear();
      window.location.reload();
    } else {
      if (!window.confirm('캐시 데이터만 삭제합니다. 계속하시겠습니까?')) return;
      ['zmis_program_cache', 'zmis_deep_research'].forEach(k => localStorage.removeItem(k));
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '캐시가 초기화되었습니다.', type: 'success' },
      }));
    }
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

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '경로가 복사되었습니다.', type: 'success' },
      }));
    }).catch(() => {
      // fallback: do nothing
    });
  };

  // ─── Tab Panels ──────────────────────────────

  const renderVaultTab = () => (
    <div className="space-y-6">
      {/* 섹션 1: Obsidian 연결 상태 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-icons-outlined">cloud_done</span>
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
              onClick={() => handleCopyPath(vaultStats.vaultPath)}
              className="shrink-0 p-1.5 text-gray-400 hover:text-indigo-500 transition-colors"
              title="경로 복사"
            >
              <span className="material-icons-outlined text-sm">content_copy</span>
            </button>
          )}
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
          <span className="material-icons-outlined text-sm align-text-bottom mr-1">info</span>
          공고 데이터는 Obsidian(무료 문서 편집기)과 호환되는 형식으로 저장됩니다. Obsidian을 설치하면 데이터를 더 편리하게 편집할 수 있습니다.
        </div>
      </div>

      {/* 섹션 2: 폴더 구조 시각화 */}
      {vaultStats?.folders && vaultStats.folders.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <span className="material-icons-outlined">folder_open</span>
            데이터 구조
          </h3>
          <div className="space-y-2">
            {vaultStats.folders.map((folder: VaultFolder) => (
              <div
                key={folder.name}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <span className="material-icons-outlined text-indigo-500">
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

      {/* 섹션 4: 동기화/분석 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <span className="material-icons-outlined">sync</span>
          공고 동기화
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <span className="material-icons-outlined text-sm">cloud_download</span>
            기본 동기화
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={syncing}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <span className="material-icons-outlined text-sm">rocket_launch</span>
            딥크롤 동기화
          </button>
        </div>
        <ProgressBar active={syncing} label="동기화 진행 중..." />
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

      {/* 전체 분석 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <span className="material-icons-outlined">psychology</span>
          AI 적합도 분석
        </h3>
        <button
          onClick={handleAnalyzeAll}
          disabled={analyzing || (vaultStats?.totalPrograms ?? 0) === 0}
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <span className="material-icons-outlined text-sm">auto_awesome</span>
          전체 분석 실행
        </button>
        <ProgressBar active={analyzing} label="AI 분석 진행 중..." />
        {analyzeResult && (
          <p className={`mt-3 text-sm ${analyzeResult.includes('실패') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
            {analyzeResult}
          </p>
        )}
      </div>
    </div>
  );

  const renderCompanyTab = () => (
    <div className="space-y-6">
      {/* AI 기업 검색 */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-5">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
          <span className="material-icons-outlined text-indigo-600">travel_explore</span>
          AI 기업 리서치
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          기업명을 입력하면 AI가 공개 정보를 검색하여 자동으로 기업 프로필을 채워줍니다.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={researchQuery}
            onChange={e => setResearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleResearchCompany()}
            placeholder="기업명 입력 (예: 산너머남촌)"
            disabled={researching}
            className="flex-1 border border-indigo-300 dark:border-indigo-700 rounded-lg p-2.5 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={handleResearchCompany}
            disabled={researching || researchQuery.trim().length < 2}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {researching ? (
              <>
                <span className="material-icons-outlined text-sm animate-spin">refresh</span>
                리서치 중...
              </>
            ) : (
              <>
                <span className="material-icons-outlined text-sm">search</span>
                검색
              </>
            )}
          </button>
        </div>
        {researchError && (
          <p className="mt-2 text-sm text-red-500">{researchError}</p>
        )}
        {researching && (
          <div className="mt-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg p-3 text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
            <span className="material-icons-outlined animate-spin text-sm">autorenew</span>
            AI가 기업 정보를 수집하고 있습니다. 약 10~15초 소요됩니다...
          </div>
        )}
      </div>

      {/* 기업 정보 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-icons-outlined">business</span>
            기업 정보
          </h3>
          <InlineSaveMessage show={companySaved} />
        </div>

        {companyLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <span className="material-icons-outlined animate-spin mr-2">refresh</span>
            로딩 중...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">기업명</label>
                <input
                  type="text"
                  value={company.name}
                  onChange={e => setCompany(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">사업자번호</label>
                <input
                  type="text"
                  value={company.businessNumber || ''}
                  onChange={e => setCompany(prev => ({ ...prev, businessNumber: e.target.value }))}
                  placeholder="000-00-00000"
                  className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">업종</label>
                <input
                  type="text"
                  value={company.industry}
                  onChange={e => setCompany(prev => ({ ...prev, industry: e.target.value }))}
                  className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">주소</label>
                <input
                  type="text"
                  value={company.address || ''}
                  onChange={e => setCompany(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">매출액 (원)</label>
                <input
                  type="number"
                  value={company.revenue || 0}
                  onChange={e => setCompany(prev => ({ ...prev, revenue: Number(e.target.value) }))}
                  className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">직원수</label>
                <input
                  type="number"
                  value={company.employees || 0}
                  onChange={e => setCompany(prev => ({ ...prev, employees: Number(e.target.value) }))}
                  className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">핵심 역량</label>
              <ChipInput
                value={company.coreCompetencies || []}
                onChange={v => setCompany(prev => ({ ...prev, coreCompetencies: v }))}
                placeholder="역량 입력 후 Enter (예: HACCP, 식품가공)"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">보유 인증</label>
              <ChipInput
                value={company.certifications || []}
                onChange={v => setCompany(prev => ({ ...prev, certifications: v }))}
                placeholder="인증 입력 후 Enter (예: ISO9001, HACCP)"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">기업 설명</label>
              <textarea
                value={company.description}
                onChange={e => setCompany(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <button
              onClick={handleSaveCompany}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-icons-outlined text-sm">save</span>
              기업 정보 저장
            </button>
          </div>
        )}
      </div>

      {/* 기업 서류함 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
          <span className="material-icons-outlined">folder_shared</span>
          기업 서류함
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          여기에 등록한 서류는 지원서 작성 시 자동으로 활용됩니다.
        </p>

        {/* 서류 목록 */}
        {docsLoading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <span className="material-icons-outlined animate-spin mr-2">refresh</span>
            로딩 중...
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <span className="material-icons-outlined text-4xl block mb-2">upload_file</span>
            <p className="text-sm">등록된 서류가 없습니다.</p>
            <p className="text-xs mt-1">아래에서 서류를 추가하세요.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {documents.map(doc => {
              const style = FILE_TYPE_STYLES[doc.fileType] || FILE_TYPE_STYLES.OTHER;
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`material-icons-outlined text-xl ${style.color}`}>
                      {style.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{doc.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {doc.fileName} &middot; {formatDate(doc.uploadDate)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.id, doc.name)}
                    className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="삭제"
                  >
                    <span className="material-icons-outlined text-lg">delete</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 서류 추가 폼 */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-3">서류 추가</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">서류명</label>
              <input
                type="text"
                value={docName}
                onChange={e => setDocName(e.target.value)}
                placeholder="예: 사업자등록증, HACCP 인증서"
                className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">파일 선택</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={e => setDocFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-600 dark:file:text-indigo-300 hover:file:bg-indigo-100"
              />
              <p className="text-xs text-gray-400 mt-1">
                지원 형식: PDF, HWP, DOCX, JPG, PNG, ZIP, XLSX
              </p>
            </div>
            <button
              onClick={handleUploadDocument}
              disabled={uploading || !docName.trim() || !docFile}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {uploading ? (
                <>
                  <span className="material-icons-outlined text-sm animate-spin">refresh</span>
                  업로드 중...
                </>
              ) : (
                <>
                  <span className="material-icons-outlined text-sm">upload</span>
                  서류 등록
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderApiTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-icons-outlined">vpn_key</span>
            API 설정
          </h3>
          <InlineSaveMessage show={apiSaved} />
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Gemini API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Gemini API 키를 입력하세요"
                className="flex-1 border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-sm"
              >
                <span className="material-icons-outlined text-sm">open_in_new</span>
                발급
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1">Google AI Studio에서 무료로 발급 가능합니다</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Open DART API Key (선택)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dartApiKey}
                onChange={e => setDartApiKey(e.target.value)}
                placeholder="DART API 키를 입력하세요"
                className="flex-1 border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <a
                href="https://opendart.fss.or.kr/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-sm"
              >
                <span className="material-icons-outlined text-sm">open_in_new</span>
                발급
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1">금융감독원 전자공시 데이터 조회용</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">AI 모델</label>
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="gemini-2.5-flash-preview">Gemini 2.5 Flash (빠름)</option>
              <option value="gemini-2.5-pro-preview">Gemini 2.5 Pro (정확)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            </select>
          </div>

          <button
            onClick={handleSaveApi}
            className="w-full bg-gray-800 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-icons-outlined text-sm">save</span>
            API 설정 저장
          </button>
        </div>
      </div>
    </div>
  );

  const renderCrawlingTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-icons-outlined">travel_explore</span>
            공고 수집 설정
          </h3>
          <InlineSaveMessage show={crawlingSaved} />
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">수집 모드</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCrawlingConfig(prev => ({ ...prev, mode: 'basic' }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  crawlingConfig.mode === 'basic'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="font-bold text-sm">기본</div>
                <div className="text-xs text-gray-500 mt-1">API 목록만 수집</div>
              </button>
              <button
                onClick={() => setCrawlingConfig(prev => ({ ...prev, mode: 'deep' }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  crawlingConfig.mode === 'deep'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="font-bold text-sm">고급 (딥크롤)</div>
                <div className="text-xs text-gray-500 mt-1">상세페이지 + 첨부파일</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">데이터 소스</label>
            <div className="space-y-3">
              {[
                { key: 'incheon' as const, label: '인천 BizOK', desc: 'ODCLOUD API' },
                { key: 'mss' as const, label: '중소벤처기업부', desc: 'data.go.kr' },
                { key: 'kstartup' as const, label: 'K-Startup', desc: '창업진흥원' },
              ].map(source => (
                <label key={source.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer">
                  <div>
                    <div className="font-medium text-sm">{source.label}</div>
                    <div className="text-xs text-gray-400">{source.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={crawlingConfig.sources[source.key]}
                    onChange={e => setCrawlingConfig(prev => ({
                      ...prev,
                      sources: { ...prev.sources, [source.key]: e.target.checked },
                    }))}
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
              onChange={e => setCrawlingConfig(prev => ({
                ...prev,
                autoDownloadAttachments: e.target.checked,
              }))}
              className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
            />
          </label>

          <button
            onClick={handleSaveCrawling}
            className="w-full bg-gray-800 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-icons-outlined text-sm">save</span>
            수집 설정 저장
          </button>
        </div>
      </div>
    </div>
  );

  const renderSystemTab = () => (
    <div className="space-y-6">
      {/* QA */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-900 p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <span className="material-icons-outlined text-8xl text-indigo-500">health_and_safety</span>
        </div>
        <div className="relative z-10">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
            <span className="material-icons-outlined">build</span>
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
                <span className="material-icons-outlined animate-spin text-sm">refresh</span>
              ) : (
                <span className="material-icons-outlined text-sm">play_arrow</span>
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
          <span className="material-icons-outlined">delete_sweep</span>
          데이터 관리
        </h3>
        <div className="space-y-3">
          <button
            onClick={() => handleResetData('selective')}
            className="w-full px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors text-left flex items-center gap-3"
          >
            <span className="material-icons-outlined">cleaning_services</span>
            <div>
              <div className="font-bold text-sm">캐시 초기화</div>
              <div className="text-xs opacity-75">프로그램 캐시, 리서치 결과만 삭제</div>
            </div>
          </button>
          <button
            onClick={() => handleResetData('all')}
            className="w-full px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-left flex items-center gap-3"
          >
            <span className="material-icons-outlined">warning</span>
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
          <span className="material-icons-outlined">info</span>
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'vault': return renderVaultTab();
      case 'company': return renderCompanyTab();
      case 'api': return renderApiTab();
      case 'crawling': return renderCrawlingTab();
      case 'system': return renderSystemTab();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="설정" />

      <main className="flex-1 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full">
          {/* 모바일: 가로 스크롤 */}
          <div className="md:hidden overflow-x-auto border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="flex min-w-max">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="material-icons-outlined text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* 데스크톱: 좌측 세로 탭 */}
          <div className="hidden md:flex flex-col w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3 gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                <span className="material-icons-outlined text-xl">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 콘텐츠 패널 */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;

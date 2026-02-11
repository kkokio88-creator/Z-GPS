
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
  getStoredNpsApiKey,
  saveStoredNpsApiKey,
} from '../services/storageService';
import { Company } from '../types';
import { startQA, resetQA, getQAState } from '../services/qaService';
import type { SSEProgressEvent } from '../services/sseClient';

type TabId = 'vault' | 'company' | 'api' | 'crawling' | 'system';

interface CrawlingConfig {
  sources: { incheon: boolean; mss: boolean; kstartup: boolean };
  autoDownloadAttachments: boolean;
}

const DEFAULT_CRAWLING_CONFIG: CrawlingConfig = {
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

const PHASE_LABELS = ['', 'API 수집', 'AI 사전심사', 'URL 크롤링', 'AI 강화', '적합도 분석'];
const PHASE_COLORS = ['', 'bg-blue-500', 'bg-cyan-500', 'bg-amber-500', 'bg-purple-500', 'bg-emerald-500'];

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
      {/* 3단계 스텝 인디케이터 */}
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
          <span className="material-icons-outlined text-sm animate-spin">refresh</span>
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
  const location = useLocation();
  const initialTab = (location.state as { tab?: TabId } | null)?.tab || 'vault';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Vault
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');
  const [analyzeResult, setAnalyzeResult] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState<SSEProgressEvent | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<SSEProgressEvent | null>(null);
  const syncAbortRef = useRef<(() => void) | null>(null);
  const analyzeAbortRef = useRef<(() => void) | null>(null);

  // Company
  const [company, setCompany] = useState<Company>(getStoredCompany());
  const [companySaved, setCompanySaved] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [researchQuery, setResearchQuery] = useState('');
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [deepResearchData, setDeepResearchData] = useState<Record<string, unknown> | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

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
  const [npsApiKey, setNpsApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash-preview');
  const [apiSaved, setApiSaved] = useState(false);
  const [npsGuideOpen, setNpsGuideOpen] = useState(false);

  // Crawling
  const [crawlingConfig, setCrawlingConfig] = useState<CrawlingConfig>(loadCrawlingConfig());
  const [crawlingSaved, setCrawlingSaved] = useState(false);

  // System / QA
  const [isQaRunning, setIsQaRunning] = useState(false);

  // ─── Effects ─────────────────────────────────

  useEffect(() => {
    const localApiKey = getStoredApiKey();
    const localDartKey = getStoredDartApiKey();
    const localNpsKey = getStoredNpsApiKey();
    const localModel = getStoredAiModel();
    setApiKey(localApiKey);
    setDartApiKey(localDartKey);
    setNpsApiKey(localNpsKey);
    setAiModel(localModel);

    // localStorage가 비어있으면 서버에서 복원 시도
    if (!localApiKey && !localDartKey) {
      vaultService.getConfig().then(config => {
        if (config.geminiApiKey && typeof config.geminiApiKey === 'string') {
          setApiKey(config.geminiApiKey);
        }
        if (config.dartApiKey && typeof config.dartApiKey === 'string') {
          setDartApiKey(config.dartApiKey);
        }
        if (config.dataGoKrApiKey && typeof config.dataGoKrApiKey === 'string') {
          setNpsApiKey(config.dataGoKrApiKey);
        }
        if (config.aiModel && typeof config.aiModel === 'string') {
          setAiModel(config.aiModel as string);
        }
      }).catch(() => { /* 서버 연결 실패 무시 */ });
    }

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
            name: (c.name as string) ?? prev.name,
            businessNumber: (c.businessNumber as string) ?? prev.businessNumber,
            industry: (c.industry as string) ?? prev.industry,
            address: (c.address as string) ?? prev.address,
            revenue: (c.revenue != null ? Number(c.revenue) : prev.revenue),
            employees: (c.employees != null ? Number(c.employees) : prev.employees),
            description: (c.description as string) ?? prev.description,
            coreCompetencies: Array.isArray(c.coreCompetencies) ? c.coreCompetencies as string[] : prev.coreCompetencies,
            certifications: Array.isArray(c.certifications) ? c.certifications as string[] : prev.certifications,
            foundedYear: (c.foundedYear != null ? Number(c.foundedYear) : prev.foundedYear),
            businessType: (c.businessType as string) ?? prev.businessType,
            mainProducts: Array.isArray(c.mainProducts) ? c.mainProducts as string[] : prev.mainProducts,
            representative: (c.representative as string) ?? prev.representative,
            history: (c.history as string) ?? prev.history,
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

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult('');
    setSyncProgress(null);
    try {
      const { promise, abort } = vaultService.syncProgramsWithProgress(
        (event) => setSyncProgress(event)
      );
      syncAbortRef.current = abort;
      const result = await promise;
      const parts = [`완료: ${result.totalFetched}건 수집, ${result.created}건 생성, ${result.updated}건 갱신`];
      if (result.preScreenPassed || result.preScreenRejected) parts.push(`사전심사 ${result.preScreenPassed || 0}건 통과/${result.preScreenRejected || 0}건 탈락`);
      if (result.phase2Crawled) parts.push(`${result.phase2Crawled}건 크롤`);
      if (result.phase3Enriched) parts.push(`${result.phase3Enriched}건 AI 강화`);
      if (result.phase4Analyzed) parts.push(`${result.phase4Analyzed}건 분석`);
      if (result.phase4Strategies) parts.push(`${result.phase4Strategies}건 전략 생성`);
      if (result.attachmentsDownloaded) parts.push(`첨부 ${result.attachmentsDownloaded}건`);
      setSyncResult(parts.join(', '));
      loadVaultStats();
    } catch (e) {
      setSyncResult(`동기화 실패: ${String(e)}`);
    } finally {
      setSyncing(false);
      setSyncProgress(null);
      syncAbortRef.current = null;
    }
  };

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    setAnalyzeResult('');
    setAnalyzeProgress(null);
    try {
      const { promise, abort } = vaultService.analyzeAllWithProgress(
        (event) => setAnalyzeProgress(event)
      );
      analyzeAbortRef.current = abort;
      const result = await promise;
      setAnalyzeResult(`분석 완료: ${result.analyzed}건 성공, ${result.errors}건 실패`);
      loadVaultStats();
    } catch (e) {
      setAnalyzeResult(`분석 실패: ${String(e)}`);
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
      analyzeAbortRef.current = null;
    }
  };

  const handleResearchCompany = async () => {
    if (!researchQuery.trim() || researchQuery.trim().length < 2) return;
    setResearching(true);
    setResearchError('');
    try {
      const result = await vaultService.researchCompany(researchQuery.trim());
      if (!result.success || !result.company) {
        setResearchError('리서치 결과를 받지 못했습니다. 다시 시도해주세요.');
        return;
      }
      const c = result.company;

      // 빈 결과 검증 — name만 있고 나머지 비어있으면 실패 처리
      const hasName = !!c.name && String(c.name).trim().length > 0;
      const hasExtra = !!(
        (c.description && String(c.description).trim().length > 1) ||
        (c.industry && String(c.industry).trim().length > 1) ||
        (Array.isArray(c.coreCompetencies) && c.coreCompetencies.length > 0) ||
        (c.strategicAnalysis && typeof c.strategicAnalysis === 'object')
      );
      if (!hasName || !hasExtra) {
        setResearchError('AI가 유효한 기업 정보를 반환하지 않았습니다. 기업명을 확인 후 다시 시도해주세요.');
        return;
      }

      // ─── 클라이언트측 회사명 이중 검증 ───────────────
      const normalize = (n: string) =>
        n.replace(/^(주식회사|㈜|\(주\)|\(사\)|사단법인|재단법인)\s*/g, '')
         .replace(/\s*(주식회사|㈜|\(주\))$/g, '')
         .replace(/\s+/g, '').toLowerCase();

      const returnedName = String(c.name || '');
      const queryNorm = normalize(researchQuery.trim());
      const returnedNorm = normalize(returnedName);

      if (returnedName && returnedNorm.length > 0 &&
          !returnedNorm.includes(queryNorm) &&
          !queryNorm.includes(returnedNorm)) {
        setResearchError(`AI가 다른 기업("${returnedName}")을 반환했습니다. 정확한 기업명으로 다시 검색해주세요.`);
        return;
      }

      // foundedYear 추출: "YYYY-MM-DD" 또는 숫자
      let foundedYear: number | undefined;
      if (c.foundedDate && typeof c.foundedDate === 'string') {
        const y = parseInt(c.foundedDate.substring(0, 4), 10);
        if (!isNaN(y) && y > 1900) foundedYear = y;
      } else if (c.foundedYear && typeof c.foundedYear === 'number') {
        foundedYear = c.foundedYear as number;
      }

      const updated: typeof company = {
        ...company,
        name: (c.name as string) || company.name,
        businessNumber: (c.businessNumber as string) || company.businessNumber,
        industry: (c.industry as string) || company.industry,
        address: (c.address as string) || company.address,
        revenue: (c.revenue != null && Number(c.revenue) > 0 ? Number(c.revenue) : company.revenue),
        employees: (c.employees != null && Number(c.employees) > 0 ? Number(c.employees) : company.employees),
        description: (c.description as string) || company.description,
        coreCompetencies: Array.isArray(c.coreCompetencies) && c.coreCompetencies.length > 0 ? c.coreCompetencies as string[] : company.coreCompetencies,
        certifications: Array.isArray(c.certifications) && c.certifications.length > 0 ? c.certifications as string[] : company.certifications,
        mainProducts: Array.isArray(c.mainProducts) && c.mainProducts.length > 0 ? c.mainProducts as string[] : company.mainProducts,
        representative: (c.representative as string) || company.representative,
        foundedYear: foundedYear ?? company.foundedYear,
        businessType: (c.businessType as string) || company.businessType,
        history: (c.history as string) || company.history,
      };
      setCompany(updated);

      // 리서치 완료 시 자동 저장
      saveStoredCompany(updated);
      try {
        await vaultService.saveCompany({
          name: updated.name,
          businessNumber: updated.businessNumber,
          industry: updated.industry,
          address: updated.address,
          revenue: updated.revenue,
          employees: updated.employees,
          description: updated.description,
          coreCompetencies: updated.coreCompetencies,
          certifications: updated.certifications,
          foundedYear: updated.foundedYear,
          businessType: updated.businessType,
          mainProducts: updated.mainProducts,
          representative: updated.representative,
          history: updated.history,
        });
      } catch (saveErr) {
        console.warn('[Settings] Research auto-save failed:', saveErr);
        window.dispatchEvent(new CustomEvent('zmis-toast', {
          detail: { message: '서버 저장에 실패했습니다. 로컬에만 저장됩니다.', type: 'warning' },
        }));
      }

      // 딥리서치 전체 데이터 저장
      setDeepResearchData(c);
      setExpandedSections(new Set(['swot', 'funding']));
      setResearchQuery('');

      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '기업 리서치 완료 — 자동 저장되었습니다.', type: 'success' },
      }));
    } catch (e: unknown) {
      const err = e as Error & { response?: { data?: { error?: string; details?: string; mismatch?: boolean; notFound?: boolean } } };
      const data = err?.response?.data;
      if (data?.mismatch || data?.notFound) {
        setResearchError(data.error || '기업 정보를 찾을 수 없습니다.');
      } else {
        const detail = data?.details || data?.error || String(e);
        setResearchError(`리서치 실패: ${detail}`);
      }
    } finally {
      setResearching(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
        foundedYear: company.foundedYear,
        businessType: company.businessType,
        mainProducts: company.mainProducts,
        representative: company.representative,
        history: company.history,
      });
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '기업 정보가 서버에 저장되었습니다.', type: 'success' },
      }));
    } catch {
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '서버 저장에 실패했습니다. 로컬에만 저장됩니다.', type: 'warning' },
      }));
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

  const handleSaveApi = async () => {
    saveStoredApiKey(apiKey);
    saveStoredDartApiKey(dartApiKey);
    saveStoredNpsApiKey(npsApiKey);
    saveStoredAiModel(aiModel);

    // 서버에도 저장 (process.env에 반영)
    try {
      await vaultService.saveConfig({
        geminiApiKey: apiKey || undefined,
        dartApiKey: dartApiKey || undefined,
        dataGoKrApiKey: npsApiKey || undefined,
        aiModel: aiModel || undefined,
      });
    } catch {
      window.dispatchEvent(new CustomEvent('zmis-toast', {
        detail: { message: '서버에 API 키를 저장하지 못했습니다. 로컬에만 저장됩니다.', type: 'warning' },
      }));
    }

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
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <span className="material-icons-outlined text-sm">cloud_download</span>
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

      {/* 딥리서치 결과 */}
      {deepResearchData && (() => {
        const sa = deepResearchData.strategicAnalysis as Record<string, unknown> | undefined;
        const swot = sa?.swot as Record<string, string[]> | undefined;
        const mp = deepResearchData.marketPosition as Record<string, unknown> | undefined;
        const ii = deepResearchData.industryInsights as Record<string, unknown> | undefined;
        const gf = deepResearchData.governmentFundingFit as Record<string, unknown> | undefined;
        const ei = deepResearchData.employmentInfo as Record<string, unknown> | undefined;
        const inv = deepResearchData.investmentInfo as Record<string, unknown> | undefined;

        // 표시 가능한 섹션이 있는지 체크
        const hasAnySections = !!(swot || mp || ii || gf || ei || (inv && !inv.isBootstrapped));

        const AccordionSection: React.FC<{ id: string; icon: string; title: string; children: React.ReactNode }> = ({ id, icon, title, children }) => (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(id)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="flex items-center gap-2 font-medium text-sm">
                <span className="material-icons-outlined text-base">{icon}</span>
                {title}
              </span>
              <span className={`material-icons-outlined text-sm transition-transform ${expandedSections.has(id) ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            {expandedSections.has(id) && (
              <div className="p-3 text-sm space-y-2">{children}</div>
            )}
          </div>
        );

        return (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span className="material-icons-outlined text-indigo-600">insights</span>
                AI 딥리서치 결과
              </h3>
              <button onClick={() => setDeepResearchData(null)} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
            </div>

            {/* 기본 정보 요약 (항상 표시) */}
            {deepResearchData.name && (
              <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg">
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{deepResearchData.name as string}</p>
                {deepResearchData.industry && <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{deepResearchData.industry as string}</p>}
                {deepResearchData.description && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{deepResearchData.description as string}</p>}
              </div>
            )}

            {!hasAnySections && (
              <div className="text-center py-6 text-gray-400">
                <span className="material-icons-outlined text-3xl mb-2 block">info</span>
                <p className="text-sm">기본 정보만 수집되었습니다. 상세 분석 데이터가 없습니다.</p>
                <p className="text-xs mt-1">아래 기업 정보 폼에서 수집된 내용을 확인하세요.</p>
              </div>
            )}

            <div className="space-y-2">

              {/* SWOT */}
              {swot && (
                <AccordionSection id="swot" icon="grid_view" title="SWOT 전략 분석">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-2.5 border border-green-200 dark:border-green-800">
                      <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-1">강점 (S)</p>
                      {(swot.strengths || []).map((s, i) => <p key={i} className="text-xs text-green-600 dark:text-green-300">- {s}</p>)}
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-2.5 border border-red-200 dark:border-red-800">
                      <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-1">약점 (W)</p>
                      {(swot.weaknesses || []).map((w, i) => <p key={i} className="text-xs text-red-600 dark:text-red-300">- {w}</p>)}
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-2.5 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">기회 (O)</p>
                      {(swot.opportunities || []).map((o, i) => <p key={i} className="text-xs text-blue-600 dark:text-blue-300">- {o}</p>)}
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2.5 border border-amber-200 dark:border-amber-800">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">위협 (T)</p>
                      {(swot.threats || []).map((t, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-300">- {t}</p>)}
                    </div>
                  </div>
                  {sa?.competitiveAdvantage && <p className="mt-2 text-xs"><strong>경쟁우위:</strong> {sa.competitiveAdvantage as string}</p>}
                  {sa?.growthPotential && <p className="text-xs"><strong>성장잠재력:</strong> {sa.growthPotential as string}</p>}
                </AccordionSection>
              )}

              {/* 시장 분석 */}
              {mp && (
                <AccordionSection id="market" icon="analytics" title="시장 분석">
                  {(mp.competitors as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">경쟁사</p>{(mp.competitors as string[]).map((c, i) => <span key={i} className="inline-block mr-1.5 mb-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{c}</span>)}</div>
                  ) : null}
                  {mp.marketShare && <p className="text-xs"><strong>시장점유율:</strong> {mp.marketShare as string}</p>}
                  {(mp.uniqueSellingPoints as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">차별화 포인트</p>{(mp.uniqueSellingPoints as string[]).map((u, i) => <p key={i} className="text-xs text-gray-600 dark:text-gray-400">- {u}</p>)}</div>
                  ) : null}
                </AccordionSection>
              )}

              {/* 산업 인사이트 */}
              {ii && (
                <AccordionSection id="industry" icon="trending_up" title="산업 인사이트">
                  {(ii.marketTrends as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">시장 트렌드</p>{(ii.marketTrends as string[]).map((t, i) => <p key={i} className="text-xs text-gray-600 dark:text-gray-400">- {t}</p>)}</div>
                  ) : null}
                  {ii.industryOutlook && <p className="text-xs"><strong>산업 전망:</strong> {ii.industryOutlook as string}</p>}
                  {ii.regulatoryEnvironment && <p className="text-xs"><strong>규제 환경:</strong> {ii.regulatoryEnvironment as string}</p>}
                </AccordionSection>
              )}

              {/* 정부지원 적합성 */}
              {gf && (
                <AccordionSection id="funding" icon="account_balance" title="정부지원금 적합성">
                  {(gf.recommendedPrograms as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">추천 지원사업</p>{(gf.recommendedPrograms as string[]).map((r, i) => <p key={i} className="text-xs text-indigo-600 dark:text-indigo-400">- {r}</p>)}</div>
                  ) : null}
                  {(gf.eligibilityStrengths as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">자격 강점</p>{(gf.eligibilityStrengths as string[]).map((s, i) => <p key={i} className="text-xs text-green-600 dark:text-green-400">- {s}</p>)}</div>
                  ) : null}
                  {(gf.potentialChallenges as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">도전과제</p>{(gf.potentialChallenges as string[]).map((c, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-400">- {c}</p>)}</div>
                  ) : null}
                  {gf.applicationTips && (
                    <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded p-2 text-xs text-indigo-700 dark:text-indigo-300">
                      <strong>지원 팁:</strong> {gf.applicationTips as string}
                    </div>
                  )}
                </AccordionSection>
              )}

              {/* 고용 정보 */}
              {ei && (
                <AccordionSection id="employment" icon="people" title="고용/재무 정보">
                  {(ei.averageSalary as number) > 0 && <p className="text-xs"><strong>평균 연봉:</strong> {((ei.averageSalary as number) / 10000).toFixed(0)}만원</p>}
                  {ei.creditRating && <p className="text-xs"><strong>신용등급:</strong> {ei.creditRating as string}</p>}
                  {(ei.benefits as string[] | undefined)?.length ? (
                    <p className="text-xs"><strong>복리후생:</strong> {(ei.benefits as string[]).join(', ')}</p>
                  ) : null}
                </AccordionSection>
              )}

              {/* 투자 정보 */}
              {inv && !(inv.isBootstrapped) && (
                <AccordionSection id="investment" icon="payments" title="투자 정보">
                  {inv.totalRaised && <p className="text-xs"><strong>총 투자유치:</strong> {inv.totalRaised as string}</p>}
                  {(inv.fundingRounds as { round: string; amount: string; date: string; investor?: string }[] | undefined)?.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50 dark:bg-gray-800"><th className="p-1.5 text-left">라운드</th><th className="p-1.5 text-left">금액</th><th className="p-1.5 text-left">일시</th><th className="p-1.5 text-left">투자자</th></tr></thead>
                        <tbody>
                          {(inv.fundingRounds as { round: string; amount: string; date: string; investor?: string }[]).map((r, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="p-1.5">{r.round}</td>
                              <td className="p-1.5">{r.amount}</td>
                              <td className="p-1.5">{r.date}</td>
                              <td className="p-1.5">{r.investor || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </AccordionSection>
              )}

            </div>
          </div>
        );
      })()}

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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">공공데이터포털 API Key (국민연금)</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={npsApiKey}
                onChange={e => setNpsApiKey(e.target.value)}
                placeholder="공공데이터포털 인증키를 입력하세요"
                className="flex-1 border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <a
                href="https://www.data.go.kr/data/15083277/openapi.do"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-sm"
              >
                <span className="material-icons-outlined text-sm">open_in_new</span>
                신청
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1">국민연금 사업장 정보 API를 연결하면 세금 환급 분석의 정확도가 높아집니다</p>

            <button
              type="button"
              onClick={() => setNpsGuideOpen(v => !v)}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 flex items-center gap-1"
            >
              <span className="material-icons-outlined text-sm">{npsGuideOpen ? 'expand_less' : 'info'}</span>
              연결 방법 안내
            </button>
            {npsGuideOpen && (
              <ol className="mt-2 ml-4 text-xs text-gray-500 dark:text-gray-400 space-y-1 list-decimal">
                <li>data.go.kr 회원가입 (공공데이터포털)</li>
                <li>'국민연금공단_국민연금 사업장 정보' API 신청</li>
                <li>즉시 승인 — 발급된 인증키를 위 필드에 입력</li>
                <li>저장 후 세금 환급 탭에서 재스캔</li>
              </ol>
            )}
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
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">4단계 자동 파이프라인</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { step: 1, label: 'API 수집', desc: '공공 API 데이터', icon: 'cloud_download', color: 'blue' },
                { step: 2, label: 'URL 크롤링', desc: '상세페이지 파싱', icon: 'language', color: 'amber' },
                { step: 3, label: 'AI 강화', desc: '첨부파일 + Gemini', icon: 'auto_awesome', color: 'purple' },
                { step: 4, label: '적합도 분석', desc: '5차원 평가', icon: 'psychology', color: 'emerald' },
              ].map(({ step, label, desc, icon, color }) => (
                <div key={step} className={`p-3 rounded-xl border border-${color}-200 dark:border-${color}-800 bg-${color}-50 dark:bg-${color}-900/20 text-center`}>
                  <span className={`material-icons-outlined text-${color}-500 text-lg`}>{icon}</span>
                  <div className="font-bold text-xs mt-1">{step}. {label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">동기화 버튼 하나로 4단계를 자동 진행합니다. 이미 처리된 단계는 건너뜁니다.</p>
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

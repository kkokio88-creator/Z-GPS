import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../Header';
import { vaultService, type VaultStats, type VaultDocumentMeta } from '../../services/vaultService';
import {
  saveStoredCompany,
  getStoredApiKey,
  saveStoredApiKey,
  getStoredAiModel,
  saveStoredAiModel,
  getStoredDartApiKey,
  saveStoredDartApiKey,
  getStoredNpsApiKey,
  saveStoredNpsApiKey,
  getStoredDeepResearch,
} from '../../services/storageService';
import { Company } from '../../types';
import { useCompanyStore } from '../../services/stores/companyStore';
import type { SSEProgressEvent } from '../../services/sseClient';
import VaultTab from './VaultTab';
import CompanyTab from './CompanyTab';
import ApiTab from './ApiTab';
import { type CrawlingConfig } from './CrawlingTab';
import SystemTab from './SystemTab';
import { useResearchCompany } from './useResearchCompany';

type TabId = 'vault' | 'company' | 'api' | 'system';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'vault', label: '공고 데이터', icon: 'folder_open' },
  { id: 'company', label: '우리 기업', icon: 'business' },
  { id: 'api', label: 'API 연동', icon: 'vpn_key' },
  { id: 'system', label: '시스템', icon: 'settings' },
];

const DEFAULT_CRAWLING_CONFIG: CrawlingConfig = {
  sources: { incheon: true, mss: true, kstartup: true },
  autoDownloadAttachments: false,
};

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

const Settings: React.FC = () => {
  const location = useLocation();
  const initialTab = (location.state as { tab?: TabId } | null)?.tab || 'vault';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Vault
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState<SSEProgressEvent | null>(null);
  const syncAbortRef = useRef<(() => void) | null>(null);

  // Company
  const _storeCompany = useCompanyStore(s => s.company);
  const [company, setCompany] = React.useState<Company | null>(() => _storeCompany);
  const _setStoreCompany = useCompanyStore(s => s.setCompany);
  React.useEffect(() => {
    if (_storeCompany) setCompany(_storeCompany);
  }, [_storeCompany]);
  const [companySaved, setCompanySaved] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [deepResearchData, setDeepResearchData] = useState<Record<string, unknown> | null>(() => {
    const stored = getStoredDeepResearch();
    return stored as unknown as Record<string, unknown> | null;
  });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [documents, setDocuments] = useState<VaultDocumentMeta[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const { researching, researchError, handleResearchCompany } = useResearchCompany({
    company,
    setCompany,
    setDeepResearchData,
    setExpandedSections,
  });

  // API
  const [apiKey, setApiKey] = useState('');
  const [dartApiKey, setDartApiKey] = useState('');
  const [npsApiKey, setNpsApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash');
  const [apiSaved, setApiSaved] = useState(false);

  // Crawling
  const [crawlingConfig, setCrawlingConfig] = useState<CrawlingConfig>(loadCrawlingConfig());
  const [crawlingSaved, setCrawlingSaved] = useState(false);

  // ─── Effects ─────────────────────────────────

  useEffect(() => {
    const k = getStoredApiKey(), d = getStoredDartApiKey(), n = getStoredNpsApiKey(), m = getStoredAiModel();
    setApiKey(k); setDartApiKey(d); setNpsApiKey(n); setAiModel(m);
    if (!k && !d) {
      vaultService.restoreConfig().then(cfg => {
        if (typeof cfg.geminiApiKey === 'string') { setApiKey(cfg.geminiApiKey); saveStoredApiKey(cfg.geminiApiKey); }
        if (typeof cfg.dartApiKey === 'string') { setDartApiKey(cfg.dartApiKey); saveStoredDartApiKey(cfg.dartApiKey); }
        if (typeof cfg.dataGoKrApiKey === 'string') { setNpsApiKey(cfg.dataGoKrApiKey); saveStoredNpsApiKey(cfg.dataGoKrApiKey); }
        if (typeof cfg.aiModel === 'string') { setAiModel(cfg.aiModel); saveStoredAiModel(cfg.aiModel); }
      }).catch(() => {});
    }
  }, []);

  const loadVaultStats = useCallback(async () => {
    try { setVaultStats(await vaultService.getVaultStats()); }
    catch (e) {
      if (import.meta.env.DEV) console.error('[Settings] Vault stats error:', e);
      setVaultStats({ vaultPath: '', connected: false, totalPrograms: 0, analyzedPrograms: 0, applications: 0, attachments: 0, latestSyncedAt: '', latestAnalyzedAt: '', folders: [] });
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'vault') loadVaultStats();
  }, [activeTab, loadVaultStats]);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try { setDocuments(await vaultService.getCompanyDocuments()); }
    catch { setDocuments([]); }
    finally { setDocsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab !== 'company') return;
    setCompanyLoading(true);
    vaultService.getCompany().then(result => {
      const c = result.company;
      if (!c) return;
      setCompany(prev => ({
        ...prev,
        name: (c.name as string) ?? prev.name, businessNumber: (c.businessNumber as string) ?? prev.businessNumber,
        industry: (c.industry as string) ?? prev.industry, address: (c.address as string) ?? prev.address,
        revenue: (c.revenue != null ? Number(c.revenue) : prev.revenue), employees: (c.employees != null ? Number(c.employees) : prev.employees),
        description: (c.description as string) ?? prev.description,
        coreCompetencies: Array.isArray(c.coreCompetencies) ? c.coreCompetencies as string[] : prev.coreCompetencies,
        certifications: Array.isArray(c.certifications) ? c.certifications as string[] : prev.certifications,
        foundedYear: (c.foundedYear != null ? Number(c.foundedYear) : prev.foundedYear),
        businessType: (c.businessType as string) ?? prev.businessType,
        mainProducts: Array.isArray(c.mainProducts) ? c.mainProducts as string[] : prev.mainProducts,
        representative: (c.representative as string) ?? prev.representative, history: (c.history as string) ?? prev.history,
      }));
    }).catch(() => {}).finally(() => setCompanyLoading(false));
    loadDocuments();
  }, [activeTab, loadDocuments]);

  // ─── Handlers ────────────────────────────────

  const handleSync = async (options?: { forceReanalyze?: boolean }) => {
    setSyncing(true); setSyncResult(''); setSyncProgress(null);
    try {
      const { promise, abort } = vaultService.syncProgramsWithProgress(e => setSyncProgress(e), options);
      syncAbortRef.current = abort;
      const SYNC_TIMEOUT = 10 * 60 * 1000; // 10분 타임아웃
      const r = await Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => { abort(); reject(new Error('동기화 시간 초과 (10분)')); }, SYNC_TIMEOUT)
        ),
      ]);
      const parts = [`완료: ${r.totalFetched}건 수집, ${r.created}건 생성, ${r.updated}건 갱신`];
      if (r.preScreenPassed || r.preScreenRejected) parts.push(`사전심사 ${r.preScreenPassed||0}건 통과/${r.preScreenRejected||0}건 탈락`);
      if (r.phase2Crawled) parts.push(`${r.phase2Crawled}건 크롤`);
      if (r.phase3Enriched) parts.push(`${r.phase3Enriched}건 AI 강화`);
      if (r.phase4Analyzed) parts.push(`${r.phase4Analyzed}건 분석`);
      if (r.attachmentsDownloaded) parts.push(`첨부 ${r.attachmentsDownloaded}건`);
      setSyncResult(parts.join(', ')); loadVaultStats();
    } catch (e) { setSyncResult(`동기화 실패: ${String(e)}`); }
    finally { setSyncing(false); setSyncProgress(null); syncAbortRef.current = null; }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '경로가 복사되었습니다.', type: 'success' } }));
    }).catch(() => {});
  };

  const handleSaveCompany = async () => {
    _setStoreCompany(company); saveStoredCompany(company);
    const payload = { name: company.name, businessNumber: company.businessNumber, industry: company.industry,
      address: company.address, revenue: company.revenue, employees: company.employees,
      description: company.description, coreCompetencies: company.coreCompetencies,
      certifications: company.certifications, foundedYear: company.foundedYear,
      businessType: company.businessType, mainProducts: company.mainProducts,
      representative: company.representative, history: company.history };
    try {
      await vaultService.saveCompany(payload);
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '기업 정보가 서버에 저장되었습니다.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '서버 저장에 실패했습니다. 로컬에만 저장됩니다.', type: 'warning' } }));
    }
    setCompanySaved(true); setTimeout(() => setCompanySaved(false), 2000);
  };

  const handleSaveApi = async () => {
    saveStoredApiKey(apiKey); saveStoredDartApiKey(dartApiKey); saveStoredNpsApiKey(npsApiKey); saveStoredAiModel(aiModel);
    try {
      await vaultService.saveConfig({ geminiApiKey: apiKey || undefined, dartApiKey: dartApiKey || undefined, dataGoKrApiKey: npsApiKey || undefined, aiModel: aiModel || undefined });
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: 'API 설정이 저장되었습니다.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '서버에 API 키를 저장하지 못했습니다. 로컬에만 저장됩니다.', type: 'warning' } }));
    }
    setApiSaved(true); setTimeout(() => setApiSaved(false), 2000);
  };

  const handleSaveCrawling = () => {
    saveCrawlingConfig(crawlingConfig); setCrawlingSaved(true); setTimeout(() => setCrawlingSaved(false), 2000);
  };

  const handleResetData = (type: 'selective' | 'all') => {
    if (type === 'all') {
      if (!window.confirm('모든 로컬 데이터를 삭제합니다. 계속하시겠습니까?')) return;
      localStorage.clear(); window.location.reload();
    } else {
      if (!window.confirm('캐시 데이터만 삭제합니다. 계속하시겠습니까?')) return;
      ['zmis_program_cache', 'zmis_deep_research'].forEach(k => localStorage.removeItem(k));
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '캐시가 초기화되었습니다.', type: 'success' } }));
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'vault':
        return (
          <VaultTab
            vaultStats={vaultStats}
            syncing={syncing}
            syncResult={syncResult}
            syncProgress={syncProgress}
            onSync={() => handleSync()}
            onForceReanalyze={() => handleSync({ forceReanalyze: true })}
            onCopyPath={handleCopyPath}
            crawlingConfig={crawlingConfig}
            crawlingSaved={crawlingSaved}
            onCrawlingConfigChange={setCrawlingConfig}
            onSaveCrawling={handleSaveCrawling}
          />
        );
      case 'company':
        return (
          <CompanyTab
            company={company}
            companyLoading={companyLoading}
            companySaved={companySaved}
            deepResearchData={deepResearchData}
            expandedSections={expandedSections}
            documents={documents}
            docsLoading={docsLoading}
            onCompanyChange={updater => setCompany(updater)}
            onSaveCompany={handleSaveCompany}
            onResearch={handleResearchCompany}
            researching={researching}
            researchError={researchError}
            onToggleSection={(key) => setExpandedSections(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            })}
            onCloseDeepResearch={() => setDeepResearchData(null)}
            onDocumentDeleted={loadDocuments}
          />
        );
      case 'api':
        return (
          <ApiTab
            apiKey={apiKey}
            dartApiKey={dartApiKey}
            npsApiKey={npsApiKey}
            aiModel={aiModel}
            apiSaved={apiSaved}
            onApiKeyChange={setApiKey}
            onDartApiKeyChange={setDartApiKey}
            onNpsApiKeyChange={setNpsApiKey}
            onAiModelChange={setAiModel}
            onSave={handleSaveApi}
          />
        );
      case 'system':
        return <SystemTab onResetData={handleResetData} />;
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
                  <span className="material-icons-outlined text-lg" aria-hidden="true">{tab.icon}</span>
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
                <span className="material-icons-outlined text-xl" aria-hidden="true">{tab.icon}</span>
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

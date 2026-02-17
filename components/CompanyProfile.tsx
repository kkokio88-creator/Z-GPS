import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { getStoredDeepResearch, saveStoredDeepResearch } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { useQAStore } from '../services/stores/qaStore';
import { Company, CompanySearchResult, DeepResearchResult, ResearchProgress } from '../types';
import { companyResearchAgent } from '../services/geminiAgents';
import { vaultService } from '../services/vaultService';
import { useToast } from './Toast';
import { CompanySearchInput, CompanySearchResults } from './company/CompanySearch';
import CompanyResearchProgress from './company/CompanyResearchProgress';
import CompanyResearch from './company/CompanyResearch';

type SearchMode = 'INPUT' | 'RESULTS' | 'RESEARCHING' | 'COMPLETE';

/** 저장된 기업 정보를 DeepResearchResult 형식으로 변환 */
const convertCompanyToResearchData = (comp: Company): DeepResearchResult => ({
  basicInfo: {
    name: comp.name,
    representativeName: '',
    businessNumber: comp.businessNumber || '',
    establishedDate: '',
    address: comp.address || '',
    website: '',
    employeeCount: comp.employees || 0
  },
  financialInfo: {
    recentRevenue: comp.revenue || 0,
    revenueGrowth: '',
    financials: comp.financials || []
  },
  businessInfo: {
    industry: comp.industry || '',
    mainProducts: [],
    businessDescription: comp.description || ''
  },
  certifications: comp.certifications || [],
  ipList: comp.ipList || [],
  marketPosition: {
    competitors: [],
    marketShare: '',
    uniqueSellingPoints: []
  },
  history: comp.history || '',
  coreCompetencies: comp.coreCompetencies || [],
  strategicAnalysis: undefined,
  industryInsights: undefined,
  governmentFundingFit: undefined,
  executiveSummary: '',
  sources: [],
  researchedAt: new Date().toISOString()
});

const CompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [company, setCompany] = useState<Company | null>(null);
  const [isQaActive, setIsQaActive] = useState(false);

  const [searchMode, setSearchMode] = useState<SearchMode>('INPUT');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [researchProgress, setResearchProgress] = useState<ResearchProgress>({
    stage: 'IDLE',
    message: '',
    progress: 0
  });
  const [deepResearchData, setDeepResearchData] = useState<DeepResearchResult | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Guard flag: prevents the storage event listener from overriding data that was
  // just saved by the active research flow.
  const isResearchingRef = useRef(false);

  useEffect(() => {
    const storedCompany = useCompanyStore.getState().company;
    setCompany(storedCompany);
    setIsQaActive(useQAStore.getState().qaState.isActive);

    const storedResearch = getStoredDeepResearch();
    if (storedResearch) {
      setDeepResearchData(storedResearch);
      setSearchMode('COMPLETE');
    } else if (storedCompany && storedCompany.name && storedCompany.name !== '신규 기업') {
      setDeepResearchData(convertCompanyToResearchData(storedCompany));
      setSearchMode('COMPLETE');
    }

    const handleStorage = () => {
      // Bug 3 fix: skip storage sync while a research flow is actively writing data
      // to avoid overriding the freshly-fetched result.
      if (isResearchingRef.current) return;

      const updatedCompany = useCompanyStore.getState().company;
      setCompany(updatedCompany);
      const updatedResearch = getStoredDeepResearch();
      if (updatedResearch) {
        setDeepResearchData(updatedResearch);
        setSearchMode('COMPLETE');
      } else if (updatedCompany && updatedCompany.name && updatedCompany.name !== '신규 기업') {
        setDeepResearchData(convertCompanyToResearchData(updatedCompany));
        setSearchMode('COMPLETE');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setErrorMessage(null);
    setResearchProgress({ stage: 'SEARCHING', message: '기업 검색 중...', progress: 30 });
    try {
      const results = await companyResearchAgent.searchByName(searchQuery);
      setSearchResults(results);
      setSearchMode('RESULTS');
      setResearchProgress({ stage: 'SELECTING', message: '검색 완료', progress: 100 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.';
      setErrorMessage(msg);
      setResearchProgress({ stage: 'ERROR', message: msg, progress: 0 });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCompany = async (result: CompanySearchResult) => {
    setSelectedCompanyName(result.name);
    setSearchMode('RESEARCHING');
    setErrorMessage(null);
    setResearchProgress({ stage: 'RESEARCHING', message: '딥 리서치 시작...', progress: 0 });
    // Bug 3 fix: raise the guard so storage events do not interfere with the
    // data we are about to write.
    isResearchingRef.current = true;
    try {
      const data = await companyResearchAgent.deepResearch(
        result.name,
        (stage, progress) => {
          setResearchProgress({ stage: 'RESEARCHING', message: stage, progress });
        }
      );
      if (data) {
        setDeepResearchData(data);
        setSearchMode('COMPLETE');
        setResearchProgress({ stage: 'COMPLETE', message: '리서치 완료!', progress: 100 });
      } else {
        setResearchProgress({ stage: 'ERROR', message: '리서치 결과를 가져올 수 없습니다.', progress: 0 });
        setSearchMode('RESULTS');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '리서치 중 오류가 발생했습니다.';
      setErrorMessage(msg);
      setResearchProgress({ stage: 'ERROR', message: msg, progress: 0 });
      setSearchMode('RESULTS');
    } finally {
      isResearchingRef.current = false;
    }
  };

  const handleSaveResearchData = () => {
    if (!deepResearchData) return;
    const newCompany: Company = {
      id: `c_${Date.now()}`,
      name: deepResearchData.basicInfo.name,
      businessNumber: deepResearchData.basicInfo.businessNumber || '',
      industry: deepResearchData.businessInfo.industry,
      description: deepResearchData.businessInfo.businessDescription,
      revenue: deepResearchData.financialInfo.recentRevenue || 0,
      employees: deepResearchData.basicInfo.employeeCount || 0,
      address: deepResearchData.basicInfo.address || '',
      isVerified: false,
      certifications: deepResearchData.certifications,
      history: deepResearchData.history,
      coreCompetencies: deepResearchData.coreCompetencies,
      financials: deepResearchData.financialInfo.financials,
      ipList: deepResearchData.ipList
    };
    useCompanyStore.getState().setCompany(newCompany);
    saveStoredDeepResearch(deepResearchData);
    setCompany(newCompany);
    vaultService.saveCompany({
      name: newCompany.name,
      businessNumber: newCompany.businessNumber,
      industry: newCompany.industry,
      address: newCompany.address,
      revenue: newCompany.revenue,
      employees: newCompany.employees,
      description: newCompany.description,
      coreCompetencies: newCompany.coreCompetencies,
      certifications: newCompany.certifications,
    }).catch((err: unknown) => {
      // Bug 2 fix: vault is secondary storage — the save still succeeds, but we
      // surface the error so the user knows the cloud backup did not complete.
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      if (import.meta.env.DEV) console.error('[CompanyProfile] Vault save failed:', msg);
      showToast('Vault 저장에 실패했습니다. 로컬에는 정상 저장되었습니다.', 'warning');
    });
    alert('기업 정보가 저장되었습니다!');
  };

  const handleReset = () => {
    setSearchMode('INPUT');
    setSearchQuery('');
    setSearchResults([]);
    setDeepResearchData(null);
    setSelectedCompanyName('');
    setResearchProgress({ stage: 'IDLE', message: '', progress: 0 });
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="기업 자산 허브"
        actionLabel="대시보드"
        icon="dashboard"
        onAction={() => navigate('/')}
      />

      <main className="flex-1 overflow-y-auto p-8 z-10 relative">
        {isQaActive && (
          <div className="mb-4 bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded shadow-sm">
            <p className="font-bold text-indigo-700 flex items-center">
              <span className="material-icons-outlined animate-spin mr-2" aria-hidden="true">sync</span>
              QA Testing In Progress: Data Verification...
            </p>
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-6">
          {/* 에러 메시지 */}
          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-4 rounded-r mb-4">
              <div className="flex items-center">
                <span className="material-icons-outlined text-red-600 mr-2" aria-hidden="true">error</span>
                <p className="font-bold text-red-800 dark:text-red-200">오류 발생</p>
              </div>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{errorMessage}</p>
              <button
                onClick={() => setErrorMessage(null)}
                className="mt-2 text-sm text-red-800 dark:text-red-200 underline hover:no-underline"
              >
                닫기
              </button>
            </div>
          )}

          {/* 검색 섹션 */}
          <CompanySearchInput
            searchQuery={searchQuery}
            isSearching={isSearching}
            onQueryChange={setSearchQuery}
            onSearch={handleSearch}
          />

          {searchMode === 'RESULTS' && (
            <CompanySearchResults
              results={searchResults}
              onReset={handleReset}
              onSelect={handleSelectCompany}
            />
          )}

          {searchMode === 'RESEARCHING' && (
            <CompanyResearchProgress
              companyName={selectedCompanyName}
              progress={researchProgress}
            />
          )}

          {searchMode === 'COMPLETE' && deepResearchData && (
            <CompanyResearch
              data={deepResearchData}
              onReset={handleReset}
              onSave={handleSaveResearchData}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default CompanyProfile;

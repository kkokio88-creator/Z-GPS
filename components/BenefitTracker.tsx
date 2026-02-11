import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { vaultService } from '../services/vaultService';
import type { BenefitRecord, BenefitAnalysisResult, BenefitSummary, BenefitCategory, BenefitStatus, TaxScanResult, TaxRefundDifficulty, TaxRefundOpportunity, TaxCalculationLineItem } from '../types';
import Header from './Header';

const CATEGORIES: BenefitCategory[] = ['고용지원', 'R&D', '수출', '창업', '시설투자', '교육훈련', '기타'];

const STATUS_LABELS: Record<BenefitStatus, { label: string; color: string }> = {
  completed: { label: '완료', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  ongoing: { label: '진행중', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  refund_eligible: { label: '환급 가능', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  claimed: { label: '청구 완료', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
};

const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const DIFFICULTY_LABELS: Record<TaxRefundDifficulty, { label: string; color: string }> = {
  EASY: { label: '간편', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  MODERATE: { label: '보통', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  COMPLEX: { label: '복잡', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const OPP_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  identified: { label: '발견', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  in_progress: { label: '검토중', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  reviewing: { label: '검토중', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  filed: { label: '신고완료', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  received: { label: '환급완료', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  dismissed: { label: '해당없음', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

const SCAN_STEPS = [
  { label: '기업 정보 수집', icon: 'business' },
  { label: '국민연금 데이터 조회', icon: 'cloud_download' },
  { label: 'AI 세금 분석', icon: 'psychology' },
  { label: '결과 정리', icon: 'checklist' },
];

const DATA_SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  NPS_API: { label: '실제 데이터', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  COMPANY_PROFILE: { label: '프로필 기반', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  ESTIMATED: { label: '추정치', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 70) return 'text-green-600 dark:text-green-400';
  if (confidence >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
};

const getConfidenceBarColor = (confidence: number): string => {
  if (confidence >= 70) return 'bg-green-500';
  if (confidence >= 40) return 'bg-amber-500';
  return 'bg-red-500';
};

const TAX_BENEFIT_ICONS: Record<string, string> = {
  EMPLOYMENT_INCREASE: 'group_add',
  SME_SPECIAL: 'business',
  RND_CREDIT: 'science',
  INVESTMENT_CREDIT: 'real_estate_agent',
  SOCIAL_INSURANCE: 'shield',
  PERMANENT_CONVERSION: 'swap_horiz',
  CAREER_BREAK_WOMEN: 'woman',
  ENTERTAINMENT_SPECIAL: 'restaurant',
  STARTUP_EXEMPTION: 'rocket_launch',
  AMENDED_RETURN: 'history',
};

const LINE_ITEM_SOURCE_BADGE: Record<string, { icon: string; color: string; label: string }> = {
  NPS_API: { icon: '🔵', color: 'text-blue-600 dark:text-blue-400', label: 'NPS' },
  COMPANY_PROFILE: { icon: '🏢', color: 'text-gray-600 dark:text-gray-400', label: '프로필' },
  USER_INPUT: { icon: '✏️', color: 'text-amber-600 dark:text-amber-400', label: '입력' },
  CALCULATED: { icon: '🔄', color: 'text-indigo-600 dark:text-indigo-400', label: '계산' },
  TAX_LAW: { icon: '📕', color: 'text-red-600 dark:text-red-400', label: '법정' },
};

const formatKRW = (amount: number): string => {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억원`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(0)}만원`;
  return `${amount.toLocaleString()}원`;
};

const BenefitTracker: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'tax' | 'data' | 'analysis' | 'summary'>('tax');
  const [benefits, setBenefits] = useState<BenefitRecord[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, BenefitAnalysisResult>>({});
  const [summary, setSummary] = useState<BenefitSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [insight, setInsight] = useState<{ insight: string; recommendations: string[] } | null>(null);
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [taxScan, setTaxScan] = useState<TaxScanResult | null>(null);
  const [taxScanning, setTaxScanning] = useState(false);
  const [expandedOpportunity, setExpandedOpportunity] = useState<string | null>(null);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [taxErrorCode, setTaxErrorCode] = useState<number | null>(null);
  const [scanStep, setScanStep] = useState<0 | 1 | 2 | 3>(0);
  const [generatingWorksheet, setGeneratingWorksheet] = useState<string | null>(null);
  const autoScanTriggered = useRef(false);

  // Form state
  const [form, setForm] = useState({
    programName: '',
    category: '기타' as BenefitCategory,
    receivedAmount: '',
    receivedDate: '',
    organizer: '',
    conditions: '',
    expiryDate: '',
    tags: '',
    conditionsMet: null as boolean | null,
    status: 'completed' as BenefitStatus,
  });

  const resetForm = () => {
    setForm({
      programName: '',
      category: '기타',
      receivedAmount: '',
      receivedDate: '',
      organizer: '',
      conditions: '',
      expiryDate: '',
      tags: '',
      conditionsMet: null,
      status: 'completed',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [benefitList, summaryData, taxScanData] = await Promise.allSettled([
        vaultService.getBenefits(),
        vaultService.getBenefitSummary(),
        vaultService.getLatestTaxScan(),
      ]);
      if (benefitList.status === 'fulfilled') setBenefits(benefitList.value);
      if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
      if (taxScanData.status === 'fulfilled' && taxScanData.value) setTaxScan(taxScanData.value);
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[BenefitTracker] Load error:', e);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData().then(() => {
      // 첫 방문 자동 스캔: 기존 스캔 결과 없을 때
      if (!autoScanTriggered.current) {
        autoScanTriggered.current = true;
        // taxScan state는 아직 반영 안 됐을 수 있으므로 setTimeout으로 대기
        setTimeout(() => {
          // 직접 DOM 외부에서 체크하지 않고, 콜백 안에서 최신 state 접근
          setTaxScan(prev => {
            if (prev === null) {
              handleRunTaxScan();
            }
            return prev;
          });
        }, 100);
      }
    });
  }, [loadData]);

  const filteredBenefits = useMemo(() => {
    if (filterCategory === 'all') return benefits;
    return benefits.filter(b => b.category === filterCategory);
  }, [benefits, filterCategory]);

  const handleSubmit = async () => {
    if (!form.programName || !form.receivedAmount || !form.receivedDate || !form.organizer) return;

    try {
      if (editingId) {
        await vaultService.updateBenefit(editingId, {
          programName: form.programName,
          category: form.category,
          receivedAmount: Number(form.receivedAmount),
          receivedDate: form.receivedDate,
          organizer: form.organizer,
          conditions: form.conditions || undefined,
          expiryDate: form.expiryDate || undefined,
          conditionsMet: form.conditionsMet,
          status: form.status,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        });
      } else {
        await vaultService.createBenefit({
          programName: form.programName,
          programSlug: '',
          category: form.category,
          receivedAmount: Number(form.receivedAmount),
          receivedDate: form.receivedDate,
          organizer: form.organizer,
          conditions: form.conditions || undefined,
          expiryDate: form.expiryDate || undefined,
          conditionsMet: form.conditionsMet,
          status: form.status,
          attachments: [],
          tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        });
      }
      resetForm();
      loadData();
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Submit error:', e);
    }
  };

  const handleEdit = (b: BenefitRecord) => {
    setForm({
      programName: b.programName,
      category: b.category,
      receivedAmount: String(b.receivedAmount),
      receivedDate: b.receivedDate,
      organizer: b.organizer,
      conditions: b.conditions || '',
      expiryDate: b.expiryDate || '',
      tags: b.tags.join(', '),
      conditionsMet: b.conditionsMet ?? null,
      status: b.status,
    });
    setEditingId(b.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 수령 이력을 삭제하시겠습니까?')) return;
    try {
      await vaultService.deleteBenefit(id);
      loadData();
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Delete error:', e);
    }
  };

  const handleAnalyze = async (id: string) => {
    setAnalyzing(id);
    try {
      const result = await vaultService.analyzeBenefit(id);
      setAnalyses(prev => ({ ...prev, [id]: result }));
      loadData();
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Analyze error:', e);
    }
    setAnalyzing(null);
  };

  const handleAnalyzeAll = async () => {
    setAnalyzingAll(true);
    try {
      const { results } = await vaultService.analyzeAllBenefits();
      const map: Record<string, BenefitAnalysisResult> = {};
      for (const r of results) {
        map[r.benefitId] = r;
      }
      setAnalyses(prev => ({ ...prev, ...map }));
      loadData();
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] AnalyzeAll error:', e);
    }
    setAnalyzingAll(false);
  };

  const loadAnalysis = async (id: string) => {
    if (analyses[id]) {
      setExpandedAnalysis(expandedAnalysis === id ? null : id);
      return;
    }
    try {
      const result = await vaultService.getBenefitAnalysis(id);
      if (result) {
        setAnalyses(prev => ({ ...prev, [id]: result }));
        setExpandedAnalysis(id);
      }
    } catch { /* no analysis */ }
  };

  const handleRunTaxScan = async () => {
    setTaxScanning(true);
    setTaxError(null);
    setTaxErrorCode(null);
    setScanStep(1);
    try {
      const stepTimer1 = setTimeout(() => setScanStep(2), 500);
      const stepTimer2 = setTimeout(() => setScanStep(3), 2000);
      const result = await vaultService.runTaxScan();
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setScanStep(4);
      await new Promise(r => setTimeout(r, 300));
      setTaxScan(result);
    } catch (e: unknown) {
      const resp = (e && typeof e === 'object' && 'response' in e)
        ? (e as { response?: { status?: number; data?: { error?: string } } }).response
        : null;
      const status = resp?.status || 0;
      const serverMsg = resp?.data?.error;
      setTaxErrorCode(status);

      if (status === 503) {
        setTaxError(serverMsg || 'Gemini API 키가 설정되지 않았습니다.');
      } else if (status === 400) {
        setTaxError(serverMsg || '기업 정보가 등록되지 않았습니다.');
      } else if (status >= 500) {
        setTaxError(serverMsg || '세금 환급 스캔에 실패했습니다.');
      } else {
        setTaxError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
      }
      if (import.meta.env.DEV) console.error('[BenefitTracker] Tax scan error:', e);
    }
    setScanStep(0);
    setTaxScanning(false);
  };

  const handleGenerateWorksheet = async (oppId: string) => {
    if (!taxScan) return;
    setGeneratingWorksheet(oppId);
    try {
      const worksheet = await vaultService.generateWorksheet(taxScan.id, oppId);
      setTaxScan(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          opportunities: prev.opportunities.map(o =>
            o.id === oppId ? { ...o, status: 'reviewing' as const, worksheet } : o
          ),
        };
      });
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Generate worksheet error:', e);
    }
    setGeneratingWorksheet(null);
  };

  const handleUpdateWorksheetInput = async (oppId: string, key: string, value: number | string) => {
    if (!taxScan) return;
    try {
      const { worksheet } = await vaultService.updateWorksheetOverrides(taxScan.id, oppId, { [key]: value });
      setTaxScan(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          opportunities: prev.opportunities.map(o =>
            o.id === oppId ? { ...o, worksheet, estimatedRefund: worksheet.totalRefund } : o
          ),
        };
      });
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Update worksheet input error:', e);
    }
  };

  const handleUpdateOppStatus = async (oppId: string, newStatus: TaxRefundOpportunity['status']) => {
    if (!taxScan) return;
    try {
      await vaultService.updateOpportunityStatus(taxScan.id, oppId, newStatus);
      setTaxScan(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          opportunities: prev.opportunities.map(o =>
            o.id === oppId ? { ...o, status: newStatus } : o
          ),
        };
      });
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Update opp status error:', e);
    }
  };

  const tabs = [
    { id: 'tax' as const, label: '놓친 세금 환급', icon: 'account_balance' },
    { id: 'data' as const, label: '수령 이력', icon: 'receipt_long' },
    { id: 'analysis' as const, label: '환급 분석', icon: 'analytics' },
    { id: 'summary' as const, label: '요약', icon: 'summarize' },
  ];

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <Header title="놓친 세금 환급" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-8">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-primary dark:text-green-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="material-icons-outlined text-base">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: 수령 이력 */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilterCategory('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      filterCategory === 'all'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    전체
                  </button>
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filterCategory === cat
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { resetForm(); setShowForm(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <span className="material-icons-outlined text-base">add</span>
                  등록
                </button>
              </div>

              {/* Form Modal */}
              {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                  <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                    <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {editingId ? '수령 이력 수정' : '새 수령 이력 등록'}
                      </h3>
                      <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <span className="material-icons-outlined">close</span>
                      </button>
                    </div>
                    <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">사업명 *</label>
                        <input
                          type="text"
                          value={form.programName}
                          onChange={e => setForm(f => ({ ...f, programName: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="예: 2024 중소기업 고용장려금"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">카테고리</label>
                          <select
                            value={form.category}
                            onChange={e => setForm(f => ({ ...f, category: e.target.value as BenefitCategory }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          >
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">상태</label>
                          <select
                            value={form.status}
                            onChange={e => setForm(f => ({ ...f, status: e.target.value as BenefitStatus }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          >
                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수령 금액 (원) *</label>
                          <input
                            type="number"
                            value={form.receivedAmount}
                            onChange={e => setForm(f => ({ ...f, receivedAmount: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            placeholder="50000000"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수령일 *</label>
                          <input
                            type="date"
                            value={form.receivedDate}
                            onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">주관기관 *</label>
                        <input
                          type="text"
                          value={form.organizer}
                          onChange={e => setForm(f => ({ ...f, organizer: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          placeholder="예: 중소벤처기업부"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">의무 조건</label>
                        <input
                          type="text"
                          value={form.conditions}
                          onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          placeholder="예: 채용 인원 6개월 유지"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">의무이행 기한</label>
                          <input
                            type="date"
                            value={form.expiryDate}
                            onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">의무이행 여부</label>
                          <select
                            value={form.conditionsMet === null ? 'null' : String(form.conditionsMet)}
                            onChange={e => {
                              const v = e.target.value;
                              setForm(f => ({ ...f, conditionsMet: v === 'null' ? null : v === 'true' }));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          >
                            <option value="null">확인 안 됨</option>
                            <option value="true">이행 완료</option>
                            <option value="false">미이행</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">태그 (쉼표 구분)</label>
                        <input
                          type="text"
                          value={form.tags}
                          onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          placeholder="예: 고용, 청년"
                        />
                      </div>
                    </div>
                    <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                      <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                        취소
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={!form.programName || !form.receivedAmount || !form.receivedDate || !form.organizer}
                        className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {editingId ? '수정' : '등록'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Benefits List */}
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-24" />
                  ))}
                </div>
              ) : filteredBenefits.length === 0 ? (
                <div className="text-center py-16">
                  <span className="material-icons-outlined text-5xl text-gray-300 dark:text-gray-600 mb-3 block">receipt_long</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">등록된 수령 이력이 없습니다</p>
                  <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
                  >
                    첫 이력 등록하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredBenefits.map(b => (
                    <div key={b.id} className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">{b.programName}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_LABELS[b.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABELS[b.status]?.label || b.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>{b.organizer}</span>
                            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">{b.category}</span>
                            <span>{b.receivedDate}</span>
                          </div>
                          {b.conditions && (
                            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                              <span className="font-medium">조건:</span> {b.conditions}
                              {b.conditionsMet === true && <span className="ml-1 text-green-600">(이행)</span>}
                              {b.conditionsMet === false && <span className="ml-1 text-red-600">(미이행)</span>}
                            </p>
                          )}
                          {b.tags.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {b.tags.map(t => (
                                <span key={t} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded text-[10px]">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-primary dark:text-green-400">{formatKRW(b.receivedAmount)}</p>
                          <div className="flex gap-1 mt-2">
                            <button onClick={() => handleEdit(b)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="수정">
                              <span className="material-icons-outlined text-sm">edit</span>
                            </button>
                            <button onClick={() => handleAnalyze(b.id)} disabled={analyzing === b.id} className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-50" title="환급 분석">
                              <span className={`material-icons-outlined text-sm ${analyzing === b.id ? 'animate-spin' : ''}`}>
                                {analyzing === b.id ? 'autorenew' : 'psychology'}
                              </span>
                            </button>
                            <button onClick={() => handleDelete(b.id)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="삭제">
                              <span className="material-icons-outlined text-sm">delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: 환급 분석 */}
          {activeTab === 'analysis' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  AI가 과거 수령 지원금의 환급/추가 청구 가능 여부를 분석합니다.
                </p>
                <button
                  onClick={handleAnalyzeAll}
                  disabled={analyzingAll || benefits.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  <span className={`material-icons-outlined text-base ${analyzingAll ? 'animate-spin' : ''}`}>
                    {analyzingAll ? 'autorenew' : 'auto_awesome'}
                  </span>
                  {analyzingAll ? '분석 중...' : '전체 분석'}
                </button>
              </div>

              {benefits.length === 0 ? (
                <div className="text-center py-16">
                  <span className="material-icons-outlined text-5xl text-gray-300 dark:text-gray-600 mb-3 block">analytics</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">수령 이력을 먼저 등록해주세요</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {benefits.map(b => {
                    const analysis = analyses[b.id];
                    const isExpanded = expandedAnalysis === b.id;

                    return (
                      <div key={b.id} className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
                        <div
                          className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                          onClick={() => loadAnalysis(b.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">{b.programName}</h4>
                                <span className="text-xs text-gray-400">{formatKRW(b.receivedAmount)}</span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{b.organizer} · {b.receivedDate}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {analysis ? (
                                <>
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${analysis.isEligible ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                                    {analysis.isEligible ? '환급 가능' : '해당 없음'}
                                  </span>
                                  {analysis.isEligible && (
                                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                      {formatKRW(analysis.estimatedRefund)}
                                    </span>
                                  )}
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${RISK_COLORS[analysis.riskLevel] || ''}`}>
                                    {analysis.riskLevel}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400">미분석</span>
                              )}
                              <span className={`material-icons-outlined text-gray-400 text-base transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                expand_more
                              </span>
                            </div>
                          </div>
                        </div>

                        {isExpanded && analysis && (
                          <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                            {analysis.legalBasis.length > 0 && (
                              <div>
                                <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">법적 근거</h5>
                                <ul className="space-y-1">
                                  {analysis.legalBasis.map((l, i) => (
                                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                                      <span className="text-primary mt-0.5">-</span> {l}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {analysis.requiredDocuments.length > 0 && (
                              <div>
                                <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">필요 서류</h5>
                                <ul className="space-y-1">
                                  {analysis.requiredDocuments.map((d, i) => (
                                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                                      <span className="material-icons-outlined text-[10px] text-amber-500 mt-0.5">description</span> {d}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {analysis.timeline && (
                              <div>
                                <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">예상 기간</h5>
                                <p className="text-xs text-gray-600 dark:text-gray-400">{analysis.timeline}</p>
                              </div>
                            )}
                            {analysis.risks.length > 0 && (
                              <div>
                                <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">리스크</h5>
                                <ul className="space-y-1">
                                  {analysis.risks.map((r, i) => (
                                    <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                                      <span className="material-icons-outlined text-[10px] mt-0.5">warning</span> {r}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {analysis.advice && (
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <h5 className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">실무 조언</h5>
                                <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">{analysis.advice}</p>
                              </div>
                            )}
                            <p className="text-[10px] text-gray-400 text-right">
                              분석 시점: {analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleDateString('ko-KR') : '-'}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: 요약 */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {/* KPI Cards */}
              {isLoading || !summary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-24" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">총 수령액</p>
                      <p className="text-2xl font-bold text-primary dark:text-green-400">{formatKRW(summary.totalReceived)}</p>
                    </div>
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">총 건수</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalCount}<span className="text-sm text-gray-400 ml-1">건</span></p>
                    </div>
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">환급 가능</p>
                      <p className="text-2xl font-bold text-amber-500">{summary.refundEligible}<span className="text-sm text-gray-400 ml-1">건</span></p>
                    </div>
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">추정 환급액</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatKRW(summary.estimatedTotalRefund)}</p>
                    </div>
                  </div>

                  {/* Category Distribution */}
                  {summary.byCategory.length > 0 && (
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                        <span className="material-icons-outlined text-indigo-500 mr-2 text-base">donut_large</span>
                        카테고리별 분포
                      </h3>
                      <div className="space-y-3">
                        {summary.byCategory
                          .sort((a, b) => b.amount - a.amount)
                          .map(c => {
                            const pct = summary.totalReceived > 0 ? Math.round((c.amount / summary.totalReceived) * 100) : 0;
                            return (
                              <div key={c.category}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.category}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{c.count}건 · {formatKRW(c.amount)} ({pct}%)</span>
                                </div>
                                <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Year Distribution */}
                  {summary.byYear.length > 0 && (
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                        <span className="material-icons-outlined text-emerald-500 mr-2 text-base">bar_chart</span>
                        연도별 추이
                      </h3>
                      <div className="flex items-end gap-3 h-40">
                        {(() => {
                          const maxAmt = Math.max(...summary.byYear.map(y => y.amount), 1);
                          return summary.byYear.map(y => {
                            const h = Math.max((y.amount / maxAmt) * 100, 5);
                            return (
                              <div key={y.year} className="flex-1 flex flex-col items-center">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">{formatKRW(y.amount)}</span>
                                <div className="w-full flex justify-center">
                                  <div
                                    className="w-8 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-t-lg transition-all duration-500"
                                    style={{ height: `${h}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-2">{y.year}</span>
                                <span className="text-[10px] text-gray-400">{y.count}건</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* AI Insight */}
                  <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center">
                        <span className="material-icons-outlined text-amber-500 mr-2 text-base">auto_awesome</span>
                        AI 포트폴리오 인사이트
                      </h3>
                      {!insight && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/vault/benefits/summary-insight', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                              });
                              const data = await res.json();
                              setInsight(data);
                            } catch { /* skip */ }
                          }}
                          disabled={benefits.length === 0}
                          className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-50"
                        >
                          인사이트 생성
                        </button>
                      )}
                    </div>
                    {insight ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{insight.insight}</p>
                        {insight.recommendations.length > 0 && (
                          <div>
                            <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">추천 전략</h5>
                            <ul className="space-y-1.5">
                              {insight.recommendations.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                                    {i + 1}
                                  </span>
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-6">
                        수령 이력을 등록한 후 AI 인사이트를 생성해보세요
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {/* Tab 4: 세금 환급 */}
          {activeTab === 'tax' && (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    AI가 기업 프로필과 수령 이력을 분석하여 놓치고 있는 세금 혜택을 스캔합니다.
                  </p>
                  {taxScan && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      마지막 스캔: {new Date(taxScan.scannedAt).toLocaleString('ko-KR')}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleRunTaxScan}
                  disabled={taxScanning}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <span className={`material-icons-outlined text-base ${taxScanning ? 'animate-spin' : ''}`}>
                    {taxScanning ? 'autorenew' : 'search'}
                  </span>
                  {taxScanning ? '스캔 중...' : '스캔 시작'}
                </button>
              </div>

              {/* Scanning Stepper */}
              {taxScanning && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-6">
                  <div className="flex items-center justify-center gap-2 mb-5">
                    {SCAN_STEPS.map((step, i) => {
                      const stepNum = i + 1;
                      const isActive = scanStep === stepNum;
                      const isDone = scanStep > stepNum;
                      return (
                        <React.Fragment key={i}>
                          {i > 0 && (
                            <div className={`w-8 h-0.5 rounded ${isDone ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          )}
                          <div className="flex flex-col items-center gap-1.5">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                              isDone ? 'bg-indigo-500 text-white' : isActive ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                            }`}>
                              <span className={`material-icons-outlined text-base ${isActive ? 'animate-spin' : ''}`}>
                                {isDone ? 'check' : isActive ? 'autorenew' : step.icon}
                              </span>
                            </div>
                            <span className={`text-[10px] font-medium whitespace-nowrap ${
                              isDone ? 'text-indigo-600 dark:text-indigo-400' : isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-400'
                            }`}>{step.label}</span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 text-center">기업 정보와 수령 이력을 기반으로 적용 가능한 혜택을 탐색합니다</p>
                </div>
              )}

              {/* Error */}
              {!taxScanning && taxError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-5 text-center">
                  <span className="material-icons-outlined text-3xl text-red-400 block mb-2">error_outline</span>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">{taxError}</p>
                  {taxErrorCode === 503 && (
                    <p className="text-xs text-red-500 dark:text-red-400/70 mt-1">Gemini API 키를 설정해야 AI 스캔을 이용할 수 있습니다.</p>
                  )}
                  {taxErrorCode === 400 && (
                    <p className="text-xs text-red-500 dark:text-red-400/70 mt-1">기업 프로필을 먼저 등록해주세요.</p>
                  )}
                  {(taxErrorCode === 503 || taxErrorCode === 400) && (
                    <button
                      onClick={() => navigate('/settings')}
                      className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    >
                      <span className="material-icons-outlined text-sm align-middle mr-1">settings</span>
                      설정으로 이동
                    </button>
                  )}
                  {(!taxErrorCode || taxErrorCode >= 500) && taxErrorCode !== 503 && (
                    <button
                      onClick={handleRunTaxScan}
                      className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    >
                      <span className="material-icons-outlined text-sm align-middle mr-1">refresh</span>
                      다시 시도
                    </button>
                  )}
                </div>
              )}

              {/* Results */}
              {!taxScanning && taxScan && (
                <>
                  {/* Data Source Badge */}
                  {taxScan.npsData?.found ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-lg">
                      <span className="material-icons-outlined text-blue-500 text-base">verified</span>
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                        국민연금 데이터 확인 ({taxScan.npsData.workplace?.nrOfJnng}명 가입)
                        {taxScan.npsData.matchedByBusinessNumber && ' · 사업자번호 매칭'}
                      </span>
                      {typeof taxScan.dataCompleteness === 'number' && (
                        <span className="ml-auto text-[10px] text-blue-500 dark:text-blue-400">완성도 {taxScan.dataCompleteness}%</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg">
                      <span className="material-icons-outlined text-amber-500 text-base">warning</span>
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">추정치 기반 분석 — 국민연금 데이터 미조회</span>
                    </div>
                  )}

                  {/* KPI Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">추정 총 환급액</p>
                      <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatKRW(taxScan.totalEstimatedRefund)}</p>
                    </div>
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">발견 기회</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{taxScan.opportunityCount}<span className="text-sm text-gray-400 ml-1">건</span></p>
                    </div>
                    <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">경정청구 대상</p>
                      <p className="text-2xl font-bold text-amber-500">
                        {taxScan.opportunities.filter(o => o.isAmendedReturn).length}
                        <span className="text-sm text-gray-400 ml-1">건</span>
                      </p>
                    </div>
                  </div>

                  {/* AI Summary */}
                  {taxScan.summary && (
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800/30">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons-outlined text-indigo-500 text-base">auto_awesome</span>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">AI 분석 요약</h3>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{taxScan.summary}</p>
                    </div>
                  )}

                  {/* Opportunity Cards */}
                  {taxScan.opportunities.length > 0 ? (
                    <div className="space-y-3">
                      {[...taxScan.opportunities]
                        .sort((a, b) => (b.estimatedRefund * b.confidence / 100) - (a.estimatedRefund * a.confidence / 100))
                        .map(opp => {
                          const isExpanded = expandedOpportunity === opp.id;
                          const icon = TAX_BENEFIT_ICONS[opp.taxBenefitCode] || 'payments';
                          const diff = DIFFICULTY_LABELS[opp.difficulty] || DIFFICULTY_LABELS.MODERATE;

                          return (
                            <div key={opp.id} className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden">
                              {/* Collapsed Header */}
                              <div
                                className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                onClick={() => setExpandedOpportunity(isExpanded ? null : opp.id)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                    <span className="material-icons-outlined text-indigo-600 dark:text-indigo-400 text-lg">{icon}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">{opp.taxBenefitName}</h4>
                                      {opp.status && OPP_STATUS_LABELS[opp.status] && (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${OPP_STATUS_LABELS[opp.status].color}`}>
                                          {OPP_STATUS_LABELS[opp.status].label}
                                        </span>
                                      )}
                                      {opp.isAmendedReturn && (
                                        <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[10px] font-bold">경정청구</span>
                                      )}
                                      {opp.dataSource && DATA_SOURCE_BADGES[opp.dataSource] && (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${DATA_SOURCE_BADGES[opp.dataSource].color}`}>
                                          {DATA_SOURCE_BADGES[opp.dataSource].label}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {opp.applicableYears.map(y => (
                                        <span key={y} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] text-gray-600 dark:text-gray-400">{y}</span>
                                      ))}
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${diff.color}`}>{diff.label}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{formatKRW(opp.estimatedRefund)}</p>
                                      <div className="flex items-center gap-1 mt-1">
                                        <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${getConfidenceBarColor(opp.confidence)}`}
                                            style={{ width: `${Math.min(opp.confidence, 100)}%` }}
                                          />
                                        </div>
                                        <span className={`text-[10px] font-medium ${getConfidenceColor(opp.confidence)}`}>{opp.confidence}%</span>
                                      </div>
                                    </div>
                                    <span className={`material-icons-outlined text-gray-400 text-base transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                      expand_more
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Detail */}
                              {isExpanded && (
                                <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                                  <p className="text-sm text-gray-700 dark:text-gray-300">{opp.description}</p>

                                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                                    <h5 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">적용 사유</h5>
                                    <p className="text-xs text-indigo-600 dark:text-indigo-300">{opp.eligibilityReason}</p>
                                  </div>

                                  {opp.legalBasis.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">법적 근거</h5>
                                      <ul className="space-y-1">
                                        {opp.legalBasis.map((l, i) => (
                                          <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                                            <span className="text-indigo-500 mt-0.5">-</span> {l}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {opp.requiredActions.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">실행 단계</h5>
                                      <ol className="space-y-1">
                                        {opp.requiredActions.map((a, i) => (
                                          <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                                            {a}
                                          </li>
                                        ))}
                                      </ol>
                                    </div>
                                  )}

                                  {opp.requiredDocuments.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">필요 서류</h5>
                                      <ul className="space-y-1">
                                        {opp.requiredDocuments.map((d, i) => (
                                          <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                                            <span className="material-icons-outlined text-[10px] text-amber-500 mt-0.5">description</span> {d}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  <div className="grid grid-cols-2 gap-3">
                                    {opp.filingDeadline && (
                                      <div>
                                        <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">신고 기한</h5>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">{opp.filingDeadline}</p>
                                      </div>
                                    )}
                                    <div>
                                      <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">예상 처리 기간</h5>
                                      <p className="text-xs text-gray-600 dark:text-gray-400">{opp.estimatedProcessingTime}</p>
                                    </div>
                                  </div>

                                  {opp.risks.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">리스크</h5>
                                      <ul className="space-y-1">
                                        {opp.risks.map((r, i) => (
                                          <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                                            <span className="material-icons-outlined text-[10px] mt-0.5">warning</span> {r}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Worksheet Inline Display */}
                                  {opp.worksheet && (opp.status === 'reviewing' || opp.status === 'in_progress') && (
                                    <div className="border border-purple-200 dark:border-purple-800/40 rounded-lg overflow-hidden">
                                      <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 flex items-center gap-2">
                                        <span className="material-icons-outlined text-purple-600 dark:text-purple-400 text-base">calculate</span>
                                        <h5 className="text-xs font-bold text-purple-700 dark:text-purple-400">{opp.worksheet.title}</h5>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                                              <th className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">항목</th>
                                              <th className="text-right px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">값</th>
                                              <th className="text-center px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400 w-16">출처</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {opp.worksheet.lineItems.map((item: TaxCalculationLineItem) => {
                                              const srcBadge = LINE_ITEM_SOURCE_BADGE[item.source] || LINE_ITEM_SOURCE_BADGE.CALCULATED;
                                              return (
                                                <tr key={item.key} className="border-t border-gray-100 dark:border-gray-700/50">
                                                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{item.label}</td>
                                                  <td className="px-3 py-1.5 text-right">
                                                    {item.editable ? (
                                                      <input
                                                        type="number"
                                                        defaultValue={typeof item.value === 'number' ? item.value : parseFloat(String(item.value)) || 0}
                                                        onBlur={(e) => {
                                                          e.stopPropagation();
                                                          const v = parseFloat(e.target.value);
                                                          if (!isNaN(v)) handleUpdateWorksheetInput(opp.id, item.key, v);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-20 px-1.5 py-0.5 text-right border border-amber-300 dark:border-amber-600 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs font-medium focus:ring-1 focus:ring-amber-400"
                                                      />
                                                    ) : (
                                                      <span className="font-medium text-gray-900 dark:text-white">
                                                        {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                                                      </span>
                                                    )}
                                                    <span className="text-gray-400 ml-1">{item.unit}</span>
                                                  </td>
                                                  <td className="px-3 py-1.5 text-center">
                                                    <span className={`text-[10px] ${srcBadge.color}`} title={srcBadge.label}>
                                                      {srcBadge.icon}
                                                    </span>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                          {opp.worksheet.subtotals.length > 0 && (
                                            <tfoot>
                                              {opp.worksheet.subtotals.map((sub, i) => (
                                                <tr key={i} className="border-t-2 border-purple-200 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10">
                                                  <td className="px-3 py-1.5 font-bold text-purple-700 dark:text-purple-400">{sub.label}</td>
                                                  <td className="px-3 py-1.5 text-right font-bold text-purple-700 dark:text-purple-400" colSpan={2}>
                                                    {formatKRW(sub.amount)}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tfoot>
                                          )}
                                        </table>
                                      </div>
                                      <div className="px-3 py-2 bg-purple-50/50 dark:bg-purple-900/10 border-t border-purple-200 dark:border-purple-800/40">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">예상 공제/환급액</span>
                                          <span className="text-sm font-bold text-purple-700 dark:text-purple-400">{formatKRW(opp.worksheet.totalRefund)}</span>
                                        </div>
                                      </div>
                                      {opp.worksheet.assumptions.length > 0 && (
                                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/50">
                                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1 font-medium">가정:</p>
                                          <ul className="space-y-0.5">
                                            {opp.worksheet.assumptions.map((a, i) => (
                                              <li key={i} className="text-[10px] text-gray-400 dark:text-gray-500">• {a}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-800/30">
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                          <span className="material-icons-outlined text-[10px] align-middle mr-0.5">warning</span>
                                          본인 책임하에 검토 및 신고하시기 바랍니다. 복잡한 사안은 세무 전문가 자문을 권장합니다.
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* CTA Buttons */}
                                  {opp.status !== 'received' && opp.status !== 'dismissed' && (
                                    <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                      {opp.status === 'identified' && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleGenerateWorksheet(opp.id); }}
                                          disabled={generatingWorksheet === opp.id}
                                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
                                        >
                                          <span className={`material-icons-outlined text-sm ${generatingWorksheet === opp.id ? 'animate-spin' : ''}`}>
                                            {generatingWorksheet === opp.id ? 'autorenew' : 'calculate'}
                                          </span>
                                          {generatingWorksheet === opp.id ? '생성 중...' : '계산서 생성'}
                                        </button>
                                      )}
                                      {(opp.status === 'reviewing' || opp.status === 'in_progress') && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleUpdateOppStatus(opp.id, 'filed'); }}
                                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                                        >
                                          <span className="material-icons-outlined text-sm">send</span>
                                          신고
                                        </button>
                                      )}
                                      {opp.status === 'filed' && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleUpdateOppStatus(opp.id, 'received'); }}
                                          className="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                                        >
                                          <span className="material-icons-outlined text-sm">check_circle</span>
                                          환급 확인
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleUpdateOppStatus(opp.id, 'dismissed'); }}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                      >
                                        <span className="material-icons-outlined text-sm">block</span>
                                        해당 없음
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <span className="material-icons-outlined text-4xl text-gray-300 dark:text-gray-600 block mb-2">check_circle</span>
                      <p className="text-sm text-gray-500 dark:text-gray-400">분석 결과 추가 적용 가능한 세금 혜택이 발견되지 않았습니다.</p>
                    </div>
                  )}

                  {/* Disclaimer */}
                  {taxScan.disclaimer && (
                    <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        <span className="material-icons-outlined text-[10px] align-middle mr-1">info</span>
                        {taxScan.disclaimer}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Empty state: 스캔 전 */}
              {!taxScanning && !taxScan && !taxError && (
                <div className="text-center py-16">
                  <span className="material-icons-outlined text-5xl text-gray-300 dark:text-gray-600 mb-3 block">account_balance</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">자동으로 스캔을 시작합니다...</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">기업 프로필을 기반으로 놓치고 있는 세금 혜택을 찾아보세요</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default BenefitTracker;

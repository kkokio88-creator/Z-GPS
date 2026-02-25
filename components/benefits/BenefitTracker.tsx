import Icon from '../ui/Icon';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { vaultService } from '../../services/vaultService';
import type {
  BenefitRecord,
  BenefitAnalysisResult,
  BenefitSummary,
} from '../../types';
import Header from '../Header';
import BenefitList from './BenefitList';
import BenefitForm, { type BenefitFormState } from './BenefitForm';
import BenefitAnalysis from './BenefitAnalysis';
import BenefitSummaryPanel from './BenefitSummary';
import TaxRefund from './TaxRefund';
import { useTaxHandlers } from './useTaxHandlers';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

const DEFAULT_FORM: BenefitFormState = {
  programName: '', category: '기타', receivedAmount: '', receivedDate: '',
  organizer: '', conditions: '', expiryDate: '', tags: '',
  conditionsMet: null, status: 'completed',
};

const BenefitTracker: React.FC = () => {
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
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [form, setForm] = useState<BenefitFormState>(DEFAULT_FORM);
  const autoScanTriggered = useRef(false);

  const {
    taxScan, setTaxScan, taxScanning, taxError, taxErrorCode, scanStep,
    expandedOpportunity, setExpandedOpportunity, generatingWorksheet,
    showNpsTrend, setShowNpsTrend, taxSortBy, setTaxSortBy,
    taxFilterStatus, setTaxFilterStatus, taxFilterSource, setTaxFilterSource,
    showDartSummary, setShowDartSummary, sortedOpportunities,
    handleRunTaxScan, handleGenerateWorksheet, handleUpdateWorksheetInput, handleUpdateOppStatus,
  } = useTaxHandlers();

  const resetForm = () => { setForm(DEFAULT_FORM); setEditingId(null); setShowForm(false); };

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
  }, [setTaxScan]);

  useEffect(() => {
    loadData().then(() => {
      if (!autoScanTriggered.current) {
        autoScanTriggered.current = true;
        setTimeout(() => { setTaxScan(prev => { if (prev === null) handleRunTaxScan(); return prev; }); }, 100);
      }
    });
  }, [loadData]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!form.programName || !form.receivedAmount || !form.receivedDate || !form.organizer) return;
    try {
      if (editingId) {
        await vaultService.updateBenefit(editingId, {
          programName: form.programName, category: form.category,
          receivedAmount: Number(form.receivedAmount), receivedDate: form.receivedDate,
          organizer: form.organizer, conditions: form.conditions || undefined,
          expiryDate: form.expiryDate || undefined, conditionsMet: form.conditionsMet,
          status: form.status, tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        });
      } else {
        await vaultService.createBenefit({
          programName: form.programName, programSlug: '', category: form.category,
          receivedAmount: Number(form.receivedAmount), receivedDate: form.receivedDate,
          organizer: form.organizer, conditions: form.conditions || undefined,
          expiryDate: form.expiryDate || undefined, conditionsMet: form.conditionsMet,
          status: form.status, attachments: [],
          tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
        });
      }
      resetForm(); loadData();
    } catch (e) { if (import.meta.env.DEV) console.error('[BenefitTracker] Submit error:', e); }
  };

  const handleEdit = (b: BenefitRecord) => {
    setForm({ programName: b.programName, category: b.category,
      receivedAmount: String(b.receivedAmount), receivedDate: b.receivedDate, organizer: b.organizer,
      conditions: b.conditions || '', expiryDate: b.expiryDate || '',
      tags: b.tags.join(', '), conditionsMet: b.conditionsMet ?? null, status: b.status });
    setEditingId(b.id); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 수령 이력을 삭제하시겠습니까?')) return;
    try { await vaultService.deleteBenefit(id); loadData(); }
    catch (e) { if (import.meta.env.DEV) console.error('[BenefitTracker] Delete error:', e); }
  };

  const handleAnalyze = async (id: string) => {
    setAnalyzing(id);
    try {
      const result = await vaultService.analyzeBenefit(id);
      setAnalyses(prev => ({ ...prev, [id]: result })); loadData();
    } catch (e) { if (import.meta.env.DEV) console.error('[BenefitTracker] Analyze error:', e); }
    setAnalyzing(null);
  };

  const handleAnalyzeAll = async () => {
    setAnalyzingAll(true);
    try {
      const { results } = await vaultService.analyzeAllBenefits();
      const map: Record<string, BenefitAnalysisResult> = {};
      for (const r of results) map[r.benefitId] = r;
      setAnalyses(prev => ({ ...prev, ...map })); loadData();
    } catch (e) { if (import.meta.env.DEV) console.error('[BenefitTracker] AnalyzeAll error:', e); }
    setAnalyzingAll(false);
  };

  const handleToggleAnalysis = async (id: string) => {
    if (analyses[id]) { setExpandedAnalysis(expandedAnalysis === id ? null : id); return; }
    try {
      const result = await vaultService.getBenefitAnalysis(id);
      if (result) { setAnalyses(prev => ({ ...prev, [id]: result })); setExpandedAnalysis(id); }
    } catch { /* no analysis */ }
  };

  const tabs = [
    { id: 'tax' as const, label: '놓친 세금 환급', icon: 'account_balance' },
    { id: 'data' as const, label: '수령 이력', icon: 'receipt_long' },
    { id: 'analysis' as const, label: '환급 분석', icon: 'analytics' },
    { id: 'summary' as const, label: '요약', icon: 'summarize' },
  ];

  return (
    <div className="flex flex-col min-h-full bg-background-light dark:bg-background-dark">
      <Header title="놓친 세금 환급" />
      <main className="flex-1">
        <div className="max-w-6xl mx-auto p-6 md:p-8">
          {showForm && (
            <BenefitForm form={form} editingId={editingId} onFormChange={setForm} onSubmit={handleSubmit} onCancel={resetForm} />
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full mb-6">
              {tabs.map(tab => (
                <TabsTrigger key={tab.id} value={tab.id} className="flex-1">
                  <Icon name={tab.icon} className="h-4 w-4 mr-1" />{tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="tax" className="mt-0">
              <TaxRefund
                taxScan={taxScan} taxScanning={taxScanning} taxError={taxError} taxErrorCode={taxErrorCode} scanStep={scanStep}
                sortedOpportunities={sortedOpportunities} taxSortBy={taxSortBy} taxFilterStatus={taxFilterStatus}
                taxFilterSource={taxFilterSource} expandedOpportunity={expandedOpportunity}
                generatingWorksheet={generatingWorksheet} showNpsTrend={showNpsTrend} showDartSummary={showDartSummary}
                onRunScan={handleRunTaxScan} onSetTaxSortBy={setTaxSortBy}
                onSetTaxFilterStatus={setTaxFilterStatus} onSetTaxFilterSource={setTaxFilterSource}
                onToggleOpportunity={id => setExpandedOpportunity(expandedOpportunity === id ? null : id)}
                onGenerateWorksheet={handleGenerateWorksheet} onUpdateWorksheetInput={handleUpdateWorksheetInput}
                onUpdateOppStatus={handleUpdateOppStatus}
                onToggleNpsTrend={() => setShowNpsTrend(v => !v)} onToggleDartSummary={() => setShowDartSummary(v => !v)}
              />
            </TabsContent>

            <TabsContent value="data" className="mt-0">
              <BenefitList benefits={benefits} isLoading={isLoading} filterCategory={filterCategory} analyzing={analyzing}
                onFilterChange={setFilterCategory}
                onAdd={() => { setForm(DEFAULT_FORM); setEditingId(null); setShowForm(true); }}
                onEdit={handleEdit} onDelete={handleDelete} onAnalyze={handleAnalyze}
              />
            </TabsContent>

            <TabsContent value="analysis" className="mt-0">
              <BenefitAnalysis benefits={benefits} analyses={analyses} analyzingAll={analyzingAll}
                expandedAnalysis={expandedAnalysis} onAnalyzeAll={handleAnalyzeAll} onToggleAnalysis={handleToggleAnalysis}
              />
            </TabsContent>

            <TabsContent value="summary" className="mt-0">
              <BenefitSummaryPanel summary={summary} benefits={benefits} isLoading={isLoading} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default BenefitTracker;

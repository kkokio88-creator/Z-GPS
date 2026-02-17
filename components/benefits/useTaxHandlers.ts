import { Dispatch, SetStateAction, useState, useMemo } from 'react';
import { vaultService } from '../../services/vaultService';
import type { TaxScanResult, TaxRefundOpportunity } from '../../types';

interface UseTaxHandlersReturn {
  taxScan: TaxScanResult | null;
  setTaxScan: Dispatch<SetStateAction<TaxScanResult | null>>;
  taxScanning: boolean;
  taxError: string | null;
  taxErrorCode: number | null;
  scanStep: number;
  expandedOpportunity: string | null;
  setExpandedOpportunity: Dispatch<SetStateAction<string | null>>;
  generatingWorksheet: string | null;
  showNpsTrend: boolean;
  setShowNpsTrend: Dispatch<SetStateAction<boolean>>;
  taxSortBy: 'refund' | 'confidence' | 'difficulty';
  setTaxSortBy: Dispatch<SetStateAction<'refund' | 'confidence' | 'difficulty'>>;
  taxFilterStatus: string;
  setTaxFilterStatus: Dispatch<SetStateAction<string>>;
  taxFilterSource: string;
  setTaxFilterSource: Dispatch<SetStateAction<string>>;
  showDartSummary: boolean;
  setShowDartSummary: Dispatch<SetStateAction<boolean>>;
  sortedOpportunities: TaxRefundOpportunity[];
  handleRunTaxScan: () => Promise<void>;
  handleGenerateWorksheet: (oppId: string) => Promise<void>;
  handleUpdateWorksheetInput: (oppId: string, key: string, value: number | string) => Promise<void>;
  handleUpdateOppStatus: (oppId: string, newStatus: TaxRefundOpportunity['status']) => Promise<void>;
}

export function useTaxHandlers(): UseTaxHandlersReturn {
  const [taxScan, setTaxScan] = useState<TaxScanResult | null>(null);
  const [taxScanning, setTaxScanning] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [taxErrorCode, setTaxErrorCode] = useState<number | null>(null);
  const [scanStep, setScanStep] = useState<number>(0);
  const [expandedOpportunity, setExpandedOpportunity] = useState<string | null>(null);
  const [generatingWorksheet, setGeneratingWorksheet] = useState<string | null>(null);
  const [showNpsTrend, setShowNpsTrend] = useState(false);
  const [taxSortBy, setTaxSortBy] = useState<'refund' | 'confidence' | 'difficulty'>('refund');
  const [taxFilterStatus, setTaxFilterStatus] = useState<string>('all');
  const [taxFilterSource, setTaxFilterSource] = useState<string>('all');
  const [showDartSummary, setShowDartSummary] = useState(false);

  const sortedOpportunities = useMemo(() => {
    if (!taxScan) return [];
    let filtered = [...taxScan.opportunities];
    if (taxFilterStatus !== 'all') filtered = filtered.filter(o => o.status === taxFilterStatus);
    if (taxFilterSource === 'real') filtered = filtered.filter(o => o.dataSource === 'NPS_API' || o.dataSource === 'DART_API');
    if (taxFilterSource === 'estimated') filtered = filtered.filter(o => o.dataSource === 'ESTIMATED' || o.dataSource === 'COMPANY_PROFILE');
    filtered.sort((a, b) => {
      if (taxSortBy === 'refund') return b.estimatedRefund - a.estimatedRefund;
      if (taxSortBy === 'confidence') return b.confidence - a.confidence;
      const diffOrder = { EASY: 0, MODERATE: 1, COMPLEX: 2 };
      return (diffOrder[a.difficulty] ?? 1) - (diffOrder[b.difficulty] ?? 1);
    });
    return filtered;
  }, [taxScan, taxSortBy, taxFilterStatus, taxFilterSource]);

  const handleRunTaxScan = async () => {
    setTaxScanning(true); setTaxError(null); setTaxErrorCode(null); setScanStep(1);
    try {
      const t1 = setTimeout(() => setScanStep(2), 500);
      const t2 = setTimeout(() => setScanStep(3), 2000);
      const result = await vaultService.runTaxScan();
      clearTimeout(t1); clearTimeout(t2);
      setScanStep(4 as 0 | 1 | 2 | 3);
      await new Promise(r => setTimeout(r, 300));
      setTaxScan(result);
    } catch (e: unknown) {
      const resp = (e && typeof e === 'object' && 'response' in e)
        ? (e as { response?: { status?: number; data?: { error?: string } } }).response : null;
      const status = resp?.status || 0;
      const serverMsg = resp?.data?.error;
      setTaxErrorCode(status);
      if (status === 503) setTaxError(serverMsg || 'Gemini API 키가 설정되지 않았습니다.');
      else if (status === 400) setTaxError(serverMsg || '기업 정보가 등록되지 않았습니다.');
      else if (status >= 500) setTaxError(serverMsg || '세금 환급 스캔에 실패했습니다.');
      else setTaxError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
      if (import.meta.env.DEV) console.error('[BenefitTracker] Tax scan error:', e);
    }
    setScanStep(0); setTaxScanning(false);
  };

  const handleGenerateWorksheet = async (oppId: string) => {
    if (!taxScan) return;
    setGeneratingWorksheet(oppId);
    try {
      const worksheet = await vaultService.generateWorksheet(taxScan.id, oppId);
      setTaxScan(prev => prev ? {
        ...prev,
        opportunities: prev.opportunities.map(o => o.id === oppId ? { ...o, status: 'reviewing' as const, worksheet } : o),
      } : prev);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Generate worksheet error:', e);
    }
    setGeneratingWorksheet(null);
  };

  const handleUpdateWorksheetInput = async (oppId: string, key: string, value: number | string) => {
    if (!taxScan) return;
    try {
      const { worksheet } = await vaultService.updateWorksheetOverrides(taxScan.id, oppId, { [key]: value });
      setTaxScan(prev => prev ? {
        ...prev,
        opportunities: prev.opportunities.map(o => o.id === oppId ? { ...o, worksheet, estimatedRefund: worksheet.totalRefund } : o),
      } : prev);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Update worksheet input error:', e);
    }
  };

  const handleUpdateOppStatus = async (oppId: string, newStatus: TaxRefundOpportunity['status']) => {
    if (!taxScan) return;
    try {
      await vaultService.updateOpportunityStatus(taxScan.id, oppId, newStatus);
      setTaxScan(prev => prev ? {
        ...prev,
        opportunities: prev.opportunities.map(o => o.id === oppId ? { ...o, status: newStatus } : o),
      } : prev);
    } catch (e) {
      if (import.meta.env.DEV) console.error('[BenefitTracker] Update opp status error:', e);
    }
  };

  return {
    taxScan, setTaxScan, taxScanning, taxError, taxErrorCode, scanStep,
    expandedOpportunity, setExpandedOpportunity, generatingWorksheet,
    showNpsTrend, setShowNpsTrend, taxSortBy, setTaxSortBy,
    taxFilterStatus, setTaxFilterStatus, taxFilterSource, setTaxFilterSource,
    showDartSummary, setShowDartSummary, sortedOpportunities,
    handleRunTaxScan, handleGenerateWorksheet, handleUpdateWorksheetInput, handleUpdateOppStatus,
  };
}

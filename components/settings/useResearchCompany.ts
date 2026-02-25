import { Dispatch, SetStateAction, useState } from 'react';
import { vaultService } from '../../services/vaultService';
import { saveStoredDeepResearch } from '../../services/storageService';
import { Company, DeepResearchResult } from '../../types';
import { useCompanyStore } from '../../services/stores/companyStore';

interface UseResearchCompanyOptions {
  company: Company;
  setCompany: Dispatch<SetStateAction<Company>>;
  setDeepResearchData: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  setExpandedSections: Dispatch<SetStateAction<Set<string>>>;
}

interface UseResearchCompanyReturn {
  researching: boolean;
  researchError: string;
  handleResearchCompany: (query: string) => Promise<void>;
}

export function useResearchCompany({
  company,
  setCompany,
  setDeepResearchData,
  setExpandedSections,
}: UseResearchCompanyOptions): UseResearchCompanyReturn {
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState('');
  const _setStoreCompany = useCompanyStore(s => s.setCompany);

  const normalize = (n: string) =>
    n.replace(/^(주식회사|㈜|\(주\)|\(사\)|사단법인|재단법인|유한회사|합자회사)\s*/g, '')
     .replace(/\s*(주식회사|㈜|\(주\))$/g, '')
     .replace(/\s+/g, '').toLowerCase();

  const handleResearchCompany = async (query: string) => {
    if (!query.trim() || query.trim().length < 2) return;
    setResearching(true);
    setResearchError('');
    try {
      const result = await vaultService.researchCompany(query.trim());
      if (!result.success || !result.company) {
        setResearchError('리서치 결과를 받지 못했습니다. 다시 시도해주세요.');
        return;
      }
      const c = result.company;
      const hasName = !!c.name && String(c.name).trim().length > 0;
      const nonEmptyFields = Object.entries(c).filter(([, v]) =>
        v !== null && v !== undefined && v !== '' &&
        !(Array.isArray(v) && v.length === 0) &&
        !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)
      );
      if (!hasName && nonEmptyFields.length < 3) {
        setResearchError('AI가 유효한 기업 정보를 반환하지 않았습니다.');
        return;
      }

      const returnedName = String(c.name || '');
      const returnedBrand = String(c.brandName || '');
      const queryNorm = normalize(query.trim());
      const checkMatch = (candidate: string) => {
        const cn = normalize(candidate);
        if (!cn) return false;
        return cn.includes(queryNorm) || queryNorm.includes(cn) ||
          (queryNorm.length >= 2 && cn.length >= 2 &&
            (cn.startsWith(queryNorm.substring(0, 2)) || queryNorm.startsWith(cn.substring(0, 2))));
      };
      if (returnedName && !checkMatch(returnedName) && !checkMatch(returnedBrand)) {
        if (nonEmptyFields.length < 10) {
          setResearchError(`AI가 다른 기업("${returnedName}")을 반환했습니다.`);
          return;
        }
      }

      let foundedYear: number | undefined;
      if (c.foundedDate && typeof c.foundedDate === 'string') {
        const y = parseInt(c.foundedDate.substring(0, 4), 10);
        if (!isNaN(y) && y > 1900) foundedYear = y;
      } else if (c.foundedYear && typeof c.foundedYear === 'number') {
        foundedYear = c.foundedYear as number;
      }

      const updated: Company = {
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
      _setStoreCompany(updated);
      try {
        const savePayload: Record<string, unknown> = {
          name: updated.name, businessNumber: updated.businessNumber, industry: updated.industry,
          address: updated.address, revenue: updated.revenue, employees: updated.employees,
          description: updated.description, coreCompetencies: updated.coreCompetencies,
          certifications: updated.certifications, foundedYear: updated.foundedYear,
          businessType: updated.businessType, mainProducts: updated.mainProducts,
          representative: updated.representative, history: updated.history,
        };
        // Include deepResearch data in auto-save
        if (c.strategicAnalysis || c.governmentFundingFit || c.marketPosition || c.industryInsights) {
          savePayload.deepResearch = {
            strategicAnalysis: c.strategicAnalysis,
            governmentFundingFit: c.governmentFundingFit,
            marketPosition: c.marketPosition,
            industryInsights: c.industryInsights,
          };
        }
        await vaultService.saveCompany(savePayload);
      } catch (saveErr) {
        console.warn('[Settings] Research auto-save failed:', saveErr);
        window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '서버 저장에 실패했습니다. 로컬에만 저장됩니다.', type: 'warning' } }));
      }
      setDeepResearchData(c);
      try { saveStoredDeepResearch(c as unknown as DeepResearchResult); } catch { /* ignore */ }
      setExpandedSections(new Set(['swot', 'funding']));
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '기업 리서치 완료 — 자동 저장되었습니다.', type: 'success' } }));
    } catch (e: unknown) {
      const err = e as Error & { response?: { status?: number; data?: { error?: string; details?: string; mismatch?: boolean; notFound?: boolean } }; code?: string };
      const data = err?.response?.data;
      const status = err?.response?.status;
      if (err?.code === 'ERR_NETWORK' || !err?.response) {
        setResearchError('서버에 연결할 수 없습니다.');
      } else if (status === 503) {
        setResearchError('서버에 GEMINI_API_KEY가 설정되지 않았습니다.');
      } else if (data?.mismatch || data?.notFound) {
        setResearchError(data.error || '기업 정보를 찾을 수 없습니다.');
      } else {
        setResearchError(`리서치 실패: ${data?.details || data?.error || String(e)}`);
      }
    } finally {
      setResearching(false);
    }
  };

  return { researching, researchError, handleResearchCompany };
}

import React, { useState } from 'react';
import type { Company } from '../../types';
import type { VaultDocumentMeta } from '../../services/vaultService';
import CompanyDocuments from './CompanyDocuments';
import Icon from '../ui/Icon';

const InlineSaveMessage: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400 ml-3 animate-pulse">
      <Icon name="check_circle" className="h-5 w-5" />
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
      if (!value.includes(input.trim())) onChange([...value, input.trim()]);
      setInput('');
    }
    if (e.key === 'Backspace' && !input && value.length > 0) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border rounded-lg bg-gray-50 dark:bg-gray-800 min-h-[42px]">
      {value.map((chip, i) => (
        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
          {chip}
          <button onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="ml-1 hover:text-red-500">&times;</button>
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

interface CompanyTabProps {
  company: Company;
  companyLoading: boolean;
  companySaved: boolean;
  deepResearchData: Record<string, unknown> | null;
  expandedSections: Set<string>;
  documents: VaultDocumentMeta[];
  docsLoading: boolean;
  onCompanyChange: (updater: (c: Company) => Company) => void;
  onSaveCompany: () => void;
  onResearch: (query: string) => void;
  researching: boolean;
  researchError: string;
  onToggleSection: (key: string) => void;
  onCloseDeepResearch: () => void;
  onDocumentDeleted: () => void;
}

const CompanyTab: React.FC<CompanyTabProps> = ({
  company,
  companyLoading,
  companySaved,
  deepResearchData,
  expandedSections,
  documents,
  docsLoading,
  onCompanyChange,
  onSaveCompany,
  onResearch,
  researching,
  researchError,
  onToggleSection,
  onCloseDeepResearch,
  onDocumentDeleted,
}) => {
  const [researchQuery, setResearchQuery] = useState('');

  // 객체가 실제 유효한 데이터를 가지는지 검사 (빈 배열/null만 있는 객체는 false)
  const nonEmpty = (obj: unknown): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    return Object.values(obj as Record<string, unknown>).some(v => {
      if (v === null || v === undefined || v === '' || v === 0) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    });
  };

  const AccordionSection: React.FC<{ id: string; icon: string; title: string; children: React.ReactNode }> = ({ id, icon, title, children }) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => onToggleSection(id)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium text-sm">
          <Icon name={icon} className="h-4 w-4" />{title}
        </span>
        <span className={`material-icons-outlined text-sm transition-transform ${expandedSections.has(id) ? 'rotate-180' : ''}`} aria-hidden="true">expand_more</span>
      </button>
      {expandedSections.has(id) && <div className="p-3 text-sm space-y-2">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* AI 기업 검색 */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-5">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
          <Icon name="travel_explore" className="h-5 w-5" />
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
            onKeyDown={e => e.key === 'Enter' && onResearch(researchQuery)}
            placeholder="기업명 입력 (예: 산너머남촌)"
            disabled={researching}
            className="flex-1 border border-indigo-300 dark:border-indigo-700 rounded-lg p-2.5 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={() => onResearch(researchQuery)}
            disabled={researching || researchQuery.trim().length < 2}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {researching ? (
              <><Icon name="refresh" className="h-5 w-5" />리서치 중...</>
            ) : (
              <><Icon name="search" className="h-5 w-5" />검색</>
            )}
          </button>
        </div>
        {researchError && <p className="mt-2 text-sm text-red-500">{researchError}</p>}
        {researching && (
          <div className="mt-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg p-3 text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
            <Icon name="autorenew" className="h-5 w-5" />
            AI가 기업 정보를 수집하고 있습니다. 약 10~15초 소요됩니다...
          </div>
        )}
      </div>

      {/* 딥리서치 결과 */}
      {deepResearchData && (() => {
        const sa = nonEmpty(deepResearchData.strategicAnalysis) ? deepResearchData.strategicAnalysis as Record<string, unknown> : undefined;
        const swot = (sa && nonEmpty(sa.swot)) ? sa.swot as Record<string, string[]> : undefined;
        const gf = nonEmpty(deepResearchData.governmentFundingFit) ? deepResearchData.governmentFundingFit as Record<string, unknown> : undefined;
        const mp = nonEmpty(deepResearchData.marketPosition) ? deepResearchData.marketPosition as Record<string, unknown> : undefined;
        const ii = nonEmpty(deepResearchData.industryInsights) ? deepResearchData.industryInsights as Record<string, unknown> : undefined;
        const hasAnySections = !!(swot || gf || mp || ii);

        return (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Icon name="insights" className="h-5 w-5" />
                AI 딥리서치 결과
              </h3>
              <button onClick={onCloseDeepResearch} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
            </div>
            {deepResearchData.name && (
              <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg">
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{deepResearchData.name as string}</p>
                {deepResearchData.industry && <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{deepResearchData.industry as string}</p>}
                {deepResearchData.description && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{deepResearchData.description as string}</p>}
              </div>
            )}
            {!hasAnySections && (
              <div className="text-center py-6 text-gray-400">
                <Icon name="info" className="h-5 w-5" />
                <p className="text-sm">기본 정보만 수집되었습니다. 아래 기업 정보 폼을 확인하세요.</p>
              </div>
            )}
            <div className="space-y-2">
              {swot && (
                <AccordionSection id="swot" icon="grid_view" title="SWOT 전략 분석">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'strengths', label: '강점 (S)', cls: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800', txtCls: 'text-green-600 dark:text-green-300', lblCls: 'text-green-700 dark:text-green-400' },
                      { key: 'weaknesses', label: '약점 (W)', cls: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800', txtCls: 'text-red-600 dark:text-red-300', lblCls: 'text-red-700 dark:text-red-400' },
                      { key: 'opportunities', label: '기회 (O)', cls: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800', txtCls: 'text-blue-600 dark:text-blue-300', lblCls: 'text-blue-700 dark:text-blue-400' },
                      { key: 'threats', label: '위협 (T)', cls: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800', txtCls: 'text-amber-600 dark:text-amber-300', lblCls: 'text-amber-700 dark:text-amber-400' },
                    ].map(({ key, label, cls, txtCls, lblCls }) => (
                      <div key={key} className={`rounded-lg p-2.5 border ${cls}`}>
                        <p className={`text-xs font-bold ${lblCls} mb-1`}>{label}</p>
                        {(swot[key] || []).map((s: string, i: number) => <p key={i} className={`text-xs ${txtCls}`}>- {s}</p>)}
                      </div>
                    ))}
                  </div>
                </AccordionSection>
              )}
              {mp && (
                <AccordionSection id="market" icon="analytics" title="시장 분석">
                  {(mp.competitors as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">경쟁사</p>{(mp.competitors as string[]).map((c, i) => <span key={i} className="inline-block mr-1.5 mb-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{c}</span>)}</div>
                  ) : null}
                  {mp.marketShare && <p className="text-xs"><strong>시장점유율:</strong> {mp.marketShare as string}</p>}
                  {(mp.uniqueSellingPoints as string[] | undefined)?.length ? (
                    <div className="mt-1"><p className="font-medium text-xs mb-1">차별화 포인트</p>{(mp.uniqueSellingPoints as string[]).map((u, i) => <p key={i} className="text-xs">- {u}</p>)}</div>
                  ) : null}
                  {mp.targetMarket && <p className="text-xs mt-1"><strong>타깃 시장:</strong> {mp.targetMarket as string}</p>}
                </AccordionSection>
              )}
              {ii && (
                <AccordionSection id="industry" icon="trending_up" title="산업 인사이트">
                  {(ii.marketTrends as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">시장 트렌드</p>{(ii.marketTrends as string[]).map((t, i) => <p key={i} className="text-xs">- {t}</p>)}</div>
                  ) : null}
                  {ii.industryOutlook && <p className="text-xs mt-1"><strong>산업 전망:</strong> {ii.industryOutlook as string}</p>}
                  {ii.regulatoryEnvironment && <p className="text-xs mt-1"><strong>규제 환경:</strong> {ii.regulatoryEnvironment as string}</p>}
                  {(ii.technologyTrends as string[] | undefined)?.length ? (
                    <div className="mt-1"><p className="font-medium text-xs mb-1">기술 트렌드</p>{(ii.technologyTrends as string[]).map((t, i) => <p key={i} className="text-xs text-blue-600 dark:text-blue-400">- {t}</p>)}</div>
                  ) : null}
                </AccordionSection>
              )}
              {gf && (
                <AccordionSection id="funding" icon="account_balance" title="정부지원금 적합성">
                  {(gf.recommendedPrograms as string[] | undefined)?.length ? (
                    <div><p className="font-medium text-xs mb-1">추천 지원사업</p>{(gf.recommendedPrograms as string[]).map((r, i) => <p key={i} className="text-xs text-indigo-600 dark:text-indigo-400">- {r}</p>)}</div>
                  ) : null}
                  {(gf.eligibilityStrengths as string[] | undefined)?.length ? (
                    <div className="mt-1"><p className="font-medium text-xs mb-1">자격 강점</p>{(gf.eligibilityStrengths as string[]).map((s, i) => <p key={i} className="text-xs text-green-600 dark:text-green-400">- {s}</p>)}</div>
                  ) : null}
                  {(gf.potentialChallenges as string[] | undefined)?.length ? (
                    <div className="mt-1"><p className="font-medium text-xs mb-1">도전과제</p>{(gf.potentialChallenges as string[]).map((c, i) => <p key={i} className="text-xs text-amber-600 dark:text-amber-400">- {c}</p>)}</div>
                  ) : null}
                  {gf.applicationTips && (
                    <div className="mt-1 bg-indigo-50 dark:bg-indigo-950/20 rounded p-2 text-xs text-indigo-700 dark:text-indigo-300">
                      <strong>지원 팁:</strong> {gf.applicationTips as string}
                    </div>
                  )}
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
            <Icon name="business" className="h-5 w-5" />기업 정보
          </h3>
          <InlineSaveMessage show={companySaved} />
        </div>
        {companyLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Icon name="refresh" className="h-5 w-5" />로딩 중...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(([
                { label: '기업명', field: 'name', type: 'text', placeholder: '' },
                { label: '사업자번호', field: 'businessNumber', type: 'text', placeholder: '000-00-00000' },
                { label: '업종', field: 'industry', type: 'text', placeholder: '' },
                { label: '주소', field: 'address', type: 'text', placeholder: '' },
                { label: '매출액 (원)', field: 'revenue', type: 'number', placeholder: '' },
                { label: '직원수', field: 'employees', type: 'number', placeholder: '' },
              ]) as { label: string; field: keyof Company; type: string; placeholder: string }[]).map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(company[field] as string | number | undefined) || (type === 'number' ? 0 : '')}
                    onChange={e => onCompanyChange(prev => ({
                      ...prev,
                      [field]: type === 'number' ? Number(e.target.value) : e.target.value,
                    }))}
                    placeholder={placeholder}
                    className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">핵심 역량</label>
              <ChipInput
                value={company.coreCompetencies || []}
                onChange={v => onCompanyChange(prev => ({ ...prev, coreCompetencies: v }))}
                placeholder="역량 입력 후 Enter (예: HACCP, 식품가공)"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">보유 인증</label>
              <ChipInput
                value={company.certifications || []}
                onChange={v => onCompanyChange(prev => ({ ...prev, certifications: v }))}
                placeholder="인증 입력 후 Enter (예: ISO9001, HACCP)"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">기업 설명</label>
              <textarea
                value={company.description}
                onChange={e => onCompanyChange(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>
            <button
              onClick={onSaveCompany}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Icon name="save" className="h-5 w-5" />기업 정보 저장
            </button>
          </div>
        )}
      </div>

      {/* 기업 서류함 */}
      <CompanyDocuments
        documents={documents}
        docsLoading={docsLoading}
        onRefresh={onDocumentDeleted}
      />
    </div>
  );
};

export default CompanyTab;

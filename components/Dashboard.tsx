
import Icon from './ui/Icon';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { vaultService, VaultProgram, VaultApplication } from '../services/vaultService';
import type { SSEProgressEvent } from '../services/sseClient';
import type { BenefitSummary, TaxScanResult } from '../types';
import { useCompanyStore } from '../services/stores/companyStore';
import { Company } from '../types';
import Header from './Header';
import { formatKRW, getDday } from '../services/utils/formatters';
import { FIT_SCORE_THRESHOLD } from '../constants';

interface FocusArea {
  id: string;
  title: string;
  keywords: string[];
  icon: string;
  gradientFrom: string;
  gradientTo: string;
  bgLight: string;
  bgDark: string;
  textColor: string;
}

const FOCUS_AREAS: FocusArea[] = [
  {
    id: 'elderly',
    title: '고령자 고용 장려금',
    keywords: ['고령자', '고령', '시니어', '장년', '고용장려', '계속고용', '정년', '중장년'],
    icon: 'elderly',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-500',
    bgLight: 'bg-amber-50',
    bgDark: 'dark:bg-amber-900/20',
    textColor: 'text-amber-700 dark:text-amber-400',
  },
  {
    id: 'youth',
    title: '청년 채용 지원금',
    keywords: ['청년', '인턴', '취업', '청년고용', '신규채용', '청년내일', '일자리'],
    icon: 'school',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-indigo-500',
    bgLight: 'bg-blue-50',
    bgDark: 'dark:bg-blue-900/20',
    textColor: 'text-blue-700 dark:text-blue-400',
  },
  {
    id: 'manufacturing',
    title: '제조 중소기업 지원금',
    keywords: ['제조', '스마트공장', '자동화', '중소기업', '식품제조', 'HACCP', '시설개선', '공정개선'],
    icon: 'precision_manufacturing',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-500',
    bgLight: 'bg-emerald-50',
    bgDark: 'dark:bg-emerald-900/20',
    textColor: 'text-emerald-700 dark:text-emerald-400',
  },
];

const matchProgramToFocus = (program: VaultProgram, keywords: string[]): boolean => {
  const text = [program.programName, program.supportType].join(' ').toLowerCase();
  return keywords.some(k => text.includes(k.toLowerCase()));
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const company = useCompanyStore(s => s.company);
  const [programs, setPrograms] = useState<VaultProgram[]>([]);
  const [myApplications, setMyApplications] = useState<VaultApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [benefitSummary, setBenefitSummary] = useState<BenefitSummary | null>(null);
  const [taxScan, setTaxScan] = useState<TaxScanResult | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<SSEProgressEvent | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const batchAbortRef = useRef<(() => void) | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [progs, apps, companyResult, benefitResult, taxScanResult] = await Promise.allSettled([
        vaultService.getPrograms(),
        vaultService.getApplications(),
        vaultService.getCompany(),
        vaultService.getBenefitSummary(),
        vaultService.getLatestTaxScan(),
      ]);

      if (progs.status === 'fulfilled') {
        setPrograms(progs.value);
      }
      if (apps.status === 'fulfilled') {
        setMyApplications(apps.value);
      }
      if (benefitResult.status === 'fulfilled') {
        setBenefitSummary(benefitResult.value);
      }
      if (taxScanResult.status === 'fulfilled' && taxScanResult.value) {
        setTaxScan(taxScanResult.value);
      }
      if (companyResult.status === 'fulfilled' && companyResult.value.company) {
        const c = companyResult.value.company;
        const prev = useCompanyStore.getState().company;
        useCompanyStore.getState().setCompany({
          ...prev,
          name: (c.name as string) || prev.name,
          industry: (c.industry as string) || prev.industry,
          employees: (c.employees as number) || prev.employees,
          address: (c.address as string) || prev.address,
          revenue: (c.revenue as number) || prev.revenue,
          description: (c.description as string) || prev.description,
          businessNumber: (c.businessNumber as string) || prev.businessNumber,
          isVerified: prev.isVerified,
        });
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[Dashboard] Load error:', e);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleArea = (areaId: string) => {
    setExpandedAreas(prev => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  const handleBatchGenerate = async () => {
    setBatchGenerating(true);
    setBatchResult(null);
    setBatchProgress(null);
    try {
      const { promise, abort } = vaultService.generateAppsBatchWithProgress(
        (e) => setBatchProgress(e),
        70,
        3
      );
      batchAbortRef.current = abort;
      const BATCH_TIMEOUT = 15 * 60 * 1000; // 15분 타임아웃
      const result = await Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => { abort(); reject(new Error('지원서 생성 시간 초과 (15분)')); }, BATCH_TIMEOUT)
        ),
      ]);
      const skippedMsg = result.skipped ? `, ${result.skipped}건 대기` : '';
      setBatchResult(`완료: ${result.generated}건 생성, ${result.failed}건 실패 (총 ${result.total}건${skippedMsg})`);
      loadData();
    } catch (e) {
      setBatchResult(`실패: ${String(e)}`);
    } finally {
      setBatchGenerating(false);
      setBatchProgress(null);
      batchAbortRef.current = null;
    }
  };

  // --- Derived Data ---

  const activePrograms = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return programs.filter(p => {
      const end = new Date(p.officialEndDate);
      return end >= today;
    });
  }, [programs]);

  const heroStats = useMemo(() => {
    // 적합 프로그램: eligibility가 '부적합'이 아닌 것
    const eligiblePrograms = activePrograms.filter(p => p.eligibility !== '부적합');
    const programsWithGrant = eligiblePrograms.filter(p => (p.expectedGrant || 0) > 0);
    const totalGrant = programsWithGrant.reduce((sum, p) => sum + p.expectedGrant, 0);
    const unknownGrantCount = eligiblePrograms.length - programsWithGrant.length;
    const analyzedPrograms = activePrograms.filter(p => p.fitScore > 0);
    const avgFit = analyzedPrograms.length > 0
      ? Math.round(analyzedPrograms.reduce((sum, p) => sum + p.fitScore, 0) / analyzedPrograms.length)
      : 0;
    const recommendedCount = activePrograms.filter(p => p.fitScore >= FIT_SCORE_THRESHOLD).length;

    return {
      totalPrograms: activePrograms.length,
      totalGrant,
      unknownGrantCount,
      avgFit,
      analyzedCount: analyzedPrograms.length,
      recommendedCount,
      taxRefund: taxScan?.totalEstimatedRefund || 0,
    };
  }, [activePrograms, taxScan]);

  const focusData = useMemo(() => {
    return FOCUS_AREAS.map(area => {
      const matched = activePrograms
        .filter(p => matchProgramToFocus(p, area.keywords))
        .sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
      const totalGrant = matched.reduce((sum, p) => sum + (p.expectedGrant || 0), 0);

      let nearestDeadline: { label: string; days: number } | null = null;
      if (matched.length > 0) {
        const sortedByDate = [...matched].sort(
          (a, b) => new Date(a.officialEndDate).getTime() - new Date(b.officialEndDate).getTime()
        );
        const dd = getDday(sortedByDate[0].officialEndDate);
        nearestDeadline = { label: dd.label, days: dd.days };
      }

      return { ...area, matched, matchCount: matched.length, totalGrant, nearestDeadline };
    });
  }, [activePrograms]);

  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    activePrograms.forEach(p => {
      map[p.supportType] = (map[p.supportType] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [activePrograms]);

  const upcomingDeadlines = useMemo(() => {
    return activePrograms
      .map(p => ({ ...p, dday: getDday(p.officialEndDate) }))
      .filter(p => p.dday.days >= 0)
      .sort((a, b) => a.dday.days - b.dday.days)
      .slice(0, 5);
  }, [activePrograms]);

  const appStats = useMemo(() => {
    const appSlugs = new Set(myApplications.map(a => a.slug));
    const eligible = activePrograms.filter(p => p.fitScore >= 70);
    const withApp = eligible.filter(p => appSlugs.has(p.slug));
    return {
      draft: myApplications.filter(a => a.status === 'draft').length,
      edited: myApplications.filter(a => a.status === 'edited').length,
      total: myApplications.length,
      eligibleCount: eligible.length,
      eligibleWithApp: withApp.length,
      eligibleWithoutApp: eligible.length - withApp.length,
    };
  }, [myApplications, activePrograms]);

  const maxTypeCount = useMemo(() => {
    if (typeDistribution.length === 0) return 1;
    return typeDistribution[0][1];
  }, [typeDistribution]);

  const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`} />
  );

  return (
    <div className="flex flex-col min-h-full bg-background-light dark:bg-background-dark">
      <Header title="대시보드" />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto space-y-6 p-6 md:p-8">

          {/* ===== Hero Summary Bar ===== */}
          <section className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 rounded-2xl p-6 md:p-8 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white text-xl md:text-2xl font-bold">{company.name}</h2>
                <p className="text-gray-400 text-sm mt-1">{company.industry || '업종 미설정'} · {company.employees}명</p>
              </div>
              <span className="text-[10px] px-3 py-1 rounded-full bg-green-500/20 text-green-400 font-bold border border-green-500/30">
                {company.isVerified ? 'VERIFIED' : 'UNVERIFIED'}
              </span>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map(i => <SkeletonBlock key={i} className="h-20 bg-gray-700/50" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">볼트 내 공고</p>
                  <p className="text-white text-3xl font-bold">{heroStats.totalPrograms}<span className="text-sm text-gray-400 ml-1">건</span></p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">총 수령 가능 금액</p>
                  <p className="text-emerald-400 text-3xl font-bold">
                    {heroStats.totalGrant > 0 ? formatKRW(heroStats.totalGrant) : '-'}
                  </p>
                  {heroStats.unknownGrantCount > 0 && (
                    <p className="text-gray-500 text-[10px] mt-1">+{heroStats.unknownGrantCount}건 금액 미확정</p>
                  )}
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">평균 적합도</p>
                  <p className="text-blue-400 text-3xl font-bold">{heroStats.avgFit}<span className="text-sm text-gray-400 ml-1">%</span></p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">추천 공고</p>
                  <p className="text-purple-400 text-3xl font-bold">{heroStats.recommendedCount}<span className="text-sm text-gray-400 ml-1">건</span></p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">놓친 세금 환급</p>
                  <p className="text-amber-400 text-3xl font-bold">
                    {heroStats.taxRefund > 0 ? formatKRW(heroStats.taxRefund) : '-'}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ===== 나의 관심 분야 (3개 공고 + 더 보기 토글) ===== */}
          <section>
            <h3 className="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-4 flex items-center">
              <Icon name="interests" className="h-5 w-5" />
              나의 관심 분야
            </h3>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <SkeletonBlock key={i} className="h-44" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {focusData.map(area => {
                  const isExpanded = expandedAreas.has(area.id);
                  const visiblePrograms = isExpanded ? area.matched : area.matched.slice(0, 3);

                  return (
                    <div key={area.id} className="relative overflow-hidden rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark shadow-sm">
                      <div className={`bg-gradient-to-r ${area.gradientFrom} ${area.gradientTo} p-4 text-white`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <Icon name={area.icon} className="h-6 w-6 mr-2 opacity-90" />
                            <h4 className="font-bold text-sm">{area.title}</h4>
                          </div>
                          <span className="text-2xl font-bold">{area.matchCount}</span>
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-white/80">
                          <span>{area.totalGrant > 0 ? formatKRW(area.totalGrant) : '금액 미확정'}</span>
                          {area.nearestDeadline && (
                            <span className={area.nearestDeadline.days <= 7 ? 'text-yellow-200 font-bold' : ''}>
                              {area.nearestDeadline.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-3 space-y-1.5">
                        {visiblePrograms.length === 0 ? (
                          <div className="py-3 text-center">
                            <p className="text-xs text-gray-400">매칭 프로그램 없음</p>
                          </div>
                        ) : (
                          visiblePrograms.map(prog => (
                            <div
                              key={prog.slug}
                              onClick={() => navigate(`/program/${prog.slug}`)}
                              className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer hover:shadow-sm transition-all ${area.bgLight} ${area.bgDark}`}
                            >
                              <div className="flex-1 min-w-0 mr-2">
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{prog.programName}</p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">{prog.organizer} · {prog.expectedGrant > 0 ? formatKRW(prog.expectedGrant) : '금액 미확정'}</p>
                              </div>
                              <div className="flex-shrink-0 text-right">
                                {prog.fitScore > 0 && (
                                  <span className={`text-xs font-bold ${prog.fitScore >= 70 ? 'text-green-600' : prog.fitScore >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>
                                    {prog.fitScore}%
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                        {area.matched.length > 3 && (
                          <button
                            onClick={() => toggleArea(area.id)}
                            className={`w-full text-center py-2 text-xs font-medium rounded-lg transition-colors ${area.textColor} hover:bg-gray-50 dark:hover:bg-gray-800`}
                          >
                            {isExpanded ? '접기' : `+${area.matched.length - 3}건 더 보기`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ===== 2-Column: 유형 분포 + 마감 임박 ===== */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm p-5">
              <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark mb-4 flex items-center">
                <Icon name="bar_chart" className="h-5 w-5" />
                공고 유형 분포
              </h3>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} className="h-6" />)}
                </div>
              ) : typeDistribution.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">데이터 없음</p>
              ) : (
                <div className="space-y-3">
                  {typeDistribution.map(([type, count]) => {
                    const pct = Math.round((Number(count) / maxTypeCount) * 100);
                    return (
                      <div key={type}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate max-w-[60%]">{type}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{count}건</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm p-5">
              <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark mb-4 flex items-center">
                <Icon name="schedule" className="h-5 w-5" />
                마감 임박 타임라인
              </h3>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <SkeletonBlock key={i} className="h-14" />)}
                </div>
              ) : upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">마감 임박 공고 없음</p>
              ) : (
                <div className="space-y-2">
                  {upcomingDeadlines.map((p, i) => {
                    const isUrgent = p.dday.days <= 7;
                    return (
                      <div
                        key={p.id || i}
                        onClick={() => p.slug && navigate(`/program/${p.slug}`)}
                        className={`flex items-center p-3 rounded-lg border transition-colors cursor-pointer hover:shadow-md ${
                          isUrgent
                            ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 hover:border-red-300'
                            : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 hover:border-indigo-300'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isUrgent ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="ml-3 flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{p.programName}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">{p.organizer}</p>
                        </div>
                        <div className="ml-2 text-right flex-shrink-0">
                          <span className={`text-sm font-bold ${p.dday.color} ${isUrgent ? 'animate-pulse' : ''}`}>
                            {p.dday.label}
                          </span>
                          <p className="text-[10px] text-gray-400">{new Date(p.officialEndDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* ===== 놓친 세금 환급 ===== */}
          <section className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800/30 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div
              onClick={() => navigate('/benefits')}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Icon name="account_balance" className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark">놓친 세금 환급</h3>
                    {taxScan && (() => {
                      const daysSince = Math.floor((Date.now() - new Date(taxScan.scannedAt).getTime()) / (1000 * 60 * 60 * 24));
                      return daysSince >= 7 ? (
                        <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[10px] font-bold">재스캔 권장</span>
                      ) : null;
                    })()}
                  </div>
                  {taxScan ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {taxScan.opportunityCount}건 발견 · 추정 환급액 {formatKRW(taxScan.totalEstimatedRefund)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      AI로 놓친 세금 혜택을 스캔해보세요
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {taxScan && taxScan.totalEstimatedRefund > 0 && (
                  <div className="text-right">
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatKRW(taxScan.totalEstimatedRefund)}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(taxScan.scannedAt).toLocaleDateString('ko-KR')} 스캔
                    </p>
                  </div>
                )}
                <Icon name="chevron_right" className="h-5 w-5" />
              </div>
            </div>

            {/* Top 3 기회 미니목록 */}
            {taxScan && taxScan.opportunities.length > 0 && (
              <div className="mt-3 pt-3 border-t border-indigo-200/50 dark:border-indigo-800/30 space-y-1.5">
                {[...taxScan.opportunities]
                  .sort((a, b) => (b.estimatedRefund * b.confidence / 100) - (a.estimatedRefund * a.confidence / 100))
                  .slice(0, 3)
                  .map((opp, i) => (
                    <div
                      key={opp.id || i}
                      onClick={() => navigate('/benefits')}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/60 dark:bg-gray-800/40 cursor-pointer hover:bg-white/80 dark:hover:bg-gray-800/60 transition-colors"
                    >
                      <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{opp.taxBenefitName}</span>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 ml-2 flex-shrink-0">{formatKRW(opp.estimatedRefund)}</span>
                    </div>
                  ))
                }
              </div>
            )}

            {/* 스캔 결과 없을 때: 지금 스캔 버튼 */}
            {!taxScan && (
              <div className="mt-3 pt-3 border-t border-indigo-200/50 dark:border-indigo-800/30 text-center">
                <button
                  onClick={() => navigate('/benefits')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                >
                  <Icon name="search" className="h-5 w-5" />
                  지금 스캔하기
                </button>
              </div>
            )}
          </section>

          {/* ===== 과거 수령 이력 요약 ===== */}
          {benefitSummary && benefitSummary.totalCount > 0 && (
            <section
              onClick={() => navigate('/benefits')}
              className="bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                    <Icon name="receipt_long" className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark">과거 수령 이력</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      총 {benefitSummary.totalCount}건 | 누적 {formatKRW(benefitSummary.totalReceived)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {benefitSummary.refundEligible > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        환급 가능 {benefitSummary.refundEligible}건
                      </p>
                      {benefitSummary.estimatedTotalRefund > 0 && (
                        <p className="text-xs text-amber-500">약 {formatKRW(benefitSummary.estimatedTotalRefund)}</p>
                      )}
                    </div>
                  )}
                  <Icon name="chevron_right" className="h-5 w-5" />
                </div>
              </div>
            </section>
          )}

          {/* ===== 내 지원 현황 (Compact Bar) ===== */}
          <section className="bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark flex items-center">
                <Icon name="assignment" className="h-5 w-5" />
                내 지원 현황
              </h3>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                  <span className="text-gray-600 dark:text-gray-400">초안</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{appStats.draft}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <span className="text-gray-600 dark:text-gray-400">편집 완료</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{appStats.edited}</span>
                </div>
                <div className="pl-3 border-l border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">총 </span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{appStats.total}</span>
                  <span className="text-gray-500 dark:text-gray-400"> 지원서</span>
                </div>
              </div>

              <button
                onClick={() => navigate('/applications')}
                className="text-xs text-primary hover:underline font-medium"
              >
                전체 보기
              </button>
            </div>
          </section>

          {/* ===== 일괄 지원서 생성 ===== */}
          <section className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800/30 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Icon name="auto_awesome" className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark">AI 일괄 지원서 생성</h3>
                  {appStats.eligibleCount > 0 ? (
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        적합도 70%+ 공고: <span className="font-bold text-green-600">{appStats.eligibleCount}건</span>
                        {' / '}지원서 작성: <span className="font-bold text-blue-600">{appStats.eligibleWithApp}건</span>
                        {' / '}미작성: <span className="font-bold text-orange-600">{appStats.eligibleWithoutApp}건</span>
                      </p>
                      {appStats.eligibleWithoutApp > 3 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">API 제한으로 적합도 상위 3건씩 생성됩니다</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      적합도 70%+ 공고가 없습니다. 설정 &gt; 공고 데이터에서 동기화를 먼저 실행하세요.
                    </p>
                  )}
                </div>
              </div>
              {appStats.eligibleWithoutApp > 0 && (
                <button
                  onClick={handleBatchGenerate}
                  disabled={batchGenerating}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Icon name={batchGenerating ? 'hourglass_top' : 'bolt'} className="w-3.5 h-3.5" />
                  {batchGenerating ? '생성 중...' : `상위 ${Math.min(appStats.eligibleWithoutApp, 3)}건 생성`}
                </button>
              )}
            </div>

            {batchGenerating && batchProgress && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-green-700 dark:text-green-400 mb-1">
                  <span>{batchProgress.stage}</span>
                  <span className="font-mono">{batchProgress.current}/{batchProgress.total} ({batchProgress.percent}%)</span>
                </div>
                <div className="w-full bg-green-200 dark:bg-green-900/50 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${batchProgress.percent}%` }}
                  />
                </div>
                {batchProgress.programName && (
                  <p className="text-[10px] text-gray-500 mt-1 truncate">{batchProgress.programName}</p>
                )}
              </div>
            )}

            {batchResult && (
              <p className={`mt-2 text-xs ${batchResult.includes('실패') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                {batchResult}
              </p>
            )}
          </section>

        </div>
      </main>
    </div>
  );
};

export default Dashboard;

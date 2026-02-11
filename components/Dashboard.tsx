
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { vaultService, VaultProgram, VaultApplication } from '../services/vaultService';
import { getStoredCompany } from '../services/storageService';
import { Company } from '../types';
import Header from './Header';

// --- Helper Functions ---

const formatKRW = (amount: number): string => {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억원`;
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(0)}천만원`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(0)}만원`;
  return `${amount.toLocaleString()}원`;
};

const getDday = (endDate: string): { label: string; color: string; days: number } => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { label: '마감', color: 'text-gray-400', days: diff };
  if (diff === 0) return { label: 'D-Day', color: 'text-red-600', days: 0 };
  if (diff <= 7) return { label: `D-${diff}`, color: 'text-red-500', days: diff };
  return { label: `D-${diff}`, color: 'text-blue-600', days: diff };
};

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
  const [company, setCompany] = useState<Company>(getStoredCompany());
  const [programs, setPrograms] = useState<VaultProgram[]>([]);
  const [myApplications, setMyApplications] = useState<VaultApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [progs, apps, companyResult] = await Promise.allSettled([
        vaultService.getPrograms(),
        vaultService.getApplications(),
        vaultService.getCompany(),
      ]);

      if (progs.status === 'fulfilled') {
        setPrograms(progs.value);
      }
      if (apps.status === 'fulfilled') {
        setMyApplications(apps.value);
      }
      if (companyResult.status === 'fulfilled' && companyResult.value.company) {
        const c = companyResult.value.company;
        setCompany(prev => ({
          ...prev,
          name: (c.name as string) || prev.name,
          industry: (c.industry as string) || prev.industry,
          employees: (c.employees as number) || prev.employees,
          address: (c.address as string) || prev.address,
          revenue: (c.revenue as number) || prev.revenue,
          description: (c.description as string) || prev.description,
          businessNumber: (c.businessNumber as string) || prev.businessNumber,
          isVerified: prev.isVerified,
        }));
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
    const totalGrant = eligiblePrograms.reduce((sum, p) => sum + (p.expectedGrant || 0), 0);
    const analyzedPrograms = activePrograms.filter(p => p.fitScore > 0);
    const avgFit = analyzedPrograms.length > 0
      ? Math.round(analyzedPrograms.reduce((sum, p) => sum + p.fitScore, 0) / analyzedPrograms.length)
      : 0;
    const recommendedCount = activePrograms.filter(p => p.fitScore >= 60).length;

    return {
      totalPrograms: activePrograms.length,
      totalGrant,
      avgFit,
      analyzedCount: analyzedPrograms.length,
      recommendedCount,
    };
  }, [activePrograms]);

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

  const appStats = useMemo(() => ({
    draft: myApplications.filter(a => a.status === 'draft').length,
    edited: myApplications.filter(a => a.status === 'edited').length,
    total: myApplications.length,
  }), [myApplications]);

  const maxTypeCount = useMemo(() => {
    if (typeDistribution.length === 0) return 1;
    return typeDistribution[0][1];
  }, [typeDistribution]);

  const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`} />
  );

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <Header title="대시보드" />

      <main className="flex-1 overflow-y-auto">
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} className="h-20 bg-gray-700/50" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">볼트 내 공고</p>
                  <p className="text-white text-3xl font-bold">{heroStats.totalPrograms}<span className="text-sm text-gray-400 ml-1">건</span></p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">총 수령 가능 금액</p>
                  <p className="text-emerald-400 text-3xl font-bold">{formatKRW(heroStats.totalGrant)}</p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">평균 적합도</p>
                  <p className="text-blue-400 text-3xl font-bold">{heroStats.avgFit}<span className="text-sm text-gray-400 ml-1">%</span></p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400 text-xs font-medium mb-1">추천 공고</p>
                  <p className="text-purple-400 text-3xl font-bold">{heroStats.recommendedCount}<span className="text-sm text-gray-400 ml-1">건</span></p>
                </div>
              </div>
            )}
          </section>

          {/* ===== 나의 관심 분야 (3개 공고 + 더 보기 토글) ===== */}
          <section>
            <h3 className="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-4 flex items-center">
              <span className="material-icons-outlined text-primary mr-2">interests</span>
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
                            <span className="material-icons-outlined text-2xl mr-2 opacity-90">{area.icon}</span>
                            <h4 className="font-bold text-sm">{area.title}</h4>
                          </div>
                          <span className="text-2xl font-bold">{area.matchCount}</span>
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-white/80">
                          <span>{formatKRW(area.totalGrant)}</span>
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
                              onClick={() => navigate(`/editor/${prog.slug}`)}
                              className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer hover:shadow-sm transition-all ${area.bgLight} ${area.bgDark}`}
                            >
                              <div className="flex-1 min-w-0 mr-2">
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{prog.programName}</p>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">{prog.organizer} · {formatKRW(prog.expectedGrant)}</p>
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
                <span className="material-icons-outlined text-indigo-500 mr-2 text-base">bar_chart</span>
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
                <span className="material-icons-outlined text-red-500 mr-2 text-base">schedule</span>
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
                        onClick={() => p.slug && navigate(`/editor/${p.slug}`)}
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

          {/* ===== 내 지원 현황 (Compact Bar) ===== */}
          <section className="bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark flex items-center">
                <span className="material-icons-outlined text-primary mr-2 text-base">assignment</span>
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

        </div>
      </main>
    </div>
  );
};

export default Dashboard;

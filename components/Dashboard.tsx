
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { vaultService, VaultProgram, VaultApplication } from '../services/vaultService';
import { getStoredCompany } from '../services/storageService';
import { Company } from '../types';
import type { SSEProgressEvent } from '../services/sseClient';
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

  // Vault control states
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');
  const [analyzeResult, setAnalyzeResult] = useState<string>('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState<SSEProgressEvent | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<SSEProgressEvent | null>(null);
  const syncAbortRef = useRef<(() => void) | null>(null);
  const analyzeAbortRef = useRef<(() => void) | null>(null);

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
        // 마지막 동기화 시각 추출
        const latestSync = progs.value.reduce((latest: string, p: VaultProgram) => {
          return p.syncedAt > latest ? p.syncedAt : latest;
        }, '');
        if (latestSync) setLastSyncedAt(latestSync);
      }
      if (apps.status === 'fulfilled') {
        setMyApplications(apps.value);
      }
      // Vault의 기업 정보를 우선 사용
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

  // --- Vault Actions ---

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult('');
    setSyncProgress(null);
    try {
      const { promise, abort } = vaultService.syncProgramsWithProgress(
        false,
        (event) => setSyncProgress(event)
      );
      syncAbortRef.current = abort;
      const result = await promise;
      setSyncResult(`${result.totalFetched}건 수집 (신규 ${result.created}, 갱신 ${result.updated})`);
      setLastSyncedAt(result.syncedAt);
      await loadData();
    } catch (e) {
      setSyncResult('동기화 실패: ' + String(e));
    }
    setIsSyncing(false);
    setSyncProgress(null);
    syncAbortRef.current = null;
  };

  const handleAnalyzeAll = async () => {
    setIsAnalyzing(true);
    setAnalyzeResult('');
    setAnalyzeProgress(null);
    try {
      const { promise, abort } = vaultService.analyzeAllWithProgress(
        (event) => setAnalyzeProgress(event)
      );
      analyzeAbortRef.current = abort;
      const result = await promise;
      setAnalyzeResult(`${result.analyzed}건 분석 완료 (오류 ${result.errors}건)`);
      await loadData();
    } catch (e) {
      setAnalyzeResult('분석 실패: ' + String(e));
    }
    setIsAnalyzing(false);
    setAnalyzeProgress(null);
    analyzeAbortRef.current = null;
  };

  // --- Derived Data (Memoized) ---

  const activePrograms = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return programs.filter(p => {
      const end = new Date(p.officialEndDate);
      return end >= today;
    });
  }, [programs]);

  const heroStats = useMemo(() => {
    const totalGrant = activePrograms.reduce((sum, p) => sum + (p.expectedGrant || 0), 0);
    const avgFit = activePrograms.length > 0
      ? Math.round(activePrograms.reduce((sum, p) => sum + (p.fitScore || 0), 0) / activePrograms.length)
      : 0;
    const analyzedCount = activePrograms.filter(p => p.status === 'analyzed' || (p.fitScore && p.fitScore > 0)).length;

    return {
      totalPrograms: activePrograms.length,
      totalGrant,
      avgFit,
      analyzedCount,
    };
  }, [activePrograms]);

  const focusData = useMemo(() => {
    return FOCUS_AREAS.map(area => {
      const matched = activePrograms.filter(p => matchProgramToFocus(p, area.keywords));
      const totalGrant = matched.reduce((sum, p) => sum + (p.expectedGrant || 0), 0);
      const best = [...matched].sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))[0];

      let nearestDeadline: { label: string; days: number } | null = null;
      if (matched.length > 0) {
        const sortedByDate = [...matched].sort(
          (a, b) => new Date(a.officialEndDate).getTime() - new Date(b.officialEndDate).getTime()
        );
        const dd = getDday(sortedByDate[0].officialEndDate);
        nearestDeadline = { label: dd.label, days: dd.days };
      }

      return { ...area, matchCount: matched.length, totalGrant, bestProgram: best, nearestDeadline };
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

  // --- Skeleton Loader ---
  const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`} />
  );

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <Header title="대시보드" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6 p-6 md:p-8">

          {/* ===== Section 0: Vault Control Panel ===== */}
          <section className="bg-white dark:bg-surface-dark rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-text-main-light dark:text-text-main-dark flex items-center">
                <span className="material-icons-outlined text-indigo-500 mr-2 text-base">storage</span>
                Obsidian Vault 관리
              </h3>
              {lastSyncedAt && (
                <span className="text-[10px] text-gray-400">
                  마지막 동기화: {new Date(lastSyncedAt).toLocaleString('ko-KR')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <span className={`material-icons-outlined text-base mr-2 ${isSyncing ? 'animate-spin' : ''}`}>
                  {isSyncing ? 'autorenew' : 'cloud_download'}
                </span>
                {isSyncing ? '동기화 중...' : '공고 동기화'}
              </button>

              <button
                onClick={handleAnalyzeAll}
                disabled={isAnalyzing || programs.length === 0}
                className="flex items-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <span className={`material-icons-outlined text-base mr-2 ${isAnalyzing ? 'animate-spin' : ''}`}>
                  {isAnalyzing ? 'autorenew' : 'psychology'}
                </span>
                {isAnalyzing ? '분석 중...' : '전체 분석 실행'}
              </button>

              <button
                onClick={() => navigate('/settings')}
                className="flex items-center px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
              >
                <span className="material-icons-outlined text-base mr-2">business</span>
                기업 정보
              </button>
            </div>

            {/* SSE 진행률 */}
            {(syncProgress || analyzeProgress) && (
              <div className="mt-3 space-y-2">
                {syncProgress && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 mb-1">
                      <span>{syncProgress.stage}</span>
                      <span className="font-mono">{syncProgress.current}/{syncProgress.total} ({syncProgress.percent}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${syncProgress.percent}%` }} />
                    </div>
                    {syncProgress.programName && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{syncProgress.programName}</p>}
                  </div>
                )}
                {analyzeProgress && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 mb-1">
                      <span>{analyzeProgress.stage}</span>
                      <span className="font-mono">{analyzeProgress.current}/{analyzeProgress.total} ({analyzeProgress.percent}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${analyzeProgress.percent}%` }} />
                    </div>
                    {analyzeProgress.programName && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{analyzeProgress.programName}</p>}
                  </div>
                )}
              </div>
            )}

            {(syncResult || analyzeResult) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {syncResult && (
                  <span className="text-xs px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400">
                    {syncResult}
                  </span>
                )}
                {analyzeResult && (
                  <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                    {analyzeResult}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* ===== Section 1: Hero Summary Bar ===== */}
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
                  <p className="text-gray-400 text-xs font-medium mb-1">분석 완료</p>
                  <p className="text-purple-400 text-3xl font-bold">{heroStats.analyzedCount}<span className="text-sm text-gray-400 ml-1">건</span></p>
                </div>
              </div>
            )}
          </section>

          {/* ===== Section 2: 나의 관심 분야 ===== */}
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
                {focusData.map(area => (
                  <div key={area.id} className="relative overflow-hidden rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark shadow-sm hover:shadow-md transition-shadow">
                    <div className={`bg-gradient-to-r ${area.gradientFrom} ${area.gradientTo} p-4 text-white`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="material-icons-outlined text-2xl mr-2 opacity-90">{area.icon}</span>
                          <h4 className="font-bold text-sm">{area.title}</h4>
                        </div>
                        <span className="text-2xl font-bold">{area.matchCount}</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-gray-400">총 수령 가능</span>
                        <span className={`font-bold ${area.textColor}`}>{formatKRW(area.totalGrant)}</span>
                      </div>
                      {area.bestProgram ? (
                        <div
                          onClick={() => area.bestProgram?.slug && navigate(`/editor/${area.bestProgram.slug}`)}
                          className={`${area.bgLight} ${area.bgDark} rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow`}
                        >
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase mb-1">최적합 프로그램</p>
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{area.bestProgram.programName}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">적합도 {area.bestProgram.fitScore}%</p>
                            <span className="text-[10px] text-indigo-500 hover:underline">지원서 작성</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400">매칭 프로그램 없음</p>
                        </div>
                      )}
                      {area.nearestDeadline && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500 dark:text-gray-400">가장 빠른 마감</span>
                          <span className={`font-bold ${area.nearestDeadline.days <= 7 ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>
                            {area.nearestDeadline.label}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ===== Section 3 & 4: 2-Column Layout ===== */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: 공고 유형 분포 */}
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

            {/* Right: 마감 임박 타임라인 */}
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

          {/* ===== Section 5: 빠른 실행 ===== */}
          <section>
            <h3 className="text-lg font-bold text-text-main-light dark:text-text-main-dark mb-4 flex items-center">
              <span className="material-icons-outlined text-primary mr-2">bolt</span>
              빠른 실행
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/explore')}
                className="group flex items-center p-5 bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/40 transition-colors flex-shrink-0">
                  <span className="material-icons-outlined text-2xl">travel_explore</span>
                </div>
                <div className="ml-4 text-left">
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200">공고 탐색</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">적합 공고 탐색 및 지원서 작성</p>
                </div>
                <span className="material-icons-outlined text-gray-300 dark:text-gray-600 ml-auto group-hover:text-purple-400 transition-colors">arrow_forward</span>
              </button>

              <button
                onClick={() => navigate('/applications')}
                className="group flex items-center p-5 bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors flex-shrink-0">
                  <span className="material-icons-outlined text-2xl">folder_shared</span>
                </div>
                <div className="ml-4 text-left">
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200">나의 프로젝트</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">지원 사업 탐색 및 프로젝트 관리</p>
                </div>
                <span className="material-icons-outlined text-gray-300 dark:text-gray-600 ml-auto group-hover:text-indigo-400 transition-colors">arrow_forward</span>
              </button>

              <button
                onClick={() => navigate('/settings')}
                className="group flex items-center p-5 bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/40 transition-colors flex-shrink-0">
                  <span className="material-icons-outlined text-2xl">settings</span>
                </div>
                <div className="ml-4 text-left">
                  <p className="font-bold text-sm text-gray-800 dark:text-gray-200">환경 설정</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">기업 정보 및 API 설정</p>
                </div>
                <span className="material-icons-outlined text-gray-300 dark:text-gray-600 ml-auto group-hover:text-emerald-400 transition-colors">arrow_forward</span>
              </button>
            </div>
          </section>

          {/* ===== Section 6: 내 지원 현황 (Compact Bar) ===== */}
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

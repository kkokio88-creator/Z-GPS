import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { vaultService, VaultProgramDetail, FitDimensions } from '../services/vaultService';
import {
  getStoredApplications,
  saveStoredApplication,
} from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { Application } from '../types';
import Header from './Header';

/** HTML 태그 제거 */
const stripHtml = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

/** 비금전적 지원 감지 */
const isNonMonetary = (text: string): boolean =>
  /무료|무상|컨설팅|멘토링|교육|입주\s*지원|네트워킹|판로|홍보|인증/.test(text);

/** 금액 표시 */
const formatGrant = (grant: number, supportScale?: string, supportType?: string): string => {
  if (grant > 0) {
    const billions = grant / 100000000;
    if (billions >= 1) return `${billions.toFixed(1)}억원`;
    const tenThousands = grant / 10000;
    if (tenThousands >= 1) return `${Math.round(tenThousands)}만원`;
    return `${grant.toLocaleString()}원`;
  }
  const combined = `${supportScale || ''} ${supportType || ''}`;
  if (isNonMonetary(combined)) return '비금전 지원';
  if (supportScale) {
    const clean = stripHtml(supportScale);
    if (clean.length > 0 && !/^(별도|공고|추후|미정|해당|없음|-)/i.test(clean.trim())) {
      return clean;
    }
  }
  return '미확정';
};

/** 적합도 등급 + 색상 */
const getFitGrade = (score: number) => {
  if (score >= 90) return { label: '강력추천', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', bar: 'bg-amber-500', icon: 'star' };
  if (score >= 80) return { label: '추천', color: 'text-green-600', bg: 'bg-green-50 border-green-200', bar: 'bg-green-500', icon: 'thumb_up' };
  if (score >= 60) return { label: '검토 가능', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', bar: 'bg-blue-500', icon: 'visibility' };
  if (score > 0) return { label: '낮은 적합도', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', bar: 'bg-gray-400', icon: 'remove_circle_outline' };
  return { label: '미분석', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', bar: 'bg-gray-300', icon: 'help_outline' };
};

type TabId = 'overview' | 'analysis' | 'strategy' | 'details';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: '개요', icon: 'dashboard' },
  { id: 'analysis', label: 'AI 분석', icon: 'analytics' },
  { id: 'strategy', label: '전략', icon: 'auto_awesome' },
  { id: 'details', label: '상세정보', icon: 'description' },
];

/** 간이 마크다운 렌더러 */
const renderMarkdown = (text: string): React.ReactNode => {
  if (!text) return null;
  try {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 빈 줄 → 스킵
      if (line.trim() === '') { i++; continue; }

      // ## 제목
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={key++} className="text-base font-bold text-gray-800 dark:text-gray-100 mt-5 mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">
            {applyInlineStyles(line.slice(3))}
          </h2>
        );
        i++; continue;
      }

      // ### 소제목
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={key++} className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-4 mb-1.5">
            {applyInlineStyles(line.slice(4))}
          </h3>
        );
        i++; continue;
      }

      // > 인용
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <blockquote key={key++} className="border-l-3 border-indigo-400 pl-3 py-1 my-2 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-r-lg text-sm text-gray-600 dark:text-gray-300 italic">
            {quoteLines.map((q, qi) => <p key={qi}>{applyInlineStyles(q)}</p>)}
          </blockquote>
        );
        continue;
      }

      // - 비순서 리스트
      if (/^[-*]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ''));
          i++;
        }
        elements.push(
          <ul key={key++} className="space-y-1 my-2 ml-1">
            {items.map((item, ii) => (
              <li key={ii} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
                <span>{applyInlineStyles(item)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // 1. 순서 리스트
      if (/^\d+[.)]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+[.)]\s+/, ''));
          i++;
        }
        elements.push(
          <ol key={key++} className="space-y-1.5 my-2 ml-1">
            {items.map((item, ii) => (
              <li key={ii} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {ii + 1}
                </span>
                <span>{applyInlineStyles(item)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // 일반 단락
      elements.push(
        <p key={key++} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed my-1.5">
          {applyInlineStyles(line)}
        </p>
      );
      i++;
    }

    return <>{elements}</>;
  } catch {
    // fallback
    return <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{text}</div>;
  }
};

/** 인라인 스타일 처리 (**bold**) */
const applyInlineStyles = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-800 dark:text-gray-100">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

const ProgramDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<VaultProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<{ content: string } | null>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // 공고 데이터 로드
  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      try {
        const result = await vaultService.getProgram(slug);
        setData(result);
      } catch (e) {
        setError('공고 정보를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const fm = data?.frontmatter ?? ({} as Record<string, unknown>);
  const fitScore = Number(fm.fitScore) || 0;
  const dims = fm.dimensions as FitDimensions | undefined;
  const grade = getFitGrade(fitScore);

  // 전략 자동 로드
  useEffect(() => {
    if (!slug || fitScore <= 0) return;
    (async () => {
      setLoadingStrategy(true);
      try {
        let s = await vaultService.getStrategy(slug);
        if (!s && fitScore >= 60) {
          await vaultService.generateStrategy(slug);
          s = await vaultService.getStrategy(slug);
        }
        if (s) setStrategy({ content: s.content });
      } catch { /* ignore */ }
      setLoadingStrategy(false);
    })();
  }, [slug, fitScore]);

  const handleCreateApplication = () => {
    if (!slug) return;
    const company = useCompanyStore.getState().company;
    const myApplications = getStoredApplications();
    const existing = myApplications.find(a => a.programId === slug);

    if (existing) {
      navigate(`/editor/${slug}/${company?.id || 'default'}`);
      return;
    }

    const newApp: Application = {
      id: `app_${Date.now()}`,
      programId: slug,
      programSnapshot: {
        name: String(fm.programName || ''),
        organizer: String(fm.organizer || ''),
        endDate: String(fm.officialEndDate || ''),
        grantAmount: Number(fm.expectedGrant) || 0,
        type: String(fm.supportType || ''),
        description: String(fm.fullDescription || ''),
        requiredDocuments: (fm.requiredDocuments as string[]) || [],
        detailUrl: String(fm.detailUrl || ''),
      },
      companyId: company?.id || 'default',
      status: '작성 전',
      draftSections: { section1: '', section2: '', section3: '', section4: '', section5: '', section6: '' },
      documentStatus: {},
      updatedAt: new Date().toISOString(),
      isCalendarSynced: false,
    };
    saveStoredApplication(newApp);
    navigate(`/editor/${slug}/${company?.id || 'default'}`);
  };

  const dimEntries: { label: string; key: keyof FitDimensions; weight: string }[] = [
    { label: '자격요건 부합도', key: 'eligibilityMatch', weight: '35%' },
    { label: '업종/기술 관련성', key: 'industryRelevance', weight: '25%' },
    { label: '규모 적합성', key: 'scaleFit', weight: '15%' },
    { label: '경쟁력/선정가능성', key: 'competitiveness', weight: '15%' },
    { label: '전략적 부합도', key: 'strategicAlignment', weight: '10%' },
  ];

  const eligibilityDetails = fm.eligibilityDetails as { met?: string[]; unmet?: string[]; unclear?: string[] } | undefined;
  const strengths = (fm.strengths as string[]) || [];
  const weaknesses = (fm.weaknesses as string[]) || [];
  const keyActions = (fm.keyActions as string[]) || [];
  const advice = String(fm.advice || '');
  const recommendedStrategy = String(fm.recommendedStrategy || '');
  const preScreenReason = String(fm.preScreenReason || '');
  const enrichmentPhase = Number(fm.enrichmentPhase) || 0;

  // 전략 상태 텍스트
  const strategyStatus = useMemo(() => {
    if (loadingStrategy) return '생성 중';
    if (strategy) return '완료';
    if (fitScore >= 60) return '대기';
    return '미분석';
  }, [strategy, loadingStrategy, fitScore]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="material-icons-outlined text-4xl text-gray-300 animate-spin" aria-hidden="true">autorenew</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <span className="material-icons-outlined text-5xl text-gray-300" aria-hidden="true">error_outline</span>
        <p className="text-gray-500">{error || '데이터 없음'}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">뒤로가기</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title="공고 분석" />

      <div className="flex-1 overflow-y-auto pb-20">
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">

          {/* 뒤로가기 */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <span className="material-icons-outlined text-sm" aria-hidden="true">arrow_back</span>
            목록으로
          </button>

          {/* ─── Executive Summary Card ─── */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            {/* 태그 행 */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg font-medium">
                {String(fm.supportType || '정부지원')}
              </span>
              {fitScore > 0 && (
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${grade.bg} ${grade.color} border flex items-center gap-1`}>
                  <span className="material-icons-outlined" style={{ fontSize: '12px' }} aria-hidden="true">{grade.icon}</span>
                  {grade.label}
                </span>
              )}
              {enrichmentPhase === 99 && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                  사전심사 탈락
                </span>
              )}
            </div>

            {/* 제목 + 점수 */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-1 break-words">
                  {String(fm.programName || '')}
                </h1>
                <p className="text-sm text-gray-500">{String(fm.organizer || '')}{fm.department ? ` / ${fm.department}` : ''}</p>
              </div>
              {fitScore > 0 && (
                <div className="text-center flex-shrink-0">
                  <div className={`text-4xl font-bold ${grade.color}`}>{fitScore}</div>
                  <div className="text-xs text-gray-400">적합도</div>
                </div>
              )}
            </div>

            {/* 핵심 수치 4열 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">지원금</p>
                <p className="text-sm font-bold text-primary dark:text-green-400">
                  {formatGrant(Number(fm.expectedGrant) || 0, fm.supportScale as string, fm.supportType as string)}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">마감일</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  {fm.officialEndDate ? new Date(String(fm.officialEndDate)).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '미정'}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">데이터 품질</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  {enrichmentPhase >= 3 ? '상세' : enrichmentPhase >= 2 ? '기본' : '최소'}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">전략 상태</p>
                <p className={`text-sm font-bold ${strategy ? 'text-amber-600' : loadingStrategy ? 'text-blue-500' : 'text-gray-400'}`}>
                  {loadingStrategy && <span className="material-icons-outlined animate-spin text-xs mr-0.5" style={{ fontSize: '12px' }} aria-hidden="true">autorenew</span>}
                  {strategyStatus}
                </p>
              </div>
            </div>
          </div>

          {/* ─── 사전심사 탈락 사유 ─── */}
          {enrichmentPhase === 99 && preScreenReason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                <span className="material-icons-outlined text-sm" aria-hidden="true">info</span>
                사전심사 탈락 사유
              </h3>
              <p className="text-sm text-red-600 dark:text-red-300">{preScreenReason}</p>
            </div>
          )}

          {/* ─── Tab Bar ─── */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-1 flex">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className="material-icons-outlined" style={{ fontSize: '16px' }} aria-hidden="true">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ─── Tab Content ─── */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">

            {/* ── 개요 탭 ── */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* 적합도 미니 바 (축약) */}
                {fitScore > 0 && dims && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <span className="material-icons-outlined" style={{ fontSize: '14px' }} aria-hidden="true">analytics</span>
                      적합도 요약
                    </h3>
                    <div className="grid grid-cols-5 gap-2">
                      {dimEntries.map(d => {
                        const val = dims[d.key] || 0;
                        return (
                          <div key={d.key} className="text-center">
                            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-1">
                              <div
                                className={`h-1.5 rounded-full ${val >= 80 ? 'bg-green-500' : val >= 60 ? 'bg-amber-500' : 'bg-gray-400'}`}
                                style={{ width: `${val}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-gray-500 truncate">{d.label.replace(/ .*/, '')}</p>
                            <p className={`text-xs font-bold ${val >= 80 ? 'text-green-600' : val >= 60 ? 'text-amber-600' : 'text-gray-500'}`}>{val}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 핵심 액션 TOP 3 */}
                {keyActions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <span className="material-icons-outlined" style={{ fontSize: '14px' }} aria-hidden="true">task_alt</span>
                      핵심 액션
                    </h3>
                    <ol className="space-y-2">
                      {keyActions.slice(0, 3).map((action, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* 전략 조언 + 추천 전략 callout */}
                {(advice || recommendedStrategy) && (
                  <div className="space-y-2">
                    {advice && (
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="material-icons-outlined text-indigo-500" style={{ fontSize: '14px' }} aria-hidden="true">tips_and_updates</span>
                          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">전략 조언</p>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{advice}</p>
                      </div>
                    )}
                    {recommendedStrategy && (
                      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="material-icons-outlined text-purple-500" style={{ fontSize: '14px' }} aria-hidden="true">psychology</span>
                          <p className="text-xs font-bold text-purple-600 dark:text-purple-400">추천 전략</p>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{recommendedStrategy}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 자격요건 체크 (칩 형태) */}
                {eligibilityDetails && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <span className="material-icons-outlined" style={{ fontSize: '14px' }} aria-hidden="true">checklist</span>
                      자격요건 체크
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {eligibilityDetails.met?.map((item, i) => (
                        <span key={`met-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                          <span style={{ fontSize: '10px' }}>✓</span> {item}
                        </span>
                      ))}
                      {eligibilityDetails.unmet?.map((item, i) => (
                        <span key={`unmet-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                          <span style={{ fontSize: '10px' }}>✗</span> {item}
                        </span>
                      ))}
                      {eligibilityDetails.unclear?.map((item, i) => (
                        <span key={`unclear-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <span style={{ fontSize: '10px' }}>?</span> {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 미분석 안내 */}
                {fitScore === 0 && (
                  <div className="text-center py-8">
                    <span className="material-icons-outlined text-4xl text-gray-300 mb-2" aria-hidden="true">pending</span>
                    <p className="text-sm text-gray-500">아직 AI 분석이 수행되지 않았습니다.</p>
                    <p className="text-xs text-gray-400 mt-1">설정에서 전체 동기화를 실행하면 분석이 시작됩니다.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── AI 분석 탭 ── */}
            {activeTab === 'analysis' && (
              <div className="space-y-5">
                {fitScore > 0 && dims ? (
                  <>
                    {/* 5차원 바 차트 (풀 버전) */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-1">
                        <span className="material-icons-outlined" style={{ fontSize: '14px' }} aria-hidden="true">bar_chart</span>
                        5차원 적합도 분석
                      </h3>
                      <div className="space-y-3">
                        {dimEntries.map(d => {
                          const val = dims[d.key] || 0;
                          return (
                            <div key={d.key}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600 dark:text-gray-400">
                                  {d.label} <span className="text-gray-400 text-xs">({d.weight})</span>
                                </span>
                                <span className={`font-bold ${val >= 80 ? 'text-green-600' : val >= 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                                  {val}
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                                <div
                                  className={`h-2.5 rounded-full transition-all ${val >= 80 ? 'bg-green-500' : val >= 60 ? 'bg-amber-500' : 'bg-gray-400'}`}
                                  style={{ width: `${val}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 자격요건 상세 (3컬럼) */}
                    {eligibilityDetails && (
                      <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">자격요건 상세</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {eligibilityDetails.met && eligibilityDetails.met.length > 0 && (
                            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                              <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-2">충족</p>
                              <ul className="space-y-1">
                                {eligibilityDetails.met.map((item, i) => (
                                  <li key={i} className="text-xs text-green-600 dark:text-green-300 flex items-start gap-1">
                                    <span className="mt-0.5 flex-shrink-0">✓</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {eligibilityDetails.unmet && eligibilityDetails.unmet.length > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                              <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-2">미충족</p>
                              <ul className="space-y-1">
                                {eligibilityDetails.unmet.map((item, i) => (
                                  <li key={i} className="text-xs text-red-600 dark:text-red-300 flex items-start gap-1">
                                    <span className="mt-0.5 flex-shrink-0">✗</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {eligibilityDetails.unclear && eligibilityDetails.unclear.length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2">확인 필요</p>
                              <ul className="space-y-1">
                                {eligibilityDetails.unclear.map((item, i) => (
                                  <li key={i} className="text-xs text-amber-600 dark:text-amber-300 flex items-start gap-1">
                                    <span className="mt-0.5 flex-shrink-0">?</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 강점/약점 (2컬럼) */}
                    {(strengths.length > 0 || weaknesses.length > 0) && (
                      <div className="pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {strengths.length > 0 && (
                          <div>
                            <h3 className="text-xs font-bold text-green-600 mb-2 flex items-center gap-1">
                              <span className="material-icons-outlined" style={{ fontSize: '14px' }} aria-hidden="true">trending_up</span>
                              강점
                            </h3>
                            <ul className="space-y-1.5">
                              {strengths.map((s, i) => (
                                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                                  <span className="text-green-500 mt-0.5 flex-shrink-0">▸</span>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {weaknesses.length > 0 && (
                          <div>
                            <h3 className="text-xs font-bold text-red-500 mb-2 flex items-center gap-1">
                              <span className="material-icons-outlined" style={{ fontSize: '14px' }} aria-hidden="true">trending_down</span>
                              약점
                            </h3>
                            <ul className="space-y-1.5">
                              {weaknesses.map((w, i) => (
                                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                                  <span className="text-red-400 mt-0.5 flex-shrink-0">▸</span>
                                  <span>{w}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 핵심 액션 전체 */}
                    {keyActions.length > 0 && (
                      <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">핵심 액션</h3>
                        <ol className="space-y-2">
                          {keyActions.map((action, i) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {i + 1}
                              </span>
                              <span>{action}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <span className="material-icons-outlined text-4xl text-gray-300 mb-2" aria-hidden="true">analytics</span>
                    <p className="text-sm text-gray-500">AI 분석 데이터가 없습니다.</p>
                    <p className="text-xs text-gray-400 mt-1">설정에서 전체 동기화를 실행하면 분석이 시작됩니다.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── 전략 탭 ── */}
            {activeTab === 'strategy' && (
              <div>
                {loadingStrategy ? (
                  <div className="text-center py-12">
                    <span className="material-icons-outlined text-4xl text-amber-400 animate-spin mb-3" aria-hidden="true">auto_awesome</span>
                    <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">AI 전략 문서 생성 중...</p>
                    <p className="text-xs text-gray-400 mt-1">1~2분 소요될 수 있습니다</p>
                  </div>
                ) : strategy ? (
                  <div className="max-w-none">
                    {renderMarkdown(strategy.content)}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <span className="material-icons-outlined text-4xl text-gray-300 mb-3" aria-hidden="true">auto_awesome</span>
                    {fitScore >= 60 ? (
                      <>
                        <p className="text-sm text-gray-500">전략 문서를 불러오지 못했습니다.</p>
                        <p className="text-xs text-gray-400 mt-1">잠시 후 다시 시도해주세요.</p>
                      </>
                    ) : fitScore > 0 ? (
                      <>
                        <p className="text-sm text-gray-500">적합도 60점 이상인 공고에 대해 전략이 생성됩니다.</p>
                        <p className="text-xs text-gray-400 mt-1">현재 적합도: {fitScore}점</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-500">분석이 완료되면 전략 문서가 생성됩니다.</p>
                        <p className="text-xs text-gray-400 mt-1">설정에서 전체 동기화를 실행해주세요.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 상세정보 탭 ── */}
            {activeTab === 'details' && (
              <div className="space-y-4">
                {/* 지원 대상 */}
                {fm.targetAudience && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 mb-1">지원 대상</h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      {stripHtml(String(fm.targetAudience))}
                    </p>
                  </div>
                )}

                {/* 자격 요건 */}
                {(fm.eligibilityCriteria as string[])?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 mb-1">자격 요건</h3>
                    <ul className="space-y-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      {(fm.eligibilityCriteria as string[]).map((c, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <span className="text-gray-400 mt-0.5">•</span>
                          <span>{stripHtml(c)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 제외 대상 */}
                {(fm.exclusionCriteria as string[])?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-red-500 mb-1">제외 대상</h3>
                    <ul className="space-y-1 bg-red-50 dark:bg-red-900/10 rounded-lg p-3">
                      {(fm.exclusionCriteria as string[]).map((c, i) => (
                        <li key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">✗</span>
                          <span>{stripHtml(c)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 필요 서류 */}
                {(fm.requiredDocuments as string[])?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 mb-1">필요 서류</h3>
                    <ul className="space-y-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      {(fm.requiredDocuments as string[]).map((doc, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <span className="material-icons-outlined text-sm text-gray-400 mt-0.5" aria-hidden="true">article</span>
                          <span>{stripHtml(doc)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 평가 기준 */}
                {(fm.evaluationCriteria as string[])?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 mb-1">평가 기준</h3>
                    <ul className="space-y-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      {(fm.evaluationCriteria as string[]).map((c, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                          <span className="text-indigo-400 mt-0.5">▸</span>
                          <span>{stripHtml(c)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 사업 설명 */}
                {fm.fullDescription && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-500 mb-1">사업 설명</h3>
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 whitespace-pre-line">
                      {stripHtml(String(fm.fullDescription)).slice(0, 2000)}
                    </div>
                  </div>
                )}

                {/* 상세 데이터 없음 */}
                {!fm.targetAudience && !(fm.eligibilityCriteria as string[])?.length && !fm.fullDescription && (
                  <div className="text-center py-8">
                    <span className="material-icons-outlined text-4xl text-gray-300 mb-2" aria-hidden="true">description</span>
                    <p className="text-sm text-gray-500">상세 정보가 아직 수집되지 않았습니다.</p>
                    <p className="text-xs text-gray-400 mt-1">딥크롤링을 실행하면 상세 정보가 추가됩니다.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Sticky Bottom Actions ─── */}
      <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 shadow-lg">
        <div className="max-w-4xl mx-auto flex gap-3">
          {fm.detailUrl && (
            <a
              href={String(fm.detailUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-icons-outlined text-sm" aria-hidden="true">open_in_new</span>
              공고문 원문
            </a>
          )}
          <button
            onClick={handleCreateApplication}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-icons-outlined text-sm" aria-hidden="true">edit_note</span>
            지원서 작성하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgramDetail;

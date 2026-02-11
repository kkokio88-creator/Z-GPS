import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { vaultService, VaultProgramDetail, FitDimensions } from '../services/vaultService';
import {
  getStoredCompany,
  getStoredApplications,
  saveStoredApplication,
} from '../services/storageService';
import { Application } from '../types';
import Header from './Header';

/** HTML 태그 제거 */
const stripHtml = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

/** 금액 표시 */
const formatGrant = (grant: number, supportScale?: string): string => {
  if (grant > 0) {
    const billions = grant / 100000000;
    if (billions >= 1) return `${billions.toFixed(1)}억원`;
    const tenThousands = grant / 10000;
    if (tenThousands >= 1) return `${Math.round(tenThousands)}만원`;
    return `${grant.toLocaleString()}원`;
  }
  if (supportScale) return stripHtml(supportScale);
  return '미정';
};

/** 적합도 등급 + 색상 */
const getFitGrade = (score: number) => {
  if (score >= 90) return { label: '★ 강력추천', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', bar: 'bg-amber-500' };
  if (score >= 80) return { label: '추천', color: 'text-green-600', bg: 'bg-green-50 border-green-200', bar: 'bg-green-500' };
  if (score >= 60) return { label: '검토 가능', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', bar: 'bg-blue-500' };
  if (score > 0) return { label: '낮은 적합도', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', bar: 'bg-gray-400' };
  return { label: '미분석', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', bar: 'bg-gray-300' };
};

const ProgramDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<VaultProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<{ content: string } | null>(null);
  const [loadingStrategy, setLoadingStrategy] = useState(false);

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

  const handleViewStrategy = async () => {
    if (!slug) return;
    setLoadingStrategy(true);
    try {
      let s = await vaultService.getStrategy(slug);
      if (!s) {
        await vaultService.generateStrategy(slug);
        s = await vaultService.getStrategy(slug);
      }
      if (s) setStrategy({ content: s.content });
    } catch { /* ignore */ }
    setLoadingStrategy(false);
  };

  const handleCreateApplication = () => {
    if (!slug) return;
    const company = getStoredCompany();
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="material-icons-outlined text-4xl text-gray-300 animate-spin">autorenew</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <span className="material-icons-outlined text-5xl text-gray-300">error_outline</span>
        <p className="text-gray-500">{error || '데이터 없음'}</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">뒤로가기</button>
      </div>
    );
  }

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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header title="공고 분석" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">

          {/* 뒤로가기 */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <span className="material-icons-outlined text-sm">arrow_back</span>
            목록으로
          </button>

          {/* ─── 헤더: 제목 + 기본정보 ─── */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg font-medium">
                    {String(fm.supportType || '정부지원')}
                  </span>
                  {fitScore > 0 && (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${grade.bg} ${grade.color} border`}>
                      {grade.label}
                    </span>
                  )}
                  {enrichmentPhase === 99 && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200">
                      사전심사 탈락
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
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

            {/* 핵심 수치 */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">지원금</p>
                <p className="text-lg font-bold text-primary dark:text-green-400">
                  {formatGrant(Number(fm.expectedGrant) || 0, fm.supportScale as string)}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">마감일</p>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {fm.officialEndDate ? new Date(String(fm.officialEndDate)).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '미정'}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">데이터 품질</p>
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  {enrichmentPhase >= 3 ? '상세' : enrichmentPhase >= 2 ? '기본' : '최소'}
                </p>
              </div>
            </div>
          </div>

          {/* ─── 사전심사 탈락 사유 ─── */}
          {enrichmentPhase === 99 && preScreenReason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                <span className="material-icons-outlined text-sm">info</span>
                사전심사 탈락 사유
              </h3>
              <p className="text-sm text-red-600 dark:text-red-300">{preScreenReason}</p>
            </div>
          )}

          {/* ─── AI 적합도 분석 (5차원) ─── */}
          {fitScore > 0 && dims && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span className="material-icons-outlined text-lg text-indigo-500">analytics</span>
                AI 적합도 분석
              </h2>

              {/* 5차원 바 차트 */}
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

              {/* 자격요건 상세 */}
              {eligibilityDetails && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">자격요건 체크</h3>
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

              {/* 강점/약점 */}
              {(strengths.length > 0 || weaknesses.length > 0) && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {strengths.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-green-600 mb-2">강점</h3>
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
                      <h3 className="text-xs font-bold text-red-500 mb-2">약점</h3>
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

              {/* 핵심 액션 */}
              {keyActions.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
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

              {/* 전략 조언 */}
              {(advice || recommendedStrategy) && (
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
                  {advice && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 mb-3">
                      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">전략 조언</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{advice}</p>
                    </div>
                  )}
                  {recommendedStrategy && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                      <p className="text-xs font-bold text-purple-600 dark:text-purple-400 mb-1">추천 전략</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{recommendedStrategy}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── 공고 상세 정보 ─── */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
              <span className="material-icons-outlined text-lg text-blue-500">description</span>
              공고 상세 정보
            </h2>

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
                        <span className="material-icons-outlined text-sm text-gray-400 mt-0.5">article</span>
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
            </div>
          </div>

          {/* ─── 전략 문서 ─── */}
          {fitScore >= 80 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span className="material-icons-outlined text-lg text-amber-500">auto_awesome</span>
                AI 전략 문서
              </h2>
              {strategy ? (
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-gray-700 dark:text-gray-300">
                  {strategy.content}
                </div>
              ) : (
                <button
                  onClick={handleViewStrategy}
                  disabled={loadingStrategy}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
                >
                  {loadingStrategy ? (
                    <span className="material-icons-outlined animate-spin text-lg">autorenew</span>
                  ) : (
                    <span className="material-icons-outlined text-lg">auto_awesome</span>
                  )}
                  {loadingStrategy ? '생성 중...' : '전략 문서 생성'}
                </button>
              )}
            </div>
          )}

          {/* ─── 액션 버튼 ─── */}
          <div className="flex gap-3 pb-6">
            {fm.detailUrl && (
              <a
                href={String(fm.detailUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
              >
                <span className="material-icons-outlined text-sm">open_in_new</span>
                공고문 원문
              </a>
            )}
            <button
              onClick={handleCreateApplication}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-icons-outlined text-sm">edit_note</span>
              지원서 작성하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProgramDetail;

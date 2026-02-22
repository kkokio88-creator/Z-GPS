import Icon from './ui/Icon';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { vaultService, VaultProgram } from '../services/vaultService';
import {
  getStoredApplications,
  saveStoredApplication,
  getStoredProgramCategories,
  saveProgramCategory,
  removeProgramCategory
} from '../services/storageService';
import { SupportProgram } from '../types';
import { useCompanyStore } from '../services/stores/companyStore';
import Header from './Header';
import { CategorizedProgram, SwipeCategory, vaultToSupportProgram } from './programs/programUtils';
import ProgramFilters from './programs/ProgramFilters';
import ProgramListView from './programs/ProgramListView';
import ProgramSwipeView from './programs/ProgramSwipeView';
import ProgramDetailPanel from './programs/ProgramDetailPanel';
import { useDragHandler } from './programs/useDragHandler';
import { FIT_SCORE_THRESHOLD } from '../constants';

/** 관심 등록 시 자동 DRAFT 생성 (순수 함수) */
const createDraftIfNeeded = (program: SupportProgram, companyId: string): void => {
  const existing = getStoredApplications();
  if (existing.some(a => a.programId === program.id)) return;
  saveStoredApplication({
    id: `app_${Date.now()}`,
    programId: program.id,
    programSnapshot: {
      name: program.programName, organizer: program.organizer,
      endDate: program.officialEndDate, grantAmount: program.expectedGrant,
      type: program.supportType, description: program.description,
      requiredDocuments: program.requiredDocuments, detailUrl: program.detailUrl
    },
    companyId,
    status: '작성 전',
    draftSections: { section1: '', section2: '', section3: '', section4: '', section5: '', section6: '' },
    documentStatus: {},
    updatedAt: new Date().toISOString(),
    isCalendarSynced: false
  });
};

const ProgramExplorer: React.FC = () => {
  const navigate = useNavigate();
  const company = useCompanyStore(s => s.company);
  const [allPrograms, setAllPrograms] = useState<CategorizedProgram[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedProgram, setSelectedProgram] = useState<CategorizedProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [showHearts, setShowHearts] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const isAnimatingRef = useRef(false);

  // Drag handler hook (initialized after handleSwipe is defined below - forward ref trick)
  const handleSwipeRef = useRef<(dir: 'left' | 'right') => void>(() => {});
  const { cardRef, isDragging, dragOverlay, handlePointerDown, handlePointerMove, handlePointerUp } = useDragHandler({
    onSwipe: (dir) => handleSwipeRef.current(dir),
  });

  const [activeTab, setActiveTab] = useState<'all' | 'recommended' | 'interested' | 'rejected'>('all');
  const [strategyModal, setStrategyModal] = useState<{ slug: string; content: string } | null>(null);
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);
  const [viewMode, setViewMode] = useState<'swipe' | 'list'>('swipe');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [sortBy, setSortBy] = useState<'fitScore' | 'deadline' | 'grant'>('fitScore');
  const [analyzingSlug, setAnalyzingSlug] = useState<string | null>(null);
  const [applicationSlugs, setApplicationSlugs] = useState<Set<string>>(new Set());
  const vaultDataRef = useRef<Map<string, VaultProgram>>(new Map());

  // 프로그램 로드
  const loadPrograms = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [vaultPrograms, vaultApps] = await Promise.all([
        vaultService.getPrograms(),
        vaultService.getApplications().catch(() => []),
      ]);
      setApplicationSlugs(new Set(vaultApps.map(a => a.slug)));
      const vMap = new Map<string, VaultProgram>();
      vaultPrograms.forEach(vp => vMap.set(vp.slug || vp.id, vp));
      vaultDataRef.current = vMap;

      const data = vaultPrograms.map(vaultToSupportProgram);
      const storedCategories = getStoredProgramCategories();
      const categoryMap = new Map(storedCategories.map(c => [c.programId, c.category]));

      const sorted = data
        .sort((a, b) => b.fitScore - a.fitScore)
        .map(p => ({
          ...p,
          category: (categoryMap.get(p.id) || 'none') as SwipeCategory
        }));

      setAllPrograms(sorted);

      if (data.length === 0) {
        setLoadError('공고 데이터가 없습니다. 설정에서 동기화를 실행하세요.');
      }

      const uncategorized = sorted.filter(p => p.category === 'none');
      if (uncategorized.length > 0) {
        setSelectedProgram(uncategorized[0]);
        setCurrentIndex(0);
      } else if (sorted.length > 0) {
        setSelectedProgram(sorted[0]);
      }
    } catch (e) {
      setLoadError('Vault 연결 중 오류가 발생했습니다. 서버가 실행 중인지 확인하세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  const supportTypes = [...new Set(allPrograms.map(p => p.supportType).filter(Boolean))];

  const filteredPrograms = allPrograms
    .filter(p => {
      if (activeTab === 'all') return p.category === 'none';
      if (activeTab === 'recommended') return p.fitScore >= FIT_SCORE_THRESHOLD && p.category === 'none';
      return p.category === activeTab;
    })
    .filter(p => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.programName.toLowerCase().includes(q) ||
          p.organizer.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q));
      }
      return true;
    })
    .filter(p => {
      if (filterType) return p.supportType === filterType;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'fitScore') return b.fitScore - a.fitScore;
      if (sortBy === 'deadline') return new Date(a.officialEndDate).getTime() - new Date(b.officialEndDate).getTime();
      if (sortBy === 'grant') return b.expectedGrant - a.expectedGrant;
      return 0;
    });

  const currentProgram = filteredPrograms[currentIndex] || null;

  useEffect(() => {
    if (currentProgram) {
      setSelectedProgram(currentProgram);
    }
  }, [currentProgram]);

  // 스와이프 처리
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (!currentProgram || isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    setSwipeDirection(direction);
    if (direction === 'right') { setShowHearts(true); setTimeout(() => setShowHearts(false), 1200); }
    else { setShowTrash(true); setTimeout(() => setShowTrash(false), 800); }
    setTimeout(() => {
      const newCategory: SwipeCategory = direction === 'right' ? 'interested' : 'rejected';
      saveProgramCategory(currentProgram.id, newCategory, {
        programName: currentProgram.programName,
        expectedGrant: currentProgram.expectedGrant,
        supportType: currentProgram.supportType
      });
      if (direction === 'right') createDraftIfNeeded(currentProgram, company.id);
      setAllPrograms(prev => prev.map(p => p.id === currentProgram.id ? { ...p, category: newCategory } : p));
      setSwipeDirection(null);
      if (cardRef.current) cardRef.current.style.transform = 'none';
      const nextFiltered = filteredPrograms.filter(p => p.id !== currentProgram.id);
      setCurrentIndex(nextFiltered.length > 0 ? Math.min(currentIndex, nextFiltered.length - 1) : 0);
      setTimeout(() => { isAnimatingRef.current = false; }, 100);
    }, 500);
  }, [currentProgram, currentIndex, filteredPrograms, company.id, cardRef]);

  // Update ref so useDragHandler always calls latest handleSwipe
  useEffect(() => { handleSwipeRef.current = handleSwipe; }, [handleSwipe]);

  const handleRestoreProgram = (programId: string) => {
    removeProgramCategory(programId);
    setAllPrograms(prev => prev.map(p =>
      p.id === programId ? { ...p, category: 'none' } : p
    ));
  };

  const handleCategorizeInList = useCallback((program: CategorizedProgram, direction: 'left' | 'right') => {
    const newCategory: SwipeCategory = direction === 'right' ? 'interested' : 'rejected';
    saveProgramCategory(program.id, newCategory, {
      programName: program.programName,
      expectedGrant: program.expectedGrant,
      supportType: program.supportType
    });
    if (direction === 'right') createDraftIfNeeded(program, company.id);
    setAllPrograms(prev => prev.map(p =>
      p.id === program.id ? { ...p, category: newCategory } : p
    ));
  }, [company.id]);

  const handleReAnalyze = async (e: React.MouseEvent, program: CategorizedProgram) => {
    e.stopPropagation();
    if (analyzingSlug) return;
    setAnalyzingSlug(program.id);
    try {
      const result = await vaultService.analyzeProgram(program.id);
      setAllPrograms(prev => prev.map(p =>
        p.id === program.id
          ? { ...p, fitScore: result.fitScore, eligibilityReason: result.eligibility }
          : p
      ));
    } catch (err) {
      console.error('재분석 실패:', err);
    } finally {
      setAnalyzingSlug(null);
    }
  };

  const handleViewStrategy = async (slug: string) => {
    setIsLoadingStrategy(true);
    try {
      const result = await vaultService.getStrategy(slug);
      if (result) {
        setStrategyModal({ slug, content: result.content });
      } else {
        await vaultService.generateStrategy(slug);
        const retry = await vaultService.getStrategy(slug);
        if (retry) {
          setStrategyModal({ slug, content: retry.content });
        }
      }
    } catch {
      // 무시
    } finally {
      setIsLoadingStrategy(false);
    }
  };

  const stats = {
    total: allPrograms.length,
    remaining: allPrograms.filter(p => p.category === 'none').length,
    recommended: allPrograms.filter(p => p.fitScore >= FIT_SCORE_THRESHOLD && p.category === 'none').length,
    interested: allPrograms.filter(p => p.category === 'interested').length,
    rejected: allPrograms.filter(p => p.category === 'rejected').length
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
        <Header title="공고 탐색" icon="explore" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">📋</div>
            <p className="text-gray-500 font-medium">공고 데이터를 불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <Header title="공고 탐색" icon="explore" />

      <main className="flex-1 overflow-hidden p-4 lg:p-6">
        {/* 에러 알림 */}
        {loadError && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <p className="flex-1 text-sm text-amber-700 dark:text-amber-300">{loadError}</p>
            <button
              onClick={() => loadPrograms()}
              disabled={isLoading}
              className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 상단 통계 + 탭 */}
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto">
              <div className="text-center px-2 flex-shrink-0"><p className="text-lg sm:text-2xl font-bold text-gray-700 dark:text-gray-200">{stats.total}</p><p className="text-[10px] sm:text-xs text-gray-400">전체</p></div>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
              <div className="text-center px-2 flex-shrink-0"><p className="text-lg sm:text-2xl font-bold text-gray-600 dark:text-gray-300">{stats.remaining}</p><p className="text-[10px] sm:text-xs text-gray-400">미분류</p></div>
              <div className="text-center px-2 flex-shrink-0"><p className="text-lg sm:text-2xl font-bold text-amber-500">{stats.recommended}</p><p className="text-[10px] sm:text-xs text-gray-400">추천</p></div>
              <div className="text-center px-2 flex-shrink-0"><p className="text-lg sm:text-2xl font-bold text-primary dark:text-green-400">{stats.interested}</p><p className="text-[10px] sm:text-xs text-gray-400">관심</p></div>
              <div className="text-center px-2 flex-shrink-0"><p className="text-lg sm:text-2xl font-bold text-gray-400">{stats.rejected}</p><p className="text-[10px] sm:text-xs text-gray-400">부적합</p></div>
            </div>
            <button onClick={() => loadPrograms()} disabled={isLoading} className="ml-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0" title="새로고침">
              <span className={`material-icons-outlined text-gray-400 text-xl ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
            </button>
          </div>

          {/* 탭 + 뷰 전환 */}
          <div className="flex items-center gap-2 overflow-x-auto">
            {(['all', 'recommended', 'interested', 'rejected'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setCurrentIndex(0); }}
                className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-shrink-0 ${
                  activeTab === tab
                    ? tab === 'recommended' ? 'bg-amber-500 text-white' : 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {tab === 'all' ? '미분류' : tab === 'recommended' ? `추천 ${stats.recommended}` : tab === 'interested' ? '관심' : '부적합'}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setViewMode(viewMode === 'swipe' ? 'list' : 'swipe')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              title={viewMode === 'swipe' ? '리스트 뷰' : '스와이프 뷰'}
            >
              <Icon name={viewMode === 'swipe' ? 'view_list' : 'swipe'} className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* 검색/필터 바 */}
        <ProgramFilters
          searchQuery={searchQuery}
          filterType={filterType}
          sortBy={sortBy}
          supportTypes={supportTypes}
          onSearchChange={setSearchQuery}
          onFilterTypeChange={setFilterType}
          onSortByChange={setSortBy}
        />

        {/* 메인 컨텐츠 */}
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100%-140px)]">

          {/* 리스트 뷰 */}
          {viewMode === 'list' && (
            <ProgramListView
              programs={filteredPrograms}
              selectedProgramId={selectedProgram?.id ?? null}
              activeTab={activeTab}
              analyzingSlug={analyzingSlug}
              isLoadingStrategy={isLoadingStrategy}
              vaultData={vaultDataRef.current}
              applicationSlugs={applicationSlugs}
              onReAnalyze={handleReAnalyze}
              onCategorize={handleCategorizeInList}
              onViewStrategy={handleViewStrategy}
            />
          )}

          {/* 스와이프 뷰 */}
          {viewMode === 'swipe' && (
            <ProgramSwipeView
              filteredPrograms={filteredPrograms}
              currentProgram={currentProgram}
              currentIndex={currentIndex}
              activeTab={activeTab}
              isDragging={isDragging}
              dragOverlay={dragOverlay}
              swipeDirection={swipeDirection}
              showHearts={showHearts}
              showTrash={showTrash}
              isLoadingStrategy={isLoadingStrategy}
              vaultData={vaultDataRef.current}
              cardRef={cardRef}
              onSwipe={handleSwipe}
              onRestoreProgram={handleRestoreProgram}
              onViewStrategy={handleViewStrategy}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          )}

          {/* 우측: 세부 정보 패널 */}
          <ProgramDetailPanel
            selectedProgram={selectedProgram}
            strategyModal={strategyModal}
            isLoadingStrategy={isLoadingStrategy}
            vaultData={vaultDataRef.current}
            onViewStrategy={handleViewStrategy}
            onCloseStrategy={() => setStrategyModal(null)}
          />
        </div>
      </main>
    </div>
  );
};

export default ProgramExplorer;

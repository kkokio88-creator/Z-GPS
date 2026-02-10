import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { vaultService, VaultProgram, FitDimensions } from '../services/vaultService';
import {
  getStoredCompany,
  getStoredApplications,
  saveStoredApplication,
  getStoredProgramCategories,
  saveProgramCategory,
  removeProgramCategory
} from '../services/storageService';
import { Company, SupportProgram, Application, EligibilityStatus } from '../types';
import Header from './Header';

/** VaultProgram → SupportProgram 변환 */
const vaultToSupportProgram = (vp: VaultProgram): SupportProgram => ({
  id: vp.slug || vp.id,
  organizer: vp.organizer,
  programName: vp.programName,
  supportType: vp.supportType,
  officialEndDate: vp.officialEndDate,
  internalDeadline: vp.internalDeadline || vp.officialEndDate,
  expectedGrant: vp.expectedGrant,
  fitScore: vp.fitScore || 0,
  eligibility: EligibilityStatus.POSSIBLE,
  priorityRank: 0,
  eligibilityReason: vp.eligibility || '',
  requiredDocuments: vp.requiredDocuments || [],
  detailUrl: vp.detailUrl,
  description: vp.fullDescription || '',
});

type SwipeCategory = 'interested' | 'rejected' | 'none';

interface CategorizedProgram extends SupportProgram {
  category: SwipeCategory;
}

// HTML 태그 제거 및 텍스트 정리 함수
const stripHtml = (html: string): string => {
  if (!html) return '';
  let text = html.replace(/<[^>]*>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};

const summarizeText = (text: string, maxLength = 200): string => {
  const cleaned = stripHtml(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
};

// 하트 이모지 파티클 컴포넌트 (최적화: 8개로 축소)
const HeartParticles: React.FC<{ show: boolean }> = React.memo(({ show }) => {
  if (!show) return null;

  const hearts = ['❤️', '💕', '💖', '💗', '💓', '🩷'];

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute text-3xl animate-heart-burst"
          style={{
            left: `${45 + Math.random() * 10}%`,
            top: `${35 + Math.random() * 15}%`,
            animationDelay: `${Math.random() * 0.2}s`,
            '--tx': `${(Math.random() - 0.5) * 250}px`,
            '--ty': `${-80 - Math.random() * 150}px`,
            '--rotate': `${Math.random() * 360}deg`,
            fontSize: `${24 + Math.random() * 16}px`,
          } as React.CSSProperties}
        >
          {hearts[Math.floor(Math.random() * hearts.length)]}
        </div>
      ))}
    </div>
  );
});

// 쓰레기통 애니메이션 컴포넌트
const TrashAnimation: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="animate-trash-appear text-center">
        <div className="text-7xl mb-2">🗑️</div>
        <div className="text-gray-500 font-medium animate-pulse">부적합</div>
      </div>
    </div>
  );
};

/** 마크다운 렌더러 - 전략 문서 모달용 */
const MarkdownRenderer: React.FC<{ content: string }> = React.memo(({ content }) => {
  const processInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.substring(lastIndex, match.index));
      if (match[2]) parts.push(<strong key={key++} className="font-semibold text-gray-800 dark:text-gray-200">{match[2]}</strong>);
      else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>);
      else if (match[4]) parts.push(<code key={key++} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[11px] font-mono">{match[4]}</code>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.substring(lastIndex));
    return parts.length === 0 ? text : <>{parts}</>;
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(<pre key={`code-${i}`} className="bg-gray-900 text-gray-100 rounded-lg p-4 my-3 text-xs overflow-x-auto leading-relaxed"><code>{codeLines.join('\n')}</code></pre>);
      i++; continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++; }
      if (tableLines.length >= 2) {
        const parseRow = (row: string) => row.split('|').slice(1, -1).map(c => c.trim());
        const isSep = (r: string) => /^[\s|:-]+$/.test(r);
        const headers = parseRow(tableLines[0]);
        const dataRows = tableLines.filter((_, idx) => idx > 0 && !isSep(tableLines[idx]));
        elements.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-600">
            <table className="min-w-full text-xs">
              <thead><tr className="bg-gray-100 dark:bg-gray-700">{headers.map((h, j) => <th key={j} className="px-3 py-2 text-left font-semibold border-b border-gray-200 dark:border-gray-600">{processInline(h)}</th>)}</tr></thead>
              <tbody>{dataRows.map((row, r) => <tr key={r} className="even:bg-gray-50 dark:even:bg-gray-800/50">{parseRow(row).map((cell, c) => <td key={c} className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">{processInline(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Headers
    if (line.startsWith('#### ')) { elements.push(<h4 key={i} className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1">{processInline(line.slice(5))}</h4>); i++; continue; }
    if (line.startsWith('### ')) { elements.push(<h3 key={i} className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1.5">{processInline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith('## ')) { elements.push(<h2 key={i} className="text-lg font-bold text-gray-800 dark:text-gray-200 mt-6 mb-2 pb-1.5 border-b border-gray-200 dark:border-gray-700">{processInline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('# ')) { elements.push(<h1 key={i} className="text-xl font-bold text-gray-900 dark:text-white mt-6 mb-3">{processInline(line.slice(2))}</h1>); i++; continue; }

    // Blockquote (consecutive)
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) { quoteLines.push(lines[i].slice(2)); i++; }
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-r-lg pl-4 pr-3 py-2.5 my-3">
          {quoteLines.map((ql, qi) => <p key={qi} className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{processInline(ql)}</p>)}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (line.match(/^[\s]*[-*+] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*+] /)) {
        const c = lines[i].replace(/^[\s]*[-*+] /, '');
        items.push(<li key={i} className="flex items-start gap-2 py-0.5"><span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary" /><span className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{processInline(c)}</span></li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="my-2 space-y-0.5 ml-1">{items}</ul>);
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\. /)) {
        const c = lines[i].replace(/^\s*\d+\.\s*/, '');
        const num = lines[i].match(/^\s*(\d+)\./)?.[1] || '1';
        items.push(<li key={i} className="flex items-start gap-2 py-0.5"><span className="text-primary font-bold text-xs min-w-[20px] mt-0.5 flex-shrink-0">{num}.</span><span className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{processInline(c)}</span></li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="my-2 space-y-0.5 ml-1">{items}</ol>);
      continue;
    }

    // HR
    if (line.match(/^---+$/)) { elements.push(<hr key={i} className="my-4 border-gray-200 dark:border-gray-700" />); i++; continue; }

    // Empty line
    if (line.trim() === '') { elements.push(<div key={i} className="h-2" />); i++; continue; }

    // Paragraph
    elements.push(<p key={i} className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed my-1.5">{processInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
});

const ProgramExplorer: React.FC = () => {
  const navigate = useNavigate();
  const [company] = useState<Company>(getStoredCompany());
  const [allPrograms, setAllPrograms] = useState<CategorizedProgram[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedProgram, setSelectedProgram] = useState<CategorizedProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const dragXRef = useRef(0);
  const [dragOverlay, setDragOverlay] = useState<'left' | 'right' | null>(null); // 오버레이 상태만 state
  const [isDragging, setIsDragging] = useState(false);
  const [showHearts, setShowHearts] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const isAnimatingRef = useRef(false); // useRef로 변경 (리렌더 방지)

  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  const [activeTab, setActiveTab] = useState<'all' | 'recommended' | 'interested' | 'rejected'>('all');
  const [strategyModal, setStrategyModal] = useState<{ slug: string; content: string } | null>(null);
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);
  const [viewMode, setViewMode] = useState<'swipe' | 'list'>('swipe');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [sortBy, setSortBy] = useState<'fitScore' | 'deadline' | 'grant'>('fitScore');
  // VaultProgram 원본 데이터 (상세 패널 추가 정보용)
  const vaultDataRef = useRef<Map<string, VaultProgram>>(new Map());

  // 프로그램 로드 (Vault API 사용)
  const loadPrograms = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const vaultPrograms = await vaultService.getPrograms();
      // VaultProgram 원본 저장
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

  // 지원유형 목록 (필터용)
  const supportTypes = [...new Set(allPrograms.map(p => p.supportType).filter(Boolean))];

  // 현재 탭의 프로그램 필터 + 검색/필터링
  const filteredPrograms = allPrograms
    .filter(p => {
      if (activeTab === 'all') return p.category === 'none';
      if (activeTab === 'recommended') return p.fitScore >= 80 && p.category === 'none';
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

  // currentProgram이 바뀌면 selectedProgram도 동기화
  useEffect(() => {
    if (currentProgram) {
      setSelectedProgram(currentProgram);
    }
  }, [currentProgram]);

  // 관심 등록 시 자동 DRAFT 생성
  const autoCreateDraft = useCallback((program: SupportProgram) => {
    const existingApps = getStoredApplications();
    const alreadyExists = existingApps.some(a => a.programId === program.id);
    if (alreadyExists) return;

    const newApp: Application = {
      id: `app_${Date.now()}`,
      programId: program.id,
      programSnapshot: {
        name: program.programName,
        organizer: program.organizer,
        endDate: program.officialEndDate,
        grantAmount: program.expectedGrant,
        type: program.supportType,
        description: program.description,
        requiredDocuments: program.requiredDocuments,
        detailUrl: program.detailUrl
      },
      companyId: company.id,
      status: '작성 전',
      draftSections: {
        section1: '', section2: '', section3: '', section4: '', section5: '', section6: ''
      },
      documentStatus: {},
      updatedAt: new Date().toISOString(),
      isCalendarSynced: false
    };
    saveStoredApplication(newApp);
  }, [company.id]);

  // 스와이프 처리 (중복 방지)
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    // 이미 애니메이션 중이거나 프로그램이 없으면 무시
    if (!currentProgram || isAnimatingRef.current) return;

    // 애니메이션 시작 - 락 걸기
    isAnimatingRef.current = true;
    setSwipeDirection(direction);
    setDragOverlay(null);

    if (direction === 'right') {
      setShowHearts(true);
      setTimeout(() => setShowHearts(false), 1200);
    } else {
      setShowTrash(true);
      setTimeout(() => setShowTrash(false), 800);
    }

    setTimeout(() => {
      const newCategory: SwipeCategory = direction === 'right' ? 'interested' : 'rejected';

      saveProgramCategory(currentProgram.id, newCategory, {
        programName: currentProgram.programName,
        expectedGrant: currentProgram.expectedGrant,
        supportType: currentProgram.supportType
      });

      // 관심 등록 시 자동으로 DRAFT 생성
      if (direction === 'right') {
        autoCreateDraft(currentProgram);
      }

      setAllPrograms(prev => prev.map(p =>
        p.id === currentProgram.id ? { ...p, category: newCategory } : p
      ));

      setSwipeDirection(null);
      dragXRef.current = 0;
      if (cardRef.current) {
        cardRef.current.style.transform = 'none';
      }

      const nextFiltered = filteredPrograms.filter(p => p.id !== currentProgram.id);
      if (nextFiltered.length > 0) {
        const nextIndex = Math.min(currentIndex, nextFiltered.length - 1);
        setCurrentIndex(nextIndex);
      } else {
        setCurrentIndex(0);
      }

      // 애니메이션 완료 - 락 해제
      setTimeout(() => { isAnimatingRef.current = false; }, 100);
    }, 500);
  }, [currentProgram, currentIndex, filteredPrograms, autoCreateDraft]);

  // 마우스/터치 드래그 핸들러 (DOM 직접 조작으로 최적화)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!cardRef.current) return;
    setIsDragging(true);
    startXRef.current = e.clientX;
    dragXRef.current = 0;
    cardRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startXRef.current;
    dragXRef.current = deltaX;

    // DOM 직접 조작 (리렌더 없이 transform 적용)
    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 25}deg)`;
    }

    // 오버레이 표시는 threshold 기준으로만 state 변경
    const newOverlay = deltaX > 80 ? 'right' : deltaX < -80 ? 'left' : null;
    if (newOverlay !== dragOverlay) {
      setDragOverlay(newOverlay);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    setDragOverlay(null);

    if (cardRef.current) {
      cardRef.current.releasePointerCapture(e.pointerId);
    }

    const dx = dragXRef.current;
    if (Math.abs(dx) > 120) {
      handleSwipe(dx > 0 ? 'right' : 'left');
    } else {
      dragXRef.current = 0;
      if (cardRef.current) {
        cardRef.current.style.transform = 'none';
        cardRef.current.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        setTimeout(() => {
          if (cardRef.current) cardRef.current.style.transition = '';
        }, 300);
      }
    }
  };

  // 키보드 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handleSwipe('left');
      if (e.key === 'ArrowRight') handleSwipe('right');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSwipe]);

  // 카테고리 복원
  const handleRestoreProgram = (programId: string) => {
    removeProgramCategory(programId);
    setAllPrograms(prev => prev.map(p =>
      p.id === programId ? { ...p, category: 'none' } : p
    ));
  };

  // 리스트뷰에서 특정 프로그램 분류 (swipe와 달리 직접 대상 지정)
  const handleCategorizeInList = useCallback((program: CategorizedProgram, direction: 'left' | 'right') => {
    const newCategory: SwipeCategory = direction === 'right' ? 'interested' : 'rejected';
    saveProgramCategory(program.id, newCategory, {
      programName: program.programName,
      expectedGrant: program.expectedGrant,
      supportType: program.supportType
    });
    if (direction === 'right') autoCreateDraft(program);
    setAllPrograms(prev => prev.map(p =>
      p.id === program.id ? { ...p, category: newCategory } : p
    ));
  }, [autoCreateDraft]);

  // 지원서 작성
  const handleCreateApplication = (program: SupportProgram) => {
    const myApplications = getStoredApplications();
    const existing = myApplications.find(a => a.programId === program.id);

    if (existing) {
      navigate(`/editor/${program.id}/${company.id}`);
      return;
    }

    const newApp: Application = {
      id: `app_${Date.now()}`,
      programId: program.id,
      programSnapshot: {
        name: program.programName,
        organizer: program.organizer,
        endDate: program.officialEndDate,
        grantAmount: program.expectedGrant,
        type: program.supportType,
        description: program.description,
        requiredDocuments: program.requiredDocuments,
        detailUrl: program.detailUrl
      },
      companyId: company.id,
      status: '작성 전',
      draftSections: {
        section1: '', section2: '', section3: '', section4: '', section5: '', section6: ''
      },
      documentStatus: {},
      updatedAt: new Date().toISOString(),
      isCalendarSynced: false
    };

    saveStoredApplication(newApp);
    navigate(`/editor/${program.id}/${company.id}`);
  };

  // D-Day 계산
  const getDDay = (endDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diff < 0) return { label: '마감', color: 'bg-gray-100 text-gray-400', urgent: false };
    if (diff === 0) return { label: 'D-Day', color: 'bg-red-500 text-white', urgent: true };
    if (diff <= 7) return { label: `D-${diff}`, color: 'bg-red-50 text-red-600', urgent: true };
    if (diff <= 14) return { label: `D-${diff}`, color: 'bg-amber-50 text-amber-600', urgent: false };
    return { label: `D-${diff}`, color: 'bg-gray-100 text-gray-600', urgent: false };
  };

  // 전략 보기
  const handleViewStrategy = async (slug: string) => {
    setIsLoadingStrategy(true);
    try {
      const result = await vaultService.getStrategy(slug);
      if (result) {
        setStrategyModal({ slug, content: result.content });
      } else {
        // 전략 문서 없으면 생성 시도
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

  // 통계
  const stats = {
    total: allPrograms.length,
    remaining: allPrograms.filter(p => p.category === 'none').length,
    recommended: allPrograms.filter(p => p.fitScore >= 80 && p.category === 'none').length,
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

      {/* 파티클 효과 */}
      <HeartParticles show={showHearts} />
      <TrashAnimation show={showTrash} />

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
              <div className="text-center px-2 sm:px-3 flex-shrink-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-700 dark:text-gray-200">{stats.total}</p>
                <p className="text-[10px] sm:text-xs text-gray-400">전체</p>
              </div>
              <div className="h-6 sm:h-8 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
              <div className="text-center px-2 sm:px-3 flex-shrink-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-600 dark:text-gray-300">{stats.remaining}</p>
                <p className="text-[10px] sm:text-xs text-gray-400">미분류</p>
              </div>
              <div className="text-center px-2 sm:px-3 flex-shrink-0">
                <p className="text-lg sm:text-2xl font-bold text-amber-500 dark:text-amber-400">{stats.recommended}</p>
                <p className="text-[10px] sm:text-xs text-gray-400">추천</p>
              </div>
              <div className="text-center px-2 sm:px-3 flex-shrink-0">
                <p className="text-lg sm:text-2xl font-bold text-primary dark:text-green-400">{stats.interested}</p>
                <p className="text-[10px] sm:text-xs text-gray-400">관심</p>
              </div>
              <div className="text-center px-2 sm:px-3 flex-shrink-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-400">{stats.rejected}</p>
                <p className="text-[10px] sm:text-xs text-gray-400">부적합</p>
              </div>
            </div>
            <button
              onClick={() => loadPrograms()}
              disabled={isLoading}
              className="ml-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
              title="새로고침"
            >
              <span className={`material-icons-outlined text-gray-400 text-xl ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
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
              <span className="material-icons-outlined text-gray-500 text-lg">
                {viewMode === 'swipe' ? 'view_list' : 'swipe'}
              </span>
            </button>
          </div>
        </div>

        {/* 검색/필터 바 */}
        <div className="flex flex-wrap items-center gap-2 mb-4 bg-white dark:bg-gray-800 rounded-xl p-2.5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex-1 min-w-[200px] relative">
            <span className="material-icons-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
            <input
              type="text"
              placeholder="사업명, 기관명으로 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-xs sm:text-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 sm:px-3 py-2 text-gray-600 dark:text-gray-300"
          >
            <option value="">전체 유형</option>
            {supportTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs sm:text-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 sm:px-3 py-2 text-gray-600 dark:text-gray-300"
          >
            <option value="fitScore">적합도순</option>
            <option value="deadline">마감일순</option>
            <option value="grant">지원금순</option>
          </select>
        </div>

        {/* 메인 컨텐츠 */}
        <div className="flex flex-col lg:flex-row gap-4 h-[calc(100%-140px)]">

          {/* 리스트 뷰 */}
          {viewMode === 'list' && (
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredPrograms.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <span className="material-icons-outlined text-5xl mb-2">search_off</span>
                  <p className="font-medium">검색 결과가 없습니다</p>
                </div>
              ) : (
                filteredPrograms.map(program => {
                  const dDay = getDDay(program.officialEndDate);
                  return (
                    <div
                      key={program.id}
                      className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer ${
                        selectedProgram?.id === program.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedProgram(program)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded font-medium">
                              {program.supportType}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${dDay.color}`}>
                              {dDay.label}
                            </span>
                            {program.fitScore >= 90 && (
                              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">
                                ★ 강력추천
                              </span>
                            )}
                            {program.fitScore >= 80 && program.fitScore < 90 && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                                추천
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-gray-800 dark:text-white truncate">
                            {program.programName}
                          </h3>
                          <p className="text-xs text-gray-400 truncate">{program.organizer}</p>
                        </div>
                        <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-bold text-primary dark:text-green-400">
                              {(program.expectedGrant / 100000000).toFixed(1)}억
                            </p>
                            <p className={`text-xs font-medium ${
                              program.fitScore >= 85 ? 'text-primary' : 'text-gray-500'
                            }`}>
                              적합도 {program.fitScore}%
                            </p>
                          </div>
                          {(activeTab === 'all' || activeTab === 'recommended') && (
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCategorizeInList(program, 'left'); }}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                title="부적합"
                              >
                                <span className="material-icons-outlined text-gray-400 text-lg">close</span>
                              </button>
                              {activeTab === 'recommended' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleViewStrategy(program.id); }}
                                  disabled={isLoadingStrategy}
                                  className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                  title="전략 보기"
                                >
                                  <span className="material-icons-outlined text-amber-500 text-lg">auto_awesome</span>
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCategorizeInList(program, 'right'); }}
                                className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20"
                                title="관심 등록"
                              >
                                <span className="material-icons-outlined text-primary text-lg">favorite</span>
                              </button>
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCreateApplication(program); }}
                            className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-green-600 transition-colors"
                          >
                            지원서
                          </button>
                        </div>
                      </div>
                      {/* 추천 탭: dimensions 미니 바 차트 */}
                      {activeTab === 'recommended' && (() => {
                        const vd = vaultDataRef.current.get(program.id);
                        const dims = vd?.dimensions;
                        if (!dims) return null;
                        const dimEntries: { label: string; value: number }[] = [
                          { label: '자격', value: dims.eligibilityMatch },
                          { label: '업종', value: dims.industryRelevance },
                          { label: '규모', value: dims.scaleFit },
                          { label: '경쟁력', value: dims.competitiveness },
                          { label: '전략', value: dims.strategicAlignment },
                        ];
                        return (
                          <div className="flex gap-1 mt-2">
                            {dimEntries.map(d => (
                              <div key={d.label} className="flex-1">
                                <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                                  <span>{d.label}</span>
                                  <span>{d.value}</span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full ${
                                      d.value >= 80 ? 'bg-green-500' : d.value >= 60 ? 'bg-amber-500' : 'bg-gray-400'
                                    }`}
                                    style={{ width: `${d.value}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 스와이프 뷰 - 좌측: 스와이프 카드 영역 */}
          {viewMode === 'swipe' && (
          <div className="flex-1 flex flex-col items-center justify-center relative">
            {filteredPrograms.length === 0 ? (
              <div className="text-center">
                <span className="material-icons-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
                  {activeTab === 'all' ? 'check_circle' : activeTab === 'recommended' ? 'star_border' : activeTab === 'interested' ? 'favorite_border' : 'delete_outline'}
                </span>
                <p className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  {activeTab === 'all' ? '모든 공고를 분류했습니다' :
                   activeTab === 'recommended' ? '추천 공고가 없습니다' :
                   activeTab === 'interested' ? '아직 관심 공고가 없습니다' : '부적합 공고가 없습니다'}
                </p>
                <p className="text-sm text-gray-400">
                  {activeTab === 'all' ? '관심 공고 탭에서 확인하세요' :
                   activeTab === 'recommended' ? '적합도 분석을 실행하면 80점 이상 공고가 여기 표시됩니다' :
                   '공고를 탐색하고 분류해보세요'}
                </p>
              </div>
            ) : currentProgram && (
              <>
                {/* 스와이프 가이드 */}
                <div className="absolute top-0 left-0 right-0 flex justify-between px-8 text-xs text-gray-400">
                  <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="material-icons-outlined text-sm">arrow_back</span>
                    <span>부적합</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span>관심 등록</span>
                    <span className="material-icons-outlined text-sm">arrow_forward</span>
                  </div>
                </div>

                {/* 카드 */}
                <div
                  ref={cardRef}
                  className={`relative w-full max-w-lg select-none touch-none ${
                    swipeDirection === 'left' ? 'animate-swipe-left' :
                    swipeDirection === 'right' ? 'animate-swipe-right' : ''
                  }`}
                  style={{
                    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  {/* 스와이프 오버레이 */}
                  {dragOverlay === 'right' && (
                    <div className="absolute inset-0 bg-primary/10 rounded-2xl flex items-center justify-center z-10 pointer-events-none border-2 border-primary">
                      <div className="text-center">
                        <span className="material-icons-outlined text-4xl text-primary mb-1">favorite</span>
                        <p className="text-primary font-bold">관심 등록</p>
                      </div>
                    </div>
                  )}
                  {dragOverlay === 'left' && (
                    <div className="absolute inset-0 bg-gray-500/10 rounded-2xl flex items-center justify-center z-10 pointer-events-none border-2 border-gray-400">
                      <div className="text-center">
                        <span className="material-icons-outlined text-4xl text-gray-500 mb-1">delete</span>
                        <p className="text-gray-500 font-bold">부적합</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 cursor-grab active:cursor-grabbing border border-gray-100 dark:border-gray-700">
                    {/* 상단 배지 */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg font-medium">
                        {currentProgram.supportType}
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getDDay(currentProgram.officialEndDate).color}`}>
                        {getDDay(currentProgram.officialEndDate).label}
                      </span>
                    </div>

                    {/* 제목 */}
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5 leading-snug line-clamp-2">
                      {currentProgram.programName}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                      {currentProgram.organizer}
                    </p>

                    {/* 주요 정보 */}
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">예상 지원금</p>
                        <p className="text-xl font-bold text-gray-800 dark:text-gray-200">
                          {(currentProgram.expectedGrant / 100000000).toFixed(1)}억
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-500 mb-0.5">AI 적합도</p>
                        <p className={`text-xl font-bold ${
                          currentProgram.fitScore >= 85 ? 'text-primary dark:text-green-400' :
                          currentProgram.fitScore >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'
                        }`}>
                          {currentProgram.fitScore}%
                        </p>
                      </div>
                    </div>

                    {/* 마감일 */}
                    <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 mb-3">
                      <span className="text-gray-500">마감일</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {new Date(currentProgram.officialEndDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>

                    {/* 카드 인덱스 */}
                    <div className="text-center text-xs text-gray-400">
                      {currentIndex + 1} / {filteredPrograms.length}
                    </div>
                  </div>
                </div>

                {/* 액션 버튼 */}
                {(activeTab === 'all' || activeTab === 'recommended') && (
                  <div className="flex gap-4 mt-6 items-center">
                    <button
                      onClick={() => handleSwipe('left')}
                      className="group w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center border border-gray-200 dark:border-gray-700"
                    >
                      <span className="text-xl">🗑️</span>
                    </button>
                    {activeTab === 'recommended' && (
                      <button
                        onClick={() => currentProgram && handleViewStrategy(currentProgram.id)}
                        disabled={isLoadingStrategy}
                        className="group w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-600 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                        title="전략 보기"
                      >
                        <span className="material-icons-outlined text-white text-xl">auto_awesome</span>
                      </button>
                    )}
                    <button
                      onClick={() => currentProgram && handleCreateApplication(currentProgram)}
                      className="group w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                      title="지원서 작성"
                    >
                      <span className="material-icons-outlined text-white text-xl">edit_note</span>
                    </button>
                    <button
                      onClick={() => handleSwipe('right')}
                      className="group w-14 h-14 rounded-full bg-primary hover:bg-green-600 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                    >
                      <span className="text-xl">❤️</span>
                    </button>
                  </div>
                )}

                {activeTab !== 'all' && activeTab !== 'recommended' && (
                  <div className="flex gap-3 mt-6 items-center">
                    <button
                      onClick={() => handleRestoreProgram(currentProgram.id)}
                      className="px-5 py-3 bg-white dark:bg-gray-800 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-md flex items-center gap-2"
                    >
                      <span>↩️</span>
                      미분류로 복원
                    </button>
                    <button
                      onClick={() => currentProgram && handleCreateApplication(currentProgram)}
                      className="px-5 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md flex items-center gap-2"
                    >
                      <span className="material-icons-outlined text-sm">edit_note</span>
                      지원서 작성
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* 우측: 세부 정보 패널 */}
          <div className="w-full lg:w-[380px] bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 max-h-[50vh] lg:max-h-none">
            {selectedProgram ? (() => {
              const vd = vaultDataRef.current.get(selectedProgram.id);
              return (
              <>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200 mb-1">공고 상세</h3>
                  <p className="text-xs text-gray-500 line-clamp-1">{selectedProgram.programName}</p>
                </div>

                {/* 전략 문서 버튼 - 추천 공고 상단 배치 */}
                {selectedProgram.fitScore >= 80 && (
                  <div className="px-4 pt-3">
                    <button
                      onClick={() => handleViewStrategy(selectedProgram.id)}
                      disabled={isLoadingStrategy}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                      {isLoadingStrategy ? (
                        <span className="animate-spin material-icons-outlined text-lg">autorenew</span>
                      ) : (
                        <span className="material-icons-outlined text-lg">auto_awesome</span>
                      )}
                      AI 전략 문서 보기
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* 기본 정보 */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">기본 정보</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">주관기관</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[180px] truncate">{selectedProgram.organizer}</span>
                      </div>
                      {vd?.department && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">담당부서</span>
                          <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[180px] truncate">{vd.department}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">지원유형</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{selectedProgram.supportType}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">예상 지원금</span>
                        <span className="font-bold text-primary dark:text-green-400">{(selectedProgram.expectedGrant / 100000000).toFixed(1)}억원</span>
                      </div>
                      {vd?.supportScale && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">지원규모</span>
                          <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[180px] truncate">{vd.supportScale}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">마감일</span>
                        <span className={`font-medium text-xs px-2 py-0.5 rounded ${getDDay(selectedProgram.officialEndDate).color}`}>
                          {new Date(selectedProgram.officialEndDate).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 지원 대상 */}
                  {vd?.targetAudience && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">지원 대상</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{vd.targetAudience}</p>
                    </div>
                  )}

                  {/* AI 적합도 */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">AI 분석</h4>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-center">
                        <div className={`text-3xl font-bold ${
                          selectedProgram.fitScore >= 90 ? 'text-amber-500' :
                          selectedProgram.fitScore >= 80 ? 'text-primary dark:text-green-400' :
                          selectedProgram.fitScore >= 70 ? 'text-amber-500' : 'text-gray-500'
                        }`}>
                          {selectedProgram.fitScore}%
                        </div>
                        {selectedProgram.fitScore >= 90 && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">★ 강력추천</span>
                        )}
                        {selectedProgram.fitScore >= 80 && selectedProgram.fitScore < 90 && (
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">추천</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              selectedProgram.fitScore >= 80 ? 'bg-primary' :
                              selectedProgram.fitScore >= 70 ? 'bg-amber-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${selectedProgram.fitScore}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 5차원 점수 바 차트 */}
                    {(() => {
                      const dims = vd?.dimensions;
                      if (!dims) return null;
                      const dimEntries: { label: string; key: keyof FitDimensions; weight: string }[] = [
                        { label: '자격요건 부합', key: 'eligibilityMatch', weight: '35%' },
                        { label: '업종/기술 관련', key: 'industryRelevance', weight: '25%' },
                        { label: '규모 적합성', key: 'scaleFit', weight: '15%' },
                        { label: '경쟁력', key: 'competitiveness', weight: '15%' },
                        { label: '전략적 부합', key: 'strategicAlignment', weight: '10%' },
                      ];
                      return (
                        <div className="space-y-1.5 mt-2">
                          {dimEntries.map(d => (
                            <div key={d.key}>
                              <div className="flex justify-between text-[10px] mb-0.5">
                                <span className="text-gray-500">{d.label} <span className="text-gray-400">({d.weight})</span></span>
                                <span className={`font-bold ${dims[d.key] >= 80 ? 'text-green-600' : dims[d.key] >= 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                                  {dims[d.key]}
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    dims[d.key] >= 80 ? 'bg-green-500' : dims[d.key] >= 60 ? 'bg-amber-500' : 'bg-gray-400'
                                  }`}
                                  style={{ width: `${dims[d.key]}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* keyActions */}
                    {vd?.keyActions && vd.keyActions.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">핵심 액션</p>
                        <ul className="space-y-1">
                          {vd.keyActions.slice(0, 3).map((action, i) => (
                            <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                              <span className="text-primary mt-0.5 flex-shrink-0">▸</span>
                              <span className="line-clamp-2">{action}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 전략 문서 버튼은 상단으로 이동됨 */}
                  </div>

                  {/* 사업 설명 */}
                  {selectedProgram.description && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">사업 요약</h4>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                          {summarizeText(selectedProgram.description, 200)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 필요 서류 */}
                  {selectedProgram.requiredDocuments && selectedProgram.requiredDocuments.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">필요 서류</h4>
                      <ul className="space-y-1.5">
                        {selectedProgram.requiredDocuments.slice(0, 5).map((doc, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                            <span className="text-gray-400 mt-0.5">•</span>
                            <span className="line-clamp-2">{stripHtml(doc)}</span>
                          </li>
                        ))}
                        {selectedProgram.requiredDocuments.length > 5 && (
                          <li className="text-xs text-gray-400 pl-4">외 {selectedProgram.requiredDocuments.length - 5}개 항목</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="p-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                  {selectedProgram.detailUrl && (
                    <a
                      href={selectedProgram.detailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                    >
                      공고문 원문 보기
                    </a>
                  )}
                  <button
                    onClick={() => handleCreateApplication(selectedProgram)}
                    className="w-full py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:bg-green-600 transition-colors"
                  >
                    지원서 작성하기
                  </button>
                </div>
              </>
              );
            })() : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <span className="material-icons-outlined text-4xl mb-2 text-gray-300">description</span>
                  <p className="text-sm">공고를 선택하세요</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 전략 문서 모달 */}
      {strategyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setStrategyModal(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                <span className="material-icons-outlined text-amber-500">auto_awesome</span>
                전략 문서
              </h2>
              <button
                onClick={() => setStrategyModal(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span className="material-icons-outlined text-gray-500">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-none">
                <MarkdownRenderer content={strategyModal.content} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgramExplorer;

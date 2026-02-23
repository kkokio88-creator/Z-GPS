/**
 * 칸반 보드 상태 관리 훅
 * 기존 에디터 상태(sectionSchema, draftSections, documentStatus)에서 칸반 카드를 파생
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SectionSchema, KanbanStatus, KanbanCardType, KanbanCardData } from '../types';

const KANBAN_STORAGE_KEY = 'zgps_kanban_state';

interface StoredKanbanState {
  cardStatuses: Record<string, KanbanStatus>;
  aiRecommendations: Record<string, string>;
  viewMode: 'list' | 'kanban';
}

export interface KanbanActions {
  moveCard: (cardId: string, newStatus: KanbanStatus) => void;
  setActiveCard: (cardId: string | null) => void;
  setAiRecommendation: (cardId: string, text: string) => void;
  setAiGenerating: (cardId: string | null) => void;
  setViewMode: (mode: 'list' | 'kanban') => void;
}

export interface KanbanState {
  cards: KanbanCardData[];
  columns: Record<KanbanStatus, KanbanCardData[]>;
  activeCardId: string | null;
  viewMode: 'list' | 'kanban';
  aiGeneratingCardId: string | null;
  progress: {
    totalSections: number;
    completedSections: number;
    totalDocuments: number;
    completedDocuments: number;
    percentage: number;
    isAllComplete: boolean;
  };
}

function loadStoredState(programId: string): StoredKanbanState | null {
  try {
    const raw = localStorage.getItem(`${KANBAN_STORAGE_KEY}_${programId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredState(programId: string, state: StoredKanbanState) {
  try {
    localStorage.setItem(`${KANBAN_STORAGE_KEY}_${programId}`, JSON.stringify(state));
  } catch { /* ignore */ }
}

/**
 * 내용 기반으로 기본 상태를 추론
 */
function inferStatus(content: string | undefined, isUploaded?: boolean): KanbanStatus {
  if (isUploaded) return 'done';
  if (!content || content.trim().length === 0) return 'backlog';
  if (content.trim().length > 200) return 'writing'; // 충분한 내용이 있으면 작성중
  return 'writing';
}

export function useKanbanState(
  programId: string | undefined,
  sectionSchema: SectionSchema[],
  draftSections: Record<string, string>,
  documentStatus: Record<string, boolean>,
  requiredDocuments: string[],
): KanbanState & KanbanActions {
  const stored = programId ? loadStoredState(programId) : null;

  const [cardStatuses, setCardStatuses] = useState<Record<string, KanbanStatus>>(
    stored?.cardStatuses || {}
  );
  const [aiRecommendations, setAiRecommendations] = useState<Record<string, string>>(
    stored?.aiRecommendations || {}
  );
  const [activeCardId, setActiveCard] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(stored?.viewMode || 'kanban');
  const [aiGeneratingCardId, setAiGeneratingCardId] = useState<string | null>(null);

  // 저장
  useEffect(() => {
    if (!programId) return;
    saveStoredState(programId, { cardStatuses, aiRecommendations, viewMode });
  }, [programId, cardStatuses, aiRecommendations, viewMode]);

  // 카드 목록 생성 (sectionSchema + requiredDocuments에서 파생)
  const cards = useMemo<KanbanCardData[]>(() => {
    const sectionCards: KanbanCardData[] = sectionSchema.map(section => {
      const content = draftSections[section.id] || '';
      const savedStatus = cardStatuses[section.id];
      // 저장된 상태가 있으면 사용, 없으면 내용 기반 추론
      const status = savedStatus || inferStatus(content);

      return {
        id: section.id,
        type: 'section' as KanbanCardType,
        status,
        section,
        content,
        aiRecommendation: aiRecommendations[section.id],
        isAiGenerating: aiGeneratingCardId === section.id,
      };
    });

    const docCards: KanbanCardData[] = requiredDocuments.map(docName => {
      const docId = `doc_${docName.replace(/\s+/g, '_')}`;
      const isUploaded = documentStatus[docName] || false;
      const savedStatus = cardStatuses[docId];
      const status = savedStatus || (isUploaded ? 'done' : 'backlog');

      return {
        id: docId,
        type: 'document' as KanbanCardType,
        status,
        documentName: docName,
        isUploaded,
      };
    });

    return [...sectionCards, ...docCards];
  }, [sectionSchema, draftSections, documentStatus, requiredDocuments, cardStatuses, aiRecommendations, aiGeneratingCardId]);

  // 칼럼별 분류
  const columns = useMemo(() => {
    const result: Record<KanbanStatus, KanbanCardData[]> = {
      backlog: [],
      writing: [],
      review: [],
      done: [],
    };
    cards.forEach(card => {
      result[card.status].push(card);
    });
    // 각 칼럼 내에서 section cards를 order 기준 정렬
    Object.values(result).forEach(col => {
      col.sort((a, b) => {
        if (a.type === 'section' && b.type === 'section') {
          return (a.section?.order || 0) - (b.section?.order || 0);
        }
        if (a.type === 'section') return -1;
        return 1;
      });
    });
    return result;
  }, [cards]);

  // 진행률 계산
  const progress = useMemo(() => {
    const sectionCards = cards.filter(c => c.type === 'section');
    const docCards = cards.filter(c => c.type === 'document');
    const completedSections = sectionCards.filter(c => c.status === 'done').length;
    const completedDocuments = docCards.filter(c => c.status === 'done').length;
    const total = cards.length;
    const done = completedSections + completedDocuments;

    return {
      totalSections: sectionCards.length,
      completedSections,
      totalDocuments: docCards.length,
      completedDocuments,
      percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      isAllComplete: total > 0 && done === total,
    };
  }, [cards]);

  const moveCard = useCallback((cardId: string, newStatus: KanbanStatus) => {
    setCardStatuses(prev => ({ ...prev, [cardId]: newStatus }));
  }, []);

  const setAiRecommendation = useCallback((cardId: string, text: string) => {
    setAiRecommendations(prev => ({ ...prev, [cardId]: text }));
  }, []);

  const setAiGenerating = useCallback((cardId: string | null) => {
    setAiGeneratingCardId(cardId);
  }, []);

  return {
    cards,
    columns,
    activeCardId,
    viewMode,
    aiGeneratingCardId,
    progress,
    moveCard,
    setActiveCard,
    setAiRecommendation,
    setAiGenerating,
    setViewMode,
  };
}

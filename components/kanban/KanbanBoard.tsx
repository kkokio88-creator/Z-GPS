import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import type { KanbanStatus, KanbanCardData } from '../../types';

const COLUMNS: { id: KanbanStatus; title: string; icon: string }[] = [
  { id: 'backlog', title: '대기', icon: '📋' },
  { id: 'writing', title: '작성 중', icon: '✍️' },
  { id: 'review', title: 'AI 검토', icon: '🤖' },
  { id: 'done', title: '완료', icon: '✅' },
];

interface KanbanBoardProps {
  columns: Record<KanbanStatus, KanbanCardData[]>;
  onMoveCard: (cardId: string, newStatus: KanbanStatus) => void;
  onCardClick: (cardId: string) => void;
  aiGeneratingCardId: string | null;
}

export function KanbanBoard({ columns, onMoveCard, onCardClick, aiGeneratingCardId }: KanbanBoardProps) {
  const [activeCard, setActiveCard] = useState<KanbanCardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // 모든 카드를 플랫 맵으로 빠르게 조회
  const findCard = useCallback((id: string): { card: KanbanCardData; columnId: KanbanStatus } | null => {
    for (const colId of Object.keys(columns) as KanbanStatus[]) {
      const card = columns[colId].find(c => c.id === id);
      if (card) return { card, columnId: colId };
    }
    return null;
  }, [columns]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const result = findCard(String(event.active.id));
    if (result) {
      setActiveCard(result.card);
    }
  }, [findCard]);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // DragOverlay가 시각적 피드백을 제공하므로 별도 처리 불필요
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // 드롭 대상이 칼럼인지 확인
    const isColumnDrop = COLUMNS.some(col => col.id === overId);

    if (isColumnDrop) {
      // 칼럼에 직접 드롭
      const targetColumn = overId as KanbanStatus;
      const source = findCard(activeId);
      if (source && source.columnId !== targetColumn) {
        onMoveCard(activeId, targetColumn);
      }
    } else {
      // 다른 카드 위에 드롭 → 해당 카드가 속한 칼럼으로 이동
      const targetResult = findCard(overId);
      const sourceResult = findCard(activeId);
      if (targetResult && sourceResult && sourceResult.columnId !== targetResult.columnId) {
        onMoveCard(activeId, targetResult.columnId);
      }
    }
  }, [findCard, onMoveCard]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 px-1">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            icon={col.icon}
            cards={columns[col.id]}
          >
            {columns[col.id].map(card => (
              <KanbanCard
                key={card.id}
                card={{
                  ...card,
                  isAiGenerating: aiGeneratingCardId === card.id || undefined,
                }}
                onClick={() => onCardClick(card.id)}
              />
            ))}
          </KanbanColumn>
        ))}
      </div>

      {/* 드래그 오버레이: 드래그 중인 카드의 미리보기 */}
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="rotate-2 scale-105">
            <KanbanCard
              card={activeCard}
              onClick={() => {}}
              isDragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '../../lib/utils';
import type { KanbanStatus, KanbanCardData } from '../../types';

export interface KanbanColumnProps {
  id: KanbanStatus;
  title: string;
  icon: string;
  cards: KanbanCardData[];
  children: ReactNode;
}

const columnColors: Record<KanbanStatus, {
  header: string;
  dropzone: string;
  badge: string;
  border: string;
}> = {
  backlog: {
    header: 'text-slate-700 dark:text-slate-300',
    dropzone: 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700',
    badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-600',
  },
  writing: {
    header: 'text-blue-700 dark:text-blue-300',
    dropzone: 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-200 text-blue-700 dark:bg-blue-800 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
  },
  review: {
    header: 'text-amber-700 dark:text-amber-300',
    dropzone: 'bg-amber-50/50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-200 text-amber-700 dark:bg-amber-800 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700',
  },
  done: {
    header: 'text-green-700 dark:text-green-300',
    dropzone: 'bg-green-50/50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    badge: 'bg-green-200 text-green-700 dark:bg-green-800 dark:text-green-300',
    border: 'border-green-300 dark:border-green-700',
  },
};

export function KanbanColumn({ id, title, icon, cards, children }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const colors = columnColors[id];
  const cardIds = cards.map(c => c.id);

  return (
    <div className="flex flex-col min-w-[260px] max-w-[320px] w-full">
      {/* 칼럼 헤더 */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-t-lg border-b-2',
        colors.border,
      )}>
        <span className="text-base">{icon}</span>
        <h3 className={cn('text-sm font-semibold', colors.header)}>
          {title}
        </h3>
        <span className={cn(
          'ml-auto text-xs font-medium rounded-full px-2 py-0.5',
          colors.badge,
        )}>
          {cards.length}
        </span>
      </div>

      {/* 드롭 영역 */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 flex flex-col gap-2 p-2 rounded-b-lg border border-t-0 min-h-[120px] transition-colors duration-150',
          colors.dropzone,
          isOver && 'ring-2 ring-primary/40 bg-primary/5 dark:bg-primary/10',
        )}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>

        {cards.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-6">
            <p className="text-xs text-muted-foreground/50">
              카드를 여기에 놓으세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default KanbanColumn;

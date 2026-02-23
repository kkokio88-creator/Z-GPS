import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../../lib/utils';
import { Icon } from '../ui/Icon';
import type { KanbanCardData } from '../../types';

interface KanbanCardProps {
  card: KanbanCardData;
  onClick: () => void;
  isDragging?: boolean;
}

export function KanbanCard({ card, onClick, isDragging = false }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCurrentlyDragging = isDragging || isSortableDragging;

  const typeIcon = card.type === 'section' ? 'description' : 'attach_file';
  const title = card.type === 'section' ? card.section?.title : card.documentName;
  const contentPreview = card.content && card.content.trim().length > 0
    ? card.content.trim().slice(0, 50) + (card.content.trim().length > 50 ? '…' : '')
    : '미작성';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-lg border bg-card p-3 shadow-sm',
        'hover:shadow-md hover:border-primary/30 transition-all duration-150',
        'dark:bg-zinc-800 dark:border-zinc-700',
        isCurrentlyDragging && 'opacity-40 shadow-lg ring-2 ring-primary/30',
        !isCurrentlyDragging && 'cursor-grab active:cursor-grabbing',
      )}
      onClick={onClick}
    >
      {/* 드래그 핸들 + 타입 아이콘 */}
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className={cn(
            'mt-0.5 shrink-0 text-muted-foreground/50 hover:text-muted-foreground',
            'cursor-grab active:cursor-grabbing',
          )}
          aria-label="드래그하여 이동"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="drag_indicator" className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          {/* 제목 행 */}
          <div className="flex items-center gap-1.5">
            <Icon
              name={typeIcon}
              className={cn(
                'w-4 h-4 shrink-0',
                card.type === 'section' ? 'text-blue-500 dark:text-blue-400' : 'text-amber-500 dark:text-amber-400',
              )}
            />
            <span className="text-sm font-medium truncate dark:text-zinc-100">
              {title}
            </span>
          </div>

          {/* 내용 미리보기 (섹션 카드만) */}
          {card.type === 'section' && (
            <p className={cn(
              'mt-1 text-xs truncate',
              contentPreview === '미작성'
                ? 'text-muted-foreground/60 italic'
                : 'text-muted-foreground',
            )}>
              {contentPreview}
            </p>
          )}

          {/* 배지 행 */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {/* 평가 배점 배지 */}
            {card.section?.evaluationWeight && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                <Icon name="bar_chart" className="w-3 h-3" />
                {card.section.evaluationWeight}
              </span>
            )}

            {/* 필수 항목 배지 */}
            {card.section?.required && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                필수
              </span>
            )}

            {/* AI 상태 인디케이터 */}
            {card.isAiGenerating && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                <Icon name="auto_awesome" className="w-3 h-3 animate-spin" />
                AI 생성 중
              </span>
            )}
            {!card.isAiGenerating && card.aiRecommendation && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                AI 추천 있음
              </span>
            )}

            {/* 문서 업로드 상태 */}
            {card.type === 'document' && (
              <span className={cn(
                'inline-flex items-center gap-0.5 text-[10px]',
                card.isUploaded
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground/60',
              )}>
                <Icon
                  name={card.isUploaded ? 'check_circle' : 'upload_file'}
                  className="w-3 h-3"
                />
                {card.isUploaded ? '업로드 완료' : '미업로드'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default KanbanCard;

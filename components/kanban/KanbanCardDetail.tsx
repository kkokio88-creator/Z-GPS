import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import Icon from '../ui/Icon';
import { cn } from '../../lib/utils';
import type { KanbanCardData, KanbanStatus } from '../../types';

interface KanbanCardDetailProps {
  card: KanbanCardData | null;
  isOpen: boolean;
  onClose: () => void;
  onTextChange: (cardId: string, text: string) => void;
  onGenerateAI: (cardId: string, sectionTitle: string) => void;
  onApplyAI: (cardId: string) => void;
  onStatusChange: (cardId: string, status: KanbanStatus) => void;
  onDocumentToggle: (docName: string) => void;
}

const RECOMMENDED_LENGTH = 800;

function SectionDetail({
  card,
  onTextChange,
  onGenerateAI,
  onApplyAI,
  onStatusChange,
}: {
  card: KanbanCardData;
  onTextChange: (cardId: string, text: string) => void;
  onGenerateAI: (cardId: string, sectionTitle: string) => void;
  onApplyAI: (cardId: string) => void;
  onStatusChange: (cardId: string, status: KanbanStatus) => void;
}) {
  const section = card.section!;
  const [localText, setLocalText] = useState(card.content ?? '');

  useEffect(() => {
    setLocalText(card.content ?? '');
  }, [card.content, card.id]);

  const handleTextChange = (value: string) => {
    setLocalText(value);
    onTextChange(card.id, value);
  };

  const charCount = localText.length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold">
            {section.order}
          </span>
          <span className="flex-1">{section.title}</span>
          {section.evaluationWeight && (
            <Badge variant="secondary" className="text-xs font-normal shrink-0">
              {section.evaluationWeight}
            </Badge>
          )}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {section.title} 상세 편집
        </DialogDescription>
      </DialogHeader>

      {/* 질문 내용 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1.5">질문 내용</h4>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {section.description}
        </p>
      </div>

      {/* 작성 힌트 */}
      {section.hints && section.hints.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-1.5">작성 힌트</h4>
          <div className="flex flex-wrap gap-1.5">
            {section.hints.map((hint, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 text-xs"
              >
                {hint}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI 추천 답변 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
          <Icon name="smart_toy" className="w-4 h-4 text-indigo-500" />
          AI 추천 답변
        </h4>

        {card.aiRecommendation ? (
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-3 text-sm text-indigo-900 dark:text-indigo-100 leading-relaxed whitespace-pre-wrap mb-2">
            {card.aiRecommendation}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-2">
            아직 AI 추천 답변이 없습니다.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onGenerateAI(card.id, section.title)}
            disabled={card.isAiGenerating}
          >
            {card.isAiGenerating ? (
              <>
                <Icon name="pending" className="w-4 h-4 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Icon name="auto_awesome" className="w-4 h-4" />
                AI 답변 생성
              </>
            )}
          </Button>

          {card.aiRecommendation && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApplyAI(card.id)}
              disabled={card.isAiGenerating}
            >
              <Icon name="content_copy" className="w-4 h-4" />
              AI 답변 적용
            </Button>
          )}
        </div>
      </div>

      {/* 내 답변 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
          <Icon name="edit" className="w-4 h-4" />
          내 답변
        </h4>
        <Textarea
          value={localText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="이 항목에 대한 답변을 작성하세요..."
          className="min-h-[200px] resize-y"
        />
        <div className="flex justify-end mt-1">
          <span
            className={cn(
              'text-xs',
              charCount > RECOMMENDED_LENGTH
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
            )}
          >
            {charCount}자 / 권장 ~{RECOMMENDED_LENGTH}자
          </span>
        </div>
      </div>

      {/* 하단 액션 버튼 */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStatusChange(card.id, 'writing')}
        >
          <Icon name="edit_note" className="w-4 h-4" />
          작성 중으로
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStatusChange(card.id, 'review')}
        >
          <Icon name="rate_review" className="w-4 h-4" />
          AI 검토 요청
        </Button>
        <Button
          size="sm"
          onClick={() => onStatusChange(card.id, 'done')}
          className="ml-auto bg-primary hover:bg-primary/90"
        >
          <Icon name="check_circle" className="w-4 h-4" />
          완료
        </Button>
      </div>
    </div>
  );
}

function DocumentDetail({
  card,
  onDocumentToggle,
  onStatusChange,
}: {
  card: KanbanCardData;
  onDocumentToggle: (docName: string) => void;
  onStatusChange: (cardId: string, status: KanbanStatus) => void;
}) {
  const docName = card.documentName ?? '서류';

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <Icon name="attach_file" className="w-5 h-5 text-muted-foreground" />
          {docName}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {docName} 서류 상세
        </DialogDescription>
      </DialogHeader>

      {/* 설명 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1.5">설명</h4>
        <p className="text-sm text-muted-foreground">
          해당 서류를 준비하여 제출해야 합니다.
        </p>
      </div>

      {/* 첨부 상태 */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1.5">첨부 상태</h4>
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Switch
            checked={card.isUploaded ?? false}
            onCheckedChange={() => onDocumentToggle(docName)}
          />
          <span className="text-sm">
            {card.isUploaded ? (
              <span className="text-primary font-medium">준비 완료</span>
            ) : (
              <span className="text-muted-foreground">미준비</span>
            )}
          </span>
        </div>
      </div>

      {/* 하단 */}
      {card.isUploaded && (
        <div className="flex items-center justify-end pt-2 border-t">
          <Button
            size="sm"
            onClick={() => onStatusChange(card.id, 'done')}
            className="bg-primary hover:bg-primary/90"
          >
            <Icon name="check_circle" className="w-4 h-4" />
            완료
          </Button>
        </div>
      )}
    </div>
  );
}

export default function KanbanCardDetail({
  card,
  isOpen,
  onClose,
  onTextChange,
  onGenerateAI,
  onApplyAI,
  onStatusChange,
  onDocumentToggle,
}: KanbanCardDetailProps) {
  if (!card) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {card.type === 'section' ? (
          <SectionDetail
            card={card}
            onTextChange={onTextChange}
            onGenerateAI={onGenerateAI}
            onApplyAI={onApplyAI}
            onStatusChange={onStatusChange}
          />
        ) : (
          <DocumentDetail
            card={card}
            onDocumentToggle={onDocumentToggle}
            onStatusChange={onStatusChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

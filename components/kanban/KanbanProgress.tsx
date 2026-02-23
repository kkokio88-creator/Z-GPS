import { useState, useEffect } from "react";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";
import { Icon } from "../ui/Icon";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";

interface KanbanProgressProps {
  progress: {
    totalSections: number;
    completedSections: number;
    totalDocuments: number;
    completedDocuments: number;
    percentage: number;
    isAllComplete: boolean;
  };
  onGenerateIntegration: () => void;
}

export function KanbanProgress({
  progress,
  onGenerateIntegration,
}: KanbanProgressProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const [prevComplete, setPrevComplete] = useState(progress.isAllComplete);

  useEffect(() => {
    if (progress.isAllComplete && !prevComplete) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 5000);
      return () => clearTimeout(timer);
    }
    setPrevComplete(progress.isAllComplete);
  }, [progress.isAllComplete, prevComplete]);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <Progress
          value={progress.percentage}
          className="h-2.5 flex-1"
        />
        <span
          className={cn(
            "text-sm font-semibold tabular-nums min-w-[3ch] text-right",
            progress.isAllComplete
              ? "text-primary"
              : "text-muted-foreground"
          )}
        >
          {progress.percentage}%
        </span>
      </div>

      {/* Stats row + button */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">
          <span className="inline-flex items-center gap-0.5">
            <Icon name="checklist" className="w-3.5 h-3.5" />
            &nbsp;질문 {progress.completedSections}/{progress.totalSections}개 완료
          </span>
          <span className="mx-1.5">·</span>
          <span className="inline-flex items-center gap-0.5">
            <Icon name="attach_file" className="w-3.5 h-3.5" />
            &nbsp;서류 {progress.completedDocuments}/{progress.totalDocuments}건 첨부
          </span>
        </p>

        <Tooltip>
          <TooltipTrigger>
            <Button
              size="sm"
              disabled={!progress.isAllComplete}
              onClick={onGenerateIntegration}
              className={cn(
                "shrink-0 text-xs gap-1.5",
                !progress.isAllComplete && "opacity-50 cursor-not-allowed"
              )}
            >
              <Icon name="summarize" className="w-4 h-4" />
              지원서 통합본 만들기
            </Button>
          </TooltipTrigger>
          {!progress.isAllComplete && (
            <TooltipContent side="bottom">
              모든 항목을 완료해주세요
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Celebration banner */}
      {showCelebration && (
        <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs text-primary animate-in fade-in slide-in-from-top-1 duration-300">
          <span>🎉</span>
          <span>모든 항목이 완료되었습니다! 통합본을 생성할 수 있습니다.</span>
        </div>
      )}
    </div>
  );
}

export default KanbanProgress;

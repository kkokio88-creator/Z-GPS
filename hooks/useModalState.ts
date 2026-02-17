/**
 * 모달/패널 상태 관리 (10+ 모달)
 */
import { useState } from 'react';
import { DraftSnapshot, ConsistencyCheckResult, AuditDefenseResult } from '../types';

export interface GanttTask {
  name: string;
  startMonth: number;
  durationMonths: number;
}

export interface GanttData {
  tasks: GanttTask[];
}

export interface BudgetItem {
  category: string;
  amount: number;
  description: string;
}

export interface CompetitorInfo {
  name: string;
  strengths: string[];
  weaknesses: string[];
}

export function useModalState() {
  // Consistency
  const [showConsistencyModal, setShowConsistencyModal] = useState(false);
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null);
  const [isConsistencyChecking, setIsConsistencyChecking] = useState(false);

  // Defense
  const [showDefenseModal, setShowDefenseModal] = useState(false);
  const [defenseResult, setDefenseResult] = useState<AuditDefenseResult | null>(null);
  const [isDefenseLoading, setIsDefenseLoading] = useState(false);

  // Export
  const [showExportModal, setShowExportModal] = useState(false);

  // Gantt
  const [showGanttModal, setShowGanttModal] = useState(false);
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [isGanttLoading, setIsGanttLoading] = useState(false);

  // Budget
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [isBudgeting, setIsBudgeting] = useState(false);

  // Interview
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [isInterviewLoading, setIsInterviewLoading] = useState(false);
  const [interviewQuestions, setInterviewQuestions] = useState<string[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [interviewAnswer, setInterviewAnswer] = useState('');
  const [interviewFeedback, setInterviewFeedback] = useState('');

  // Slides
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);

  // Summary
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  // Image
  const [showImageModal, setShowImageModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Diff
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffTargetSnapshot, setDiffTargetSnapshot] = useState<DraftSnapshot | null>(null);

  // Competitor
  const [showCompetitorPanel, setShowCompetitorPanel] = useState(false);
  const [competitors, setCompetitors] = useState<CompetitorInfo[]>([]);
  const [isAnalyzingCompetitors, setIsAnalyzingCompetitors] = useState(false);

  // Snapshot menu
  const [showSnapshotMenu, setShowSnapshotMenu] = useState(false);

  return {
    showConsistencyModal, setShowConsistencyModal,
    consistencyResult, setConsistencyResult,
    isConsistencyChecking, setIsConsistencyChecking,
    showDefenseModal, setShowDefenseModal,
    defenseResult, setDefenseResult,
    isDefenseLoading, setIsDefenseLoading,
    showExportModal, setShowExportModal,
    showGanttModal, setShowGanttModal,
    ganttData, setGanttData,
    isGanttLoading, setIsGanttLoading,
    showBudgetModal, setShowBudgetModal,
    budgetItems, setBudgetItems,
    isBudgeting, setIsBudgeting,
    showInterviewModal, setShowInterviewModal,
    isInterviewLoading, setIsInterviewLoading,
    interviewQuestions, setInterviewQuestions,
    currentQuestionIdx, setCurrentQuestionIdx,
    interviewAnswer, setInterviewAnswer,
    interviewFeedback, setInterviewFeedback,
    showSlideModal, setShowSlideModal,
    slides, setSlides,
    currentSlideIndex, setCurrentSlideIndex,
    isGeneratingSlides, setIsGeneratingSlides,
    showSummaryModal, setShowSummaryModal,
    summaryText, setSummaryText,
    isSummaryLoading, setIsSummaryLoading,
    showImageModal, setShowImageModal,
    imagePrompt, setImagePrompt,
    generatedImage, setGeneratedImage,
    isGeneratingImage, setIsGeneratingImage,
    showDiffModal, setShowDiffModal,
    diffTargetSnapshot, setDiffTargetSnapshot,
    showCompetitorPanel, setShowCompetitorPanel,
    competitors, setCompetitors,
    isAnalyzingCompetitors, setIsAnalyzingCompetitors,
    showSnapshotMenu, setShowSnapshotMenu,
  };
}

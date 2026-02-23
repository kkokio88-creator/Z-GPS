import Icon from './ui/Icon';
import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    draftAgent, refinementAgent, budgetAgent,
    interviewAgent, scheduleAgent, consistencyAgent, dueDiligenceAgent
} from '../services/geminiAgents';
import { saveStoredApplication } from '../services/storageService';
import { vaultService } from '../services/vaultService';
import Header from './Header';
import LeftPanel from './editor/LeftPanel';
import SectionCard from './editor/SectionCard';
import ConsistencyModal from './editor/ConsistencyModal';
import DefenseModal from './editor/DefenseModal';
import ExportModal from './editor/ExportModal';
import GanttModal from './editor/GanttModal';
import { KanbanBoard } from './kanban/KanbanBoard';
import KanbanCardDetail from './kanban/KanbanCardDetail';
import { KanbanProgress } from './kanban/KanbanProgress';
import { useEditorState } from '../hooks/useEditorState';
import { useModalState } from '../hooks/useModalState';
import { useAITools } from '../hooks/useAITools';
import { useKanbanState } from '../hooks/useKanbanState';
import { getGoogleCalendarUrlForProgram } from '../services/calendarService';
import type { KanbanStatus } from '../types';

const ApplicationEditor: React.FC = () => {
  const { programId, slug } = useParams();
  const navigate = useNavigate();
  const editorKey = slug || programId;

  const editor = useEditorState(editorKey);
  const modals = useModalState();
  const ai = useAITools();

  const kanban = useKanbanState(
    editorKey,
    editor.sectionSchema,
    editor.draftSections,
    editor.documentStatus,
    editor.program?.requiredDocuments || [],
  );

  if (!editor.program || !editor.company) return <div>Loading...</div>;

  const { company, program } = editor;

  // === Kanban Handlers ===

  const handleKanbanCardClick = (cardId: string) => {
    kanban.setActiveCard(cardId);
  };

  const handleKanbanTextChange = (cardId: string, text: string) => {
    editor.setDraftSections(prev => ({ ...prev, [cardId]: text }));
  };

  const handleKanbanGenerateAI = async (cardId: string, sectionTitle: string) => {
    kanban.setAiGenerating(cardId);
    let extendedContext = editor.referenceContext;
    if (editor.gapAnalysisData) {
      extendedContext += `\n\n[STRATEGY GUIDE]\nStrengths to emphasize: ${editor.gapAnalysisData.strengths.join(', ')}\nAdvice: ${editor.gapAnalysisData.advice}`;
    }
    try {
      const res = await draftAgent.writeSection(company, program, sectionTitle, ai.useSearchGrounding, extendedContext);
      kanban.setAiRecommendation(cardId, res.text);
    } catch (error) {
      if (import.meta.env.DEV) console.error('AI Generation Error', error);
      kanban.setAiRecommendation(cardId, 'AI 작성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      kanban.setAiGenerating(null);
    }
  };

  const handleKanbanApplyAI = (cardId: string) => {
    const card = kanban.cards.find(c => c.id === cardId);
    if (card?.aiRecommendation) {
      editor.setDraftSections(prev => ({ ...prev, [cardId]: card.aiRecommendation! }));
    }
  };

  const handleKanbanStatusChange = (cardId: string, status: KanbanStatus) => {
    kanban.moveCard(cardId, status);
  };

  const handleGenerateIntegration = () => {
    modals.setShowExportModal(true);
  };

  // === Handlers ===

  const handleSaveApplication = () => {
    saveStoredApplication({
      id: editor.appId,
      programId: program.id,
      programSnapshot: {
        name: program.programName,
        organizer: program.organizer,
        endDate: program.officialEndDate,
        grantAmount: program.expectedGrant,
        type: program.supportType,
        description: program.description,
        requiredDocuments: program.requiredDocuments,
        detailUrl: program.detailUrl,
      },
      companyId: company.id,
      status: '작성 중',
      draftSections: editor.draftSections,
      documentStatus: editor.documentStatus,
      updatedAt: new Date().toISOString(),
      isCalendarSynced: editor.isCalendarSynced,
      snapshots: editor.snapshots,
      comments: editor.comments,
      gapAnalysis: editor.gapAnalysisData,
      sectionSchema: {
        programSlug: program.id,
        sections: editor.sectionSchema,
        generatedAt: new Date().toISOString(),
        source: editor.sectionSchemaSource === 'saved' ? 'ai_analyzed' : editor.sectionSchemaSource,
      },
    });

    // Gap #6 fix: Also save to Vault for Obsidian-First workflow
    const editorSlug = slug || programId;
    if (editorSlug) {
      vaultService.updateApplication(editorSlug, editor.draftSections).catch((err: unknown) => {
        if (import.meta.env.DEV) console.error('[ApplicationEditor] Vault save failed:', err);
      });
    }

    alert('저장되었습니다.');
  };

  const scrollToSection = (sectionTitle: string) => {
    const targetSection = editor.sectionSchema.find(s => sectionTitle.includes(s.title) || s.title.includes(sectionTitle));
    if (targetSection && ai.sectionRefs.current[targetSection.id]) {
      ai.sectionRefs.current[targetSection.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const el = ai.sectionRefs.current[targetSection.id];
      if (el) {
        el.classList.add('ring-4', 'ring-red-400', 'transition-all', 'duration-500');
        setTimeout(() => el.classList.remove('ring-4', 'ring-red-400'), 2500);
      }
      modals.setShowConsistencyModal(false);
    } else {
      alert(`해당 섹션('${sectionTitle}')을 찾을 수 없습니다.`);
    }
  };

  const handleDocumentToggle = (doc: string) => {
    editor.setDocumentStatus(prev => ({ ...prev, [doc]: !prev[doc] }));
  };

  const handleGenerateAI = async (sectionId: string, sectionTitle: string) => {
    ai.setIsGenerating(sectionId);
    let extendedContext = editor.referenceContext;
    if (editor.gapAnalysisData) {
      extendedContext += `\n\n[STRATEGY GUIDE]\nStrengths to emphasize: ${editor.gapAnalysisData.strengths.join(', ')}\nAdvice: ${editor.gapAnalysisData.advice}`;
    }
    try {
      const res = await draftAgent.writeSection(company, program, sectionTitle, ai.useSearchGrounding, extendedContext);
      editor.setDraftSections(prev => ({ ...prev, [sectionId]: res.text }));
    } catch (error) {
      if (import.meta.env.DEV) console.error('AI Generation Error', error);
      editor.setDraftSections(prev => ({ ...prev, [sectionId]: 'AI 작성 중 오류가 발생했습니다. 잠시 후 다시 시도하거나, API Key 설정을 확인해주세요.' }));
    } finally {
      ai.setIsGenerating(null);
    }
  };

  const handleTextSelect = (e: React.SyntheticEvent, sid: string) => {
    const t = e.target as HTMLTextAreaElement;
    const s = t.selectionStart;
    const end = t.selectionEnd;
    if (end - s > 5) {
      ai.setSelectedText(t.value.substring(s, end));
      ai.setSelectionRange({ start: s, end });
      ai.setActiveSectionForToolbar(sid);
      ai.setShowMagicToolbar(true);
    } else {
      ai.setShowMagicToolbar(false);
    }
  };

  const handleMagicRewrite = async () => {
    if (!ai.selectedText || !ai.activeSectionForToolbar || !ai.selectionRange) return;
    ai.setShowMagicToolbar(false);
    const refined = await refinementAgent.refine(ai.selectedText, ai.magicInstruction || 'Make it better');
    const full = editor.draftSections[ai.activeSectionForToolbar];
    const next = full.substring(0, ai.selectionRange.start) + refined + full.substring(ai.selectionRange.end);
    editor.setDraftSections(prev => ({ ...prev, [ai.activeSectionForToolbar!]: next }));
    ai.setMagicInstruction('');
  };

  const handleCalendarSync = async () => {
    ai.setIsSyncingCalendar(true);
    try {
      const url = getGoogleCalendarUrlForProgram(program, 'OFFICIAL');
      window.open(url, '_blank');
      editor.setIsCalendarSynced(true);
    } finally {
      ai.setIsSyncingCalendar(false);
    }
  };

  const handleConsistencyCheck = async () => {
    modals.setIsConsistencyChecking(true);
    modals.setShowConsistencyModal(true);
    const result = await consistencyAgent.checkConsistency(editor.draftSections);
    modals.setConsistencyResult(result);
    modals.setIsConsistencyChecking(false);
  };

  const handleDefensePrep = async () => {
    modals.setIsDefenseLoading(true);
    modals.setShowDefenseModal(true);
    const result = await dueDiligenceAgent.generateDefenseStrategy(company, editor.draftSections);
    modals.setDefenseResult(result);
    modals.setIsDefenseLoading(false);
  };

  const handleBudgetPlan = async () => {
    modals.setShowBudgetModal(true);
    modals.setIsBudgeting(true);
    const result = await budgetAgent.planBudget(program.expectedGrant, program.supportType);
    modals.setBudgetItems(result.items);
    modals.setIsBudgeting(false);
  };

  const handleGenerateGantt = async () => {
    modals.setIsGanttLoading(true);
    modals.setShowGanttModal(true);
    // 동적 섹션에서 일정/예산 관련 섹션 찾기
    const scheduleSection = editor.sectionSchema.find(s =>
      s.title.includes('일정') || s.title.includes('예산') || s.title.includes('추진') || s.id.includes('schedule') || s.id.includes('budget')
    );
    const scheduleContent = scheduleSection
      ? (editor.draftSections[scheduleSection.id] || '')
      : Object.values(editor.draftSections).join('\n');
    const data = await scheduleAgent.generateGanttData(scheduleContent);
    modals.setGanttData(data);
    modals.setIsGanttLoading(false);
  };

  const startInterview = async () => {
    modals.setShowInterviewModal(true);
    modals.setIsInterviewLoading(true);
    const allText = Object.values(editor.draftSections).join('\n');
    const questions = await interviewAgent.generateQuestions(allText);
    modals.setInterviewQuestions(questions);
    modals.setCurrentQuestionIdx(0);
    modals.setInterviewAnswer('');
    modals.setInterviewFeedback('');
    modals.setIsInterviewLoading(false);
  };

  // === Render ===

  const activeKanbanCard = kanban.activeCardId
    ? kanban.cards.find(c => c.id === kanban.activeCardId) ?? null
    : null;

  return (
    <div className="flex flex-col min-h-full relative">
      <Header title="AI 신청 프로세스" actionLabel="지원서 저장" icon="save" onAction={handleSaveApplication} secondaryLabel="목록으로" secondaryAction={() => navigate('/applications')} />

      <main className="flex-1 overflow-y-auto p-8 z-10 relative">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
        <div className="relative z-10 max-w-7xl mx-auto">

          {/* 뷰 모드 토글 + 제목 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">지원서 작성</h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border bg-muted p-0.5">
                <button
                  onClick={() => kanban.setViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${kanban.viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon name="view_list" className="h-4 w-4" />
                  리스트
                </button>
                <button
                  onClick={() => kanban.setViewMode('kanban')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${kanban.viewMode === 'kanban' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon name="view_kanban" className="h-4 w-4" />
                  칸반
                </button>
              </div>
              <button onClick={() => modals.setShowExportModal(true)} className="flex items-center px-3 py-1.5 bg-gray-800 text-white rounded text-sm hover:bg-black">
                <Icon name="print" className="h-5 w-5 mr-1" /> 표준 서식 미리보기
              </button>
            </div>
          </div>

          {/* ===== 칸반 뷰 ===== */}
          {kanban.viewMode === 'kanban' ? (
            <div className="space-y-4">
              <KanbanProgress
                progress={kanban.progress}
                onGenerateIntegration={handleGenerateIntegration}
              />

              {editor.isLoadingSchema ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <Icon name="autorenew" className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">공고 맞춤 섹션 분석 중...</p>
                </div>
              ) : (
                <KanbanBoard
                  columns={kanban.columns}
                  onMoveCard={kanban.moveCard}
                  onCardClick={handleKanbanCardClick}
                  aiGeneratingCardId={kanban.aiGeneratingCardId}
                />
              )}

              {/* 칸반 카드 상세 다이얼로그 */}
              <KanbanCardDetail
                card={activeKanbanCard}
                isOpen={!!kanban.activeCardId}
                onClose={() => kanban.setActiveCard(null)}
                onTextChange={handleKanbanTextChange}
                onGenerateAI={handleKanbanGenerateAI}
                onApplyAI={handleKanbanApplyAI}
                onStatusChange={handleKanbanStatusChange}
                onDocumentToggle={handleDocumentToggle}
              />
            </div>
          ) : (
            /* ===== 리스트 뷰 (기존) ===== */
            <div className="grid grid-cols-12 gap-6">
              <LeftPanel
                program={program}
                documentStatus={editor.documentStatus}
                onDocumentToggle={handleDocumentToggle}
                gapAnalysisData={editor.gapAnalysisData}
                showContextPanel={editor.showContextPanel}
                onToggleContextPanel={() => editor.setShowContextPanel(!editor.showContextPanel)}
                onBudgetPlan={handleBudgetPlan}
                onGenerateGantt={handleGenerateGantt}
                onConsistencyCheck={handleConsistencyCheck}
                onDefensePrep={handleDefensePrep}
                onStartInterview={startInterview}
                onCalendarSync={handleCalendarSync}
              />

              {/* Right Panel (Editor) */}
              <div className="col-span-12 lg:col-span-8 space-y-6">
                {editor.isLoadingSchema ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-3">
                    <Icon name="autorenew" className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">공고 맞춤 섹션 분석 중...</p>
                  </div>
                ) : (
                  <>
                    {editor.sectionSchemaSource === 'ai_analyzed' && (
                      <div className="flex items-center px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-xs text-indigo-700 dark:text-indigo-400 mb-2">
                        <Icon name="auto_awesome" className="h-5 w-5" />
                        공고 요구사항 기반 AI 맞춤 섹션 ({editor.sectionSchema.length}개)
                      </div>
                    )}
                    {editor.sectionSchema.map((section) => (
                      <SectionCard
                        key={section.id}
                        ref={(el) => { ai.sectionRefs.current[section.id] = el; }}
                        section={section}
                        content={editor.draftSections[section.id] || ''}
                        isGenerating={ai.isGenerating === section.id}
                        isAnyGenerating={!!ai.isGenerating}
                        onGenerateAI={() => handleGenerateAI(section.id, section.title)}
                        onTextChange={(text) => editor.setDraftSections(prev => ({ ...prev, [section.id]: text }))}
                        onTextSelect={(e) => handleTextSelect(e, section.id)}
                        magicToolbar={ai.showMagicToolbar && ai.activeSectionForToolbar === section.id ? {
                          show: true,
                          instruction: ai.magicInstruction,
                          onInstructionChange: ai.setMagicInstruction,
                          onRewrite: handleMagicRewrite,
                        } : undefined}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Modals */}
      {modals.showConsistencyModal && (
        <ConsistencyModal
          result={modals.consistencyResult}
          isLoading={modals.isConsistencyChecking}
          onClose={() => modals.setShowConsistencyModal(false)}
          onScrollToSection={scrollToSection}
        />
      )}

      {modals.showDefenseModal && (
        <DefenseModal
          result={modals.defenseResult}
          isLoading={modals.isDefenseLoading}
          onClose={() => modals.setShowDefenseModal(false)}
        />
      )}

      {modals.showExportModal && (
        <ExportModal
          company={company}
          program={program}
          draftSections={editor.draftSections}
          sections={editor.sectionSchema}
          onClose={() => modals.setShowExportModal(false)}
        />
      )}

      {modals.showGanttModal && (
        <GanttModal
          data={modals.ganttData}
          isLoading={modals.isGanttLoading}
          onClose={() => modals.setShowGanttModal(false)}
        />
      )}
    </div>
  );
};

export default ApplicationEditor;

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DRAFT_SECTIONS, INITIAL_APPLICATION } from '../constants';
import { 
    analysisAgent, draftAgent, supervisorAgent, reviewAgent, refinementAgent, 
    voiceDictationAgent, presentationAgent, ReviewPersona, budgetAgent, 
    interviewAgent, competitorAgent, translationAgent, speechAgent, summaryAgent,
    fileParserAgent, imageGenAgent, scheduleAgent, consistencyAgent, dueDiligenceAgent
} from '../services/geminiAgents'; 
import { learnFromApplication } from '../services/ontologyService'; 
import { getStoredCompany, getApplicationByProgramId, saveStoredApplication, getTeamMembers } from '../services/storageService';
import { getGoogleCalendarUrlForProgram } from '../services/calendarService';
import { SupportProgram, Application, DraftSnapshot, DraftComment, ReviewResult, ConsistencyCheckResult, AuditDefenseResult, EligibilityStatus } from '../types';
import Header from './Header';

// ... [Keep RadarChart] ...
const RadarChart: React.FC<{ scores: { [key: string]: number } }> = ({ scores }) => {
    const size = 300; const center = size / 2; const radius = 100;
    const labels = [{ key: 'technology', label: '기술성' }, { key: 'marketability', label: '사업성' }, { key: 'originality', label: '독창성' }, { key: 'capability', label: '수행역량' }, { key: 'socialValue', label: '사회적가치' }];
    const angleSlice = (Math.PI * 2) / labels.length;
    const points = labels.map((label, i) => { const val = scores[label.key] || 0; const r = (val / 100) * radius; const x = center + r * Math.cos(i * angleSlice - Math.PI / 2); const y = center + r * Math.sin(i * angleSlice - Math.PI / 2); return `${x},${y}`; }).join(' ');
    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1].map(level => labels.map((_, i) => { const r = level * radius; const x = center + r * Math.cos(i * angleSlice - Math.PI / 2); const y = center + r * Math.sin(i * angleSlice - Math.PI / 2); return `${x},${y}`; }).join(' '));
    const labelPos = labels.map((l, i) => { const r = radius + 20; const x = center + r * Math.cos(i * angleSlice - Math.PI / 2); const y = center + r * Math.sin(i * angleSlice - Math.PI / 2); return { x, y, text: l.label }; });
    return ( <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}> {gridLevels.map((pts, i) => ( <polygon key={i} points={pts} fill="none" stroke="#e5e7eb" strokeWidth="1" /> ))} <polygon points={points} fill="rgba(13, 86, 17, 0.2)" stroke="#0D5611" strokeWidth="2" /> {labelPos.map((pos, i) => ( <text key={i} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#4b5563"> {pos.text} ({scores[labels[i].key]}) </text> ))} </svg> );
};

const ApplicationEditor: React.FC = () => {
  const { programId, companyId } = useParams();
  const navigate = useNavigate();
  // ... [Keep existing state] ...
  const company = getStoredCompany();
  // V1.7: Reconstruct SupportProgram from Application Snapshot if possible
  const [program, setProgram] = useState<SupportProgram | null>(null);
  
  const teamMembers = getTeamMembers();
  
  const [draftSections, setDraftSections] = useState(INITIAL_APPLICATION.draftSections);
  const [sectionAssignees, setSectionAssignees] = useState<{[key:string]: string}>({}); 
  const [documentStatus, setDocumentStatus] = useState(INITIAL_APPLICATION.documentStatus);
  const [appId, setAppId] = useState<string>(`app_${Date.now()}`);
  const [snapshots, setSnapshots] = useState<DraftSnapshot[]>([]); 
  const [comments, setComments] = useState<DraftComment[]>([]); 
  const [gapAnalysisData, setGapAnalysisData] = useState<any>(null); // V1.5 Strategy Context
  
  const [isGenerating, setIsGenerating] = useState<string | null>(null); 
  const [isRefining, setIsRefining] = useState<string | null>(null); 
  const [isListening, setIsListening] = useState<string | null>(null); 
  const [isAnalyzingDocs, setIsAnalyzingDocs] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [isCalendarSynced, setIsCalendarSynced] = useState(false);
  const [sourcesMap, setSourcesMap] = useState<{[key:string]: any[]}>({});
  
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [reviewPersona, setReviewPersona] = useState<ReviewPersona>('GENERAL');
  const [referenceContext, setReferenceContext] = useState<string>('');
  const [showContextPanel, setShowContextPanel] = useState(true); // V1.5 Auto-expand if strategy exists
  
  const [showGanttModal, setShowGanttModal] = useState(false);
  const [ganttData, setGanttData] = useState<any>(null);
  const [isGanttLoading, setIsGanttLoading] = useState(false);

  const [showMagicToolbar, setShowMagicToolbar] = useState(false);
  const [activeSectionForToolbar, setActiveSectionForToolbar] = useState<string | null>(null);
  const [magicInstruction, setMagicInstruction] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<{start: number, end: number} | null>(null);

  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [isBudgeting, setIsBudgeting] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [isInterviewLoading, setIsInterviewLoading] = useState(false);
  const [interviewQuestions, setInterviewQuestions] = useState<string[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [interviewAnswer, setInterviewAnswer] = useState('');
  const [interviewFeedback, setInterviewFeedback] = useState('');
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffTargetSnapshot, setDiffTargetSnapshot] = useState<DraftSnapshot | null>(null);
  const [isGlobalMode, setIsGlobalMode] = useState(false);
  const [translatedSections, setTranslatedSections] = useState<{[key:string]: string}>({});
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);
  const [showSnapshotMenu, setShowSnapshotMenu] = useState(false);
  const [activeCommentSection, setActiveCommentSection] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const fileImportRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [showCompetitorPanel, setShowCompetitorPanel] = useState(false);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [isAnalyzingCompetitors, setIsAnalyzingCompetitors] = useState(false);

  // New States for V1.4
  const [showConsistencyModal, setShowConsistencyModal] = useState(false);
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null);
  const [isConsistencyChecking, setIsConsistencyChecking] = useState(false);

  const [showDefenseModal, setShowDefenseModal] = useState(false);
  const [defenseResult, setDefenseResult] = useState<AuditDefenseResult | null>(null);
  const [isDefenseLoading, setIsDefenseLoading] = useState(false);

  // Refs for scrolling (V1.5 Navigation)
  const sectionRefs = useRef<{[key:string]: HTMLDivElement | null}>({});

  useEffect(() => {
      if (programId) {
          const savedApp = getApplicationByProgramId(programId);
          
          if (savedApp) {
              setDraftSections(savedApp.draftSections);
              setDocumentStatus(savedApp.documentStatus);
              setAppId(savedApp.id);
              setIsCalendarSynced(!!savedApp.isCalendarSynced);
              setSnapshots(savedApp.snapshots || []);
              setComments(savedApp.comments || []);
              // V1.5 Strategy Inheritance
              if (savedApp.gapAnalysis) {
                  setGapAnalysisData(savedApp.gapAnalysis);
                  // Pre-populate reference context with advice if empty
                  if (!referenceContext) {
                      setReferenceContext(`[전략 가이드]\n${savedApp.gapAnalysis.advice}`);
                  }
              }
              
              // V1.7: Reconstruct program object from snapshot for consistent display
              if (savedApp.programSnapshot) {
                  setProgram({
                      id: savedApp.programId,
                      programName: savedApp.programSnapshot.name,
                      organizer: savedApp.programSnapshot.organizer,
                      officialEndDate: savedApp.programSnapshot.endDate,
                      internalDeadline: savedApp.programSnapshot.endDate, // fallback
                      expectedGrant: savedApp.programSnapshot.grantAmount,
                      supportType: savedApp.programSnapshot.type,
                      description: savedApp.programSnapshot.description || "",
                      requiredDocuments: savedApp.programSnapshot.requiredDocuments || [],
                      fitScore: 0,
                      eligibility: EligibilityStatus.POSSIBLE,
                      priorityRank: 0,
                      eligibilityReason: "",
                      detailUrl: savedApp.programSnapshot.detailUrl
                  });
              } else {
                  // Fallback for old data or direct link without snapshot
                  setProgram({
                      id: programId,
                      programName: "저장된 지원사업 (세부정보 없음)",
                      organizer: "정보 없음",
                      supportType: "기타",
                      officialEndDate: "2025-12-31",
                      internalDeadline: "2025-12-24",
                      expectedGrant: 0,
                      fitScore: 0,
                      eligibility: EligibilityStatus.POSSIBLE,
                      priorityRank: 0,
                      eligibilityReason: "",
                      requiredDocuments: [],
                      successProbability: "Unknown",
                      detailUrl: ""
                  });
              }
          } 
      }
  }, [programId]);

  if (!program || !company) return <div>Loading...</div>;

  // V1.5 Deep Link Navigation with Animation
  const scrollToSection = (sectionTitle: string) => {
      // Find matching section ID
      const targetSection = DRAFT_SECTIONS.find(s => sectionTitle.includes(s.title) || s.title.includes(sectionTitle));
      if (targetSection && sectionRefs.current[targetSection.id]) {
          sectionRefs.current[targetSection.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // V1.6 Better Highlight effect
          const el = sectionRefs.current[targetSection.id];
          if(el) {
              el.classList.add('ring-4', 'ring-red-400', 'transition-all', 'duration-500');
              setTimeout(() => el.classList.remove('ring-4', 'ring-red-400'), 2500);
          }
          setShowConsistencyModal(false); // Close modal
      } else {
          alert(`해당 섹션('${sectionTitle}')을 찾을 수 없습니다.`);
      }
  };

  // ... [Handlers] ...
  const handleSaveApplication = async () => { 
      if(!program) return;
      saveStoredApplication({
          id: appId, 
          programId: program.id, 
          programSnapshot: {
              name: program.programName,
              organizer: program.organizer,
              endDate: program.officialEndDate,
              grantAmount: program.expectedGrant,
              type: program.supportType,
              description: program.description,
              requiredDocuments: program.requiredDocuments,
              detailUrl: program.detailUrl // Persist URL
          },
          companyId: company.id, 
          status: '작성 중', 
          draftSections, 
          documentStatus, 
          updatedAt: new Date().toISOString(), 
          isCalendarSynced, 
          snapshots, 
          comments, 
          gapAnalysis: gapAnalysisData
      }); 
      alert("저장되었습니다."); 
  };
  const handleTakeSnapshot = () => { /* ... */ };
  const handleRestoreSnapshot = (s: DraftSnapshot) => { /* ... */ };
  const handleCompareSnapshot = (s: DraftSnapshot) => { setDiffTargetSnapshot(s); setShowDiffModal(true); setShowSnapshotMenu(false); };
  const handleExport = () => { setShowExportModal(true); };
  const handleAddComment = (sid: string) => { if (!newCommentText.trim()) return; setComments([...comments, {id: Date.now().toString(), sectionId: sid, author: '나', text: newCommentText, timestamp: new Date().toISOString(), isResolved: false}]); setNewCommentText(""); };
  const handleResolveComment = (id: string) => { setComments(comments.map(c => c.id === id ? { ...c, isResolved: !c.isResolved } : c)); };
  const getSectionComments = (sid: string) => comments.filter(c => c.sectionId === sid);
  const handleDocumentToggle = (doc: string) => { setDocumentStatus(prev => ({ ...prev, [doc]: !prev[doc] })); };
  const handleAnalyzeRequirements = async () => { /* ... */ };
  
  const handleGenerateAI = async (sectionId: string, sectionTitle: string) => { 
      setIsGenerating(sectionId); 
      // V1.5 Include Strategy in Prompt Context
      let extendedContext = referenceContext;
      if (gapAnalysisData) {
          extendedContext += `\n\n[STRATEGY GUIDE]\nStrengths to emphasize: ${gapAnalysisData.strengths.join(", ")}\nAdvice: ${gapAnalysisData.advice}`;
      }
      
      try {
          const res = await draftAgent.writeSection(company, program, sectionTitle, useSearchGrounding, extendedContext); 
          // Always update draft sections, even if it returns an error message text
          setDraftSections(prev => ({ ...prev, [sectionId]: res.text })); 
      } catch (error) {
          console.error("AI Generation Error", error);
          setDraftSections(prev => ({ ...prev, [sectionId]: "⚠️ AI 작성 중 오류가 발생했습니다. 잠시 후 다시 시도하거나, API Key 설정을 확인해주세요." }));
      } finally {
          setIsGenerating(null); 
      }
  };
  const handleRefineDraft = async (sid: string, type: any) => { /* ... */ };
  const handleTextSelect = (e: any, sid: string) => { const t = e.target; const s = t.selectionStart; const end = t.selectionEnd; if (end - s > 5) { setSelectedText(t.value.substring(s, end)); setSelectionRange({start: s, end}); setActiveSectionForToolbar(sid); setShowMagicToolbar(true); } else { setShowMagicToolbar(false); } };
  const handleMagicRewrite = async () => { if (!selectedText) return; setShowMagicToolbar(false); const refined = await refinementAgent.refine(selectedText, magicInstruction || "Make it better"); const full = draftSections[activeSectionForToolbar!]; const next = full.substring(0, selectionRange!.start) + refined + full.substring(selectionRange!.end); setDraftSections(prev => ({ ...prev, [activeSectionForToolbar!]: next })); setMagicInstruction(''); };
  const handleTranslateSection = async (sid: string) => { /* ... */ };
  const handleTTS = async (sid: string) => { /* ... */ };
  const handleVoiceToggle = async (sid: string) => { /* ... */ };
  const handleCalendarSync = async () => { /* ... */ };
  const handleReview = async () => { /* ... */ };
  const handleBudgetPlan = async () => { setShowBudgetModal(true); setIsBudgeting(true); const result = await budgetAgent.planBudget(program.expectedGrant, program.supportType); setBudgetItems(result.items); setIsBudgeting(false); };
  const startInterview = async () => { setShowInterviewModal(true); setIsInterviewLoading(true); const allText = Object.values(draftSections).join("\n"); const questions = await interviewAgent.generateQuestions(allText); setInterviewQuestions(questions); setCurrentQuestionIdx(0); setInterviewAnswer(''); setInterviewFeedback(''); setIsInterviewLoading(false); };
  const submitInterviewAnswer = async () => { setIsInterviewLoading(true); const fb = await interviewAgent.evaluateAnswer(interviewQuestions[currentQuestionIdx], interviewAnswer); setInterviewFeedback(fb); setIsInterviewLoading(false); };
  const nextQuestion = () => { if(currentQuestionIdx < interviewQuestions.length - 1) { setCurrentQuestionIdx(p=>p+1); setInterviewAnswer(''); setInterviewFeedback(''); } else { alert("끝"); setShowInterviewModal(false); } };
  const handleGenerateSlides = async () => { /* ... */ };
  const handleGenerateSummary = async () => { /* ... */ };
  const handleFileImport = async (e: any) => { /* ... */ };
  const handleGenerateImage = async () => { /* ... */ };
  const handleAssignMember = (sid: string, mid: string) => { /* ... */ };
  const handleGenerateGantt = async () => { setIsGanttLoading(true); setShowGanttModal(true); const data = await scheduleAgent.generateGanttData(draftSections['section5'] || ""); setGanttData(data); setIsGanttLoading(false); };

  // New Handlers V1.4
  const handleConsistencyCheck = async () => {
      setIsConsistencyChecking(true);
      setShowConsistencyModal(true);
      const result = await consistencyAgent.checkConsistency(draftSections);
      setConsistencyResult(result);
      setIsConsistencyChecking(false);
  };

  const handleDefensePrep = async () => {
      setIsDefenseLoading(true);
      setShowDefenseModal(true);
      const result = await dueDiligenceAgent.generateDefenseStrategy(company, draftSections);
      setDefenseResult(result);
      setIsDefenseLoading(false);
  };

  return (
    <div className="flex flex-col h-full relative">
      <Header title="AI 신청 프로세스" actionLabel="지원서 저장" icon="save" onAction={handleSaveApplication} secondaryLabel="목록으로" secondaryAction={() => navigate('/applications')} />

      <main className="flex-1 overflow-y-auto p-8 z-10 relative">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
        <div className="relative z-10 grid grid-cols-12 gap-6 max-w-7xl mx-auto">
          {/* Left Panel - V1.7 Improved Visibility */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
             {/* Program Info Card */}
             <div className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-border-light dark:border-border-dark p-6">
                 <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded mb-2">{program.supportType}</span>
                 <h2 className="text-lg font-bold leading-tight mb-2">{program.programName}</h2>
                 <p className="text-xs text-gray-500 mb-4">{program.organizer}</p>
                 
                 <div className="grid grid-cols-2 gap-4 mb-4 border-t border-gray-100 pt-4">
                     <div>
                         <span className="text-xs text-gray-400 block mb-1">지원금액</span>
                         <span className="text-lg font-bold text-indigo-600">{(program.expectedGrant/100000000).toFixed(1)}억원</span>
                     </div>
                     <div>
                         <span className="text-xs text-gray-400 block mb-1">마감일</span>
                         <span className="text-sm font-bold text-gray-800">{new Date(program.officialEndDate).toLocaleDateString()}</span>
                     </div>
                 </div>

                 <button onClick={handleCalendarSync} className="w-full py-2 border rounded text-sm flex items-center justify-center hover:bg-gray-50 mb-2"><span className="material-icons-outlined text-sm mr-2">event</span>캘린더 등록</button>
                 
                 {program.detailUrl && (
                     <a href={program.detailUrl} target="_blank" rel="noreferrer" className="w-full py-2 bg-gray-50 border border-gray-300 rounded text-sm flex items-center justify-center hover:bg-gray-100 text-gray-700 font-medium">
                         <span className="material-icons-outlined text-sm mr-2">open_in_new</span>공고 원문 보기
                     </a>
                 )}
                 
                 <h4 className="font-bold text-xs text-gray-500 mt-4 mb-2">제출 필요 서류</h4>
                 <ul className="text-xs space-y-1 text-gray-600 bg-gray-50 p-3 rounded">
                     {program.requiredDocuments.length > 0 ? program.requiredDocuments.map((doc, idx) => (
                         <li key={idx} className="flex items-center">
                             <input type="checkbox" checked={documentStatus[doc]||false} onChange={() => handleDocumentToggle(doc)} className="mr-2 h-3 w-3 rounded text-primary focus:ring-0"/>
                             {doc}
                         </li>
                     )) : <li className="text-gray-400">명시된 서류 없음</li>}
                 </ul>
             </div>

             {/* V1.5 Strategy Inheritance Display */}
             {gapAnalysisData && (
                 <div className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-indigo-200 dark:border-indigo-800 p-6 relative overflow-hidden">
                     <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                     <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => setShowContextPanel(!showContextPanel)}>
                         <h3 className="text-sm font-bold flex items-center text-indigo-700 dark:text-indigo-300">
                             <span className="material-icons-outlined mr-2 text-sm">strategy</span> 전략 가이드
                         </h3>
                         <span className="material-icons-outlined text-sm">{showContextPanel ? 'expand_less' : 'expand_more'}</span>
                     </div>
                     {showContextPanel && (
                         <div className="text-xs space-y-2 animate-fade-in">
                             <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                                 <strong className="text-green-700 dark:text-green-300 block mb-1">강조 포인트</strong>
                                 <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                                     {gapAnalysisData.strengths.slice(0,2).map((s:string, i:number) => <li key={i}>{s}</li>)}
                                 </ul>
                             </div>
                             <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded">
                                 <strong className="text-red-700 dark:text-red-300 block mb-1">보완 필요</strong>
                                 <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                                     {gapAnalysisData.gaps.slice(0,2).map((s:string, i:number) => <li key={i}>{s}</li>)}
                                 </ul>
                             </div>
                             <p className="text-gray-500 italic mt-2 border-t pt-2">
                                 * 이 전략은 AI 초안 생성 시 자동으로 반영됩니다.
                             </p>
                         </div>
                     )}
                 </div>
             )}
             
             {/* Action Cards (Updated Layout) */}
             <div className="grid grid-cols-2 gap-3">
                 <button onClick={handleBudgetPlan} className="p-3 bg-teal-50 text-teal-700 border border-teal-200 rounded text-xs font-bold hover:bg-teal-100 flex flex-col items-center"><span className="material-icons-outlined mb-1">attach_money</span>예산 설계</button>
                 <button onClick={handleGenerateGantt} className="p-3 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded text-xs font-bold hover:bg-cyan-100 flex flex-col items-center"><span className="material-icons-outlined mb-1">calendar_view_week</span>일정 차트</button>
                 {/* V1.4 New Buttons */}
                 <button onClick={handleConsistencyCheck} className="p-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-xs font-bold hover:bg-indigo-100 flex flex-col items-center"><span className="material-icons-outlined mb-1">rule</span>정합성 검사</button>
                 <button onClick={handleDefensePrep} className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-bold hover:bg-red-100 flex flex-col items-center"><span className="material-icons-outlined mb-1">security</span>실사 방어</button>
                 
                 <button onClick={startInterview} className="col-span-2 p-2 bg-purple-50 text-purple-700 border border-purple-200 rounded text-xs font-bold hover:bg-purple-100 flex items-center justify-center"><span className="material-icons-outlined mr-1">record_voice_over</span>모의 면접</button>
             </div>
          </div>

          {/* Right Panel (Editor) */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
             {/* Toolbar */}
             <div className="flex items-center justify-between mb-2">
                 <h2 className="text-lg font-bold">지원서 작성</h2>
                 <button onClick={handleExport} className="flex items-center px-3 py-1.5 bg-gray-800 text-white rounded text-sm hover:bg-black"><span className="material-icons-outlined text-sm mr-1">print</span> 표준 서식 미리보기</button>
             </div>
             
             {/* Sections */}
             {DRAFT_SECTIONS.map((section) => (
                 <div key={section.id} ref={(el) => { sectionRefs.current[section.id] = el; }} className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-border-light dark:border-border-dark overflow-hidden relative transition-all duration-300">
                     {/* Magic Toolbar */}
                     {showMagicToolbar && activeSectionForToolbar === section.id && (
                         <div className="absolute z-50 left-1/2 -translate-x-1/2 top-16 bg-white dark:bg-gray-900 border border-indigo-200 shadow-xl rounded-lg p-2 flex gap-2 items-center animate-fade-in-up">
                             <span className="text-xs font-bold text-indigo-600 px-2 border-r">✨ Magic Edit</span>
                             <input type="text" className="text-xs border-none bg-transparent w-48 focus:ring-0" placeholder="수정 요청..." value={magicInstruction} onChange={e=>setMagicInstruction(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleMagicRewrite()}} autoFocus />
                             <button onClick={handleMagicRewrite} className="bg-indigo-600 text-white rounded p-1"><span className="material-icons-outlined text-sm">auto_fix_high</span></button>
                         </div>
                     )}
                     {/* Section Header */}
                     <div className="bg-gray-50 dark:bg-gray-800 px-6 py-3 border-b flex justify-between items-center">
                         <h3 className="text-sm font-bold flex items-center"><span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs mr-2">{section.id.replace('section', '')}</span>{section.title}</h3>
                         <div className="flex space-x-1">
                             <button onClick={() => handleGenerateAI(section.id, section.title)} disabled={!!isGenerating} className="text-xs bg-white border px-3 py-1 rounded shadow-sm flex items-center hover:bg-gray-50 disabled:opacity-50">
                                 {isGenerating === section.id ? "생성 중..." : "AI 초안"}
                             </button>
                         </div>
                     </div>
                     {/* Text Area */}
                     <div className="p-6 relative">
                         <textarea 
                            className="w-full p-4 border rounded-md text-sm resize-none h-48 focus:ring-1 focus:ring-primary focus:border-primary" 
                            value={draftSections[section.id] || ''} 
                            onChange={e => setDraftSections({...draftSections, [section.id]: e.target.value})} 
                            onSelect={e => handleTextSelect(e, section.id)} 
                            placeholder="내용을 입력하거나 AI 초안을 생성하세요." 
                        />
                        {isGenerating === section.id && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><span className="animate-spin material-icons-outlined text-3xl text-primary">autorenew</span></div>}
                     </div>
                 </div>
             ))}
          </div>
        </div>
      </main>
      
      {/* Existing Modals ... */}
      {/* (Keep Consistency Check Modal, Audit Defense Modal, Export Modal as is) */}
      
      {/* NEW: Consistency Check Modal with Deep Linking */}
      {showConsistencyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-fade-in-up max-h-[80vh] flex flex-col">
                  <div className="px-6 py-4 bg-indigo-700 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center"><span className="material-icons-outlined mr-2">rule</span>AI 문서 정합성 검사</h3>
                      <button onClick={() => setShowConsistencyModal(false)} className="text-white hover:text-gray-200"><span className="material-icons-outlined">close</span></button>
                  </div>
                  <div className="p-8 bg-gray-50 dark:bg-gray-900 flex-1 overflow-y-auto">
                      {isConsistencyChecking ? (
                          <div className="text-center py-20">
                              <span className="material-icons-outlined animate-spin text-5xl text-indigo-600 mb-4">find_in_page</span>
                              <p className="text-gray-600">사업비, 일정, 목표 간의 논리적 모순을 찾는 중입니다...</p>
                          </div>
                      ) : consistencyResult ? (
                          <div>
                              <div className="flex items-center justify-between mb-6 bg-white p-4 rounded-lg shadow-sm">
                                  <div>
                                      <span className="text-sm text-gray-500">논리적 완성도 점수</span>
                                      <div className="text-3xl font-bold text-indigo-600">{consistencyResult.score}점</div>
                                  </div>
                                  <div className="text-right max-w-md">
                                      <span className="text-xs font-bold text-gray-500 block mb-1">종합 제안</span>
                                      <p className="text-sm text-gray-800">{consistencyResult.suggestion}</p>
                                  </div>
                              </div>
                              <h4 className="font-bold text-sm text-gray-700 mb-3">발견된 이슈 ({consistencyResult.issues.length})</h4>
                              <div className="space-y-3">
                                  {consistencyResult.issues.map((issue, idx) => (
                                      <div 
                                        key={idx} 
                                        onClick={() => scrollToSection(issue.section)} // V1.5 Deep Link
                                        className="bg-white border-l-4 border-red-500 p-4 rounded shadow-sm hover:bg-gray-50 cursor-pointer group transition-colors"
                                      >
                                          <div className="flex justify-between mb-1">
                                              <span className="font-bold text-sm text-red-600 flex items-center">
                                                  [{issue.section}]
                                                  <span className="material-icons-outlined text-xs ml-1 opacity-0 group-hover:opacity-100 transition-opacity">open_in_new</span>
                                              </span>
                                              <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">{issue.severity}</span>
                                          </div>
                                          <p className="text-sm text-gray-700">{issue.description}</p>
                                      </div>
                                  ))}
                                  {consistencyResult.issues.length === 0 && <div className="text-center text-gray-400 py-4">발견된 논리적 오류가 없습니다. 완벽합니다!</div>}
                              </div>
                          </div>
                      ) : null}
                  </div>
              </div>
          </div>
      )}

      {/* Audit Defense Modal (Same as previous) */}
      {showDefenseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
                  <div className="px-6 py-4 bg-red-700 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center"><span className="material-icons-outlined mr-2">security</span>현장 실사 방어 솔루션</h3>
                      <button onClick={() => setShowDefenseModal(false)} className="text-white hover:text-gray-200"><span className="material-icons-outlined">close</span></button>
                  </div>
                  <div className="p-8 bg-gray-50 dark:bg-gray-900 flex-1 overflow-y-auto">
                      {isDefenseLoading ? (
                          <div className="text-center py-20">
                              <span className="material-icons-outlined animate-spin text-5xl text-red-600 mb-4">gavel</span>
                              <p className="text-gray-600">평가위원 페르소나로 빙의하여 약점을 분석 중입니다...</p>
                          </div>
                      ) : defenseResult ? (
                          <div className="space-y-6">
                              <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-sm text-red-800">
                                  <strong>⚠️ 경고:</strong> 아래 질문들은 평가위원이 실제 현장에서 가장 뼈아프게 질문할 수 있는 내용들입니다. 반드시 숙지하세요.
                              </div>
                              {defenseResult.questions.map((q, idx) => (
                                  <div key={idx} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                                      <h4 className="font-bold text-lg text-gray-800 mb-2 flex items-start">
                                          <span className="text-red-600 mr-2">Q{idx+1}.</span> {q.question}
                                      </h4>
                                      <div className="text-xs text-gray-500 mb-4 bg-gray-100 inline-block px-2 py-1 rounded">
                                          의도: {q.intent}
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div className="bg-blue-50 p-4 rounded border border-blue-100">
                                              <span className="font-bold text-blue-700 text-xs block mb-1">🛡️ 방어 논리</span>
                                              <p className="text-sm text-blue-900 leading-relaxed">{q.defenseStrategy}</p>
                                          </div>
                                          <div className="bg-green-50 p-4 rounded border border-green-100">
                                              <span className="font-bold text-green-700 text-xs block mb-1">💬 모범 답변 (Script)</span>
                                              <p className="text-sm text-green-900 leading-relaxed">"{q.sampleAnswer}"</p>
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      ) : null}
                  </div>
              </div>
          </div>
      )}

      {/* Export Modal (Same as previous) */}
      {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-fade-in-up h-[95vh] flex flex-col">
                  <div className="px-6 py-4 bg-gray-800 text-white flex justify-between items-center">
                      <h3 className="text-lg font-bold flex items-center"><span className="material-icons-outlined mr-2">description</span>정부 표준 서식 미리보기 (HWP Style)</h3>
                      <button onClick={() => setShowExportModal(false)} className="text-white hover:text-gray-300"><span className="material-icons-outlined">close</span></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 bg-gray-200 dark:bg-gray-900 flex justify-center">
                      {/* Document Page Simulation */}
                      <div className="bg-white w-[210mm] min-h-[297mm] p-[20mm] shadow-lg text-black text-[11pt] leading-[1.6] font-serif">
                          {/* Title */}
                          <div className="border-4 border-double border-black p-4 mb-8 text-center">
                              <h1 className="text-3xl font-bold tracking-widest mb-4">[사업계획서]</h1>
                              <h2 className="text-xl font-bold">{program.programName}</h2>
                          </div>

                          {/* Table Summary */}
                          <table className="w-full border-collapse border border-black mb-10 text-sm">
                              <tbody>
                                  <tr>
                                      <td className="border border-black bg-gray-100 p-2 text-center font-bold w-32">기업명</td>
                                      <td className="border border-black p-2">{company.name}</td>
                                      <td className="border border-black bg-gray-100 p-2 text-center font-bold w-32">대표자</td>
                                      <td className="border border-black p-2">홍길동</td>
                                  </tr>
                                  <tr>
                                      <td className="border border-black bg-gray-100 p-2 text-center font-bold">사업자번호</td>
                                      <td className="border border-black p-2">{company.businessNumber}</td>
                                      <td className="border border-black bg-gray-100 p-2 text-center font-bold">업종</td>
                                      <td className="border border-black p-2">{company.industry}</td>
                                  </tr>
                              </tbody>
                          </table>

                          {/* Content Body */}
                          {DRAFT_SECTIONS.map((section, idx) => (
                              <div key={section.id} className="mb-8">
                                  {/* HWP Style Header */}
                                  <div className="flex items-center mb-3">
                                      <div className="w-6 h-6 rounded-full border-2 border-black flex items-center justify-center font-bold text-sm mr-2">{idx + 1}</div>
                                      <h3 className="text-lg font-bold border-b-2 border-gray-400 w-full pb-1">{section.title.split('(')[0]}</h3>
                                  </div>
                                  <div className="pl-4 text-justify whitespace-pre-wrap">
                                      {(draftSections[section.id] || "내용 없음").split('\n').map((line, i) => (
                                          <p key={i} className="mb-1">
                                              {line.trim().startsWith('-') || line.trim().startsWith('•') ? line : `  ${line}`}
                                          </p>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
                  <div className="px-6 py-4 bg-white dark:bg-surface-dark border-t border-gray-200 flex justify-end gap-3">
                      <button className="px-4 py-2 border rounded flex items-center hover:bg-gray-50"><span className="material-icons-outlined mr-2">picture_as_pdf</span>PDF 저장</button>
                      <button className="px-4 py-2 bg-blue-600 text-white rounded flex items-center hover:bg-blue-700"><span className="material-icons-outlined mr-2">file_download</span>HWP 다운로드</button>
                  </div>
              </div>
          </div>
      )}

      {/* Existing Gantt Modal (if exists) */}
      {showGanttModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
              <div className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden p-6 relative">
                  <button onClick={() => setShowGanttModal(false)} className="absolute top-4 right-4"><span className="material-icons-outlined">close</span></button>
                  <h3 className="text-lg font-bold mb-4">추진 일정 차트</h3>
                  <div className="bg-gray-50 p-4 rounded min-h-[300px]">
                      {isGanttLoading ? "생성 중..." : (
                          <svg width="100%" height="300">
                              {ganttData?.tasks?.map((t:any, i:number) => (
                                  <g key={i} transform={`translate(0, ${i*30 + 20})`}>
                                      <text x="100" y="15" textAnchor="end" fontSize="12">{t.name}</text>
                                      <rect x={110 + (t.startMonth-1)*40} y="0" width={t.durationMonths*40} height="20" fill="#06b6d4" />
                                  </g>
                              ))}
                          </svg>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default ApplicationEditor;
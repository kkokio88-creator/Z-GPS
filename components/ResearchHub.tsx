import Icon from './ui/Icon';
import React, { useState, useRef, useEffect } from 'react';
import Header from './Header';
import { marketAgent, vocAgent, productVisionAgent, positioningAgent, pitchCoachAgent, reviewAgent, ReviewPersona } from '../services/geminiAgents';
import { saveStoredCompany, getStoredApplications } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { ResearchReport, Company, ReviewResult, SupportProgram, EligibilityStatus } from '../types';

// AI Persona Data (Moved from ExpertMatch.tsx)
interface AIPersona { id: ReviewPersona; name: string; role: string; description: string; icon: string; color: string; }
const AI_PERSONAS: AIPersona[] = [
    { id: 'TECHNICAL', name: '박박사 (기술)', role: 'R&D 전문', description: '기술의 독창성, 차별성, 실현 가능성을 검증합니다.', icon: 'psychology', color: 'bg-purple-100 text-purple-700' },
    { id: 'VC', name: '이이사 (투자)', role: '사업성 전문', description: '시장 규모, 매출 실현 가능성, ROI를 평가합니다.', icon: 'trending_up', color: 'bg-blue-100 text-blue-700' },
    { id: 'COMPLIANCE', name: '김팀장 (규정)', role: '규정 전문', description: '예산 적정성, 규정 준수 여부를 체크합니다.', icon: 'gavel', color: 'bg-red-100 text-red-700' }
];

const ResearchHub: React.FC = () => { // Conceptually "AI Strategy Lab"
  const [activeTab, setActiveTab] = useState<'MARKET' | 'PITCH' | 'EXPERT'>('MARKET');
  
  // --- Market Research States ---
  const [marketSubTab, setMarketSubTab] = useState<'GENERAL'|'VOC'|'MATRIX'>('GENERAL');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [vocInput, setVocInput] = useState('');
  const [vocResult, setVocResult] = useState<any>(null);
  const [targetIndustry, setTargetIndustry] = useState('');
  const [matrixData, setMatrixData] = useState<any>(null);
  const [isMatrixLoading, setIsMatrixLoading] = useState(false);

  // --- Pitch Trainer States ---
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [pitchResult, setPitchResult] = useState<{score: number, feedback: string, tone: string} | null>(null);
  const [isPitchAnalyzing, setIsPitchAnalyzing] = useState(false);
  const recognitionRef = useRef<any>(null);

  // --- Expert Match States ---
  const [selectedPersona, setSelectedPersona] = useState<AIPersona | null>(null);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatThinking, setIsChatThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const applications = getStoredApplications();
  const company = useCompanyStore(s => s.company);

  // --- Handlers: Market ---
  const handleSearch = async () => { if (!query.trim()) return; setIsSearching(true); const r = await marketAgent.research(query, company.industry); setReports([{ id: `r_${Date.now()}`, query, summary: r.summary||"", keyFindings: r.keyFindings||[], sources: r.sources||[], timestamp: new Date().toISOString() }, ...reports]); setQuery(''); setIsSearching(false); };
  const handleVoc = async () => { if (!vocInput.trim()) return; setIsSearching(true); const r = await vocAgent.analyzeReviews(vocInput); setVocResult(r); setIsSearching(false); };
  const handleMatrix = async () => { if (!targetIndustry.trim()) return; setIsMatrixLoading(true); const r = await positioningAgent.generateMatrix(targetIndustry); setMatrixData(r); setIsMatrixLoading(false); };

  // --- Handlers: Pitch ---
  const startRecording = () => {
      setIsRecording(true); setTranscription(''); setPitchResult(null);
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = true; recognitionRef.current.lang = 'ko-KR'; recognitionRef.current.interimResults = true;
          recognitionRef.current.onresult = (e: any) => {
              let final = ''; for (let i = e.resultIndex; i < e.results.length; ++i) if (e.results[i].isFinal) final += e.results[i][0].transcript;
              if(final) setTranscription(p => p + " " + final);
          };
          recognitionRef.current.start();
      } else { alert("마이크 미지원 브라우저"); }
  };
  const stopRecording = async () => {
      setIsRecording(false); recognitionRef.current?.stop();
      const text = transcription.trim() || "데모 텍스트: 저희 회사는 친환경 기술로...";
      if(!transcription.trim()) setTranscription(text);
      setIsPitchAnalyzing(true);
      const res = await pitchCoachAgent.analyzePitch(text);
      setPitchResult(res);
      setIsPitchAnalyzing(false);
  };

  // --- Handlers: Expert ---
  const handleSimulation = async () => {
      if (!selectedAppId || !selectedPersona) return;
      setIsSimulating(true); setReviewResult(null); setChatMessages([]);
      const targetApp = applications.find(a => a.id === selectedAppId);
      const mockProgram: SupportProgram = {
          id: 'mock_program',
          programName: "선택된 지원사업",
          organizer: "정보 없음",
          supportType: "R&D",
          officialEndDate: '',
          internalDeadline: '',
          expectedGrant: 0,
          fitScore: 0,
          eligibility: EligibilityStatus.REVIEW_NEEDED,
          priorityRank: 0,
          eligibilityReason: '',
          requiredDocuments: [],
      };
      if (targetApp) {
          const res = await reviewAgent.reviewApplication(company, mockProgram, targetApp.draftSections, selectedPersona.id);
          setReviewResult(res);
      }
      setIsSimulating(false);
  };
  const handleExpertChat = async () => {
      if (!chatInput.trim() || !selectedPersona || !reviewResult) return;
      const userMsg = chatInput; setChatMessages(p => [...p, {role:'user', text: userMsg}]); setChatInput(''); setIsChatThinking(true);
      try { const res = await reviewAgent.askReviewer(selectedPersona.id, reviewResult, userMsg); setChatMessages(p => [...p, {role:'model', text: res}]); } 
      catch (e) { setChatMessages(p => [...p, {role:'model', text: "오류 발생"}]); }
      setIsChatThinking(false);
  };
  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:'smooth'}); }, [chatMessages]);

  return (
    <div className="flex flex-col min-h-full">
      <Header title="AI 전략 연구소 (AI Strategy Lab)" icon="psychology" />

      <main className="flex-1 p-8 z-10 relative">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
        <div className="relative z-10 max-w-6xl mx-auto">
            
            {/* Top Navigation */}
            <div className="flex justify-center mb-8">
                <div className="bg-white dark:bg-surface-dark p-1 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 inline-flex">
                    <button onClick={() => setActiveTab('MARKET')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'MARKET' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>📡 시장 조사</button>
                    <button onClick={() => setActiveTab('EXPERT')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'EXPERT' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>⚖️ 모의 심사</button>
                    <button onClick={() => setActiveTab('PITCH')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'PITCH' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>🎙️ 피칭 훈련</button>
                </div>
            </div>

            {/* TAB 1: MARKET */}
            {activeTab === 'MARKET' && (
                <div className="animate-fade-in space-y-6">
                    <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
                        <button onClick={() => setMarketSubTab('GENERAL')} className={`px-4 py-2 border-b-2 text-sm font-medium ${marketSubTab === 'GENERAL' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>통합 검색</button>
                        <button onClick={() => setMarketSubTab('MATRIX')} className={`px-4 py-2 border-b-2 text-sm font-medium ${marketSubTab === 'MATRIX' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>포지셔닝 맵</button>
                        <button onClick={() => setMarketSubTab('VOC')} className={`px-4 py-2 border-b-2 text-sm font-medium ${marketSubTab === 'VOC' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>VOC 분석</button>
                    </div>

                    {marketSubTab === 'GENERAL' && (
                        <>
                            <div className="flex gap-2">
                                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="시장 동향, 경쟁사, 기술 트렌드 검색..." className="flex-1 p-4 border rounded-lg shadow-sm focus:ring-2 focus:ring-primary"/>
                                <button onClick={handleSearch} disabled={isSearching} className="px-8 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark">{isSearching ? "분석 중..." : "AI 조사"}</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {reports.map(r => (
                                    <div key={r.id} className="bg-white dark:bg-surface-dark p-5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                        <h4 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-100">{r.query}</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-4">{r.summary}</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {r.keyFindings.slice(0,3).map((k,i) => <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">#{k}</span>)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {marketSubTab === 'MATRIX' && (
                        <div className="flex flex-col items-center">
                            <div className="w-full max-w-xl flex gap-2 mb-6">
                                <input type="text" value={targetIndustry} onChange={e=>setTargetIndustry(e.target.value)} placeholder="산업군 입력 (예: 비건 식품)" className="flex-1 p-3 border rounded-lg"/>
                                <button onClick={handleMatrix} disabled={isMatrixLoading} className="px-6 bg-primary text-white rounded-lg">{isMatrixLoading ? "생성 중..." : "매트릭스 생성"}</button>
                            </div>
                            {matrixData && (
                                <div className="bg-white p-8 rounded-lg shadow-lg border relative w-full max-w-2xl aspect-square">
                                    <h4 className="absolute top-4 left-4 font-bold text-gray-500">포지셔닝 맵</h4>
                                    <svg viewBox="0 0 400 400" className="w-full h-full overflow-visible">
                                        <line x1="20" y1="380" x2="380" y2="380" stroke="#9ca3af" strokeWidth="2" />
                                        <line x1="20" y1="380" x2="20" y2="20" stroke="#9ca3af" strokeWidth="2" />
                                        <text x="380" y="395" textAnchor="end" fontSize="12" fill="#4b5563">{matrixData.xAxis}</text>
                                        <text x="25" y="15" textAnchor="start" fontSize="12" fill="#4b5563">{matrixData.yAxis}</text>
                                        {matrixData.competitors.map((c:any, i:number) => (
                                            <g key={i}><circle cx={20+(c.x/100)*360} cy={380-(c.y/100)*360} r="6" fill="#9ca3af" opacity="0.6"/><text x={20+(c.x/100)*360} y={380-(c.y/100)*360-10} textAnchor="middle" fontSize="10">{c.name}</text></g>
                                        ))}
                                        <g><circle cx={20+(matrixData.myCompany.x/100)*360} cy={380-(matrixData.myCompany.y/100)*360} r="8" fill="#16a34a"/><text x={20+(matrixData.myCompany.x/100)*360} y={380-(matrixData.myCompany.y/100)*360-15} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#16a34a">나의 기업</text></g>
                                    </svg>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: EXPERT MATCH */}
            {activeTab === 'EXPERT' && (
                <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                    <div className="col-span-1 space-y-4">
                        <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-border-light dark:border-border-dark shadow-sm">
                            <h3 className="font-bold mb-3">1. 대상 지원서</h3>
                            <select className="w-full p-2 border rounded" value={selectedAppId} onChange={e=>setSelectedAppId(e.target.value)}>
                                <option value="">선택하세요</option>
                                {applications.map(a => <option key={a.id} value={a.id}>{a.status} (ID:{a.id})</option>)}
                            </select>
                        </div>
                        <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-border-light dark:border-border-dark shadow-sm">
                            <h3 className="font-bold mb-3">2. 심사위원 선택</h3>
                            <div className="space-y-2">
                                {AI_PERSONAS.map(p => (
                                    <div key={p.id} onClick={()=>setSelectedPersona(p)} className={`p-3 rounded border cursor-pointer flex items-center ${selectedPersona?.id === p.id ? 'border-primary bg-green-50' : 'hover:bg-gray-50'}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${p.color}`}><Icon name={p.icon} className="h-4 w-4" /></div>
                                        <div><div className="font-bold text-sm">{p.name}</div><div className="text-[10px] text-gray-500">{p.role}</div></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button onClick={handleSimulation} disabled={!selectedAppId || !selectedPersona || isSimulating} className="w-full py-3 bg-primary text-white rounded-lg font-bold shadow-md hover:bg-primary-dark disabled:opacity-50">
                            {isSimulating ? "심사 중..." : "모의 심사 시작"}
                        </button>
                    </div>

                    <div className="col-span-1 lg:col-span-2">
                        {reviewResult ? (
                            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 h-full flex flex-col overflow-hidden">
                                <div className="p-4 bg-primary text-white flex justify-between items-center">
                                    <h3 className="font-bold">{selectedPersona?.name} 심사 결과</h3>
                                    <span className="text-2xl font-bold">{reviewResult.totalScore}점</span>
                                </div>
                                <div className="p-6 flex-1 overflow-y-auto">
                                    <div className="mb-6 space-y-2">
                                        <h4 className="font-bold text-sm text-gray-500">피드백</h4>
                                        {reviewResult.feedback.map((f,i) => <div key={i} className="bg-red-50 text-red-800 p-3 rounded text-sm border-l-4 border-red-500">{f}</div>)}
                                    </div>
                                    {/* Chat */}
                                    <div className="border-t pt-4">
                                        <h4 className="font-bold text-sm mb-2 text-primary">심사위원 청문회 (Q&A)</h4>
                                        <div className="bg-gray-100 dark:bg-gray-800 rounded p-3 h-48 overflow-y-auto mb-2 space-y-2">
                                            {chatMessages.map((m,i) => (
                                                <div key={i} className={`p-2 rounded text-sm w-fit max-w-[90%] ${m.role==='user' ? 'bg-primary text-white ml-auto' : 'bg-white border text-gray-800'}`}>{m.text}</div>
                                            ))}
                                            <div ref={messagesEndRef}/>
                                        </div>
                                        <div className="flex gap-2">
                                            <input className="flex-1 border rounded p-2 text-sm" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && handleExpertChat()} placeholder="심사 결과에 대해 질문..."/>
                                            <button onClick={handleExpertChat} disabled={isChatThinking} className="bg-primary text-white px-3 rounded"><Icon name="send" className="h-5 w-5" /></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 border rounded-xl">
                                <div><Icon name="rate_review" className="h-5 w-5" />좌측에서 심사 대상을 선택하세요.</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: PITCH TRAINER */}
            {activeTab === 'PITCH' && (
                <div className="animate-fade-in text-center max-w-2xl mx-auto py-10">
                    <h2 className="text-2xl font-bold mb-2">실전 발표 연습</h2>
                    <p className="text-gray-500 mb-8">마이크를 켜고 1분간 사업계획을 발표하세요. AI가 전달력과 내용을 분석합니다.</p>
                    <button onClick={isRecording ? stopRecording : startRecording} className={`w-24 h-24 rounded-full shadow-lg mb-6 flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-primary hover:bg-primary-dark'}`}>
                        <Icon name={isRecording ? 'stop' : 'mic'} className="w-10 h-10 text-white" />
                    </button>
                    {transcription && (
                        <div className="bg-gray-100 p-4 rounded text-left text-sm text-gray-700 mb-6 min-h-[100px]">{transcription}</div>
                    )}
                    {isPitchAnalyzing && <div className="text-primary animate-pulse">분석 중...</div>}
                    {pitchResult && (
                        <div className="bg-white border border-primary/30 rounded-lg p-6 shadow-lg text-left">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg text-primary">분석 결과</h3>
                                <span className="text-2xl font-bold text-primary">{pitchResult.score}점</span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2"><strong>톤앤매너:</strong> {pitchResult.tone}</p>
                            <div className="bg-green-50 p-3 rounded text-sm text-green-800">{pitchResult.feedback}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default ResearchHub;
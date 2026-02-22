import Icon from './ui/Icon';
import React, { useState, useRef, useEffect } from 'react';
import Header from './Header';
import { getStoredApplications } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { reviewAgent, ReviewPersona } from '../services/geminiAgents';
import { Application, ReviewResult, SupportProgram, EligibilityStatus } from '../types';

interface AIPersona {
    id: ReviewPersona;
    name: string;
    role: string;
    description: string;
    icon: string;
    color: string;
}

const AI_PERSONAS: AIPersona[] = [
    { 
        id: 'TECHNICAL', 
        name: '박박사 (기술평가위원)', 
        role: 'R&D 전문', 
        description: '기술의 독창성, 차별성, 실현 가능성을 매우 깐깐하게 검증합니다.', 
        icon: 'psychology', 
        color: 'bg-purple-100 text-purple-700' 
    },
    { 
        id: 'VC', 
        name: '이이사 (벤처캐피탈)', 
        role: '사업성 전문', 
        description: '시장 규모, 매출 실현 가능성, ROI 관점에서 냉철하게 평가합니다.', 
        icon: 'trending_up', 
        color: 'bg-blue-100 text-blue-700' 
    },
    { 
        id: 'COMPLIANCE', 
        name: '김팀장 (규정감사관)', 
        role: '규정/예산 전문', 
        description: '예산 집행 계획의 적정성, 규정 준수 여부를 꼼꼼하게 체크합니다.', 
        icon: 'gavel', 
        color: 'bg-red-100 text-red-700' 
    }
];

const ExpertMatch: React.FC = () => {
    const [selectedPersona, setSelectedPersona] = useState<AIPersona | null>(null);
    const [selectedAppId, setSelectedAppId] = useState('');
    const [isSimulating, setIsSimulating] = useState(false);
    const [result, setResult] = useState<ReviewResult | null>(null);
    
    // V1.5 Chat Feature
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatThinking, setIsChatThinking] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const applications = getStoredApplications();
    const company = useCompanyStore(s => s.company);

    const handleSimulation = async () => {
        if (!selectedAppId || !selectedPersona) return;
        
        setIsSimulating(true);
        setResult(null);
        setIsChatOpen(false); // Reset chat
        setChatMessages([]);
        
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
            const reviewResult = await reviewAgent.reviewApplication(
                company, 
                mockProgram, 
                targetApp.draftSections, 
                selectedPersona.id
            );
            setResult(reviewResult);
        }
        setIsSimulating(false);
    };

    const handleChatSend = async () => {
        if (!chatInput.trim() || !selectedPersona || !result) return;
        
        const userMsg = chatInput;
        setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setChatInput('');
        setIsChatThinking(true);

        try {
            // Call Real Agent
            const responseText = await reviewAgent.askReviewer(selectedPersona.id, result, userMsg);
            setChatMessages(prev => [...prev, { role: 'model', text: responseText }]);
        } catch (error) {
            setChatMessages(prev => [...prev, { role: 'model', text: "오류가 발생하여 답변을 생성할 수 없습니다." }]);
        } finally {
            setIsChatThinking(false);
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    return (
        <div className="flex flex-col h-full">
            <Header title="AI 전문가 위원회 (AI Expert Board)" icon="smart_toy" />
            
            <main className="flex-1 overflow-y-auto p-8 z-10 relative">
                <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
                <div className="relative z-10 max-w-6xl mx-auto">
                    
                    <div className="mb-8 text-center">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">무제한 AI 모의 심사</h2>
                        <p className="text-gray-500 text-sm">
                            외부 유출 걱정 없이, 24시간 대기 중인 AI 전문위원들에게 날카로운 피드백을 받아보세요.<br/>
                            실제 심사장에 들어가기 전, 다양한 관점(기술, 사업, 규정)에서 검증할 수 있습니다.
                        </p>
                    </div>

                    {/* Step 1: Select Application */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow-sm border border-border-light dark:border-border-dark mb-8">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">1. 검토받을 지원서 선택</label>
                        <select 
                            value={selectedAppId}
                            onChange={(e) => { setSelectedAppId(e.target.value); setResult(null); setIsChatOpen(false); }}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-800"
                        >
                            <option value="">지원서를 선택하세요</option>
                            {applications.map(app => (
                                <option key={app.id} value={app.id}>
                                    {app.status} - {new Date(app.updatedAt).toLocaleDateString()} (ID: {app.id})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Step 2: Select Persona */}
                    {selectedAppId && (
                        <div className="mb-8 animate-fade-in">
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">2. 평가위원(Persona) 선택</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {AI_PERSONAS.map(persona => (
                                    <div 
                                        key={persona.id}
                                        onClick={() => { setSelectedPersona(persona); setResult(null); setIsChatOpen(false); }}
                                        className={`cursor-pointer rounded-xl border-2 p-6 transition-all ${
                                            selectedPersona?.id === persona.id 
                                            ? 'border-primary bg-green-50 dark:bg-green-900/30' 
                                            : 'border-transparent bg-white dark:bg-surface-dark hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'
                                        }`}
                                    >
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${persona.color}`}>
                                            <Icon name={persona.icon} className="h-5 w-5" />
                                        </div>
                                        <h4 className="font-bold text-lg mb-1">{persona.name}</h4>
                                        <span className="text-xs font-bold bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">{persona.role}</span>
                                        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                                            "{persona.description}"
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Simulation Action */}
                    {selectedPersona && selectedAppId && !result && (
                        <div className="text-center mb-12 animate-fade-in">
                            <button 
                                onClick={handleSimulation}
                                disabled={isSimulating}
                                className="px-8 py-4 bg-primary text-white rounded-full font-bold text-lg shadow-lg hover:bg-primary-dark transition-transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center mx-auto"
                            >
                                {isSimulating ? (
                                    <><Icon name="refresh" className="h-5 w-5" /> AI 위원이 서류를 검토 중입니다...</>
                                ) : (
                                    <><Icon name="play_arrow" className="h-5 w-5" /> {selectedPersona.name}에게 심사 받기</>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Result View with Chat */}
                    {result && selectedPersona && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
                            {/* Report Card */}
                            <div className="lg:col-span-2 bg-white dark:bg-surface-dark rounded-xl border border-primary/20 dark:border-primary/20 shadow-lg overflow-hidden">
                                <div className="bg-primary p-6 text-white flex justify-between items-center">
                                    <div className="flex items-center">
                                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mr-3">
                                            <Icon name={selectedPersona.icon} className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">{selectedPersona.name}의 심사 결과</h3>
                                            <p className="text-xs opacity-80">{selectedPersona.role} 관점 평가</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xs opacity-80">종합 점수</span>
                                        <span className="text-3xl font-bold">{result.totalScore}점</span>
                                    </div>
                                </div>
                                
                                <div className="p-8 grid grid-cols-1 gap-8">
                                    <div>
                                        <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                                            <Icon name="analytics" className="h-5 w-5" /> 항목별 점수
                                        </h4>
                                        <div className="space-y-4">
                                            {Object.entries(result.scores).map(([key, score]) => (
                                                <div key={key}>
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="capitalize text-gray-600 dark:text-gray-300">
                                                            {key === 'technology' ? '기술성' : key === 'marketability' ? '사업성' : key === 'originality' ? '독창성' : key === 'capability' ? '수행역량' : '사회적가치'}
                                                        </span>
                                                        <span className="font-bold">{score}</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                                        <div className="bg-primary h-2 rounded-full transition-all duration-1000" style={{ width: `${score}%` }}></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
                                        <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                                            <Icon name="rate_review" className="h-5 w-5" /> 날카로운 피드백
                                        </h4>
                                        <ul className="space-y-3">
                                            {result.feedback.map((fb, idx) => (
                                                <li key={idx} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                                                    <span className="text-red-500 mr-2 font-bold">•</span>
                                                    {fb}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Reviewer Chat Feature (V1.5 & V1.6 Live) */}
                            <div className="lg:col-span-1 bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-lg flex flex-col h-[600px]">
                                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-xl flex justify-between items-center">
                                    <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 flex items-center">
                                        <Icon name="forum" className="h-5 w-5" /> 심사위원 청문회
                                    </h4>
                                    <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full animate-pulse">Live</span>
                                </div>
                                
                                <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50 dark:bg-black/20">
                                    <div className="flex justify-start">
                                        <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 text-sm max-w-[90%] shadow-sm">
                                            <p className="font-bold text-xs text-primary mb-1">{selectedPersona.name}</p>
                                            평가 결과에 대해 궁금한 점이 있으신가요? 이의 제기나 보완 방향에 대해 질문해 주세요.
                                        </div>
                                    </div>
                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`rounded-lg p-3 text-sm max-w-[90%] shadow-sm ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600'}`}>
                                                {msg.role === 'model' && <p className="font-bold text-xs text-primary mb-1">{selectedPersona.name}</p>}
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))}
                                    {isChatThinking && (
                                        <div className="flex justify-start">
                                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm text-gray-500">
                                                <Icon name="refresh" className="h-5 w-5" />
                                                답변 작성 중...
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="p-3 border-t border-gray-100 dark:border-gray-700">
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                                            disabled={isChatThinking}
                                            className="flex-1 text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 disabled:opacity-50"
                                            placeholder="질문 입력..."
                                        />
                                        <button onClick={handleChatSend} disabled={isChatThinking} className="p-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50">
                                            <Icon name="send" className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default ExpertMatch;
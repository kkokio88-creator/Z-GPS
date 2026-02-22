import Icon from './ui/Icon';
import React, { useState, useRef } from 'react';
import Header from './Header';
import { pitchCoachAgent } from '../services/geminiAgents';

const PitchTrainer: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcription, setTranscription] = useState(''); // Simulated transcription
    const [result, setResult] = useState<{score: number, feedback: string, tone: string} | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    // Mock Speech Recognition for Demo (using standard Web API if available, else simulate)
    const recognitionRef = useRef<any>(null);

    const startRecording = () => {
        setIsRecording(true);
        setTranscription('');
        setResult(null);

        // Simple check for browser support
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.lang = 'ko-KR';
            recognitionRef.current.interimResults = true;

            recognitionRef.current.onresult = (event: any) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                if(finalTranscript) setTranscription(prev => prev + " " + finalTranscript);
            };
            
            recognitionRef.current.start();
        } else {
            alert("이 브라우저는 음성 인식을 지원하지 않습니다. 텍스트 입력 모드로 전환됩니다.");
            // Fallback: Let user type or paste script
        }
    };

    const stopRecording = async () => {
        setIsRecording(false);
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        
        // If empty (no mic support or silence), simulate for demo
        const textToAnalyze = transcription.trim() || "안녕하십니까. 저희 회사는 친환경 패키징 기술을 통해 탄소 배출을 30% 절감하는 솔루션을 개발했습니다. 시장 규모는 매년 15% 성장하고 있으며, 저희의 핵심 경쟁력은...";
        if (!transcription.trim()) setTranscription(textToAnalyze);

        setIsAnalyzing(true);
        const analysis = await pitchCoachAgent.analyzePitch(textToAnalyze);
        setResult(analysis);
        setIsAnalyzing(false);
    };

    return (
        <div className="flex flex-col h-full">
            <Header title="AI 피칭 트레이너 (Pitch Trainer)" icon="record_voice_over" />
            
            <main className="flex-1 overflow-y-auto p-8 z-10 relative">
                <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
                <div className="relative z-10 max-w-4xl mx-auto text-center">
                    
                    <h2 className="text-2xl font-bold mb-2">발표 평가 리허설</h2>
                    <p className="text-gray-500 mb-8">
                        마이크를 켜고 1분 자기소개나 사업계획 요약을 말해보세요.<br/>
                        AI 코치가 발음, 속도, 설득력을 실시간으로 분석합니다.
                    </p>

                    <div className="mb-8">
                        <button 
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`w-32 h-32 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
                                isRecording 
                                ? 'bg-red-500 animate-pulse scale-110' 
                                : 'bg-primary hover:bg-primary-dark hover:scale-105'
                            }`}
                        >
                            <Icon name={isRecording ? 'stop' : 'mic'} className="h-12 w-12 text-white" />
                        </button>
                        <p className="mt-4 font-bold text-primary dark:text-green-400">
                            {isRecording ? "녹음 중... (말씀하세요)" : "버튼을 눌러 시작"}
                        </p>
                    </div>

                    {/* Script / Transcription Area */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark shadow-sm text-left mb-8 min-h-[150px]">
                        <span className="text-xs font-bold text-gray-400 uppercase mb-2 block">Script Analysis</span>
                        <p className="text-lg leading-relaxed text-gray-800 dark:text-gray-200">
                            {transcription || <span className="text-gray-400 italic">녹음된 내용이 여기에 표시됩니다...</span>}
                        </p>
                    </div>

                    {/* Result Card */}
                    {isAnalyzing && (
                        <div className="py-10">
                            <Icon name="refresh" className="h-5 w-5" />
                            <p className="mt-2 text-sm text-gray-500">AI 코치가 발표 내용을 분석 중입니다...</p>
                        </div>
                    )}

                    {result && (
                        <div className="bg-white dark:bg-surface-dark rounded-xl border border-primary/20 dark:border-primary/20 shadow-lg overflow-hidden animate-fade-in-up text-left">
                            <div className="bg-primary p-6 text-white flex justify-between items-center">
                                <h3 className="font-bold text-lg flex items-center">
                                    <Icon name="assessment" className="h-5 w-5" /> 분석 리포트
                                </h3>
                                <div className="text-right">
                                    <span className="block text-xs opacity-70">전달력 점수</span>
                                    <span className="text-3xl font-bold">{result.score}점</span>
                                </div>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-bold text-gray-800 dark:text-white mb-2">🗣️ 발표 톤 (Tone)</h4>
                                    <div className="bg-green-50 dark:bg-green-900/30 p-3 rounded text-green-700 dark:text-green-300 font-medium">
                                        {result.tone}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800 dark:text-white mb-2">💡 AI 코칭 피드백</h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                        {result.feedback}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default PitchTrainer;
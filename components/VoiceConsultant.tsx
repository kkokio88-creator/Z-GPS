import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { getStoredApiKey } from '../services/storageService';

const VoiceConsultant: React.FC = () => {
    const [isActive, setIsActive] = useState(false);
    const [isTalking, setIsTalking] = useState(false);
    const [status, setStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('IDLE');
    
    // Audio Context Refs
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef<number>(0);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);

    // Visualizer Canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const toggleSession = async () => {
        if (isActive) {
            disconnect();
        } else {
            connect();
        }
    };

    const connect = async () => {
        const apiKey = getStoredApiKey() || process.env.API_KEY || '';
        if (!apiKey) {
            alert("API Key가 필요합니다. 설정에서 키를 등록해주세요.");
            return;
        }

        setStatus('CONNECTING');
        setIsActive(true);

        try {
            const ai = new GoogleGenAI({ apiKey });
            
            // Setup Audio Contexts
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            // Setup Input Stream
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                callbacks: {
                    onopen: () => {
                        console.log("Gemini Live Connected");
                        setStatus('CONNECTED');
                        if (inputAudioContextRef.current) {
                             setupAudioInput(stream, inputAudioContextRef.current, sessionPromise);
                        }
                    },
                    onmessage: (msg: LiveServerMessage) => handleMessage(msg),
                    onclose: () => disconnect(),
                    onerror: (err) => { console.error(err); disconnect(); setStatus('ERROR'); }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                    systemInstruction: "당신은 한국 식품 제조 중소기업을 돕는 정부지원사업 전문 컨설턴트입니다. 친절하고 전문적인 톤으로, 짧고 간결하게 대답하세요. 한국어로 대화합니다."
                }
            });
            
            sessionPromiseRef.current = sessionPromise;

        } catch (e) {
            console.error("Connection Failed", e);
            setStatus('ERROR');
            setIsActive(false);
        }
    };

    const disconnect = () => {
        // Safe Close: Check state before closing to avoid "Cannot close a closed AudioContext"
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            try {
                inputAudioContextRef.current.close();
            } catch (e) { console.warn("Input context close error", e); }
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            try {
                outputAudioContextRef.current.close();
            } catch (e) { console.warn("Output context close error", e); }
        }
        
        sourcesRef.current.forEach(s => {
            try { s.stop(); } catch(e){}
        });
        sourcesRef.current.clear();
        
        setIsActive(false);
        setStatus('IDLE');
        setIsTalking(false);
        
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close()).catch(e => console.warn(e));
            sessionPromiseRef.current = null;
        }
    };

    const setupAudioInput = (stream: MediaStream, ctx: AudioContext, sessionPromise: Promise<any>) => {
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = float32ToInt16(inputData);
            const blob = {
                data: btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer))),
                mimeType: 'audio/pcm;rate=16000'
            };
            
            sessionPromise.then(session => session.sendRealtimeInput({ media: blob }));
            
            // Simple visualizer update
            drawVisualizer(inputData);
        };

        source.connect(processor);
        processor.connect(ctx.destination);
    };

    const handleMessage = async (message: LiveServerMessage) => {
        const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioData) {
            setIsTalking(true);
            playAudio(audioData);
        }
        
        if (message.serverContent?.turnComplete) {
            setIsTalking(false);
        }
    };

    const playAudio = async (base64String: string) => {
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') return;
        
        const ctx = outputAudioContextRef.current;
        const audioBuffer = await decodeAudioData(base64String, ctx);
        
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        const now = ctx.currentTime;
        const startTime = Math.max(now, nextStartTimeRef.current);
        source.start(startTime);
        nextStartTimeRef.current = startTime + audioBuffer.duration;
        
        sourcesRef.current.add(source);
        source.onended = () => sourcesRef.current.delete(source);
    };

    // --- Helpers ---
    const float32ToInt16 = (float32: Float32Array) => {
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            let s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16;
    };

    const decodeAudioData = async (base64: string, ctx: AudioContext) => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const int16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(int16.length);
        for(let i=0; i<int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }
        
        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);
        return buffer;
    };

    const drawVisualizer = (data: Float32Array) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0D5611'; // Primary Green
        
        const barWidth = 2;
        const step = Math.ceil(data.length / (canvas.width / barWidth));
        
        for (let i = 0; i < canvas.width; i += barWidth) {
            const dataIndex = Math.floor(i * step);
            const value = Math.abs(data[dataIndex] || 0);
            const height = value * canvas.height * 2;
            ctx.fillRect(i, (canvas.height - height) / 2, barWidth, height);
        }
    };

    return (
        <div className="fixed bottom-6 left-6 z-50">
            {isActive && (
                <div className="absolute bottom-16 left-0 mb-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-primary/20 dark:border-gray-700 p-4 animate-fade-in-up">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-primary flex items-center">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></span>
                            Live Consultant
                        </span>
                        <span className="text-[10px] text-gray-400">{status}</span>
                    </div>
                    <canvas ref={canvasRef} width={220} height={40} className="w-full h-10 bg-gray-50 dark:bg-gray-900 rounded mb-2" />
                    <p className="text-xs text-center text-gray-500 dark:text-gray-300">
                        {isTalking ? "AI가 답변 중입니다..." : "말씀해주세요..."}
                    </p>
                </div>
            )}
            
            <button 
                onClick={toggleSession}
                className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
                    isActive 
                    ? 'bg-red-500 hover:bg-red-600 scale-110 ring-4 ring-red-200' 
                    : 'bg-primary hover:bg-primary-dark'
                }`}
                title="AI 음성 컨설턴트 연결"
            >
                <span className="material-icons-outlined text-white text-2xl">
                    {isActive ? 'mic_off' : 'support_agent'}
                </span>
            </button>
        </div>
    );
};

export default VoiceConsultant;
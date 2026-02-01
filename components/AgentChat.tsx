import React, { useState, useEffect, useRef } from 'react';
import { Company, SupportProgram } from '../types';
import { consultantAgent } from '../services/geminiAgents';
import { GenerateContentResponse } from "@google/genai";

interface AgentChatProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  program: SupportProgram;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isStreaming?: boolean;
}

const AgentChat: React.FC<AgentChatProps> = ({ isOpen, onClose, company, program }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'model',
      text: `안녕하세요! "${program.programName}" 지원사업 컨설턴트입니다. 궁금한 점이 있거나 작성 팁이 필요하시면 언제든 물어보세요.`
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatSessionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Chat Session
  useEffect(() => {
    if (isOpen && !chatSessionRef.current) {
      chatSessionRef.current = consultantAgent.createChatSession(company, program);
    }
  }, [isOpen, company, program]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      if (chatSessionRef.current) {
        // Streaming Response
        const result = await chatSessionRef.current.sendMessageStream({ message: input });
        
        const aiMsgId = (Date.now() + 1).toString();
        let aiText = '';
        
        // Initial placeholder for streaming message
        setMessages(prev => [...prev, { id: aiMsgId, role: 'model', text: '', isStreaming: true }]);

        for await (const chunk of result) {
            const c = chunk as GenerateContentResponse;
            if (c.text) {
                aiText += c.text;
                setMessages(prev => 
                    prev.map(msg => msg.id === aiMsgId ? { ...msg, text: aiText } : msg)
                );
            }
        }
        
        // Finalize
        setMessages(prev => 
            prev.map(msg => msg.id === aiMsgId ? { ...msg, isStreaming: false } : msg)
        );

      } else {
        // Fallback for Demo (No API Key)
        setTimeout(() => {
          setMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'model', 
            text: "[Demo Mode] API Key가 설정되지 않았습니다. 실제 AI 응답을 보려면 API Key를 설정해주세요." 
          }]);
        }, 1000);
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: "죄송합니다. 오류가 발생하여 답변을 생성할 수 없습니다." 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-96 bg-white dark:bg-surface-dark shadow-2xl z-50 flex flex-col border-l border-border-light dark:border-border-dark transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-border-light dark:border-border-dark bg-primary text-white">
        <div className="flex items-center">
          <span className="material-icons-outlined mr-2">smart_toy</span>
          <div>
             <h3 className="font-bold text-sm">Z-MIS AI Consultant</h3>
             <p className="text-[10px] opacity-80">{program.organizer}</p>
          </div>
        </div>
        <button onClick={onClose} className="hover:bg-white/20 rounded-full p-1 transition-colors">
          <span className="material-icons-outlined">close</span>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-black/20">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
             {msg.role === 'model' && (
                 <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0 border border-indigo-200">
                     <span className="material-icons-outlined text-indigo-600 text-xs">smart_toy</span>
                 </div>
             )}
             <div 
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' 
                    ? 'bg-primary text-white rounded-br-none' 
                    : 'bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main-light dark:text-text-main-dark rounded-bl-none shadow-sm'
                }`}
             >
                {msg.text}
                {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-indigo-500 animate-pulse"></span>}
             </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-surface-dark border-t border-border-light dark:border-border-dark">
        <div className="relative">
            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="궁금한 점을 물어보세요..."
                className="w-full pl-4 pr-12 py-3 rounded-lg border border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800 text-sm focus:ring-1 focus:ring-primary focus:border-primary resize-none h-14" // Fixed height for simplicity
            />
            <button 
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="absolute right-2 bottom-2 p-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                <span className="material-icons-outlined text-sm">send</span>
            </button>
        </div>
        <p className="text-[10px] text-center text-gray-400 mt-2">
            Gemini AI가 답변을 생성합니다. 부정확한 정보가 포함될 수 있습니다.
        </p>
      </div>
    </div>
  );
};

export default AgentChat;
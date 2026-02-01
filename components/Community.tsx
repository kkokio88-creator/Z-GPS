import React, { useState } from 'react';
import Header from './Header';
import { getStoredCompany, saveStoredCompany } from '../services/storageService';
import { Company } from '../types';

const InternalKnowledge: React.FC = () => { // Renamed conceptually
    const [company, setCompany] = useState<Company>(getStoredCompany());
    const [activeTab, setActiveTab] = useState<'KEYWORDS' | 'SNIPPETS'>('KEYWORDS');
    const [newSnippetTitle, setNewSnippetTitle] = useState('');
    const [newSnippetContent, setNewSnippetContent] = useState('');

    // Mocking Snippets (Normally would be in Company type, but adding locally for demo)
    const [snippets, setSnippets] = useState<{id: string, title: string, content: string}[]>([
        { id: 's1', title: '회사 연혁 요약', content: '2015년 설립 이후 매년 20% 성장, 2023년 HACCP 인증 획득, 2024년 벤처기업 인증.' },
        { id: 's2', title: 'CEO 경영 철학', content: '사람을 위한 기술, 자연을 생각하는 제조.' }
    ]);

    const handleAddSnippet = () => {
        if (!newSnippetTitle || !newSnippetContent) return;
        setSnippets([...snippets, { id: Date.now().toString(), title: newSnippetTitle, content: newSnippetContent }]);
        setNewSnippetTitle('');
        setNewSnippetContent('');
    };

    const handleDeleteKeyword = (keyword: string) => {
        if (!company.preferredKeywords) return;
        const updated = company.preferredKeywords.filter(k => k !== keyword);
        const newCompany = { ...company, preferredKeywords: updated };
        setCompany(newCompany);
        saveStoredCompany(newCompany);
    };

    return (
        <div className="flex flex-col h-full">
            <Header title="사내 지식 자산 (Private Knowledge Base)" icon="folder_special" />
            
            <main className="flex-1 overflow-y-auto p-8 z-10 relative">
                <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
                <div className="relative z-10 max-w-5xl mx-auto">
                    
                    <div className="bg-gradient-to-r from-teal-600 to-emerald-600 rounded-xl p-8 mb-8 text-white shadow-lg">
                        <h2 className="text-2xl font-bold mb-2 flex items-center">
                            <span className="material-icons-outlined mr-2">lock</span> 
                            우리 회사만의 합격 DNA
                        </h2>
                        <p className="opacity-90">
                            이곳은 외부와 단절된 <strong>내부 전용 공간</strong>입니다.<br/>
                            AI가 분석한 성공 키워드와 자주 쓰는 문구를 관리하여 서류 작성 효율을 높이세요.
                        </p>
                    </div>

                    <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
                        <button onClick={() => setActiveTab('KEYWORDS')} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'KEYWORDS' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>
                            🏆 성공 키워드 (Ontology)
                        </button>
                        <button onClick={() => setActiveTab('SNIPPETS')} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'SNIPPETS' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>
                            📝 상용구 관리 (Snippets)
                        </button>
                    </div>

                    {activeTab === 'KEYWORDS' && (
                        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark shadow-sm">
                            <h3 className="text-lg font-bold mb-4">AI가 학습한 우리 회사의 핵심 역량</h3>
                            <div className="flex flex-wrap gap-3">
                                {(!company.preferredKeywords || company.preferredKeywords.length === 0) && (
                                    <p className="text-gray-400 text-sm">아직 학습된 키워드가 없습니다. 지원서를 작성하고 제출하면 AI가 자동으로 학습합니다.</p>
                                )}
                                {company.preferredKeywords?.map(k => (
                                    <span key={k} className="px-4 py-2 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-700 flex items-center font-medium shadow-sm hover:scale-105 transition-transform">
                                        #{k}
                                        <button onClick={() => handleDeleteKeyword(k)} className="ml-2 text-teal-400 hover:text-teal-600"><span className="material-icons-outlined text-sm">close</span></button>
                                    </span>
                                ))}
                            </div>
                            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-500">
                                💡 <strong>Tip:</strong> 이 키워드들은 '지원서 초안 작성' 시 AI 에이전트에게 우선적으로 제공되어, 우리 회사다운 톤앤매너를 유지하는 데 사용됩니다.
                            </div>
                        </div>
                    )}

                    {activeTab === 'SNIPPETS' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light dark:border-border-dark shadow-sm">
                                <h3 className="text-lg font-bold mb-4">자주 쓰는 문구 등록</h3>
                                <div className="space-y-3">
                                    <input 
                                        type="text" 
                                        placeholder="제목 (예: 회사 연혁, 대표자 인사말)" 
                                        value={newSnippetTitle}
                                        onChange={(e) => setNewSnippetTitle(e.target.value)}
                                        className="w-full p-2 border rounded text-sm bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                    />
                                    <textarea 
                                        placeholder="내용 입력..." 
                                        value={newSnippetContent}
                                        onChange={(e) => setNewSnippetContent(e.target.value)}
                                        className="w-full p-2 border rounded text-sm h-24 resize-none bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                    />
                                    <div className="text-right">
                                        <button onClick={handleAddSnippet} className="px-4 py-2 bg-primary text-white rounded text-sm hover:bg-primary-dark">저장하기</button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {snippets.map(s => (
                                    <div key={s.id} className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow relative group">
                                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-2">{s.title}</h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">{s.content}</p>
                                        <button className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="material-icons-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default InternalKnowledge;
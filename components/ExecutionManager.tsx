import React, { useState, useEffect, useRef } from 'react';
import Header from './Header';
import { getStoredApplications, getStoredCalendarEvents } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { Application, SupportProgram, CalendarEvent } from '../types';
import { fetchIncheonSupportPrograms } from '../services/apiService';
import { draftAgent, labNoteAgent, haccpAgent } from '../services/geminiAgents';

const ExecutionManager: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'EXECUTION' | 'CALENDAR'>('EXECUTION');
    
    // Execution States
    const [wonApps, setWonApps] = useState<Application[]>([]);
    const [selectedApp, setSelectedApp] = useState<Application | null>(null);
    const [subTab, setSubTab] = useState<'BUDGET' | 'REPORT' | 'LABNOTE' | 'HACCP'>('BUDGET');
    const [programs, setPrograms] = useState<SupportProgram[]>([]);
    const [expenses, setExpenses] = useState<{item: string, amount: number, date: string}[]>([]);
    const [budgetTotal, setBudgetTotal] = useState(100000000);
    const [reportDraft, setReportDraft] = useState('');
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [labLogs, setLabLogs] = useState<{date: string, content: string}[]>([]);
    const [newLog, setNewLog] = useState('');
    const [isRefiningLog, setIsRefiningLog] = useState(false);
    const haccpInputRef = useRef<HTMLInputElement>(null);
    const [haccpImage, setHaccpImage] = useState<string | null>(null);
    const [haccpChecklist, setHaccpChecklist] = useState('작업장 위생 관리');
    const [haccpResult, setHaccpResult] = useState('');
    const [isHaccpAuditing, setIsHaccpAuditing] = useState(false);

    // Calendar States
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        const load = async () => {
            const allApps = getStoredApplications();
            const won = allApps.filter(a => a.status === '최종 선정');
            if (won.length === 0 && allApps.length > 0) {
                // Mock for Demo
                const mockWin = { ...allApps[0], id: 'demo_win', status: '최종 선정' } as Application;
                setWonApps([mockWin]);
            } else { setWonApps(won); }
            setPrograms(await fetchIncheonSupportPrograms());
            setEvents(getStoredCalendarEvents());
        };
        load();
    }, []);

    useEffect(() => { if (wonApps.length > 0 && !selectedApp) setSelectedApp(wonApps[0]); }, [wonApps]);

    // Handlers (Execution)
    const handleAddExpense = () => { const i = prompt("항목"); const a = prompt("금액"); if(i&&a) setExpenses([...expenses, {item:i, amount:parseInt(a), date: new Date().toISOString().split('T')[0]}]); };
    const handleGenerateReport = async () => { if(!selectedApp) return; setIsGeneratingReport(true); const r = await draftAgent.writeSection(useCompanyStore.getState().company, programs[0], "결과보고서", false, "성과 중심 변환"); setReportDraft(r.text); setIsGeneratingReport(false); };
    const handleAddLabLog = async () => { if(!newLog) return; setIsRefiningLog(true); const r = await labNoteAgent.refineLog(newLog); setLabLogs([...labLogs, {date:new Date().toISOString().split('T')[0], content:r}]); setNewLog(''); setIsRefiningLog(false); };
    const handleHaccpUpload = (e:any) => { const f=e.target.files[0]; if(f) { const r=new FileReader(); r.onloadend=()=>setHaccpImage(r.result as string); r.readAsDataURL(f); }};
    const handleRunHaccpAudit = async () => { if(!haccpImage) return; setIsHaccpAuditing(true); const r = await haccpAgent.auditFacility(haccpImage.split(',')[1], haccpChecklist); setHaccpResult(r); setIsHaccpAuditing(false); };

    // Handlers (Calendar)
    const getDaysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    const getFirstDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const handlePrev = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1));
    const handleNext = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1));

    const spent = expenses.reduce((acc,c) => acc+c.amount, 0);
    const progress = (spent/budgetTotal)*100;

    return (
        <div className="flex flex-col h-full">
            <Header title="수행 및 일정 (Execution & Schedule)" icon="engineering" />
            
            <main className="flex-1 overflow-y-auto p-8 z-10 relative">
                <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
                <div className="relative z-10 max-w-7xl mx-auto">
                    
                    {/* Main Tabs */}
                    <div className="flex justify-center mb-8">
                        <div className="bg-white dark:bg-surface-dark p-1 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 inline-flex">
                            <button onClick={() => setActiveTab('EXECUTION')} className={`px-8 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'EXECUTION' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>🛠️ 과제 수행 관리</button>
                            <button onClick={() => setActiveTab('CALENDAR')} className={`px-8 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'CALENDAR' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>📅 전체 일정</button>
                        </div>
                    </div>

                    {/* EXECUTION VIEW */}
                    {activeTab === 'EXECUTION' && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in">
                            <div className="col-span-1 bg-white dark:bg-surface-dark p-4 rounded-lg border border-border-light shadow-sm h-fit">
                                <h3 className="font-bold text-sm mb-3 text-gray-700">진행 중인 과제</h3>
                                {wonApps.length === 0 && <div className="text-xs text-gray-400">선정된 과제가 없습니다.</div>}
                                {wonApps.map(app => (
                                    <div key={app.id} onClick={() => setSelectedApp(app)} className={`p-3 rounded cursor-pointer mb-2 text-sm border ${selectedApp?.id === app.id ? 'bg-primary text-white border-primary' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                                        <div className="font-bold truncate">{app.programId}</div>
                                        <div className="text-[10px] opacity-80">{new Date(app.updatedAt).toLocaleDateString()}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="col-span-1 lg:col-span-3">
                                {selectedApp ? (
                                    <div className="bg-white dark:bg-surface-dark rounded-lg border border-border-light shadow-sm">
                                        <div className="flex border-b overflow-x-auto">
                                            {(['BUDGET','LABNOTE','HACCP','REPORT'] as const).map(t => (
                                                <button key={t} onClick={()=>setSubTab(t)} className={`flex-1 py-3 text-sm font-bold border-b-2 ${subTab===t ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>{t}</button>
                                            ))}
                                        </div>
                                        <div className="p-6 min-h-[400px]">
                                            {subTab === 'BUDGET' && (
                                                <div>
                                                    <div className="flex justify-between mb-4 bg-gray-50 p-4 rounded">
                                                        <div className="text-center">
                                                            <div className="text-xs text-gray-500">총 예산</div>
                                                            <div className="text-lg font-bold">{budgetTotal.toLocaleString()}</div>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="text-xs text-blue-500">집행액 ({progress.toFixed(1)}%)</div>
                                                            <div className="text-lg font-bold text-blue-600">{spent.toLocaleString()}</div>
                                                        </div>
                                                    </div>
                                                    <button onClick={handleAddExpense} className="mb-2 text-xs bg-gray-800 text-white px-2 py-1 rounded">+ 지출 추가</button>
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="bg-gray-100"><tr><th className="p-2">날짜</th><th className="p-2">항목</th><th className="p-2 text-right">금액</th></tr></thead>
                                                        <tbody>{expenses.map((e,i)=><tr key={i}><td className="p-2">{e.date}</td><td className="p-2">{e.item}</td><td className="p-2 text-right">{e.amount.toLocaleString()}</td></tr>)}</tbody>
                                                    </table>
                                                </div>
                                            )}
                                            {subTab === 'LABNOTE' && (
                                                <div>
                                                    <div className="bg-purple-50 p-3 rounded mb-4">
                                                        <textarea value={newLog} onChange={e=>setNewLog(e.target.value)} className="w-full text-sm border rounded p-2" placeholder="오늘의 연구 내용..."/>
                                                        <button onClick={handleAddLabLog} disabled={isRefiningLog} className="mt-2 bg-purple-600 text-white text-xs px-3 py-1 rounded">{isRefiningLog ? "변환 중..." : "AI 표준 등록"}</button>
                                                    </div>
                                                    <div className="space-y-2">{labLogs.map((l,i)=><div key={i} className="p-3 border-l-4 border-purple-500 bg-gray-50 rounded"><div className="text-xs font-bold text-purple-600">{l.date}</div><p className="text-sm">{l.content}</p></div>)}</div>
                                                </div>
                                            )}
                                            {subTab === 'HACCP' && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <div onClick={()=>haccpInputRef.current?.click()} className="border-2 border-dashed h-40 flex items-center justify-center bg-gray-50 cursor-pointer rounded">{haccpImage ? <img src={haccpImage} className="h-full object-contain"/> : "사진 업로드"}</div>
                                                        <input type="file" className="hidden" ref={haccpInputRef} onChange={handleHaccpUpload}/>
                                                        <button onClick={handleRunHaccpAudit} disabled={isHaccpAuditing} className="w-full mt-2 bg-red-600 text-white py-2 rounded font-bold">{isHaccpAuditing ? "감사 중..." : "AI 위생 점검"}</button>
                                                    </div>
                                                    <div className="bg-gray-50 p-3 rounded overflow-y-auto h-60 text-sm whitespace-pre-wrap">{haccpResult || "결과 대기 중..."}</div>
                                                </div>
                                            )}
                                            {subTab === 'REPORT' && (
                                                <div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-sm font-bold">결과보고서 초안</span>
                                                        <button onClick={handleGenerateReport} disabled={isGeneratingReport} className="bg-primary text-white text-xs px-3 py-1 rounded">{isGeneratingReport?"생성 중...":"AI 자동 작성"}</button>
                                                    </div>
                                                    <textarea value={reportDraft} onChange={e=>setReportDraft(e.target.value)} className="w-full h-80 p-3 border rounded bg-gray-50 text-sm"/>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg">좌측에서 과제를 선택하세요.</div>}
                            </div>
                        </div>
                    )}

                    {/* CALENDAR VIEW */}
                    {activeTab === 'CALENDAR' && (
                        <div className="bg-white dark:bg-surface-dark p-6 rounded-lg border border-border-light shadow-sm animate-fade-in">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold">{currentDate.getFullYear()}년 {currentDate.getMonth()+1}월</h2>
                                <div className="flex gap-2">
                                    <button onClick={handlePrev} className="p-1 hover:bg-gray-100 rounded"><span className="material-icons-outlined" aria-hidden="true">chevron_left</span></button>
                                    <button onClick={handleNext} className="p-1 hover:bg-gray-100 rounded"><span className="material-icons-outlined" aria-hidden="true">chevron_right</span></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden">
                                {['일','월','화','수','목','금','토'].map(d=><div key={d} className="bg-gray-50 p-2 text-center text-xs font-bold">{d}</div>)}
                                {Array(getFirstDay(currentDate)).fill(null).map((_,i)=><div key={`e-${i}`} className="bg-white min-h-[100px]"/>)}
                                {Array(getDaysInMonth(currentDate)).fill(null).map((_,i)=>{
                                    const day = i+1;
                                    const dayEvents = events.filter(e => { const d=new Date(e.date); return d.getFullYear()===currentDate.getFullYear() && d.getMonth()===currentDate.getMonth() && d.getDate()===day; });
                                    return (
                                        <div key={day} className="bg-white min-h-[100px] p-2 border-t border-gray-100">
                                            <span className={`text-sm font-bold ${day===new Date().getDate()?'text-primary':''}`}>{day}</span>
                                            <div className="mt-1 space-y-1">
                                                {dayEvents.map(e=><div key={e.id} className={`text-[10px] text-white px-1 rounded truncate ${e.type==='INTERNAL'?'bg-red-500':'bg-blue-500'}`}>{e.programName}</div>)}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default ExecutionManager;
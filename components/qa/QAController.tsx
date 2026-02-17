import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { stopQA, generateFixPrompt, executeTestLogic, updateTestResult } from '../../services/qaService';
import { useQAStore } from '../../services/stores/qaStore';
import { QATestItem } from '../../types';

// Global QA Orchestrator Component
const QAController: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const qaState = useQAStore(s => s.qaState);
    const [showReport, setShowReport] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Use Ref to track processing state across renders
    const processingRef = useRef(false);

    // THE PUPPETEER LOGIC
    useEffect(() => {
        if (!qaState.isActive) return;
        if (processingRef.current) return; // Prevent double execution

        const runSequence = async () => {
            if (qaState.currentIndex < qaState.checklist.length) {
                const currentTest = qaState.checklist[qaState.currentIndex];

                if (currentTest.status === 'PENDING') {
                    processingRef.current = true;
                    setIsProcessing(true);

                    // 1. Navigate to page (Visual confirmation)
                    if (location.pathname !== currentTest.path) {
                        if (import.meta.env.DEV) console.log(`[QA] Navigating to ${currentTest.path}`);
                        navigate(currentTest.path);
                        // Wait for navigation
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    // 2. Execute Logic (Centralized)
                    if (import.meta.env.DEV) console.log(`[QA] Running Test: ${currentTest.name}`);
                    // Small delay for UI to settle
                    await new Promise(r => setTimeout(r, 800));

                    const result = await executeTestLogic(currentTest);

                    // 3. Update State
                    updateTestResult(currentTest.id, result.status, result.logs, result.error, result.fix);

                    processingRef.current = false;
                    setIsProcessing(false);
                }
            } else {
                // All Done
                stopQA();
                setShowReport(true);
            }
        };

        runSequence();

    }, [qaState, location.pathname, navigate]);

    if (!qaState.isActive && !showReport) return null;

    return (
        <>
            {/* Live Status Overlay - Robust & Always on Top */}
            {qaState.isActive && (
                <div className="fixed bottom-6 right-6 z-[9999] w-80 bg-white dark:bg-gray-800 shadow-2xl border-2 border-indigo-600 rounded-xl overflow-hidden animate-bounce-subtle">
                    <div className="bg-indigo-600 text-white p-3 font-bold flex justify-between items-center">
                        <span className="flex items-center text-sm">
                            <span className="material-icons-outlined animate-spin mr-2 text-xs" aria-hidden="true">autorenew</span>
                            Auto-Fix Mode
                        </span>
                        <span className="text-xs bg-indigo-700 px-2 py-0.5 rounded">
                            {Math.round((qaState.currentIndex / qaState.checklist.length) * 100)}%
                        </span>
                    </div>
                    <div className="p-3 max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-900 text-xs">
                        {qaState.checklist.map((t: QATestItem, i: number) => (
                            <div key={t.id} className={`flex items-center mb-1.5 p-1 rounded ${i === qaState.currentIndex ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-500'}`}>
                                <span className="mr-2 text-[10px]">
                                    {t.status === 'PASS' ? '✅' : t.status === 'FAIL' ? '❌' : i === qaState.currentIndex ? (isProcessing ? '⚙️' : '⏳') : '○'}
                                </span>
                                <span className="truncate">{t.name}</span>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => { stopQA(); processingRef.current = false; }}
                        className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 font-bold border-t border-gray-200 dark:border-gray-600"
                    >
                        ABORT DIAGNOSIS
                    </button>
                </div>
            )}

            {/* Final Report Modal */}
            {showReport && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div role="dialog" aria-modal="true" aria-labelledby="qa-report-title" className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in-up">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
                            <h2 id="qa-report-title" className="text-xl font-bold flex items-center text-gray-900 dark:text-white">
                                <span className="material-icons-outlined mr-2 text-green-600" aria-hidden="true">assignment_turned_in</span>
                                QA Diagnostic Report
                            </h2>
                            <button onClick={() => setShowReport(false)} aria-label="닫기" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                                <span className="material-icons-outlined" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white dark:bg-gray-900">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-900/30 text-center">
                                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                        {qaState.checklist.filter((i: any) => i.status === 'PASS').length}
                                    </div>
                                    <div className="text-xs text-green-700 dark:text-green-500 font-bold uppercase">Passed</div>
                                </div>
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/30 text-center">
                                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                        {qaState.checklist.filter((i: any) => i.status === 'FAIL').length}
                                    </div>
                                    <div className="text-xs text-red-700 dark:text-red-500 font-bold uppercase">Failed</div>
                                </div>
                            </div>

                            {/* Detailed List */}
                            {qaState.checklist.map((t: QATestItem) => (
                                <div key={t.id} className={`p-4 border rounded-lg ${t.status === 'FAIL' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'}`}>
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">{t.name}</h4>
                                        <span className={`text-xs px-2 py-1 rounded font-bold ${t.status === 'PASS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {t.status}
                                        </span>
                                    </div>
                                    <div className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700 mb-2">
                                        {t.log.slice(-3).map((l: string, i: number) => <div key={i}>&gt; {l}</div>)}
                                    </div>
                                    {t.status === 'FAIL' && (
                                        <div className="mt-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                                            <strong>Fix:</strong> {t.fixProposal}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Auto-Fix Prompt */}
                            {qaState.checklist.some((i: QATestItem) => i.status === 'FAIL') && (
                                <div className="mt-6">
                                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Auto-Correction Prompt (Copy & Apply)</label>
                                    <textarea
                                        readOnly
                                        className="w-full h-32 bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg focus:outline-none"
                                        value={generateFixPrompt()}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-end gap-3">
                            <button onClick={() => setShowReport(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900">Close Report</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default QAController;

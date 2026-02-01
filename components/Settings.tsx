
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { getStoredCompany, saveStoredCompany, getStoredApiKey, saveStoredApiKey, getStoredAiModel, saveStoredAiModel, getStoredDartApiKey, saveStoredDartApiKey } from '../services/storageService';
import { Company } from '../types';
import { startQA, resetQA, getQAState } from '../services/qaService';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  
  // Settings States
  const [apiKey, setApiKey] = useState('');
  const [dartApiKey, setDartApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash-preview');
  
  // Basic States
  const [company, setCompany] = useState<Company>(getStoredCompany());
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SUCCESS'>('IDLE');
  
  // QA Status for Local View
  const [isQaRunning, setIsQaRunning] = useState(false);

  useEffect(() => {
    setApiKey(getStoredApiKey());
    setDartApiKey(getStoredDartApiKey());
    setAiModel(getStoredAiModel());
    
    // Listen for global QA updates
    const handleUpdate = () => setIsQaRunning(getQAState().isActive);
    window.addEventListener('zmis-qa-update', handleUpdate);
    handleUpdate();

    return () => window.removeEventListener('zmis-qa-update', handleUpdate);
  }, []);

  const handleStartQA = () => {
      if(!window.confirm("시스템 자가 진단 및 자동 수정 프로세스를 시작하시겠습니까?\n(여러 화면을 자동으로 이동하며 점검합니다)")) return;
      resetQA();
      startQA();
      // App.tsx handles the rest via global event
  };

  const handleResetQA = () => {
      resetQA();
      alert("QA 상태가 초기화되었습니다.");
  };

  const handleSave = () => {
      saveStoredApiKey(apiKey);
      saveStoredDartApiKey(dartApiKey);
      saveStoredAiModel(aiModel);
      saveStoredCompany(company);
      setSaveStatus('SUCCESS');
      setTimeout(()=>setSaveStatus('IDLE'), 2000);
  };

  return (
    <div className="flex flex-col h-full relative">
      <Header title="시스템 설정 & QA 센터" />
      
      <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-8">
              {/* QA Trigger Section */}
              <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow-sm border border-indigo-100 dark:border-indigo-900 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                      <span className="material-icons-outlined text-9xl text-indigo-500">health_and_safety</span>
                  </div>
                  <div className="relative z-10">
                      <h2 className="text-xl font-bold text-indigo-900 dark:text-indigo-300 mb-2">시스템 자가 진단 및 수정 (Self-Healing QA)</h2>
                      <p className="text-sm text-gray-500 mb-6 max-w-lg">
                          전체 기능을 순차적으로 실행하고, 오류 발생 시 수정 코드를 제안합니다.<br/>
                          '진단 시작'을 누르면 자동으로 페이지가 이동하며 점검이 진행됩니다.
                      </p>
                      
                      <div className="flex gap-3">
                          <button 
                              onClick={handleStartQA} 
                              disabled={isQaRunning}
                              className={`px-6 py-3 rounded-lg font-bold shadow-md flex items-center transition-all ${isQaRunning ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'}`}
                          >
                              {isQaRunning ? <span className="material-icons-outlined animate-spin mr-2">refresh</span> : <span className="material-icons-outlined mr-2">build</span>}
                              {isQaRunning ? "진단 진행 중..." : "진단 시작 (Start Diagnosis)"}
                          </button>
                          
                          <button 
                             onClick={handleResetQA} 
                             className="px-4 py-3 bg-white dark:bg-surface-dark border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                              상태 초기화
                          </button>
                      </div>
                  </div>
              </div>

              {/* Settings Form */}
              <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow-sm border border-border-light dark:border-border-dark">
                  <h3 className="font-bold mb-4 flex items-center"><span className="material-icons-outlined mr-2">vpn_key</span> API 설정</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Gemini API Key</label>
                          <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full border rounded p-3 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-primary outline-none transition-all"/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">Open DART API Key</label>
                          <input type="text" value={dartApiKey} onChange={e=>setDartApiKey(e.target.value)} className="w-full border rounded p-3 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-primary outline-none transition-all"/>
                      </div>
                      <button onClick={handleSave} className="w-full bg-gray-800 hover:bg-black text-white py-3 rounded-lg font-bold transition-colors">
                          {saveStatus === 'SUCCESS' ? '저장되었습니다!' : '설정 저장'}
                      </button>
                  </div>
              </div>
          </div>
      </main>
    </div>
  );
};

export default Settings;

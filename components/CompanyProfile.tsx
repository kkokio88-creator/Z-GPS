
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { getStoredCompany, saveStoredCompany, getStoredDartApiKey, saveStoredDartApiKey } from '../services/storageService';
import { Company } from '../types';
import { fetchCompanyDetailsFromDART } from '../services/apiService';
import { getQAState } from '../services/qaService';

const CompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDartModal, setShowDartModal] = useState(false);
  const [tempDartKey, setTempDartKey] = useState('');
  const [isQaActive, setIsQaActive] = useState(false);

  useEffect(() => {
      setCompany(getStoredCompany());
      setIsQaActive(getQAState().isActive);
      
      // Listen for updates in case QA modified the company data behind the scenes
      const handleStorage = () => setCompany(getStoredCompany());
      window.addEventListener('storage', handleStorage); // Sync cross-tab or storage event
      window.addEventListener('zmis-qa-update', handleStorage); // Sync with our QA events

      return () => {
          window.removeEventListener('storage', handleStorage);
          window.removeEventListener('zmis-qa-update', handleStorage);
      };
  }, []);

  const handleSave = () => { if (company) { saveStoredCompany(company); setIsEditing(false); alert("저장됨"); } };
  const handleVerifyBtnClick = () => { if(!company?.businessNumber) return alert("사업자번호 입력 필요"); const k=getStoredDartApiKey(); if(!k) setShowDartModal(true); else executeDartVerification(k); };
  const handleSaveKeyAndVerify = () => { saveStoredDartApiKey(tempDartKey); setShowDartModal(false); executeDartVerification(tempDartKey); };
  
  const executeDartVerification = async (key: string) => {
      if (!company) return;
      try {
          const data = await fetchCompanyDetailsFromDART(company.businessNumber, key, company.name);
          if(data.revenue) {
              if(window.confirm("정보를 업데이트 하시겠습니까?")) {
                  const updated = {...company, ...data, isVerified:true} as Company;
                  setCompany(updated);
                  saveStoredCompany(updated);
              }
          } else { alert("정보 없음 (Simulation Mode)"); }
      } catch(e) { alert("Error"); }
  };

  if (!company) return <div>Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="기업 자산 허브" 
        actionLabel={isEditing ? "저장" : "수정"}
        icon={isEditing ? "save" : "edit"}
        onAction={isEditing ? handleSave : () => setIsEditing(true)}
      />
      
      <main className="flex-1 overflow-y-auto p-8 z-10 relative">
        {isQaActive && (
            <div className="mb-4 bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded shadow-sm">
                <p className="font-bold text-indigo-700 flex items-center">
                    <span className="material-icons-outlined animate-spin mr-2">sync</span>
                    QA Testing In Progress: Data Verification...
                </p>
            </div>
        )}

        <div className="max-w-4xl mx-auto bg-white dark:bg-surface-dark p-6 rounded shadow border border-border-light dark:border-border-dark">
            <h2 className="text-xl font-bold mb-4">{company.name}</h2>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-gray-500">사업자번호</label>
                    <div className="flex gap-2">
                        <input disabled={!isEditing} value={company.businessNumber} onChange={e=>setCompany({...company, businessNumber:e.target.value})} className="border p-1 rounded text-sm"/>
                        <button onClick={handleVerifyBtnClick} className="bg-primary text-white text-xs px-2 rounded">조회</button>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-gray-500">매출액</label>
                    <div className="font-bold text-blue-600">{(company.revenue||0).toLocaleString()}원</div>
                </div>
            </div>
        </div>
      </main>

      {showDartModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded shadow-lg">
                  <h3 className="font-bold mb-2">API Key 입력</h3>
                  <input value={tempDartKey} onChange={e=>setTempDartKey(e.target.value)} className="border p-2 w-full mb-2"/>
                  <button onClick={handleSaveKeyAndVerify} className="bg-primary text-white px-4 py-2 rounded">확인</button>
                  <button onClick={()=>setShowDartModal(false)} className="ml-2 px-4 py-2">취소</button>
              </div>
          </div>
      )}
    </div>
  );
};

export default CompanyProfile;

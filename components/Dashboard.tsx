
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchIncheonSupportPrograms } from '../services/apiService';
import { getStoredCompany, getStoredApplications, saveStoredApplication } from '../services/storageService';
import { Company, SupportProgram, Application, EligibilityStatus } from '../types';
import Header from './Header';
import { getQAState } from '../services/qaService';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company>(getStoredCompany());
  const [programs, setPrograms] = useState<SupportProgram[]>([]);
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [isQaActive, setIsQaActive] = useState(false);

  useEffect(() => {
    // 1. Fetch User & Apps
    const loadedCompany = getStoredCompany();
    setCompany(loadedCompany);
    setMyApplications(getStoredApplications());
    setIsQaActive(getQAState().isActive);

    // 2. Fetch Programs & Simulate 'AI Matching'
    const loadPrograms = async () => {
        const data = await fetchIncheonSupportPrograms();
        // Simple client-side sorting by fitScore (simulated)
        const sorted = data.sort((a, b) => b.fitScore - a.fitScore);
        setPrograms(sorted);
    };
    loadPrograms();
  }, []);

  const handleCreateApplication = (program: SupportProgram) => {
      // Check if already exists
      const existing = myApplications.find(a => a.programId === program.id);
      if (existing) {
          navigate(`/editor/${program.id}/${company.id}`);
          return;
      }

      // Create new
      const newApp: Application = {
          id: `app_${Date.now()}`,
          programId: program.id,
          programSnapshot: {
              name: program.programName,
              organizer: program.organizer,
              endDate: program.officialEndDate,
              grantAmount: program.expectedGrant,
              type: program.supportType,
              description: program.description,
              requiredDocuments: program.requiredDocuments,
              detailUrl: program.detailUrl
          },
          companyId: company.id,
          status: '작성 전',
          draftSections: {
            section1: '', section2: '', section3: '', section4: '', section5: '', section6: ''
          },
          documentStatus: {},
          updatedAt: new Date().toISOString(),
          isCalendarSynced: false
      };

      saveStoredApplication(newApp);
      navigate(`/editor/${program.id}/${company.id}`);
  };

  // Stats Calculation
  const stats = {
      writing: myApplications.filter(a => a.status === '작성 중' || a.status === '작성 전').length,
      reviewing: myApplications.filter(a => ['제출 완료', '서류 심사', '발표 평가'].includes(a.status)).length,
      accepted: myApplications.filter(a => a.status === '최종 선정').length
  };

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <Header title="대시보드" icon="dashboard" />
      
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto space-y-8">
            
            {/* QA Active Banner */}
            {isQaActive && (
                <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded shadow-sm flex items-center justify-between">
                    <p className="font-bold text-indigo-700 flex items-center">
                        <span className="material-icons-outlined animate-spin mr-2">sync</span>
                        System Self-Diagnosis Mode Active...
                    </p>
                    <span className="text-xs text-indigo-600 bg-white px-2 py-1 rounded">Monitoring</span>
                </div>
            )}

            {/* Welcome & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Enhanced Company Profile Card */}
                <div className="lg:col-span-1 bg-white dark:bg-surface-dark p-5 rounded-xl border border-border-light dark:border-border-dark shadow-sm h-full flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white truncate" title={company.name}>
                                {company.name}
                            </h2>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${company.isVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {company.isVerified ? '인증기업' : '미인증'}
                            </span>
                        </div>
                        
                        <div className="space-y-3 text-xs text-gray-600 dark:text-gray-300 mb-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">사업자번호</span>
                                <span className="font-mono">{company.businessNumber}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">업종</span>
                                <span className="font-medium text-right truncate w-24">{company.industry || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">매출액</span>
                                <span className="font-medium">{company.revenue ? (company.revenue / 100000000).toFixed(1) : '0'}억원</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">임직원</span>
                                <span className="font-medium">{company.employees}명</span>
                            </div>
                        </div>

                         <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mb-2">
                             <p className="text-[10px] text-gray-400 mb-2 font-bold uppercase">핵심 역량 키워드</p>
                             <div className="flex flex-wrap gap-1.5">
                                 {company.preferredKeywords && company.preferredKeywords.length > 0 ? 
                                    company.preferredKeywords.slice(0, 4).map((k,i) => (
                                        <span key={i} className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded">#{k}</span>
                                    ))
                                    : <span className="text-[10px] text-gray-300 italic">키워드 데이터 없음</span>
                                 }
                             </div>
                         </div>
                    </div>

                    <button 
                        onClick={() => navigate('/company')}
                        className="w-full mt-2 py-2 text-xs font-bold text-gray-500 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
                    >
                        <span className="material-icons-outlined text-sm mr-1">edit</span>
                        기업 정보 관리
                    </button>
                </div>

                {/* Status Cards */}
                <div className="lg:col-span-3 grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-surface-dark p-5 rounded-xl shadow-sm border border-border-light dark:border-border-dark flex items-center justify-between">
                        <div>
                            <p className="text-xs text-text-sub-light dark:text-text-sub-dark font-bold uppercase">작성 중 (Draft)</p>
                            <p className="text-3xl font-bold text-blue-600 mt-1">{stats.writing}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                            <span className="material-icons-outlined">edit_document</span>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-surface-dark p-5 rounded-xl shadow-sm border border-border-light dark:border-border-dark flex items-center justify-between">
                        <div>
                            <p className="text-xs text-text-sub-light dark:text-text-sub-dark font-bold uppercase">심사 중 (Review)</p>
                            <p className="text-3xl font-bold text-purple-600 mt-1">{stats.reviewing}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600">
                            <span className="material-icons-outlined">fact_check</span>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-surface-dark p-5 rounded-xl shadow-sm border border-border-light dark:border-border-dark flex items-center justify-between">
                        <div>
                            <p className="text-xs text-text-sub-light dark:text-text-sub-dark font-bold uppercase">선정 완료 (Success)</p>
                            <p className="text-3xl font-bold text-green-600 mt-1">{stats.accepted}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600">
                            <span className="material-icons-outlined">emoji_events</span>
                        </div>
                    </div>
                    
                    {/* Additional Mini Stats / Tip */}
                    <div className="col-span-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 text-white shadow-md flex justify-between items-center">
                         <div>
                             <h4 className="font-bold text-sm mb-1">💡 Z-GPS 팁</h4>
                             <p className="text-xs opacity-90">기업 프로필을 상세히 입력할수록 AI 추천 정확도가 <strong>30% 이상</strong> 향상됩니다.</p>
                         </div>
                         <button onClick={() => navigate('/company')} className="bg-white/20 hover:bg-white/30 text-xs px-3 py-1.5 rounded transition-colors">
                             프로필 완성하기
                         </button>
                    </div>
                </div>
            </div>

            {/* AI Recommendations */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-text-main-light dark:text-text-main-dark flex items-center">
                        <span className="material-icons-outlined text-primary mr-2">auto_awesome</span>
                        AI 맞춤 추천 지원사업
                    </h3>
                    <button className="text-sm text-primary hover:underline">전체 보기</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {programs.slice(0, 6).map((program) => {
                        const isHighFit = program.fitScore >= 85;
                        
                        // Calculate D-Day
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const endDate = new Date(program.officialEndDate);
                        endDate.setHours(0,0,0,0);
                        const diffTime = endDate.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        let dDayLabel = "";
                        let dDayColor = "";
                        
                        if (diffDays < 0) {
                            dDayLabel = "마감";
                            dDayColor = "bg-gray-100 text-gray-500";
                        } else if (diffDays === 0) {
                            dDayLabel = "D-Day";
                            dDayColor = "bg-red-100 text-red-600 animate-pulse";
                        } else {
                            dDayLabel = `D-${diffDays}`;
                            dDayColor = diffDays <= 7 ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600";
                        }

                        return (
                            <div key={program.id} className="group bg-white dark:bg-surface-dark rounded-xl p-5 border border-border-light dark:border-border-dark hover:shadow-md transition-all relative overflow-hidden flex flex-col h-full">
                                {isHighFit && <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-1 rounded-bl-lg font-bold">강력 추천</div>}
                                
                                <div className="mb-4">
                                    <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded font-medium mb-2">
                                        {program.supportType}
                                    </span>
                                    <h4 className="text-md font-bold text-text-main-light dark:text-text-main-dark leading-tight line-clamp-2 min-h-[44px]">
                                        {program.programName}
                                    </h4>
                                    <p className="text-xs text-text-sub-light dark:text-text-sub-dark mt-1">{program.organizer}</p>
                                </div>

                                <div className="space-y-2 mb-6 flex-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">예상 지원금</span>
                                        <span className="font-bold text-indigo-600">{(program.expectedGrant / 100000000).toFixed(1)}억원</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">적합도</span>
                                        <span className={`font-bold ${isHighFit ? 'text-green-600' : 'text-yellow-600'}`}>{program.fitScore}%</span>
                                    </div>
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="text-gray-500">마감일</span>
                                        <div className="flex items-center">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 ${dDayColor}`}>{dDayLabel}</span>
                                            <span className="text-gray-700 dark:text-gray-300">{new Date(program.officialEndDate).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => handleCreateApplication(program)}
                                    className="w-full py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-primary dark:text-green-400 font-bold text-sm hover:bg-primary hover:text-white dark:hover:bg-green-600 dark:hover:text-white transition-colors flex items-center justify-center group-hover:bg-primary group-hover:text-white"
                                >
                                    <span className="material-icons-outlined text-sm mr-2">edit_note</span>
                                    지원서 작성하기
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
            
        </div>
      </main>
    </div>
  );
};

export default Dashboard;

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { getStoredApplications, getStoredCompany, saveStoredApplication } from '../services/storageService';
import { Application, Company } from '../types';

const ApplicationList: React.FC = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [company, setCompany] = useState<Company>(getStoredCompany());
  const [viewMode, setViewMode] = useState<'LIST' | 'BOARD'>('LIST');

  useEffect(() => {
    const apps = getStoredApplications();
    setApplications(apps);
  }, []);

  const handleStatusChange = (appId: string, newStatus: Application['status']) => {
      const updatedApps = applications.map(app => 
          app.id === appId ? { ...app, status: newStatus, updatedAt: new Date().toISOString() } : app
      );
      setApplications(updatedApps);
      const targetApp = updatedApps.find(a => a.id === appId);
      if (targetApp) saveStoredApplication(targetApp);
  };

  // Stats Logic
  const stats = {
      total: applications.length,
      writing: applications.filter(a => a.status === '작성 중' || a.status === '작성 전').length,
      submitted: applications.filter(a => a.status === '제출 완료' || a.status === '서류 심사' || a.status === '발표 평가').length,
      success: applications.filter(a => a.status === '최종 선정').length,
  };
  
  const successRate = stats.submitted > 0 ? Math.round((stats.success / stats.submitted) * 100) : 0;

  // Kanban Columns
  const columns: { title: string; statuses: Application['status'][]; color: string }[] = [
      { title: '준비 (To Do)', statuses: ['작성 전'], color: 'border-gray-400' },
      { title: '작성 중 (In Progress)', statuses: ['작성 중'], color: 'border-blue-500' },
      { title: '제출/심사 (Review)', statuses: ['제출 완료', '서류 심사', '발표 평가'], color: 'border-purple-500' },
      { title: '결과 (Done)', statuses: ['최종 선정', '탈락'], color: 'border-green-500' },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="신청 관리 (My Applications)" 
        actionLabel="새 지원사업 찾기" 
        icon="search"
        onAction={() => navigate('/')}
        secondaryLabel={viewMode === 'LIST' ? '보드 뷰' : '리스트 뷰'}
        secondaryAction={() => setViewMode(viewMode === 'LIST' ? 'BOARD' : 'LIST')}
      />
      
      <main className="flex-1 overflow-y-auto p-8 z-10 relative">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
        <div className="relative z-10 max-w-7xl mx-auto">
            
            {/* Funnel Analytics */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-surface-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark text-center">
                    <span className="text-xs text-text-sub-light uppercase font-bold">총 지원 이력</span>
                    <div className="text-3xl font-bold text-gray-700 dark:text-white mt-1">{stats.total}</div>
                </div>
                <div className="bg-white dark:bg-surface-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark text-center relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 h-1 bg-blue-500 w-full"></div>
                    <span className="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold">작성 중 (Draft)</span>
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.writing}</div>
                </div>
                <div className="bg-white dark:bg-surface-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark text-center relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 h-1 bg-purple-500 w-full"></div>
                    <span className="text-xs text-purple-600 dark:text-purple-400 uppercase font-bold">평가 진행 (In Review)</span>
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1">{stats.submitted}</div>
                </div>
                <div className="bg-white dark:bg-surface-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark text-center relative overflow-hidden">
                    <div className="absolute bottom-0 left-0 h-1 bg-green-500 w-full"></div>
                    <span className="text-xs text-green-600 dark:text-green-400 uppercase font-bold">최종 선정 (Win)</span>
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{stats.success}</div>
                    {stats.submitted > 0 && <span className="text-[10px] text-gray-400">성공률 {successRate}%</span>}
                </div>
            </div>

            {applications.length === 0 ? (
                 <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <span className="material-icons-outlined text-6xl text-gray-300 mb-4">folder_open</span>
                    <h3 className="text-lg font-medium text-text-sub-light">작성 중인 지원서가 없습니다.</h3>
                    <p className="text-sm text-gray-400 mt-2">대시보드에서 적합한 사업을 찾아 신청을 시작해보세요.</p>
                    <button 
                        onClick={() => navigate('/')}
                        className="mt-6 px-4 py-2 bg-primary text-white rounded shadow-sm hover:bg-primary-dark transition-colors"
                    >
                        지원사업 매칭하러 가기
                    </button>
                </div>
            ) : viewMode === 'LIST' ? (
                <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg overflow-hidden shadow-sm">
                   <table className="w-full text-left border-collapse">
                     <thead>
                       <tr className="bg-gray-50 dark:bg-gray-800 border-b border-border-light dark:border-border-dark">
                         <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase">지원사업명</th>
                         <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase">마감일 / 지원금</th>
                         <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase">진행 단계</th>
                         <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase">최종 수정일</th>
                         <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase text-right">Action</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-border-light dark:divide-border-dark">
                       {applications.map((app) => {
                         const snapshot = app.programSnapshot;
                         return (
                           <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                             <td className="py-4 px-6">
                                  <div className="font-medium text-text-main-light dark:text-text-main-dark">
                                      {snapshot?.name || `지원사업 (ID: ${app.programId})`}
                                  </div>
                                  <div className="text-xs text-text-sub-light mt-1">{snapshot?.organizer || '-'}</div>
                             </td>
                             <td className="py-4 px-6">
                                  <div className="text-sm text-gray-800 dark:text-gray-200">
                                      {snapshot?.endDate ? new Date(snapshot.endDate).toLocaleDateString() : '-'}
                                  </div>
                                  <div className="text-xs text-indigo-600 font-bold mt-1">
                                      {snapshot?.grantAmount ? `${(snapshot.grantAmount / 1000000).toLocaleString()} 백만원` : '-'}
                                  </div>
                             </td>
                             <td className="py-4 px-6">
                                 <span className={`px-2 py-1 rounded text-xs font-bold inline-flex items-center ${
                                     app.status === '최종 선정' ? 'bg-green-100 text-green-800' :
                                     app.status === '탈락' ? 'bg-red-100 text-red-800' :
                                     'bg-blue-50 text-blue-800'
                                 }`}>
                                     {app.status}
                                 </span>
                             </td>
                             <td className="py-4 px-6 text-sm text-text-sub-light">
                                 {new Date(app.updatedAt).toLocaleDateString()}
                             </td>
                             <td className="py-4 px-6 text-right">
                                 <button 
                                     onClick={() => navigate(`/editor/${app.programId}/${company.id}`)}
                                     className="text-primary hover:text-primary-dark font-medium text-sm border border-primary px-3 py-1 rounded hover:bg-green-50 transition-colors"
                                 >
                                     상세 보기
                                 </button>
                             </td>
                           </tr>
                         );
                       })}
                     </tbody>
                   </table>
                </div>
            ) : (
                /* Kanban Board View */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full overflow-x-auto pb-4">
                    {columns.map((col) => (
                        <div key={col.title} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 min-w-[280px]">
                            <h3 className={`text-sm font-bold mb-3 pb-2 border-b-2 ${col.color} text-gray-700 dark:text-gray-300 flex justify-between`}>
                                {col.title}
                                <span className="bg-gray-200 dark:bg-gray-700 px-2 rounded-full text-xs flex items-center">{applications.filter(a => col.statuses.includes(a.status)).length}</span>
                            </h3>
                            <div className="space-y-3">
                                {applications
                                    .filter(app => col.statuses.includes(app.status))
                                    .map(app => {
                                        const snapshot = app.programSnapshot;
                                        return (
                                            <div 
                                                key={app.id} 
                                                className="bg-white dark:bg-surface-dark p-4 rounded shadow-sm border border-border-light dark:border-border-dark hover:shadow-md transition-shadow cursor-pointer relative group"
                                                onClick={() => navigate(`/editor/${app.programId}/${company.id}`)}
                                            >
                                                <div className="text-xs text-gray-500 mb-1">{new Date(app.updatedAt).toLocaleDateString()}</div>
                                                <div className="font-bold text-sm mb-2 text-gray-800 dark:text-gray-200 line-clamp-2">
                                                    {snapshot?.name || '지원사업'}
                                                </div>
                                                <div className="flex justify-between items-center mt-3">
                                                    <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">{app.status}</span>
                                                    {/* Simple Move Button for Demo (No DnD Lib) */}
                                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => handleStatusChange(app.id, '작성 전')} title="준비" className="w-4 h-4 rounded-full bg-gray-300 hover:bg-gray-400"></button>
                                                        <button onClick={() => handleStatusChange(app.id, '작성 중')} title="작성중" className="w-4 h-4 rounded-full bg-blue-300 hover:bg-blue-400"></button>
                                                        <button onClick={() => handleStatusChange(app.id, '제출 완료')} title="제출" className="w-4 h-4 rounded-full bg-purple-300 hover:bg-purple-400"></button>
                                                        <button onClick={() => handleStatusChange(app.id, '최종 선정')} title="성공" className="w-4 h-4 rounded-full bg-green-300 hover:bg-green-400"></button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
        </div>
      </main>
    </div>
  );
};

export default ApplicationList;
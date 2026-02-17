import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { logoutUser } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(false);
  const companyName = useCompanyStore(s => s.company)?.name || '기업 미설정';

  const isActive = (path: string) => location.pathname === path;

  // Initialize Theme based on OS preference or localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isDark;
    setIsDark(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleLogout = () => {
      if(window.confirm("로그아웃 하시겠습니까?\n(설정된 API Key 정보는 기기에 유지됩니다)")) {
          logoutUser();
          navigate('/login');
      }
  };

  // v2.0 Consolidated Menu Structure
  const menuItems = [
    { path: '/', icon: 'dashboard', label: '대시보드' },
    { path: '/explore', icon: 'travel_explore', label: '공고 탐색' },
    { path: '/applications', icon: 'folder_shared', label: '나의 프로젝트' },
    { path: '/benefits', icon: 'account_balance', label: '놓친 세금 환급' },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex flex-col flex-shrink-0 z-20 shadow-sm transition-colors duration-200">
      <div className="h-16 flex items-center px-6 border-b border-border-light dark:border-border-dark cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" onClick={() => navigate('/')}>
        <span className="font-bold text-lg mr-2 text-primary dark:text-green-400">Z-GPS</span>
        <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-bold">Pro</span>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <div className="px-3 text-xs font-semibold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-2">Core Workflow</div>
        
        {menuItems.map((item) => (
           <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center px-3 py-3 rounded-lg font-medium transition-all mb-1 ${
              isActive(item.path) 
                ? 'text-primary dark:text-green-400 bg-green-50 dark:bg-green-900/20 shadow-sm translate-x-1' 
                : 'text-text-main-light dark:text-text-main-dark hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span className={`material-icons-outlined mr-3 ${isActive(item.path) ? 'text-primary' : 'text-gray-400'}`} aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div className="py-4 border-t border-gray-100 dark:border-gray-700 mt-4 mx-2"></div>
        <div className="px-3 text-xs font-semibold text-text-sub-light dark:text-text-sub-dark uppercase tracking-wider mb-2">System</div>
        
        <button 
            onClick={() => navigate('/settings')}
            className={`w-full flex items-center px-3 py-2 rounded-lg font-medium transition-colors mb-1 ${
              isActive('/settings') 
                ? 'text-primary dark:text-green-400 bg-green-50 dark:bg-green-900/20' 
                : 'text-text-main-light dark:text-text-main-dark hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
        >
          <span className="material-icons-outlined mr-3 text-gray-400" aria-hidden="true">settings</span>
          환경 설정
        </button>
      </nav>

      {/* Footer Area with Theme Toggle & Logout */}
      <div className="border-t border-border-light dark:border-border-dark p-4 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
                <span className="text-xs font-medium text-text-sub-light dark:text-text-sub-dark mr-2">다크 모드</span>
                <button 
                    onClick={toggleTheme}
                    className={`relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isDark ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                    <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isDark ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500" title="로그아웃">
                <span className="material-icons-outlined text-sm" aria-hidden="true">logout</span>
            </button>
        </div>

        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0 text-white shadow-md">
            <span className="material-icons-outlined text-lg" aria-hidden="true">business</span>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-bold text-text-main-light dark:text-text-main-dark truncate">{companyName}</p>
            <div className="flex items-center">
              <p className="text-xs text-text-sub-light dark:text-text-sub-dark truncate">Admin Account</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
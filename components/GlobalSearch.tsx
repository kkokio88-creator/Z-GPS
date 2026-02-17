import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredApplications } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';

type SearchItem = {
  type: string;
  label: string;
  path: string;
  icon: string;
  sub?: string;
};

const GlobalSearch: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const company = useCompanyStore(s => s.company);
  const applications = getStoredApplications();

  // Basic menu items
  const menuItems: SearchItem[] = [
    { type: 'MENU', label: '대시보드', path: '/', icon: 'dashboard' },
    { type: 'MENU', label: '환경 설정 (기업 정보)', path: '/settings', icon: 'business' },
    { type: 'MENU', label: '신청서 관리', path: '/applications', icon: 'folder_shared' },
    { type: 'MENU', label: '수행 및 일정', path: '/execution', icon: 'engineering' },
    { type: 'MENU', label: '캘린더', path: '/calendar', icon: 'event' },
    { type: 'MENU', label: '환경 설정', path: '/settings', icon: 'settings' },
  ];

  // Map applications to search items
  const appItems: SearchItem[] = applications.map(app => ({
      type: 'APP',
      label: `[지원서] ${app.id}`, // Usually we'd map program name here, but keeping simple for now
      path: `/editor/${app.programId}/${app.companyId}`,
      icon: 'description',
      sub: app.status
  }));

  const allItems: SearchItem[] = [...menuItems, ...appItems];

  const filteredItems = allItems.filter(item => 
      item.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
        inputRef.current?.focus();
        setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleNavigate = (path: string) => {
      navigate(path);
      setIsOpen(false);
      setQuery('');
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
          setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
          setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
          if (filteredItems[selectedIndex]) {
              handleNavigate(filteredItems[selectedIndex].path);
          }
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm transition-opacity">
      <div role="dialog" aria-modal="true" aria-label="전역 검색" className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-fade-in-up">
        <div className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <span className="material-icons-outlined text-gray-400 mr-3" aria-hidden="true">search</span>
            <input 
                ref={inputRef}
                type="text" 
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleListKeyDown}
                placeholder="검색어 입력 (메뉴, 지원서 등)..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none"
            />
            <span className="text-xs text-gray-400 border border-gray-200 dark:border-gray-600 px-1.5 rounded">ESC</span>
        </div>
        
        <div className="max-h-[300px] overflow-y-auto py-2">
            {filteredItems.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">검색 결과가 없습니다.</div>
            )}
            
            {filteredItems.map((item, idx) => (
                <div 
                    key={idx}
                    onClick={() => handleNavigate(item.path)}
                    className={`px-4 py-2 mx-2 rounded-lg flex items-center cursor-pointer text-sm transition-colors ${
                        idx === selectedIndex ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                    <span className="material-icons-outlined text-sm mr-3 opacity-70" aria-hidden="true">{item.icon}</span>
                    <div className="flex-1">
                        {item.label}
                        {item.sub && <span className="ml-2 text-[10px] bg-gray-200 dark:bg-gray-600 px-1.5 rounded text-gray-600 dark:text-gray-300">{item.sub}</span>}
                    </div>
                    {item.type === 'APP' && <span className="text-[10px] text-gray-400">지원서</span>}
                </div>
            ))}
        </div>
        
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-400 flex justify-between">
            <span><strong>↑↓</strong> 이동</span>
            <span><strong>Enter</strong> 선택</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
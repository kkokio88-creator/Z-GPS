import React, { useState, useEffect } from 'react';
import { AppNotification } from '../types';
import { getStoredNotifications, markNotificationRead } from '../services/storageService';

interface HeaderProps {
  title: string;
  onAction?: () => void;
  actionLabel?: string;
  secondaryAction?: () => void;
  secondaryLabel?: string;
  icon?: string;
}

const Header: React.FC<HeaderProps> = ({ title, onAction, actionLabel, secondaryAction, secondaryLabel, icon }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);

  useEffect(() => {
      // Poll or load notifications (Simulated)
      setNotifications(getStoredNotifications());
      const interval = setInterval(() => {
          setNotifications(getStoredNotifications());
      }, 5000);
      return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotiClick = (id: string) => {
      markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  return (
    <header className="h-16 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark flex items-center justify-between px-8 z-20 flex-shrink-0 transition-colors duration-200 relative">
      <h1 className="text-xl font-bold text-text-main-light dark:text-text-main-dark">{title}</h1>
      <div className="flex items-center space-x-3">
        
        {/* Notification Bell */}
        <div className="relative">
            <button 
                onClick={() => setShowNotiDropdown(!showNotiDropdown)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                <span className="material-icons-outlined text-lg">notifications</span>
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"></span>
                )}
            </button>
            
            {showNotiDropdown && (
                <div className="absolute right-0 top-10 w-80 bg-white dark:bg-surface-dark rounded-lg shadow-xl border border-gray-200 dark:border-border-dark py-2 z-50 animate-fade-in-up">
                    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">알림 센터</span>
                        <span className="text-[10px] text-gray-400">{unreadCount}개 안읽음</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-4 text-center text-xs text-gray-400">새로운 알림이 없습니다.</div>
                        ) : (
                            notifications.map(n => (
                                <div 
                                    key={n.id} 
                                    onClick={() => handleNotiClick(n.id)}
                                    className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-50 dark:border-gray-800 last:border-0 ${!n.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                                >
                                    <div className="flex items-start">
                                        <span className={`material-icons-outlined text-sm mr-2 mt-0.5 ${n.type === 'ALERT' ? 'text-red-500' : 'text-blue-500'}`}>
                                            {n.type === 'ALERT' ? 'error' : 'info'}
                                        </span>
                                        <div>
                                            <p className={`text-sm font-medium ${!n.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{n.title}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{n.message}</p>
                                            <p className="text-[10px] text-gray-400 mt-1">{new Date(n.timestamp).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>

        {secondaryLabel && (
           <button 
             onClick={secondaryAction}
             className="px-4 py-2 border border-border-light dark:border-border-dark rounded-md text-sm font-medium text-text-main-light dark:text-text-main-dark bg-white dark:bg-surface-dark hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
            {secondaryLabel}
          </button>
        )}

        {actionLabel && (
          <button 
            onClick={onAction}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-md text-sm font-medium shadow-sm transition-colors flex items-center"
          >
             {icon && <span className="material-icons-outlined text-sm mr-2">{icon}</span>}
             {actionLabel}
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
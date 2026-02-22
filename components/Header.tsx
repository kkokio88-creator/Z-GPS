import React, { useState, useEffect } from 'react';
import { AppNotification } from '../types';
import { getStoredNotifications, markNotificationRead } from '../services/storageService';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '@/lib/utils';
import { Bell, AlertCircle, Info } from 'lucide-react';
import Icon from './ui/Icon';

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
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-8 z-20 flex-shrink-0 transition-colors duration-200 relative">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <div className="flex items-center space-x-3">

        {/* Notification Bell */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="relative h-9 w-9 rounded-full">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 block h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-4 py-2 border-b border-border flex justify-between items-center">
              <span className="text-xs font-bold text-foreground">알림 센터</span>
              <Badge variant="secondary" className="text-[10px]">{unreadCount}개 안읽음</Badge>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">새로운 알림이 없습니다.</div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleNotiClick(n.id)}
                    className={cn(
                      "px-4 py-3 hover:bg-accent cursor-pointer border-b border-border/50 last:border-0",
                      !n.isRead && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start">
                      {n.type === 'ALERT' ? (
                        <AlertCircle className="h-4 w-4 mr-2 mt-0.5 text-destructive flex-shrink-0" />
                      ) : (
                        <Info className="h-4 w-4 mr-2 mt-0.5 text-blue-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className={cn("text-sm font-medium", !n.isRead ? "text-foreground" : "text-muted-foreground")}>{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">{new Date(n.timestamp).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {secondaryLabel && (
          <Button variant="outline" onClick={secondaryAction}>
            {secondaryLabel}
          </Button>
        )}

        {actionLabel && (
          <Button onClick={onAction}>
            {icon && <Icon name={icon} className="h-4 w-4 mr-2" />}
            {actionLabel}
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;

import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { logoutUser } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Globe,
  FolderSync,
  Landmark,
  Settings,
  LogOut,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MenuItem {
  path: string;
  icon: LucideIcon;
  label: string;
}

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(false);
  const companyName = useCompanyStore(s => s.company)?.name || '기업 미설정';

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

  const toggleTheme = (checked: boolean) => {
    setIsDark(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?\n(설정된 API Key 정보는 기기에 유지됩니다)")) {
      logoutUser();
      navigate('/login');
    }
  };

  const menuItems: MenuItem[] = [
    { path: '/', icon: LayoutDashboard, label: '대시보드' },
    { path: '/explore', icon: Globe, label: '공고 탐색' },
    { path: '/applications', icon: FolderSync, label: '나의 프로젝트' },
    { path: '/benefits', icon: Landmark, label: '놓친 세금 환급' },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 w-64 h-screen bg-card border-r border-border flex-col z-20 shadow-sm transition-colors duration-200">
      <NavLink
        to="/"
        className="h-16 flex items-center px-6 border-b border-border hover:bg-accent transition-colors"
      >
        <span className="font-bold text-lg mr-2 text-primary">Z-GPS</span>
        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs font-bold">Pro</Badge>
      </NavLink>

      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        <div className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Core Workflow</div>

        {menuItems.map((item) => {
          const IconComp = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => cn(
                "flex items-center w-full px-3 py-3 rounded-md font-medium mb-1 transition-colors",
                isActive
                  ? "text-primary bg-primary/10 shadow-sm translate-x-1"
                  : "text-foreground hover:bg-accent"
              )}
            >
              {({ isActive }) => (
                <>
                  <IconComp className={cn("mr-3 h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}

        <Separator className="my-4 mx-2" />
        <div className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">System</div>

        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            "flex items-center w-full px-3 py-2 rounded-md font-medium mb-1 transition-colors",
            isActive
              ? "text-primary bg-primary/10"
              : "text-foreground hover:bg-accent"
          )}
        >
          {({ isActive }) => (
            <>
              <Settings className={cn("mr-3 h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
              환경 설정
            </>
          )}
        </NavLink>
      </nav>

      <div className="border-t border-border p-4 bg-muted/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <span className="text-xs font-medium text-muted-foreground mr-2">다크 모드</span>
            <Switch checked={isDark} onCheckedChange={toggleTheme} />
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 text-muted-foreground hover:text-destructive" title="로그아웃">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0 text-white shadow-md">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{companyName}</p>
            <p className="text-xs text-muted-foreground truncate">Admin Account</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

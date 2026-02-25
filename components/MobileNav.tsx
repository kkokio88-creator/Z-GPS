import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { logoutUser } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';
import {
  Menu,
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

const menuItems: MenuItem[] = [
  { path: '/', icon: LayoutDashboard, label: '대시보드' },
  { path: '/explore', icon: Globe, label: '공고 탐색' },
  { path: '/applications', icon: FolderSync, label: '나의 프로젝트' },
  { path: '/benefits', icon: Landmark, label: '놓친 세금 환급' },
];

const MobileNav: React.FC = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const companyName = useCompanyStore(s => s.company)?.name || '기업 미설정';

  // Close sheet on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?\n(설정된 API Key 정보는 기기에 유지됩니다)")) {
      logoutUser();
      navigate('/login');
    }
  };

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-card border-b border-border flex items-center px-4">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Menu className="h-5 w-5" />
            <span className="sr-only">메뉴 열기</span>
          </Button>
        </SheetTrigger>

        <SheetContent side="left" className="w-64 p-0 flex flex-col">
          {/* Logo */}
          <NavLink
            to="/"
            className="h-14 flex items-center px-6 border-b border-border hover:bg-accent transition-colors"
          >
            <span className="font-bold text-lg mr-2 text-primary">Z-GPS</span>
            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs font-bold">Pro</Badge>
          </NavLink>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
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
                      ? "text-primary bg-primary/10 shadow-sm"
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

          {/* Footer */}
          <div className="border-t border-border p-4 bg-muted/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="ml-2 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{companyName}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 text-muted-foreground hover:text-destructive" title="로그아웃">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Center title */}
      <div className="flex-1 text-center">
        <span className="font-bold text-primary">Z-GPS</span>
      </div>

      {/* Spacer for symmetry */}
      <div className="w-9" />
    </div>
  );
};

export default MobileNav;

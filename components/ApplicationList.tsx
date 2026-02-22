
import Icon from './ui/Icon';
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { getStoredApplications, saveStoredApplication } from '../services/storageService';
import { useCompanyStore } from '../services/stores/companyStore';
import { Application, Company, SupportProgram, EligibilityStatus } from '../types';
import { vaultService, VaultProgram } from '../services/vaultService';
import { draftAgent, labNoteAgent } from '../services/geminiAgents';
import { getDday } from '../services/utils/formatters';

/** VaultProgram → SupportProgram 변환 */
const vaultToSupportProgram = (vp: VaultProgram): SupportProgram => ({
  id: vp.slug || vp.id,
  organizer: vp.organizer,
  programName: vp.programName,
  supportType: vp.supportType,
  officialEndDate: vp.officialEndDate,
  internalDeadline: vp.internalDeadline || vp.officialEndDate,
  expectedGrant: vp.expectedGrant,
  fitScore: vp.fitScore || 0,
  eligibility: EligibilityStatus.POSSIBLE,
  priorityRank: 0,
  eligibilityReason: vp.eligibility || '',
  requiredDocuments: [],
  detailUrl: vp.detailUrl,
  description: '',
});

import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Types ──────────────────────────────────────────────────────

interface KanbanColumn {
  id: string;
  title: string;
  statuses: Application['status'][];
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

interface Meeting {
  id: string;
  date: string;
  title: string;
  attendees: string[];
  location: string;
  notes: string;
  actionItems: { task: string; assignee: string; dueDate: string; done: boolean }[];
}

interface Expense {
  id: string;
  date: string;
  category: '인건비' | '재료비' | '위탁연구비' | '장비비' | '출장비' | '회의비' | '기타';
  item: string;
  amount: number;
  paymentMethod: '연구비카드' | '계좌이체' | '현금';
  receiptNo?: string;
  status: '집행' | '정산대기' | '정산완료' | '반려';
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  affiliation: string;
  participationRate: number;
  monthlyPay: number;
  startDate: string;
  status: '참여중' | '참여종료';
}

interface LabLog {
  id: string;
  date: string;
  content: string;
  tags: string[];
}

interface ProjectEvent {
  id: string;
  date: string;
  title: string;
  type: 'deadline' | 'meeting' | 'report' | 'settlement' | 'milestone';
  projectName?: string;
  color: string;
}

// ─── Helpers ────────────────────────────────────────────────────

// getDday: services/utils/formatters.ts 에서 import됨

const formatGrant = (amount: number): string => {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억`;
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(0)}천만`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(0)}만`;
  return `${amount.toLocaleString()}원`;
};

const STATUS_COLOR_MAP: Record<string, string> = {
  '작성 전': 'bg-gray-100 text-gray-600',
  '작성 중': 'bg-blue-100 text-blue-700',
  '제출 완료': 'bg-purple-100 text-purple-700',
  '서류 심사': 'bg-amber-100 text-amber-700',
  '발표 평가': 'bg-amber-100 text-amber-700',
  '최종 선정': 'bg-green-100 text-green-700',
  '탈락': 'bg-red-100 text-red-700',
  '포기': 'bg-gray-200 text-gray-500',
};

// ─── Sortable Card ──────────────────────────────────────────────

const SortableCard: React.FC<{
  app: Application;
  company: Company;
  onNavigate: (path: string) => void;
  onAction: (appId: string, action: 'edit' | 'abandon' | 'delete') => void;
}> = ({ app, company, onNavigate, onAction }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });
  const [showMenu, setShowMenu] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const snapshot = app.programSnapshot;
  const dday = snapshot?.endDate ? getDday(snapshot.endDate) : null;
  const canAbandon = ['작성 전', '작성 중'].includes(app.status);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`relative bg-white dark:bg-surface-dark rounded-xl p-4 shadow-sm border border-border-light dark:border-border-dark hover:shadow-lg transition-all cursor-grab active:cursor-grabbing group ${isDragging ? 'shadow-xl ring-2 ring-primary z-50' : ''}`}
    >
      {/* Header Row */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          {dday && dday.days >= 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dday.urgent ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-indigo-50 text-indigo-600'}`}>
              {dday.label}
            </span>
          )}
          {snapshot?.grantAmount && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-full">
              {formatGrant(snapshot.grantAmount)}
            </span>
          )}
        </div>
        {/* Action Menu */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMenu(!showMenu); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Icon name="more_vert" className="h-5 w-5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-7 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50"
              onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={(e) => { e.stopPropagation(); onAction(app.id, 'edit'); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <Icon name="edit" className="h-5 w-5" />지원서 편집
              </button>
              {canAbandon && (
                <button onClick={(e) => { e.stopPropagation(); onAction(app.id, 'abandon'); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-600">
                  <Icon name="block" className="h-5 w-5" />포기 처리
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onAction(app.id, 'delete'); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-red-500">
                <Icon name="delete_outline" className="h-5 w-5" />삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Program Name */}
      <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 line-clamp-2 mb-1.5 leading-snug min-h-[36px]">
        {snapshot?.name || '지원사업'}
      </h4>
      <p className="text-[11px] text-gray-400 truncate mb-3">{snapshot?.organizer || '-'}</p>

      {/* Footer */}
      <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR_MAP[app.status] || 'bg-gray-100 text-gray-600'}`}>
          {app.status}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onNavigate(`/editor/${app.programId}/${company.id}`); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-[10px] text-primary hover:text-primary-dark font-bold opacity-0 group-hover:opacity-100 transition-opacity"
        >
          편집 &rarr;
        </button>
      </div>
    </div>
  );
};

const DragOverlayCard: React.FC<{ app: Application }> = ({ app }) => (
  <div className="bg-white dark:bg-surface-dark p-4 rounded-xl shadow-2xl border-2 border-primary w-[260px] rotate-2">
    <div className="font-bold text-sm mb-2 text-gray-800 dark:text-gray-200 line-clamp-2">{app.programSnapshot?.name || '지원사업'}</div>
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR_MAP[app.status] || 'bg-gray-100'}`}>{app.status}</span>
  </div>
);

// ─── Droppable Column ───────────────────────────────────────────

const DroppableColumn: React.FC<{
  column: KanbanColumn;
  applications: Application[];
  company: Company;
  onNavigate: (path: string) => void;
  onAction: (appId: string, action: 'edit' | 'abandon' | 'delete') => void;
}> = ({ column, applications, company, onNavigate, onAction }) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const columnApps = applications.filter(app => column.statuses.includes(app.status));

  return (
    <div ref={setNodeRef}
      className={`rounded-xl min-w-[260px] flex flex-col transition-all ${isOver ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-gray-900' : ''}`}
    >
      {/* Column Header */}
      <div className={`flex items-center justify-between p-3 rounded-t-xl border-b-2 ${column.borderColor} bg-gray-50 dark:bg-gray-800/80`}>
        <div className="flex items-center gap-2">
          <Icon name={column.icon} className="h-5 w-5" />
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{column.title}</h3>
        </div>
        <span className={`${column.bgColor} w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold`}>
          {columnApps.length}
        </span>
      </div>

      {/* Cards */}
      <div className="bg-gray-50/50 dark:bg-gray-800/30 rounded-b-xl p-2 flex-1">
        <SortableContext items={columnApps.map(a => a.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 min-h-[120px]">
            {columnApps.map(app => (
              <SortableCard key={app.id} app={app} company={company} onNavigate={onNavigate} onAction={onAction} />
            ))}
            {columnApps.length === 0 && (
              <div className={`flex items-center justify-center text-gray-400 text-[11px] py-10 border-2 border-dashed rounded-xl transition-colors ${isOver ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 dark:border-gray-700'}`}>
                {isOver ? '여기에 놓기' : '드래그하여 이동'}
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
};

// ─── Confirm Modal ──────────────────────────────────────────────

const ConfirmModal: React.FC<{
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, confirmLabel, confirmColor = 'bg-red-600 hover:bg-red-700', onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <h3 id="confirm-dialog-title" className="text-lg font-bold text-gray-800 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">취소</button>
        <button onClick={onConfirm} className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors ${confirmColor}`}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

// ─── Main Component ─────────────────────────────────────────────

const ApplicationList: React.FC = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const company = useCompanyStore(s => s.company);
  const [mainTab, setMainTab] = useState<'APPLY' | 'EXECUTION' | 'CALENDAR'>('APPLY');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ appId: string; action: 'abandon' | 'delete' } | null>(null);

  // Execution States
  const [wonApps, setWonApps] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'FINANCE' | 'TEAM' | 'MEETINGS' | 'LABNOTE' | 'REPORTS'>('OVERVIEW');
  const [programs, setPrograms] = useState<SupportProgram[]>([]);

  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', date: '2024-01-15', category: '재료비', item: '실험용 시약 구매', amount: 2500000, paymentMethod: '연구비카드', receiptNo: 'RC-2024-001', status: '정산완료' },
    { id: '2', date: '2024-01-20', category: '인건비', item: '연구보조원 1월 급여', amount: 1800000, paymentMethod: '계좌이체', status: '정산완료' },
    { id: '3', date: '2024-02-01', category: '출장비', item: '학회 참가 (서울)', amount: 350000, paymentMethod: '연구비카드', receiptNo: 'RC-2024-015', status: '정산대기' },
  ]);
  const [budgetTotal] = useState(100000000);
  const [budgetByCategory] = useState({
    '인건비': 40000000, '재료비': 25000000, '위탁연구비': 15000000,
    '장비비': 10000000, '출장비': 5000000, '회의비': 3000000, '기타': 2000000
  });

  const [teamMembers] = useState<TeamMember[]>([
    { id: '1', name: '김연구', role: '연구책임자', affiliation: '(주)산너머남촌', participationRate: 30, monthlyPay: 0, startDate: '2024-01-01', status: '참여중' },
    { id: '2', name: '이개발', role: '참여연구원', affiliation: '(주)산너머남촌', participationRate: 100, monthlyPay: 3500000, startDate: '2024-01-01', status: '참여중' },
    { id: '3', name: '박분석', role: '연구보조원', affiliation: '인하대학교', participationRate: 50, monthlyPay: 1800000, startDate: '2024-01-15', status: '참여중' },
  ]);

  const [meetings] = useState<Meeting[]>([
    {
      id: '1', date: '2024-02-05', title: '1차 전문가 자문회의', attendees: ['김연구', '이개발', '외부전문가A'],
      location: '본사 회의실', notes: '시제품 개발 방향성 논의\n- A안: 기존 방식 개선\n- B안: 신규 기술 적용',
      actionItems: [
        { task: 'B안 상세 계획서 작성', assignee: '이개발', dueDate: '2024-02-12', done: true },
        { task: '리스크 분석 보고서', assignee: '박분석', dueDate: '2024-02-15', done: false },
      ]
    },
  ]);

  const [labLogs, setLabLogs] = useState<LabLog[]>([]);
  const [newLog, setNewLog] = useState('');
  const [isRefiningLog, setIsRefiningLog] = useState(false);
  const [reportDraft, setReportDraft] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportType, setReportType] = useState<'중간' | '최종'>('중간');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [milestones] = useState([
    { id: '1', title: '협약 체결', date: '2024-01-05', status: 'done' },
    { id: '2', title: '1차 전문가 자문', date: '2024-02-05', status: 'done' },
    { id: '3', title: '중간보고서 제출', date: '2024-06-30', status: 'upcoming' },
    { id: '4', title: '최종보고서 제출', date: '2024-12-15', status: 'upcoming' },
    { id: '5', title: '정산서류 제출', date: '2024-12-31', status: 'upcoming' },
  ]);

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columns: KanbanColumn[] = useMemo(() => [
    { id: 'review', title: '검토 중', statuses: ['작성 전'], color: 'text-gray-500', bgColor: 'bg-gray-200 text-gray-700', borderColor: 'border-gray-300', icon: 'search' },
    { id: 'writing', title: '작성 중', statuses: ['작성 중'], color: 'text-blue-500', bgColor: 'bg-blue-100 text-blue-700', borderColor: 'border-blue-400', icon: 'edit_note' },
    { id: 'submitted', title: '제출 완료', statuses: ['제출 완료'], color: 'text-purple-500', bgColor: 'bg-purple-100 text-purple-700', borderColor: 'border-purple-400', icon: 'send' },
    { id: 'evaluation', title: '심사 중', statuses: ['서류 심사', '발표 평가'], color: 'text-amber-500', bgColor: 'bg-amber-100 text-amber-700', borderColor: 'border-amber-400', icon: 'hourglass_top' },
    { id: 'result', title: '완료', statuses: ['최종 선정', '탈락'], color: 'text-green-500', bgColor: 'bg-green-100 text-green-700', borderColor: 'border-green-400', icon: 'flag' },
    { id: 'abandoned', title: '포기', statuses: ['포기'], color: 'text-gray-400', bgColor: 'bg-gray-200 text-gray-500', borderColor: 'border-gray-300', icon: 'block' },
  ], []);

  // Pipeline Stats
  const pipelineStats = useMemo(() => {
    const items = [
      { label: '검토', count: applications.filter(a => a.status === '작성 전').length, color: 'bg-gray-400' },
      { label: '작성', count: applications.filter(a => a.status === '작성 중').length, color: 'bg-blue-500' },
      { label: '제출', count: applications.filter(a => a.status === '제출 완료').length, color: 'bg-purple-500' },
      { label: '심사', count: applications.filter(a => ['서류 심사', '발표 평가'].includes(a.status)).length, color: 'bg-amber-500' },
      { label: '선정', count: applications.filter(a => a.status === '최종 선정').length, color: 'bg-green-500' },
      { label: '탈락', count: applications.filter(a => a.status === '탈락').length, color: 'bg-red-400' },
      { label: '포기', count: applications.filter(a => a.status === '포기').length, color: 'bg-gray-300' },
    ];
    const totalGrant = applications.reduce((sum, a) => sum + (a.programSnapshot?.grantAmount || 0), 0);
    return { items, total: applications.length, totalGrant };
  }, [applications]);

  // Calendar Events
  const allCalendarEvents: ProjectEvent[] = useMemo(() => {
    const events: ProjectEvent[] = [];
    applications.forEach(app => {
      if (app.programSnapshot?.endDate) {
        events.push({ id: `app-${app.id}`, date: app.programSnapshot.endDate, title: `[마감] ${app.programSnapshot.name}`, type: 'deadline', projectName: app.programSnapshot.name, color: 'bg-red-500' });
      }
    });
    meetings.forEach(m => {
      events.push({ id: `meeting-${m.id}`, date: m.date, title: m.title, type: 'meeting', projectName: selectedApp?.programSnapshot?.name, color: 'bg-blue-500' });
    });
    milestones.forEach(ms => {
      events.push({ id: `milestone-${ms.id}`, date: ms.date, title: ms.title, type: 'milestone', projectName: selectedApp?.programSnapshot?.name, color: ms.status === 'done' ? 'bg-green-500' : 'bg-purple-500' });
    });
    return events;
  }, [applications, meetings, milestones, selectedApp]);

  useEffect(() => {
    const loadData = async () => {
      const apps = getStoredApplications();
      setApplications(apps);
      const won = apps.filter(a => a.status === '최종 선정');
      if (won.length === 0 && apps.length > 0) {
        setWonApps([{ ...apps[0], id: 'demo_win', status: '최종 선정' } as Application]);
      } else {
        setWonApps(won);
      }
      try {
        const vaultPrograms = await vaultService.getPrograms();
        setPrograms(vaultPrograms.map(vaultToSupportProgram));
      } catch {
        // Vault 연결 실패 시 빈 배열
        setPrograms([]);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (wonApps.length > 0 && !selectedApp) setSelectedApp(wonApps[0]);
  }, [wonApps, selectedApp]);

  // DnD Handlers
  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const activeApp = applications.find(a => a.id === active.id);
    if (!activeApp) return;
    const overApp = applications.find(a => a.id === over.id);
    let targetColumn: KanbanColumn | undefined;
    if (overApp) {
      targetColumn = columns.find(col => col.statuses.includes(overApp.status));
    } else {
      targetColumn = columns.find(col => col.id === over.id);
    }
    if (targetColumn && !targetColumn.statuses.includes(activeApp.status)) {
      const newStatus = targetColumn.statuses[0];
      const updatedApps = applications.map(app =>
        app.id === active.id ? { ...app, status: newStatus, updatedAt: new Date().toISOString() } : app
      );
      setApplications(updatedApps);
      const targetApp = updatedApps.find(a => a.id === active.id);
      if (targetApp) saveStoredApplication(targetApp);
    }
  };
  const handleDragOver = (_event: DragOverEvent) => {};
  const activeApp = activeId ? applications.find(a => a.id === activeId) : null;

  // Card Actions
  const handleCardAction = (appId: string, action: 'edit' | 'abandon' | 'delete') => {
    const app = applications.find(a => a.id === appId);
    if (!app) return;
    if (action === 'edit') {
      navigate(`/editor/${app.programId}/${company.id}`);
    } else {
      setConfirmAction({ appId, action });
    }
  };

  const executeConfirmAction = () => {
    if (!confirmAction) return;
    const { appId, action } = confirmAction;
    if (action === 'abandon') {
      const updatedApps = applications.map(app =>
        app.id === appId ? { ...app, status: '포기' as Application['status'], updatedAt: new Date().toISOString() } : app
      );
      setApplications(updatedApps);
      const targetApp = updatedApps.find(a => a.id === appId);
      if (targetApp) saveStoredApplication(targetApp);
    } else if (action === 'delete') {
      const remaining = applications.filter(a => a.id !== appId);
      setApplications(remaining);
      localStorage.setItem('zmis_applications', JSON.stringify(remaining));
    }
    setConfirmAction(null);
  };

  // Execution Handlers
  const handleAddLabLog = async () => {
    if (!newLog) return;
    setIsRefiningLog(true);
    try {
      const r = await labNoteAgent.refineLog(newLog);
      setLabLogs([...labLogs, { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], content: r, tags: ['연구'] }]);
      setNewLog('');
    } catch {
      setLabLogs([...labLogs, { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], content: newLog, tags: ['연구'] }]);
      setNewLog('');
    }
    setIsRefiningLog(false);
  };

  const handleGenerateReport = async () => {
    if (!selectedApp || programs.length === 0) return;
    setIsGeneratingReport(true);
    try {
      const r = await draftAgent.writeSection(useCompanyStore.getState().company, programs[0], `${reportType}보고서`, false, "성과 중심");
      setReportDraft(r.text);
    } catch {
      setReportDraft(`[${reportType}보고서 초안]\n\n1. 연구개요\n\n2. 연구 수행 내용\n\n3. 연구 결과\n\n4. 기대효과 및 활용방안`);
    }
    setIsGeneratingReport(false);
  };

  // Calendar helpers
  const getDaysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();

  const spent = expenses.filter(e => e.status !== '반려').reduce((acc, c) => acc + c.amount, 0);
  const spentByCategory = expenses.reduce((acc, e) => {
    if (e.status !== '반려') acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const progress = (spent / budgetTotal) * 100;

  return (
    <div className="flex flex-col h-full bg-background-light dark:bg-background-dark">
      <Header title="나의 프로젝트" />

      {/* Confirm Modal */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.action === 'abandon' ? '포기 처리' : '삭제 확인'}
          message={confirmAction.action === 'abandon'
            ? '이 지원서를 포기 처리하시겠습니까? 나중에 다시 상태를 변경할 수 있습니다.'
            : '이 지원서를 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'}
          confirmLabel={confirmAction.action === 'abandon' ? '포기 처리' : '삭제'}
          confirmColor={confirmAction.action === 'abandon' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-red-600 hover:bg-red-700'}
          onConfirm={executeConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 md:p-8">

          {/* Tab Navigation */}
          <div className="flex justify-center mb-6">
            <div className="bg-white dark:bg-surface-dark p-1 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 inline-flex gap-1">
              {[
                { id: 'APPLY', label: '신청 관리', icon: 'assignment' },
                { id: 'EXECUTION', label: '과제 수행', icon: 'engineering' },
                { id: 'CALENDAR', label: '일정', icon: 'calendar_month' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setMainTab(tab.id as typeof mainTab)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    mainTab === tab.id ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                  <Icon name={tab.icon} className="h-5 w-5" />{tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ═══════ APPLY TAB ═══════ */}
          {mainTab === 'APPLY' && (
            <div className="space-y-6">

              {/* Pipeline Summary */}
              <div className="bg-white dark:bg-surface-dark rounded-2xl border border-border-light dark:border-border-dark shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">총 프로젝트</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-white">{pipelineStats.total}</p>
                    </div>
                    <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">총 지원 규모</p>
                      <p className="text-2xl font-bold text-emerald-600">{formatGrant(pipelineStats.totalGrant)}원</p>
                    </div>
                  </div>
                  <button onClick={() => navigate('/explore')}
                    className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark transition-colors flex items-center gap-2 shadow-sm">
                    <Icon name="add" className="h-5 w-5" />새 공고 찾기
                  </button>
                </div>

                {/* Pipeline Bar */}
                <div className="flex gap-3 flex-wrap">
                  {pipelineStats.items.filter(s => s.count > 0).map(s => (
                    <div key={s.label} className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                      <span className="text-gray-600 dark:text-gray-400">{s.label}</span>
                      <span className="font-bold text-gray-800 dark:text-gray-200">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kanban Board */}
              {applications.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-surface-dark rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                  <Icon name="folder_open" className="h-5 w-5" />
                  <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">작성 중인 지원서가 없습니다</h3>
                  <p className="text-sm text-gray-400 mt-2">공고 탐색에서 적합한 사업을 찾아 시작해보세요.</p>
                  <button onClick={() => navigate('/explore')} className="mt-6 px-6 py-2.5 bg-primary text-white rounded-xl shadow-md hover:bg-primary-dark transition-colors font-bold text-sm">
                    지원사업 찾아보기
                  </button>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver}>
                  <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
                    {columns.map(col => (
                      <DroppableColumn key={col.id} column={col} applications={applications} company={company} onNavigate={navigate} onAction={handleCardAction} />
                    ))}
                  </div>
                  <DragOverlay>{activeApp ? <DragOverlayCard app={activeApp} /> : null}</DragOverlay>
                </DndContext>
              )}
            </div>
          )}

          {/* ═══════ EXECUTION TAB ═══════ */}
          {mainTab === 'EXECUTION' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Sidebar */}
              <div className="col-span-1 space-y-4">
                <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                  <h3 className="font-bold text-sm mb-3 text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Icon name="verified" className="h-5 w-5" />선정 과제
                  </h3>
                  {wonApps.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-xs">선정된 과제가 없습니다.</div>
                  ) : (
                    <div className="space-y-2">
                      {wonApps.map(app => (
                        <div key={app.id} onClick={() => setSelectedApp(app)}
                          className={`p-3 rounded-lg cursor-pointer transition-all text-sm ${
                            selectedApp?.id === app.id ? 'bg-primary text-white shadow-md' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                          }`}>
                          <div className="font-bold truncate">{app.programSnapshot?.name || app.programId}</div>
                          <div className="text-[10px] opacity-70 mt-1">{new Date(app.updatedAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedApp && (
                  <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                    <h3 className="font-bold text-xs mb-3 text-gray-500 uppercase">마일스톤</h3>
                    <div className="space-y-2">
                      {milestones.map(ms => (
                        <div key={ms.id} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${ms.status === 'done' ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className={ms.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}>{ms.title}</span>
                          <span className="ml-auto text-gray-400">{new Date(ms.date).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Main Content */}
              <div className="col-span-1 lg:col-span-4">
                {selectedApp ? (
                  <div className="bg-white dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
                    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-x-auto">
                      {[
                        { id: 'OVERVIEW', label: '개요', icon: 'dashboard' },
                        { id: 'FINANCE', label: '재무/정산', icon: 'account_balance_wallet' },
                        { id: 'TEAM', label: '참여인력', icon: 'groups' },
                        { id: 'MEETINGS', label: '회의록', icon: 'groups_2' },
                        { id: 'LABNOTE', label: '연구노트', icon: 'science' },
                        { id: 'REPORTS', label: '보고서', icon: 'description' },
                      ].map(tab => (
                        <button key={tab.id} onClick={() => setSubTab(tab.id as typeof subTab)}
                          className={`px-4 py-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap ${
                            subTab === tab.id ? 'border-primary text-primary bg-white dark:bg-surface-dark' : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}>
                          <Icon name={tab.icon} className="h-4 w-4" />{tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="p-6 min-h-[500px] overflow-y-auto">
                      {/* OVERVIEW */}
                      {subTab === 'OVERVIEW' && (
                        <div className="space-y-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <h2 className="text-xl font-bold text-gray-800 dark:text-white">{selectedApp.programSnapshot?.name}</h2>
                              <p className="text-sm text-gray-500 mt-1">{selectedApp.programSnapshot?.organizer}</p>
                            </div>
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">수행 중</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
                              <div className="text-xs text-blue-600 font-bold mb-1">예산 집행률</div>
                              <div className="text-2xl font-bold text-blue-700">{progress.toFixed(1)}%</div>
                            </div>
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl">
                              <div className="text-xs text-purple-600 font-bold mb-1">참여 인력</div>
                              <div className="text-2xl font-bold text-purple-700">{teamMembers.filter(t => t.status === '참여중').length}명</div>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl">
                              <div className="text-xs text-green-600 font-bold mb-1">회의 진행</div>
                              <div className="text-2xl font-bold text-green-700">{meetings.length}회</div>
                            </div>
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl">
                              <div className="text-xs text-orange-600 font-bold mb-1">다음 마일스톤</div>
                              <div className="text-lg font-bold text-orange-700 truncate">{milestones.find(m => m.status === 'upcoming')?.title || '-'}</div>
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                            <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                              <Icon name="priority_high" className="h-5 w-5" />할 일 목록
                            </h3>
                            <div className="space-y-2">
                              {meetings.flatMap(m => m.actionItems).filter(a => !a.done).slice(0, 3).map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-surface-dark rounded-lg border border-gray-200 dark:border-gray-700">
                                  <div className="flex items-center gap-3">
                                    <input type="checkbox" className="w-4 h-4 rounded" readOnly />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.task}</span>
                                    <span className="text-xs text-gray-400">@{item.assignee}</span>
                                  </div>
                                  <span className="text-xs text-red-500">{item.dueDate}</span>
                                </div>
                              ))}
                              {meetings.flatMap(m => m.actionItems).filter(a => !a.done).length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-4">모든 할 일이 완료되었습니다.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* FINANCE */}
                      {subTab === 'FINANCE' && (
                        <div className="space-y-6">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl text-center">
                              <div className="text-xs text-gray-500 mb-1">총 예산</div>
                              <div className="text-xl font-bold text-gray-800 dark:text-white">{budgetTotal.toLocaleString()}원</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-center">
                              <div className="text-xs text-blue-600 mb-1">집행액</div>
                              <div className="text-xl font-bold text-blue-600">{spent.toLocaleString()}원</div>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl text-center">
                              <div className="text-xs text-green-600 mb-1">잔액</div>
                              <div className="text-xl font-bold text-green-600">{(budgetTotal - spent).toLocaleString()}원</div>
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                            <h3 className="text-sm font-bold text-gray-700 mb-3">항목별 예산 현황</h3>
                            <div className="space-y-2">
                              {Object.entries(budgetByCategory).map(([cat, budget]) => {
                                const used = spentByCategory[cat] || 0;
                                const pct = (used / Number(budget)) * 100;
                                return (
                                  <div key={cat} className="flex items-center gap-3">
                                    <span className="text-xs text-gray-600 w-20">{cat}</span>
                                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                                      <div className={`h-2 rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500 w-32 text-right">{used.toLocaleString()} / {budget.toLocaleString()}</span>
                                    <span className={`text-xs font-bold w-12 text-right ${pct > 90 ? 'text-red-600' : 'text-gray-600'}`}>{pct.toFixed(0)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                  <th className="p-3 text-left font-medium text-gray-600">날짜</th>
                                  <th className="p-3 text-left font-medium text-gray-600">분류</th>
                                  <th className="p-3 text-left font-medium text-gray-600">항목</th>
                                  <th className="p-3 text-right font-medium text-gray-600">금액</th>
                                  <th className="p-3 text-center font-medium text-gray-600">상태</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {expenses.map(e => (
                                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="p-3 text-gray-600">{e.date}</td>
                                    <td className="p-3"><span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{e.category}</span></td>
                                    <td className="p-3 text-gray-800 dark:text-gray-200">{e.item}</td>
                                    <td className="p-3 text-right font-medium">{e.amount.toLocaleString()}원</td>
                                    <td className="p-3 text-center">
                                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                        e.status === '정산완료' ? 'bg-green-100 text-green-700' :
                                        e.status === '정산대기' ? 'bg-amber-100 text-amber-700' :
                                        e.status === '반려' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                      }`}>{e.status}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* TEAM */}
                      {subTab === 'TEAM' && (
                        <div className="space-y-6">
                          <h3 className="font-bold text-gray-700 dark:text-gray-300">참여 인력 관리</h3>
                          <div className="grid gap-4">
                            {teamMembers.map(member => (
                              <div key={member.id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">{member.name.charAt(0)}</div>
                                  <div>
                                    <div className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                      {member.name}
                                      <span className={`text-xs px-2 py-0.5 rounded ${member.status === '참여중' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{member.status}</span>
                                    </div>
                                    <div className="text-sm text-gray-500">{member.role} · {member.affiliation}</div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm text-gray-700 dark:text-gray-300">참여율 {member.participationRate}%</div>
                                  <div className="text-xs text-gray-500">{member.monthlyPay > 0 ? `월 ${member.monthlyPay.toLocaleString()}원` : '인건비 미지급'}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* MEETINGS */}
                      {subTab === 'MEETINGS' && (
                        <div className="space-y-6">
                          <h3 className="font-bold text-gray-700 dark:text-gray-300">회의록 관리</h3>
                          {meetings.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                              <Icon name="groups" className="h-10 w-10 text-muted-foreground mb-2" />
                              <p className="text-sm text-gray-400">등록된 회의가 없습니다.</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {meetings.map(meeting => (
                                <div key={meeting.id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                    <h4 className="font-bold text-gray-800 dark:text-white">{meeting.title}</h4>
                                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                      <span className="flex items-center gap-1"><Icon name="event" className="h-5 w-5" />{meeting.date}</span>
                                      <span className="flex items-center gap-1"><Icon name="location_on" className="h-5 w-5" />{meeting.location}</span>
                                    </div>
                                  </div>
                                  <div className="p-4">
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-4">{meeting.notes}</p>
                                    {meeting.actionItems.length > 0 && (
                                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                        <div className="text-xs font-bold text-gray-500 mb-2">Action Items</div>
                                        {meeting.actionItems.map((item, i) => (
                                          <div key={i} className="flex items-center gap-2 text-sm mb-1">
                                            <input type="checkbox" checked={item.done} readOnly className="w-4 h-4 rounded" />
                                            <span className={item.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}>{item.task}</span>
                                            <span className="text-xs text-gray-400">@{item.assignee}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* LABNOTE */}
                      {subTab === 'LABNOTE' && (
                        <div className="space-y-6">
                          <div className="bg-purple-50 dark:bg-purple-900/20 p-5 rounded-xl border border-purple-100 dark:border-purple-800">
                            <h3 className="font-bold text-sm text-purple-700 mb-3 flex items-center gap-2">
                              <Icon name="edit_note" className="h-5 w-5" />새 연구 노트 작성
                            </h3>
                            <textarea value={newLog} onChange={e => setNewLog(e.target.value)}
                              className="w-full text-sm border border-purple-200 dark:border-purple-700 rounded-lg p-4 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px]"
                              placeholder="오늘의 연구 내용, 실험 결과, 관찰 사항 등을 자유롭게 기록하세요..." />
                            <div className="flex justify-end mt-3">
                              <button onClick={handleAddLabLog} disabled={isRefiningLog || !newLog}
                                className="bg-purple-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                                {isRefiningLog ? <><Icon name="autorenew" className="h-5 w-5" />변환 중...</> : <><Icon name="auto_awesome" className="h-5 w-5" />AI 등록</>}
                              </button>
                            </div>
                          </div>
                          {labLogs.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                              <Icon name="note_alt" className="h-5 w-5" />
                              <p className="text-sm text-gray-400">등록된 연구 노트가 없습니다.</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {labLogs.map((l, i) => (
                                <div key={l.id} className="p-5 border-l-4 border-purple-500 bg-white dark:bg-surface-dark rounded-r-xl shadow-sm">
                                  <div className="flex justify-between items-start mb-3">
                                    <span className="text-sm font-bold text-purple-600">{l.date}</span>
                                    <span className="text-xs text-gray-400">#{labLogs.length - i}</span>
                                  </div>
                                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{l.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* REPORTS */}
                      {subTab === 'REPORTS' && (
                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-bold text-gray-800 dark:text-white">보고서 작성</h3>
                              <p className="text-xs text-gray-500 mt-1">AI가 수행 내역을 기반으로 보고서 초안을 작성합니다.</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <select value={reportType} onChange={e => setReportType(e.target.value as typeof reportType)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300">
                                <option value="중간">중간보고서</option>
                                <option value="최종">최종보고서</option>
                              </select>
                              <button onClick={handleGenerateReport} disabled={isGeneratingReport}
                                className="bg-primary text-white text-sm px-5 py-2.5 rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2">
                                {isGeneratingReport ? <><Icon name="autorenew" className="h-5 w-5" />생성 중...</> : <><Icon name="auto_awesome" className="h-5 w-5" />AI 작성</>}
                              </button>
                            </div>
                          </div>
                          <textarea value={reportDraft} onChange={e => setReportDraft(e.target.value)}
                            className="w-full h-96 p-5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed dark:text-gray-200"
                            placeholder="AI 자동 작성 버튼을 클릭하거나 직접 내용을 입력하세요..." />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl min-h-[500px]">
                    <Icon name="assignment" className="h-5 w-5" />
                    <p>좌측에서 과제를 선택하세요.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════ CALENDAR TAB ═══════ */}
          {mainTab === 'CALENDAR' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
                    <Icon name="calendar_today" className="h-5 w-5" />
                    {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><Icon name="chevron_left" className="h-5 w-5" /></button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm text-primary hover:bg-primary/10 rounded-lg font-medium">오늘</button>
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><Icon name="chevron_right" className="h-5 w-5" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                    <div key={d} className={`bg-gray-50 dark:bg-gray-800 p-3 text-center text-xs font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600 dark:text-gray-400'}`}>{d}</div>
                  ))}
                  {Array(getFirstDay(currentDate)).fill(null).map((_, i) => (
                    <div key={`e-${i}`} className="bg-gray-50/50 dark:bg-gray-800/50 min-h-[90px]" />
                  ))}
                  {Array(getDaysInMonth(currentDate)).fill(null).map((_, i) => {
                    const day = i + 1;
                    const today = new Date();
                    const isToday = day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();
                    const dayOfWeek = (getFirstDay(currentDate) + i) % 7;
                    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayEvents = allCalendarEvents.filter(e => e.date === dateStr || e.date.startsWith(dateStr.slice(0, 10)));
                    return (
                      <div key={day} className={`bg-white dark:bg-surface-dark min-h-[90px] p-2 border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 ${isToday ? 'bg-primary/5' : ''}`}>
                        <span className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full ${
                          isToday ? 'bg-primary text-white' : dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300'
                        }`}>{day}</span>
                        <div className="mt-1 space-y-0.5">
                          {dayEvents.slice(0, 2).map(e => (
                            <div key={e.id} className={`text-[10px] text-white px-1.5 py-0.5 rounded truncate ${e.color}`} title={e.title}>{e.title}</div>
                          ))}
                          {dayEvents.length > 2 && <div className="text-[10px] text-gray-500">+{dayEvents.length - 2}개</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs">
                  {[
                    { color: 'bg-red-500', label: '마감일' },
                    { color: 'bg-blue-500', label: '회의' },
                    { color: 'bg-purple-500', label: '마일스톤' },
                    { color: 'bg-green-500', label: '완료' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className={`w-3 h-3 ${item.color} rounded`} />
                      <span className="text-gray-600 dark:text-gray-400">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default ApplicationList;

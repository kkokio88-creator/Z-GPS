import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { getStoredApplications, getStoredCompany, saveStoredApplication, getStoredCalendarEvents } from '../services/storageService';
import { Application, Company, CalendarEvent, SupportProgram } from '../types';
import { fetchIncheonSupportPrograms } from '../services/apiService';
import { draftAgent, labNoteAgent } from '../services/geminiAgents';

// DnD Kit imports
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

// Types
interface KanbanColumn {
  id: string;
  title: string;
  statuses: Application['status'][];
  color: string;
  bgColor: string;
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
  memo?: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  affiliation: string;
  participationRate: number; // 참여율 %
  monthlyPay: number;
  startDate: string;
  endDate?: string;
  status: '참여중' | '참여종료';
}

interface Document {
  id: string;
  name: string;
  category: '협약서' | '증빙서류' | '보고서' | '기타';
  uploadDate: string;
  fileSize: string;
  url?: string;
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
  projectId?: string;
  projectName?: string;
  color: string;
}

// Sortable Card Component
const SortableCard: React.FC<{
  app: Application;
  company: Company;
  onNavigate: (path: string) => void;
}> = ({ app, company, onNavigate }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const snapshot = app.programSnapshot;
  const daysUntilDeadline = snapshot?.endDate
    ? Math.ceil((new Date(snapshot.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white dark:bg-surface-dark p-4 rounded-lg shadow-sm border border-border-light dark:border-border-dark hover:shadow-lg transition-all cursor-grab active:cursor-grabbing group ${
        isDragging ? 'shadow-xl ring-2 ring-primary' : ''
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] text-gray-400">{new Date(app.updatedAt).toLocaleDateString()}</span>
        {daysUntilDeadline !== null && daysUntilDeadline <= 7 && daysUntilDeadline >= 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            daysUntilDeadline <= 3 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
          }`}>
            D-{daysUntilDeadline}
          </span>
        )}
      </div>
      <div className="font-bold text-sm mb-2 text-gray-800 dark:text-gray-200 line-clamp-2">
        {snapshot?.name || '지원사업'}
      </div>
      <div className="text-[11px] text-gray-500 mb-3 truncate">
        {snapshot?.organizer || '-'}
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-700">
        <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300">
          {app.status}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(`/editor/${app.programId}/${company.id}`); }}
          className="text-[10px] text-primary hover:text-primary-dark font-medium opacity-0 group-hover:opacity-100 transition-opacity"
        >
          상세보기 →
        </button>
      </div>
    </div>
  );
};

const DragOverlayCard: React.FC<{ app: Application }> = ({ app }) => {
  const snapshot = app.programSnapshot;
  return (
    <div className="bg-white dark:bg-surface-dark p-4 rounded-lg shadow-2xl border-2 border-primary w-[260px] rotate-3">
      <div className="font-bold text-sm mb-2 text-gray-800 dark:text-gray-200 line-clamp-2">
        {snapshot?.name || '지원사업'}
      </div>
      <span className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded font-medium">
        {app.status}
      </span>
    </div>
  );
};

const DroppableColumn: React.FC<{
  column: KanbanColumn;
  applications: Application[];
  company: Company;
  onNavigate: (path: string) => void;
}> = ({ column, applications, company, onNavigate }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });
  const columnApps = applications.filter(app => column.statuses.includes(app.status));

  return (
    <div
      ref={setNodeRef}
      className={`bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 min-w-[260px] flex flex-col transition-all ${
        isOver ? 'ring-2 ring-primary ring-offset-2 bg-primary/5' : ''
      }`}
    >
      <div className={`flex items-center justify-between mb-4 pb-3 border-b-2 ${column.color}`}>
        <div className="flex items-center gap-2">
          <span className={`material-icons-outlined text-lg ${column.color.replace('border-', 'text-')}`}>
            {column.icon}
          </span>
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{column.title}</h3>
        </div>
        <span className={`${column.bgColor} px-2.5 py-1 rounded-full text-xs font-bold`}>
          {columnApps.length}
        </span>
      </div>
      <SortableContext items={columnApps.map(a => a.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-3 min-h-[150px]">
          {columnApps.map(app => (
            <SortableCard key={app.id} app={app} company={company} onNavigate={onNavigate} />
          ))}
          {columnApps.length === 0 && (
            <div className={`h-full flex items-center justify-center text-gray-400 text-xs py-8 border-2 border-dashed rounded-lg transition-colors ${
              isOver ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-gray-700'
            }`}>
              {isOver ? '여기에 놓기' : '드래그하여 이동'}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
};

const ApplicationList: React.FC = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[]>([]);
  const [company, setCompany] = useState<Company>(getStoredCompany());
  const [viewMode, setViewMode] = useState<'LIST' | 'BOARD'>('BOARD');
  const [mainTab, setMainTab] = useState<'APPLY' | 'EXECUTION' | 'CALENDAR'>('APPLY');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Execution States
  const [wonApps, setWonApps] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'FINANCE' | 'TEAM' | 'MEETINGS' | 'LABNOTE' | 'REPORTS' | 'DOCS'>('OVERVIEW');
  const [programs, setPrograms] = useState<SupportProgram[]>([]);

  // Finance
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

  // Team
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { id: '1', name: '김연구', role: '연구책임자', affiliation: '(주)산너머남촌', participationRate: 30, monthlyPay: 0, startDate: '2024-01-01', status: '참여중' },
    { id: '2', name: '이개발', role: '참여연구원', affiliation: '(주)산너머남촌', participationRate: 100, monthlyPay: 3500000, startDate: '2024-01-01', status: '참여중' },
    { id: '3', name: '박분석', role: '연구보조원', affiliation: '인하대학교', participationRate: 50, monthlyPay: 1800000, startDate: '2024-01-15', status: '참여중' },
  ]);

  // Meetings
  const [meetings, setMeetings] = useState<Meeting[]>([
    {
      id: '1', date: '2024-02-05', title: '1차 전문가 자문회의', attendees: ['김연구', '이개발', '외부전문가A'],
      location: '본사 회의실', notes: '시제품 개발 방향성 논의\n- A안: 기존 방식 개선\n- B안: 신규 기술 적용\n\n전문가 의견: B안 추천, 단 리스크 관리 필요',
      actionItems: [
        { task: 'B안 상세 계획서 작성', assignee: '이개발', dueDate: '2024-02-12', done: true },
        { task: '리스크 분석 보고서', assignee: '박분석', dueDate: '2024-02-15', done: false },
      ]
    },
  ]);

  // Lab Notes
  const [labLogs, setLabLogs] = useState<LabLog[]>([]);
  const [newLog, setNewLog] = useState('');
  const [isRefiningLog, setIsRefiningLog] = useState(false);

  // Reports
  const [reportDraft, setReportDraft] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportType, setReportType] = useState<'중간' | '최종'>('중간');

  // Documents
  const [documents, setDocuments] = useState<Document[]>([
    { id: '1', name: '협약서_최종.pdf', category: '협약서', uploadDate: '2024-01-05', fileSize: '2.3 MB' },
    { id: '2', name: '사업자등록증.pdf', category: '증빙서류', uploadDate: '2024-01-05', fileSize: '512 KB' },
    { id: '3', name: '연구시설_현황.xlsx', category: '증빙서류', uploadDate: '2024-01-10', fileSize: '128 KB' },
  ]);

  // Calendar
  const [currentDate, setCurrentDate] = useState(new Date());

  // Project Milestones
  const [milestones] = useState([
    { id: '1', title: '협약 체결', date: '2024-01-05', status: 'done' },
    { id: '2', title: '1차 전문가 자문', date: '2024-02-05', status: 'done' },
    { id: '3', title: '중간보고서 제출', date: '2024-06-30', status: 'upcoming' },
    { id: '4', title: '최종보고서 제출', date: '2024-12-15', status: 'upcoming' },
    { id: '5', title: '정산서류 제출', date: '2024-12-31', status: 'upcoming' },
  ]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const columns: KanbanColumn[] = useMemo(() => [
    { id: 'review', title: '검토 중', statuses: ['작성 전'], color: 'border-gray-400', bgColor: 'bg-gray-200 text-gray-700', icon: 'search' },
    { id: 'writing', title: '작성 중', statuses: ['작성 중'], color: 'border-blue-500', bgColor: 'bg-blue-100 text-blue-700', icon: 'edit_note' },
    { id: 'submitted', title: '제출 완료', statuses: ['제출 완료'], color: 'border-purple-500', bgColor: 'bg-purple-100 text-purple-700', icon: 'send' },
    { id: 'evaluation', title: '심사 중', statuses: ['서류 심사', '발표 평가'], color: 'border-amber-500', bgColor: 'bg-amber-100 text-amber-700', icon: 'hourglass_top' },
    { id: 'result', title: '완료', statuses: ['최종 선정', '탈락'], color: 'border-green-500', bgColor: 'bg-green-100 text-green-700', icon: 'flag' },
  ], []);

  // Generate all calendar events from all sources
  const allCalendarEvents: ProjectEvent[] = useMemo(() => {
    const events: ProjectEvent[] = [];

    // From applications (deadlines)
    applications.forEach(app => {
      if (app.programSnapshot?.endDate) {
        events.push({
          id: `app-${app.id}`,
          date: app.programSnapshot.endDate,
          title: `[마감] ${app.programSnapshot.name}`,
          type: 'deadline',
          projectName: app.programSnapshot.name,
          color: 'bg-red-500'
        });
      }
    });

    // From meetings
    meetings.forEach(m => {
      events.push({
        id: `meeting-${m.id}`,
        date: m.date,
        title: m.title,
        type: 'meeting',
        projectName: selectedApp?.programSnapshot?.name,
        color: 'bg-blue-500'
      });
    });

    // From milestones
    milestones.forEach(ms => {
      events.push({
        id: `milestone-${ms.id}`,
        date: ms.date,
        title: ms.title,
        type: 'milestone',
        projectName: selectedApp?.programSnapshot?.name,
        color: ms.status === 'done' ? 'bg-green-500' : 'bg-purple-500'
      });
    });

    // Settlement deadlines (monthly)
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    events.push({
      id: `settlement-${year}-${month}`,
      date: `${year}-${String(month + 1).padStart(2, '0')}-10`,
      title: '연구비카드 내역 등록 마감',
      type: 'settlement',
      color: 'bg-orange-500'
    });

    return events;
  }, [applications, meetings, milestones, selectedApp, currentDate]);

  useEffect(() => {
    const loadData = async () => {
      const apps = getStoredApplications();
      setApplications(apps);
      const won = apps.filter(a => a.status === '최종 선정');
      if (won.length === 0 && apps.length > 0) {
        const mockWin = { ...apps[0], id: 'demo_win', status: '최종 선정' } as Application;
        setWonApps([mockWin]);
      } else {
        setWonApps(won);
      }
      setPrograms(await fetchIncheonSupportPrograms());
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
  const handleDragOver = (event: DragOverEvent) => {};
  const activeApp = activeId ? applications.find(a => a.id === activeId) : null;

  // Handlers
  const handleAddExpense = () => {
    const item = prompt("지출 항목:");
    const amount = prompt("금액:");
    const category = prompt("분류 (인건비/재료비/위탁연구비/장비비/출장비/회의비/기타):", "재료비") as Expense['category'];
    const method = prompt("결제수단 (연구비카드/계좌이체/현금):", "연구비카드") as Expense['paymentMethod'];
    if (item && amount) {
      setExpenses([...expenses, {
        id: Date.now().toString(),
        date: new Date().toISOString().split('T')[0],
        category: category || '기타',
        item,
        amount: parseInt(amount),
        paymentMethod: method || '연구비카드',
        status: '집행'
      }]);
    }
  };

  const handleAddMeeting = () => {
    const title = prompt("회의 제목:");
    const date = prompt("일시 (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
    const location = prompt("장소:", "본사 회의실");
    const attendeesStr = prompt("참석자 (쉼표 구분):", "김연구, 이개발");
    if (title && date) {
      setMeetings([...meetings, {
        id: Date.now().toString(),
        date: date || new Date().toISOString().split('T')[0],
        title,
        location: location || '',
        attendees: attendeesStr?.split(',').map(s => s.trim()) || [],
        notes: '',
        actionItems: []
      }]);
    }
  };

  const handleAddTeamMember = () => {
    const name = prompt("이름:");
    const role = prompt("역할 (연구책임자/참여연구원/연구보조원):", "참여연구원");
    const affiliation = prompt("소속:", "(주)산너머남촌");
    const rate = prompt("참여율 (%):", "100");
    const pay = prompt("월 인건비:", "0");
    if (name) {
      setTeamMembers([...teamMembers, {
        id: Date.now().toString(),
        name,
        role: role || '참여연구원',
        affiliation: affiliation || '',
        participationRate: parseInt(rate || '100'),
        monthlyPay: parseInt(pay || '0'),
        startDate: new Date().toISOString().split('T')[0],
        status: '참여중'
      }]);
    }
  };

  const handleAddLabLog = async () => {
    if (!newLog) return;
    setIsRefiningLog(true);
    try {
      const r = await labNoteAgent.refineLog(newLog);
      setLabLogs([...labLogs, { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], content: r, tags: ['연구'] }]);
      setNewLog('');
    } catch (e) {
      setLabLogs([...labLogs, { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], content: newLog, tags: ['연구'] }]);
      setNewLog('');
    }
    setIsRefiningLog(false);
  };

  const handleGenerateReport = async () => {
    if (!selectedApp || programs.length === 0) return;
    setIsGeneratingReport(true);
    try {
      const r = await draftAgent.writeSection(getStoredCompany(), programs[0], `${reportType}보고서`, false, "성과 중심");
      setReportDraft(r.text);
    } catch (e) {
      setReportDraft(`[${reportType}보고서 초안]\n\n1. 연구개요\n\n2. 연구 수행 내용\n\n3. 연구 결과\n\n4. 기대효과 및 활용방안`);
    }
    setIsGeneratingReport(false);
  };

  const handleUploadDocument = () => {
    const name = prompt("문서명:");
    const category = prompt("분류 (협약서/증빙서류/보고서/기타):", "증빙서류") as Document['category'];
    if (name) {
      setDocuments([...documents, {
        id: Date.now().toString(),
        name,
        category: category || '기타',
        uploadDate: new Date().toISOString().split('T')[0],
        fileSize: '- KB'
      }]);
    }
  };

  // Calendar
  const getDaysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  const handlePrev = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNext = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // Stats
  const spent = expenses.filter(e => e.status !== '반려').reduce((acc, c) => acc + c.amount, 0);
  const spentByCategory = expenses.reduce((acc, e) => {
    if (e.status !== '반려') acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const progress = (spent / budgetTotal) * 100;

  return (
    <div className="flex flex-col h-full">
      <Header title="나의 프로젝트" actionLabel="새 지원사업 찾기" icon="folder_shared" onAction={() => navigate('/explore')} />

      <main className="flex-1 overflow-y-auto p-6 z-10 relative">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0 opacity-40"></div>
        <div className="relative z-10 max-w-7xl mx-auto">

          {/* Main Tab Navigation */}
          <div className="flex justify-center mb-6">
            <div className="bg-white dark:bg-surface-dark p-1.5 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 inline-flex gap-1">
              {[
                { id: 'APPLY', label: '신청 관리', icon: 'assignment' },
                { id: 'EXECUTION', label: '과제 수행', icon: 'engineering' },
                { id: 'CALENDAR', label: '일정', icon: 'calendar_month' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMainTab(tab.id as typeof mainTab)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                    mainTab === tab.id ? 'bg-primary text-white shadow-md' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="material-icons-outlined text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* APPLY TAB - Kanban Only */}
          {mainTab === 'APPLY' && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300">지원서 현황</h2>
                <button
                  onClick={() => setViewMode(viewMode === 'LIST' ? 'BOARD' : 'LIST')}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="material-icons-outlined text-base">{viewMode === 'LIST' ? 'view_kanban' : 'view_list'}</span>
                  {viewMode === 'LIST' ? '보드 뷰' : '리스트 뷰'}
                </button>
              </div>

              {applications.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                  <span className="material-icons-outlined text-6xl text-gray-300 mb-4">folder_open</span>
                  <h3 className="text-lg font-medium text-text-sub-light">작성 중인 지원서가 없습니다.</h3>
                  <p className="text-sm text-gray-400 mt-2">공고 탐색에서 적합한 사업을 찾아 신청을 시작해보세요.</p>
                  <button onClick={() => navigate('/explore')} className="mt-6 px-6 py-2.5 bg-primary text-white rounded-lg shadow-md hover:bg-primary-dark transition-colors font-medium">
                    지원사업 찾아보기
                  </button>
                </div>
              ) : viewMode === 'BOARD' ? (
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver}>
                  <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
                    {columns.map((col) => (
                      <DroppableColumn key={col.id} column={col} applications={applications} company={company} onNavigate={navigate} />
                    ))}
                  </div>
                  <DragOverlay>{activeApp ? <DragOverlayCard app={activeApp} /> : null}</DragOverlay>
                </DndContext>
              ) : (
                <div className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800 border-b border-border-light dark:border-border-dark">
                        <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase">지원사업명</th>
                        <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase">마감일</th>
                        <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase">진행 단계</th>
                        <th className="py-3 px-6 text-xs font-semibold text-text-sub-light uppercase text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light dark:divide-border-dark">
                      {applications.map((app) => {
                        const snapshot = app.programSnapshot;
                        return (
                          <tr key={app.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td className="py-4 px-6">
                              <div className="font-medium text-text-main-light dark:text-text-main-dark">{snapshot?.name || `지원사업`}</div>
                              <div className="text-xs text-text-sub-light mt-1">{snapshot?.organizer || '-'}</div>
                            </td>
                            <td className="py-4 px-6 text-sm text-gray-600">{snapshot?.endDate ? new Date(snapshot.endDate).toLocaleDateString() : '-'}</td>
                            <td className="py-4 px-6">
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                app.status === '최종 선정' ? 'bg-green-100 text-green-700' : app.status === '탈락' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                              }`}>{app.status}</span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <button onClick={() => navigate(`/editor/${app.programId}/${company.id}`)} className="text-primary hover:text-primary-dark font-medium text-sm">편집 →</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* EXECUTION TAB */}
          {mainTab === 'EXECUTION' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-fade-in">
              {/* Sidebar */}
              <div className="col-span-1 space-y-4">
                <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                  <h3 className="font-bold text-sm mb-3 text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <span className="material-icons-outlined text-lg text-green-500">verified</span>
                    선정 과제
                  </h3>
                  {wonApps.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-xs">선정된 과제가 없습니다.</div>
                  ) : (
                    <div className="space-y-2">
                      {wonApps.map(app => (
                        <div
                          key={app.id}
                          onClick={() => setSelectedApp(app)}
                          className={`p-3 rounded-lg cursor-pointer transition-all text-sm ${
                            selectedApp?.id === app.id ? 'bg-primary text-white shadow-md' : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="font-bold truncate">{app.programSnapshot?.name || app.programId}</div>
                          <div className="text-[10px] opacity-70 mt-1">{new Date(app.updatedAt).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Milestones */}
                {selectedApp && (
                  <div className="bg-white dark:bg-surface-dark p-4 rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                    <h3 className="font-bold text-xs mb-3 text-gray-500 uppercase">마일스톤</h3>
                    <div className="space-y-2">
                      {milestones.map((ms, i) => (
                        <div key={ms.id} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${ms.status === 'done' ? 'bg-green-500' : 'bg-gray-300'}`}></span>
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
                    {/* Sub Tabs */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-x-auto">
                      {[
                        { id: 'OVERVIEW', label: '개요', icon: 'dashboard' },
                        { id: 'FINANCE', label: '재무/정산', icon: 'account_balance_wallet' },
                        { id: 'TEAM', label: '참여인력', icon: 'groups' },
                        { id: 'MEETINGS', label: '회의록', icon: 'groups_2' },
                        { id: 'LABNOTE', label: '연구노트', icon: 'science' },
                        { id: 'REPORTS', label: '보고서', icon: 'description' },
                        { id: 'DOCS', label: '서류함', icon: 'folder' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setSubTab(tab.id as typeof subTab)}
                          className={`px-4 py-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap ${
                            subTab === tab.id ? 'border-primary text-primary bg-white dark:bg-surface-dark' : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          <span className="material-icons-outlined text-base">{tab.icon}</span>
                          {tab.label}
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

                          {/* Quick Stats */}
                          <div className="grid grid-cols-4 gap-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
                              <div className="text-xs text-blue-600 font-bold mb-1">예산 집행률</div>
                              <div className="text-2xl font-bold text-blue-700">{progress.toFixed(1)}%</div>
                              <div className="text-xs text-blue-500 mt-1">{spent.toLocaleString()}원 / {budgetTotal.toLocaleString()}원</div>
                            </div>
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl">
                              <div className="text-xs text-purple-600 font-bold mb-1">참여 인력</div>
                              <div className="text-2xl font-bold text-purple-700">{teamMembers.filter(t => t.status === '참여중').length}명</div>
                              <div className="text-xs text-purple-500 mt-1">총 {teamMembers.length}명 등록</div>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl">
                              <div className="text-xs text-green-600 font-bold mb-1">회의 진행</div>
                              <div className="text-2xl font-bold text-green-700">{meetings.length}회</div>
                              <div className="text-xs text-green-500 mt-1">연구노트 {labLogs.length}건</div>
                            </div>
                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl">
                              <div className="text-xs text-orange-600 font-bold mb-1">다음 마일스톤</div>
                              <div className="text-lg font-bold text-orange-700">{milestones.find(m => m.status === 'upcoming')?.title || '-'}</div>
                              <div className="text-xs text-orange-500 mt-1">{milestones.find(m => m.status === 'upcoming')?.date ? `D-${Math.ceil((new Date(milestones.find(m => m.status === 'upcoming')!.date).getTime() - Date.now()) / (1000*60*60*24))}` : ''}</div>
                            </div>
                          </div>

                          {/* Pending Actions */}
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                            <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                              <span className="material-icons-outlined text-amber-500">priority_high</span>
                              할 일 목록
                            </h3>
                            <div className="space-y-2">
                              {expenses.filter(e => e.status === '정산대기').length > 0 && (
                                <div className="flex items-center justify-between p-3 bg-white dark:bg-surface-dark rounded-lg border border-orange-200">
                                  <div className="flex items-center gap-3">
                                    <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                    <span className="text-sm text-gray-700">정산 대기 중인 지출 내역 {expenses.filter(e => e.status === '정산대기').length}건</span>
                                  </div>
                                  <button onClick={() => setSubTab('FINANCE')} className="text-xs text-primary font-medium">처리하기 →</button>
                                </div>
                              )}
                              {meetings.flatMap(m => m.actionItems).filter(a => !a.done).slice(0, 3).map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-white dark:bg-surface-dark rounded-lg border border-gray-200 dark:border-gray-700">
                                  <div className="flex items-center gap-3">
                                    <input type="checkbox" className="w-4 h-4 rounded" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{item.task}</span>
                                    <span className="text-xs text-gray-400">({item.assignee})</span>
                                  </div>
                                  <span className="text-xs text-red-500">{item.dueDate}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* FINANCE */}
                      {subTab === 'FINANCE' && (
                        <div className="space-y-6">
                          {/* Budget Overview */}
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

                          {/* Category Breakdown */}
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
                                      <div className={`h-2 rounded-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pct, 100)}%` }}></div>
                                    </div>
                                    <span className="text-xs text-gray-500 w-32 text-right">{used.toLocaleString()} / {budget.toLocaleString()}</span>
                                    <span className={`text-xs font-bold w-12 text-right ${pct > 90 ? 'text-red-600' : 'text-gray-600'}`}>{pct.toFixed(0)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Expense List */}
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <h3 className="font-bold text-sm text-gray-700">지출 내역</h3>
                              <button onClick={handleAddExpense} className="text-xs bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark flex items-center gap-1">
                                <span className="material-icons-outlined text-base">add</span>지출 등록
                              </button>
                            </div>
                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                  <tr>
                                    <th className="p-3 text-left font-medium text-gray-600">날짜</th>
                                    <th className="p-3 text-left font-medium text-gray-600">분류</th>
                                    <th className="p-3 text-left font-medium text-gray-600">항목</th>
                                    <th className="p-3 text-left font-medium text-gray-600">결제</th>
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
                                      <td className="p-3 text-xs text-gray-500">{e.paymentMethod}</td>
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
                        </div>
                      )}

                      {/* TEAM */}
                      {subTab === 'TEAM' && (
                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <h3 className="font-bold text-gray-700">참여 인력 관리</h3>
                            <button onClick={handleAddTeamMember} className="text-xs bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark flex items-center gap-1">
                              <span className="material-icons-outlined text-base">person_add</span>인력 추가
                            </button>
                          </div>
                          <div className="grid gap-4">
                            {teamMembers.map(member => (
                              <div key={member.id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                    {member.name.charAt(0)}
                                  </div>
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
                          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
                            <div className="text-sm text-blue-700 font-medium">총 인건비 예산: {budgetByCategory['인건비'].toLocaleString()}원</div>
                            <div className="text-xs text-blue-600 mt-1">월 예상 지출: {teamMembers.reduce((acc, m) => acc + m.monthlyPay, 0).toLocaleString()}원</div>
                          </div>
                        </div>
                      )}

                      {/* MEETINGS */}
                      {subTab === 'MEETINGS' && (
                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <h3 className="font-bold text-gray-700">회의록 관리</h3>
                            <button onClick={handleAddMeeting} className="text-xs bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark flex items-center gap-1">
                              <span className="material-icons-outlined text-base">add</span>회의 등록
                            </button>
                          </div>
                          {meetings.length === 0 ? (
                            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                              <span className="material-icons-outlined text-4xl text-gray-300 mb-2">groups_2</span>
                              <p className="text-sm text-gray-400">등록된 회의가 없습니다.</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {meetings.map(meeting => (
                                <div key={meeting.id} className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h4 className="font-bold text-gray-800 dark:text-white">{meeting.title}</h4>
                                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                          <span className="flex items-center gap-1"><span className="material-icons-outlined text-sm">event</span>{meeting.date}</span>
                                          <span className="flex items-center gap-1"><span className="material-icons-outlined text-sm">location_on</span>{meeting.location}</span>
                                        </div>
                                      </div>
                                      <div className="flex gap-1">
                                        {meeting.attendees.slice(0, 3).map((a, i) => (
                                          <span key={i} className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">{a.charAt(0)}</span>
                                        ))}
                                        {meeting.attendees.length > 3 && <span className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-xs">+{meeting.attendees.length - 3}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="p-4">
                                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-4">{meeting.notes}</div>
                                    {meeting.actionItems.length > 0 && (
                                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                        <div className="text-xs font-bold text-gray-500 mb-2">Action Items</div>
                                        <div className="space-y-2">
                                          {meeting.actionItems.map((item, i) => (
                                            <div key={i} className="flex items-center gap-2 text-sm">
                                              <input type="checkbox" checked={item.done} readOnly className="w-4 h-4 rounded" />
                                              <span className={item.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}>{item.task}</span>
                                              <span className="text-xs text-gray-400">@{item.assignee}</span>
                                              <span className="ml-auto text-xs text-gray-400">{item.dueDate}</span>
                                            </div>
                                          ))}
                                        </div>
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
                              <span className="material-icons-outlined">edit_note</span>새 연구 노트 작성
                            </h3>
                            <textarea
                              value={newLog}
                              onChange={e => setNewLog(e.target.value)}
                              className="w-full text-sm border border-purple-200 dark:border-purple-700 rounded-lg p-4 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px]"
                              placeholder="오늘의 연구 내용, 실험 결과, 관찰 사항 등을 자유롭게 기록하세요..."
                            />
                            <div className="flex justify-between items-center mt-3">
                              <span className="text-xs text-purple-600">AI가 표준 연구노트 형식으로 변환합니다.</span>
                              <button onClick={handleAddLabLog} disabled={isRefiningLog || !newLog} className="bg-purple-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                                {isRefiningLog ? <><span className="material-icons-outlined animate-spin text-base">autorenew</span>변환 중...</> : <><span className="material-icons-outlined text-base">auto_awesome</span>AI 등록</>}
                              </button>
                            </div>
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-4">기록된 연구 노트 ({labLogs.length}건)</h3>
                            {labLogs.length === 0 ? (
                              <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                <span className="material-icons-outlined text-4xl text-gray-300 mb-2">note_alt</span>
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
                              <select value={reportType} onChange={e => setReportType(e.target.value as typeof reportType)} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
                                <option value="중간">중간보고서</option>
                                <option value="최종">최종보고서</option>
                              </select>
                              <button onClick={handleGenerateReport} disabled={isGeneratingReport} className="bg-primary text-white text-sm px-5 py-2.5 rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2">
                                {isGeneratingReport ? <><span className="material-icons-outlined animate-spin text-base">autorenew</span>생성 중...</> : <><span className="material-icons-outlined text-base">auto_awesome</span>AI 작성</>}
                              </button>
                            </div>
                          </div>
                          <textarea
                            value={reportDraft}
                            onChange={e => setReportDraft(e.target.value)}
                            className="w-full h-96 p-5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                            placeholder="AI 자동 작성 버튼을 클릭하거나 직접 내용을 입력하세요..."
                          />
                          <div className="flex justify-end gap-3">
                            <button className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">임시 저장</button>
                            <button className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700">PDF 내보내기</button>
                          </div>
                        </div>
                      )}

                      {/* DOCS */}
                      {subTab === 'DOCS' && (
                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <h3 className="font-bold text-gray-700">서류함</h3>
                            <button onClick={handleUploadDocument} className="text-xs bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark flex items-center gap-1">
                              <span className="material-icons-outlined text-base">upload_file</span>파일 업로드
                            </button>
                          </div>
                          <div className="grid gap-3">
                            {['협약서', '증빙서류', '보고서', '기타'].map(category => {
                              const catDocs = documents.filter(d => d.category === category);
                              if (catDocs.length === 0) return null;
                              return (
                                <div key={category}>
                                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">{category}</h4>
                                  <div className="space-y-2">
                                    {catDocs.map(doc => (
                                      <div key={doc.id} className="flex items-center justify-between p-3 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50">
                                        <div className="flex items-center gap-3">
                                          <span className="material-icons-outlined text-gray-400">description</span>
                                          <div>
                                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{doc.name}</div>
                                            <div className="text-xs text-gray-400">{doc.uploadDate} · {doc.fileSize}</div>
                                          </div>
                                        </div>
                                        <button className="text-xs text-primary hover:text-primary-dark">다운로드</button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl min-h-[500px]">
                    <span className="material-icons-outlined text-5xl mb-3">assignment</span>
                    <p>좌측에서 과제를 선택하세요.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CALENDAR TAB */}
          {mainTab === 'CALENDAR' && (
            <div className="animate-fade-in space-y-6">
              {/* Upcoming Events Summary */}
              <div className="grid grid-cols-4 gap-4">
                {['deadline', 'meeting', 'report', 'settlement'].map(type => {
                  const typeEvents = allCalendarEvents.filter(e => e.type === type);
                  const upcoming = typeEvents.filter(e => new Date(e.date) >= new Date()).slice(0, 1)[0];
                  const labels: Record<string, { label: string; icon: string; color: string }> = {
                    deadline: { label: '마감일', icon: 'event_busy', color: 'red' },
                    meeting: { label: '회의', icon: 'groups', color: 'blue' },
                    report: { label: '보고서', icon: 'description', color: 'purple' },
                    settlement: { label: '정산', icon: 'receipt_long', color: 'orange' },
                  };
                  const { label, icon, color } = labels[type];
                  return (
                    <div key={type} className={`bg-${color}-50 dark:bg-${color}-900/20 p-4 rounded-xl`}>
                      <div className={`text-xs text-${color}-600 font-bold mb-1 flex items-center gap-1`}>
                        <span className="material-icons-outlined text-sm">{icon}</span>{label}
                      </div>
                      {upcoming ? (
                        <>
                          <div className={`text-sm font-bold text-${color}-700 truncate`}>{upcoming.title}</div>
                          <div className={`text-xs text-${color}-500 mt-1`}>{new Date(upcoming.date).toLocaleDateString()}</div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-400">예정 없음</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Calendar */}
              <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-border-light dark:border-border-dark shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
                    <span className="material-icons-outlined text-primary">calendar_today</span>
                    {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={handlePrev} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><span className="material-icons-outlined">chevron_left</span></button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm text-primary hover:bg-primary/10 rounded-lg">오늘</button>
                    <button onClick={handleNext} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><span className="material-icons-outlined">chevron_right</span></button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                    <div key={d} className={`bg-gray-50 dark:bg-gray-800 p-3 text-center text-xs font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600 dark:text-gray-400'}`}>{d}</div>
                  ))}
                  {Array(getFirstDay(currentDate)).fill(null).map((_, i) => (
                    <div key={`e-${i}`} className="bg-gray-50/50 dark:bg-gray-800/50 min-h-[100px]" />
                  ))}
                  {Array(getDaysInMonth(currentDate)).fill(null).map((_, i) => {
                    const day = i + 1;
                    const today = new Date();
                    const isToday = day === today.getDate() && currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();
                    const dayOfWeek = (getFirstDay(currentDate) + i) % 7;
                    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayEvents = allCalendarEvents.filter(e => e.date === dateStr || e.date.startsWith(dateStr.slice(0, 10)));
                    return (
                      <div key={day} className={`bg-white dark:bg-surface-dark min-h-[100px] p-2 border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 ${isToday ? 'bg-primary/5' : ''}`}>
                        <span className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full ${
                          isToday ? 'bg-primary text-white' : dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300'
                        }`}>{day}</span>
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 3).map(e => (
                            <div key={e.id} className={`text-[10px] text-white px-1.5 py-0.5 rounded truncate ${e.color}`} title={e.title}>{e.title}</div>
                          ))}
                          {dayEvents.length > 3 && <div className="text-[10px] text-gray-500">+{dayEvents.length - 3}개</div>}
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
                    { color: 'bg-orange-500', label: '정산' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className={`w-3 h-3 ${item.color} rounded`}></span>
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

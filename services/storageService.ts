import { Company, Application, CalendarEvent, AppNotification } from "../types";
import { COMPANIES } from "../constants";

const KEYS = {
  COMPANY: 'zmis_company_v2', 
  APPLICATIONS: 'zmis_applications',
  CALENDAR: 'zmis_calendar_events',
  NOTIFICATIONS: 'zmis_notifications',
  API_KEY: 'zmis_user_api_key', 
  AI_MODEL: 'zmis_user_ai_model', 
  DART_KEY: 'zmis_user_dart_key',
  AUTH_SESSION: 'zmis_auth_session', // New: Session Key
};

// --- Authentication (New) ---
export const loginUser = (id: string) => {
    // Save session flag
    localStorage.setItem(KEYS.AUTH_SESSION, JSON.stringify({
        userId: id,
        loginTime: new Date().toISOString(),
        isLoggedIn: true
    }));
};

export const logoutUser = () => {
    localStorage.removeItem(KEYS.AUTH_SESSION);
    // Note: We deliberately DO NOT clear API keys here so they persist for the user's convenience
    // on the same device.
};

export const isAuthenticated = (): boolean => {
    const session = localStorage.getItem(KEYS.AUTH_SESSION);
    if (!session) return false;
    try {
        const parsed = JSON.parse(session);
        return parsed.isLoggedIn;
    } catch {
        return false;
    }
};

// --- System Settings (API Key & Model) ---
export const getStoredApiKey = (): string => {
  return localStorage.getItem(KEYS.API_KEY) || '';
};

export const saveStoredApiKey = (key: string) => {
  localStorage.setItem(KEYS.API_KEY, key);
};

export const getStoredAiModel = (): string => {
  return localStorage.getItem(KEYS.AI_MODEL) || 'gemini-2.5-flash-preview';
};

export const saveStoredAiModel = (model: string) => {
  localStorage.setItem(KEYS.AI_MODEL, model);
};

export const getStoredDartApiKey = (): string => {
  return localStorage.getItem(KEYS.DART_KEY) || '';
};

export const saveStoredDartApiKey = (key: string) => {
  localStorage.setItem(KEYS.DART_KEY, key);
};

// --- Mock Team Members ---
export const getTeamMembers = () => [
    { id: 'u1', name: '김대표', role: 'CEO', avatar: 'K' },
    { id: 'u2', name: '이이사', role: 'CTO', avatar: 'L' },
    { id: 'u3', name: '박팀장', role: 'Marketing', avatar: 'P' },
    { id: 'u4', name: '최대리', role: 'Manager', avatar: 'C' },
];

// Company Management
export const getStoredCompany = (): Company => {
  const stored = localStorage.getItem(KEYS.COMPANY);
  if (stored) {
    try {
        const parsed = JSON.parse(stored);
        if(parsed && parsed.id) return parsed;
    } catch (e) {
        console.error("Failed to parse stored company", e);
    }
  }
  
  // FAILSAFE: If nothing stored or invalid, initialize with default and save immediately
  const defaultCompany = COMPANIES[0];
  saveStoredCompany(defaultCompany);
  return defaultCompany;
};

export const saveStoredCompany = (company: Company) => {
  localStorage.setItem(KEYS.COMPANY, JSON.stringify(company));
};

// Application Management
export const getStoredApplications = (): Application[] => {
  const stored = localStorage.getItem(KEYS.APPLICATIONS);
  return stored ? JSON.parse(stored) : [];
};

export const saveStoredApplication = (application: Application) => {
  const apps = getStoredApplications();
  const index = apps.findIndex(a => a.id === application.id);
  
  if (index >= 0) {
    apps[index] = application;
  } else {
    apps.push(application);
  }
  
  localStorage.setItem(KEYS.APPLICATIONS, JSON.stringify(apps));
};

export const getApplicationByProgramId = (programId: string): Application | undefined => {
  const apps = getStoredApplications();
  return apps.find(a => a.programId === programId);
};

// Calendar Management
export const getStoredCalendarEvents = (): CalendarEvent[] => {
  const stored = localStorage.getItem(KEYS.CALENDAR);
  return stored ? JSON.parse(stored) : [];
};

export const saveStoredCalendarEvents = (newEvents: CalendarEvent[]) => {
  const events = getStoredCalendarEvents();
  // Merge avoiding duplicates by ID
  const merged = [...events];
  newEvents.forEach(evt => {
    if (!merged.find(e => e.id === evt.id)) {
      merged.push(evt);
    }
  });
  localStorage.setItem(KEYS.CALENDAR, JSON.stringify(merged));
};

// Notification Management
export const getStoredNotifications = (): AppNotification[] => {
  const stored = localStorage.getItem(KEYS.NOTIFICATIONS);
  if (!stored) {
      // Mock initial notifications
      return [
          {
              id: 'noti_1',
              type: 'ALERT',
              title: '서류 마감 임박',
              message: '[2025 식품 시설개선] 내부 마감일이 3일 남았습니다.',
              timestamp: new Date().toISOString(),
              isRead: false
          },
          {
              id: 'noti_2',
              type: 'INFO',
              title: '신규 적합 공고',
              message: '귀사의 업종(식품제조)에 적합한 R&D 과제가 등록되었습니다.',
              timestamp: new Date(Date.now() - 86400000).toISOString(),
              isRead: false
          }
      ];
  }
  return JSON.parse(stored);
};

export const saveStoredNotifications = (notis: AppNotification[]) => {
  localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(notis));
};

export const markNotificationRead = (id: string) => {
    const notis = getStoredNotifications();
    const updated = notis.map(n => n.id === id ? { ...n, isRead: true } : n);
    saveStoredNotifications(updated);
};

export interface FinancialData {
  year: number;
  revenue: number; // 매출액
  operatingProfit: number; // 영업이익
  netIncome?: number; // 당기순이익
}

export interface IntellectualProperty {
  id: string;
  title: string;
  type: '특허' | '실용신안' | '상표' | '디자인';
  status: '등록' | '출원';
  date: string; // 등록/출원일
}

// Feature 1: Smart Document Vault
export interface VaultDocument {
  id: string;
  name: string; // User defined name
  fileName: string; 
  fileType: string; // Detected by AI (e.g., "사업자등록증", "재무제표")
  uploadDate: string;
  expiryDate?: string; // Detected by AI
  status: 'VALID' | 'EXPIRED' | 'REVIEW_NEEDED';
  summary?: string; // AI Summary
}

export interface Company {
  id: string;
  name: string;
  businessNumber: string; 
  industry: string;
  description: string;
  revenue: number;
  employees: number;
  address: string;
  isVerified?: boolean; // New: True if data came from Gov API
  certifications?: string[]; 
  history?: string; 
  // Ontology Fields: Learned patterns
  coreCompetencies?: string[]; // AI inferred strengths
  preferredKeywords?: string[]; // Keywords frequently used in successful drafts
  
  // New Positioning Fields
  financials?: FinancialData[];
  ipList?: IntellectualProperty[];
  documents?: VaultDocument[]; // Added Vault
}

export enum EligibilityStatus {
  POSSIBLE = '가능',
  IMPOSSIBLE = '불가',
  REVIEW_NEEDED = '검토 필요',
}

export interface SupportProgram {
  id: string;
  organizer: string;
  programName: string;
  supportType: string; 
  officialEndDate: string;
  internalDeadline: string;
  expectedGrant: number; 
  fitScore: number; 
  eligibility: EligibilityStatus;
  priorityRank: number;
  eligibilityReason: string;
  requiredDocuments: string[];
  successProbability?: string; 
  description?: string; 
  detailUrl?: string; // New: External Link
}

export interface DraftSnapshot {
  id: string;
  timestamp: string;
  name: string; 
  sections: { [key: string]: string };
}

// Feature 3: Comments
export interface DraftComment {
  id: string;
  sectionId: string;
  author: string;
  text: string;
  timestamp: string;
  isResolved: boolean;
}

export interface Application {
  id: string;
  programId: string;
  // V1.7 Improvement: Store snapshot of program details to prevent data loss on refresh
  programSnapshot: {
      name: string;
      organizer: string;
      endDate: string;
      grantAmount: number;
      type: string;
      description?: string;
      requiredDocuments?: string[];
      detailUrl?: string; // New
  };
  companyId: string;
  status: '작성 전' | '작성 중' | '제출 완료' | '서류 심사' | '발표 평가' | '최종 선정' | '탈락'; 
  draftSections: {
    [key: string]: string; 
  };
  documentStatus: {
    [key: string]: boolean; 
  };
  updatedAt: string;
  isCalendarSynced?: boolean;
  snapshots?: DraftSnapshot[]; 
  comments?: DraftComment[]; 
  // v1.5 Strategy Inheritance
  gapAnalysis?: {
      strengths: string[];
      gaps: string[];
      advice: string;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'INTERNAL' | 'OFFICIAL'; 
  programName: string;
}

// Feature 2: Notifications
export interface AppNotification {
  id: string;
  type: 'ALERT' | 'INFO' | 'SUCCESS';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  link?: string;
}

// Feature: Market Research
export interface ResearchReport {
  id: string;
  query: string;
  summary: string;
  keyFindings: string[];
  sources: { title: string; uri: string }[];
  timestamp: string;
}

// Updated Review Result for Radar Chart
export interface ReviewResult {
  totalScore: number;
  scores: {
    technology: number; // 기술성
    marketability: number; // 사업성
    originality: number; // 창의성/독창성
    capability: number; // 수행역량
    socialValue: number; // 기대효과/사회적가치
  };
  feedback: string[];
}

export interface StructureAgentResponse {
  company: Partial<Company>;
  inferredStrengths: string[];
}

export interface DraftAgentContext {
  previousDrafts?: string[]; 
  tone?: string;
}

export interface IndustryTrend {
  keyword: string;
  relevance: string; 
  source?: string;
}

// V1.4 New Interfaces
export interface ConsistencyCheckResult {
    score: number;
    issues: { section: string, description: string, severity: 'HIGH'|'MEDIUM'|'LOW' }[];
    suggestion: string;
}

export interface AuditDefenseResult {
    questions: {
        question: string;
        intent: string; // 질문 의도
        defenseStrategy: string; // 방어 논리
        sampleAnswer: string; // 모범 답변
    }[];
}

// QA Test Interfaces
export interface QATestItem {
    id: string;
    category: string;
    name: string;
    path: string;
    action: string;
    status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL';
    log: string[];
    errorDetails?: string;
    fixProposal?: string;
}

export interface QAState {
    isActive: boolean;
    currentIndex: number;
    checklist: QATestItem[];
}
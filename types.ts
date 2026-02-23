
export interface FinancialData {
  year: number;
  revenue: number; // 매출액
  operatingProfit: number; // 영업이익
  netIncome?: number; // 당기순이익
  totalAssets?: number; // 총자산
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
  coreCompetencies?: string[];
  preferredKeywords?: string[];
  // 세금 스캔에 필요한 확장 필드
  foundedYear?: number;
  businessType?: string;
  mainProducts?: string[];
  representative?: string;
  financials?: FinancialData[];
  ipList?: IntellectualProperty[];
  documents?: VaultDocument[];
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

export const ApplicationStatus = {
  DRAFT_BEFORE: '작성 전',
  DRAFTING: '작성 중',
  SUBMITTED: '제출 완료',
  DOC_REVIEW: '서류 심사',
  PRESENTATION: '발표 평가',
  SELECTED: '최종 선정',
  REJECTED: '탈락',
  WITHDRAWN: '포기',
} as const;

export type ApplicationStatus = typeof ApplicationStatus[keyof typeof ApplicationStatus];

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
  status: ApplicationStatus;
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
  sectionSchema?: ApplicationSectionSchema;
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

// ===== Multi-Agent System Types =====

export type AgentRole =
  | 'ORCHESTRATOR'      // 전체 조율자
  | 'ANALYZER'          // 데이터 분석 에이전트
  | 'WRITER'            // 문서 작성 에이전트
  | 'REVIEWER'          // 검토 및 평가 에이전트
  | 'RESEARCHER'        // 시장조사 및 정보수집 에이전트
  | 'STRATEGIST'        // 전략 수립 에이전트
  | 'OPTIMIZER';        // 최적화 및 개선 에이전트

export interface AgentMessage {
  id: string;
  from: AgentRole;
  to: AgentRole | 'BROADCAST';
  type: 'REQUEST' | 'RESPONSE' | 'NOTIFICATION' | 'QUERY';
  payload: {
    task?: string;
    data?: unknown;
    result?: unknown;
    error?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  timestamp: string;
  conversationId?: string; // 연관된 대화 스레드
}

export interface AgentTask {
  id: string;
  assignedTo: AgentRole;
  type: 'ANALYZE' | 'WRITE' | 'REVIEW' | 'RESEARCH' | 'STRATEGIZE' | 'OPTIMIZE';
  description: string;
  context: {
    company?: Company;
    program?: SupportProgram;
    application?: Application;
    additionalData?: unknown;
  };
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dependencies?: string[]; // Task IDs that must complete first
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AgentState {
  role: AgentRole;
  status: 'IDLE' | 'BUSY' | 'ERROR' | 'OFFLINE';
  currentTask?: string; // Task ID
  tasksCompleted: number;
  lastActive: string;
  capabilities: string[];
  performance: {
    successRate: number;
    avgResponseTime: number; // milliseconds
  };
}

export interface SharedMemory {
  id: string;
  type: 'INSIGHT' | 'PATTERN' | 'STRATEGY' | 'FEEDBACK' | 'LEARNING';
  content: unknown;
  source: AgentRole;
  relevance: number; // 0-1 score
  tags: string[];
  timestamp: string;
  expiresAt?: string;
}

export interface OrchestratorState {
  isActive: boolean;
  mode: 'MANUAL' | 'AUTO' | 'SEMI_AUTO';
  activeAgents: AgentRole[];
  taskQueue: AgentTask[];
  messageLog: AgentMessage[];
  sharedMemory: SharedMemory[];
  currentWorkflow?: {
    id: string;
    name: string;
    stage: string;
    progress: number;
  };
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    avgTaskDuration: number;
  };
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: {
    id: string;
    name: string;
    agentRoles: AgentRole[];
    tasks: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt'>[];
  }[];
}

// ===== Kanban Board Types =====

export type KanbanStatus = 'backlog' | 'writing' | 'review' | 'done';
export type KanbanCardType = 'section' | 'document';

export interface KanbanCardData {
  id: string;
  type: KanbanCardType;
  status: KanbanStatus;
  // Section cards
  section?: SectionSchema;
  content?: string;
  aiRecommendation?: string;
  isAiGenerating?: boolean;
  // Document cards
  documentName?: string;
  isUploaded?: boolean;
}

// ===== Section Schema Types (Dynamic Sections) =====

export interface SectionSchema {
  id: string;              // "sec_project_overview"
  title: string;           // "사업 개요 및 추진 배경"
  description: string;     // 작성 가이드
  order: number;
  required: boolean;
  evaluationWeight?: string; // "기술성 30점"
  hints?: string[];
}

export interface ApplicationSectionSchema {
  programSlug: string;
  sections: SectionSchema[];
  generatedAt: string;
  source: 'ai_analyzed' | 'default_fallback';
}

// ===== Application Entity Types (Repository Pattern) =====

export enum ApplicationLifecycleStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export interface DraftSection {
  id: string;
  title: string;
  content: string;
}

export interface AgentExecutionMeta {
  stage?: string;
  progress?: number;
  errorMessage?: string;
}

export interface ApplicationEntity {
  id: string;
  companyId: string;
  programId: string;
  status: ApplicationLifecycleStatus;
  drafts: DraftSection[];
  createdAt: string;
  updatedAt: string;
  review?: ReviewResult;
  agentExecution?: AgentExecutionMeta;
}

export interface CreateApplicationInput {
  companyId: string;
  programId: string;
}

export interface ApplicationGenerationResult {
  drafts: DraftSection[];
  review?: ReviewResult;
}

// ===== Company Research Types =====

export interface CompanySearchResult {
  name: string;
  businessNumber: string;
  industry: string;
  address?: string;
  description?: string;
  establishedYear?: number;
  estimatedRevenue?: string;
}

export interface ResearchProgress {
  stage: 'IDLE' | 'SEARCHING' | 'SELECTING' | 'RESEARCHING' | 'COMPLETE' | 'ERROR';
  message: string;
  progress: number;
}

export interface DeepResearchResult {
  basicInfo: {
    name: string;
    representativeName: string;
    businessNumber: string;
    establishedDate: string;
    address: string;
    website?: string;
    employeeCount: number;
  };
  financialInfo: {
    recentRevenue: number;
    revenueGrowth: string;
    financials: FinancialData[];
  };
  businessInfo: {
    industry: string;
    mainProducts: string[];
    businessDescription: string;
    distributionChannels?: string[];
  };
  certifications: string[];
  ipList: IntellectualProperty[];
  marketPosition: {
    competitors: string[];
    marketShare: string;
    uniqueSellingPoints: string[];
  };
  history: string;
  coreCompetencies: string[];
  strategicAnalysis?: {
    swot: {
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      threats: string[];
    };
    competitiveAdvantage: string;
    growthPotential: string;
    riskFactors: string[];
  };
  industryInsights?: {
    marketTrends: string[];
    industryOutlook: string;
    regulatoryEnvironment: string;
    technologyTrends: string[];
  };
  governmentFundingFit?: {
    recommendedPrograms: string[];
    eligibilityStrengths: string[];
    potentialChallenges: string[];
    applicationTips: string;
  };
  executiveSummary?: string;
  sources?: { title: string; uri: string }[];
  researchedAt?: string;
  employmentInfo?: {
    averageSalary?: number;
    creditRating?: string;
    reviewRating?: number;
    reviewCount?: number;
    reviewSource?: string;
    benefits?: string[];
    turnoverRate?: string;
  };
  investmentInfo?: {
    totalRaised?: string;
    fundingRounds?: { round: string; amount: string; date: string; investor?: string }[];
    isBootstrapped?: boolean;
  };
  dataSources?: { name: string; url: string; dataTypes: string[]; lastUpdated: string }[];
}

// ===== Retroactive Benefit Tracking =====

export type BenefitCategory = '고용지원' | 'R&D' | '수출' | '창업' | '시설투자' | '교육훈련' | '기타';
export type BenefitStatus = 'completed' | 'ongoing' | 'refund_eligible' | 'claimed';

export interface BenefitRecord {
  id: string;
  programName: string;
  programSlug?: string;
  category: BenefitCategory;
  receivedAmount: number;
  receivedDate: string;
  expiryDate?: string;
  organizer: string;
  conditions?: string;
  conditionsMet?: boolean | null;
  status: BenefitStatus;
  attachments: string[];
  registeredAt: string;
  tags: string[];
}

export interface BenefitAnalysisResult {
  benefitId: string;
  isEligible: boolean;
  estimatedRefund: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  legalBasis: string[];
  requiredDocuments: string[];
  risks: string[];
  timeline: string;
  advice: string;
  analyzedAt: string;
}

export interface BenefitSummary {
  totalReceived: number;
  totalCount: number;
  byCategory: { category: BenefitCategory; amount: number; count: number }[];
  byYear: { year: number; amount: number; count: number }[];
  refundEligible: number;
  estimatedTotalRefund: number;
}

// ===== Tax Refund Scan =====

export type TaxRefundDifficulty = 'EASY' | 'MODERATE' | 'COMPLEX';

export interface TaxCalculationLineItem {
  key: string;
  label: string;
  value: number | string;
  unit: string;
  source: 'NPS_API' | 'COMPANY_PROFILE' | 'USER_INPUT' | 'CALCULATED' | 'TAX_LAW';
  editable: boolean;
  formula?: string;
  note?: string;
}

export interface TaxCalculationWorksheet {
  generatedAt: string;
  benefitCode: string;
  title: string;
  lineItems: TaxCalculationLineItem[];
  subtotals: { label: string; amount: number; formula?: string }[];
  totalRefund: number;
  assumptions: string[];
  userOverrides: Record<string, number | string>;
  lastRecalculatedAt?: string;
}

export interface TaxRefundOpportunity {
  id: string;
  taxBenefitName: string;
  taxBenefitCode: string;
  estimatedRefund: number;
  applicableYears: number[];
  difficulty: TaxRefundDifficulty;
  confidence: number;
  legalBasis: string[];
  description: string;
  eligibilityReason: string;
  requiredActions: string[];
  requiredDocuments: string[];
  filingDeadline?: string;
  estimatedProcessingTime: string;
  risks: string[];
  isAmendedReturn: boolean;
  status: 'identified' | 'in_progress' | 'reviewing' | 'filed' | 'received' | 'dismissed';
  dataSource?: 'NPS_API' | 'COMPANY_PROFILE' | 'ESTIMATED' | 'DART_API' | 'RESEARCH' | 'EI_API' | 'NTS_API';
  worksheet?: TaxCalculationWorksheet;
}

export interface TaxScanResult {
  id: string;
  scannedAt: string;
  opportunities: TaxRefundOpportunity[];
  totalEstimatedRefund: number;
  opportunityCount: number;
  companySnapshot: { name: string; industry: string; employees: number; revenue: number; foundedYear?: number };
  summary: string;
  disclaimer: string;
  npsData?: NpsLookupResult;
  dataCompleteness?: number;
  dartFinancials?: DartFinancialYear[];
  dataSources?: {
    nps: boolean;
    dart: boolean;
    ei: boolean;
    bizStatus: boolean;
    research: boolean;
    documents: boolean;
    programFit: boolean;
  };
}

// DART 재무제표 데이터
export interface DartFinancialYear {
  year: number;
  revenue: number;           // 매출액
  operatingProfit: number;   // 영업이익
  netIncome: number;         // 당기순이익
  rndExpense: number;        // 연구개발비
  personnelExpense: number;  // 인건비(급여)
  totalAssets: number;       // 자산총계
  totalEquity: number;       // 자본총계
}

export interface NpsWorkplaceInfo {
  wkplNm: string;
  bzowrRgstNo: string;
  wkplRoadNmDtlAddr: string;
  ldongAddr: string;
  wkplJnngStdt: string;
  nrOfJnng: number;
  crtmNtcAmt: number;
  nwAcqzrCnt: number;
  lssJnngpCnt: number;
  dataCrtYm: string;
  seq?: number;
}

export interface NpsPeriodData {
  dataCrtYm: string;       // YYYYMM
  employeeCount: number;   // 역산된 가입자수
  newHires: number;        // 신규취득자
  departures: number;      // 상실자
}

export interface NpsYearSummary {
  year: number;
  avgEmployees: number;
  totalNewHires: number;
  totalDepartures: number;
  netChange: number;       // 순증감
}

export interface NpsHistoricalTrend {
  monthlyData: NpsPeriodData[];    // 최대 60개월
  yearSummary: NpsYearSummary[];   // 연도별 요약
  totalWorkplaces: number;         // 통합된 사업장 수
  dataRange: { from: string; to: string };
}

export interface NpsLookupResult {
  found: boolean;
  matchedByBusinessNumber: boolean;
  workplace: NpsWorkplaceInfo | null;
  dataCompleteness: number;
  lastUpdated: string;
  allWorkplaces?: NpsWorkplaceInfo[];
  historical?: NpsHistoricalTrend;
}
/**
 * Vault API 클라이언트
 * 서버의 /api/vault/* 엔드포인트와 통신
 */

import { apiClient } from './apiClient';
import { connectSSE, SSEProgressEvent } from './sseClient';

export interface VaultProgram {
  id: string;
  slug: string;
  programName: string;
  organizer: string;
  supportType: string;
  officialEndDate: string;
  internalDeadline: string;
  expectedGrant: number;
  fitScore: number;
  eligibility: string;
  detailUrl: string;
  source: string;
  syncedAt: string;
  analyzedAt: string;
  status: string;
  tags: string[];
}

export interface VaultProgramDetail {
  frontmatter: VaultProgram;
  content: string;
}

export interface FitAnalysisResult {
  fitScore: number;
  eligibility: string;
  strengths: string[];
  weaknesses: string[];
  advice: string;
  recommendedStrategy: string;
}

export interface VaultApplication {
  slug: string;
  programName: string;
  generatedAt: string;
  status: string;
  sections: string[];
  updatedAt?: string;
}

export interface VaultApplicationDetail {
  draft: { frontmatter: Record<string, unknown>; content: string };
  review: { frontmatter: Record<string, unknown>; content: string } | null;
  consistency: { frontmatter: Record<string, unknown>; content: string } | null;
}

export interface VaultFolder {
  name: string;
  label: string;
  count: number;
}

export interface VaultStats {
  vaultPath: string;
  connected: boolean;
  totalPrograms: number;
  analyzedPrograms: number;
  applications: number;
  attachments: number;
  latestSyncedAt: string;
  latestAnalyzedAt: string;
  folders: VaultFolder[];
}

export interface VaultDocumentMeta {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  uploadDate: string;
  status: 'VALID' | 'EXPIRED' | 'REVIEW_NEEDED';
}

export interface SyncResult {
  success: boolean;
  totalFetched: number;
  created: number;
  updated: number;
  deepCrawled?: number;
  attachmentsDownloaded?: number;
  syncedAt: string;
}

export interface DeepCrawlResult {
  success: boolean;
  deepCrawled: boolean;
  attachmentsDownloaded: number;
  crawlResult: Record<string, unknown>;
}

export interface AnalyzeAllResult {
  success: boolean;
  analyzed: number;
  errors: number;
  results: { slug: string; fitScore: number; eligibility: string }[];
}

export interface GenerateAppResult {
  success: boolean;
  sections: Record<string, string>;
  review: {
    totalScore: number;
    scores: Record<string, number>;
    feedback: string[];
  };
  consistency: {
    score: number;
    issues: { section: string; description: string; severity: string }[];
    suggestion: string;
  };
}

export const vaultService = {
  /** 볼트 통계 정보 */
  async getVaultStats(): Promise<VaultStats> {
    const { data } = await apiClient.get<VaultStats>('/api/vault/stats');
    return data;
  },

  /** 3개 API → 볼트에 프로그램 동기화 */
  async syncPrograms(deepCrawl?: boolean): Promise<SyncResult> {
    const url = deepCrawl ? '/api/vault/sync?deepCrawl=true' : '/api/vault/sync';
    const { data } = await apiClient.post<SyncResult>(url, {});
    return data;
  },

  /** 단일 프로그램 딥크롤 */
  async deepCrawlProgram(slug: string): Promise<DeepCrawlResult> {
    const { data } = await apiClient.post<DeepCrawlResult>(
      `/api/vault/deep-crawl/${encodeURIComponent(slug)}`,
      {}
    );
    return data;
  },

  /** 전체 프로그램 목록 */
  async getPrograms(): Promise<VaultProgram[]> {
    const { data } = await apiClient.get<{ programs: VaultProgram[]; total: number }>(
      '/api/vault/programs'
    );
    return data.programs;
  },

  /** 프로그램 상세 */
  async getProgram(slug: string): Promise<VaultProgramDetail> {
    const { data } = await apiClient.get<VaultProgramDetail>(
      `/api/vault/program/${encodeURIComponent(slug)}`
    );
    return data;
  },

  /** 단일 프로그램 적합도 분석 */
  async analyzeProgram(slug: string): Promise<FitAnalysisResult> {
    const { data } = await apiClient.post<{ success: boolean; result: FitAnalysisResult }>(
      `/api/vault/analyze/${encodeURIComponent(slug)}`,
      {}
    );
    return data.result;
  },

  /** 전체 프로그램 일괄 분석 */
  async analyzeAll(): Promise<AnalyzeAllResult> {
    const { data } = await apiClient.post<AnalyzeAllResult>('/api/vault/analyze-all', {});
    return data;
  },

  /** SSE: 동기화 + 실시간 진행률 */
  syncProgramsWithProgress(
    deepCrawl: boolean,
    onProgress: (event: SSEProgressEvent) => void
  ): { promise: Promise<SyncResult>; abort: () => void } {
    const url = deepCrawl ? '/api/vault/sync?deepCrawl=true' : '/api/vault/sync';
    let resolvePromise: (value: SyncResult) => void;
    let rejectPromise: (reason: Error) => void;

    const promise = new Promise<SyncResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const controller = connectSSE(url, {
      onProgress,
      onComplete: (data) => resolvePromise!(data as unknown as SyncResult),
      onError: (error) => rejectPromise!(new Error(error)),
    });

    return {
      promise,
      abort: () => controller.abort(),
    };
  },

  /** SSE: 일괄 분석 + 실시간 진행률 */
  analyzeAllWithProgress(
    onProgress: (event: SSEProgressEvent) => void
  ): { promise: Promise<AnalyzeAllResult>; abort: () => void } {
    let resolvePromise: (value: AnalyzeAllResult) => void;
    let rejectPromise: (reason: Error) => void;

    const promise = new Promise<AnalyzeAllResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const controller = connectSSE('/api/vault/analyze-all', {
      onProgress,
      onComplete: (data) => resolvePromise!(data as unknown as AnalyzeAllResult),
      onError: (error) => rejectPromise!(new Error(error)),
    });

    return {
      promise,
      abort: () => controller.abort(),
    };
  },

  /** PDF 다운로드 + AI 분석 */
  async downloadPdf(slug: string): Promise<Record<string, unknown>> {
    const { data } = await apiClient.post<Record<string, unknown>>(
      `/api/vault/download-pdf/${encodeURIComponent(slug)}`,
      {}
    );
    return data;
  },

  /** 지원서 자동 생성 */
  async generateApp(slug: string): Promise<GenerateAppResult> {
    const { data } = await apiClient.post<GenerateAppResult>(
      `/api/vault/generate-app/${encodeURIComponent(slug)}`,
      {}
    );
    return data;
  },

  /** 생성된 지원서 목록 */
  async getApplications(): Promise<VaultApplication[]> {
    const { data } = await apiClient.get<{ applications: VaultApplication[]; total: number }>(
      '/api/vault/applications'
    );
    return data.applications;
  },

  /** 지원서 상세 */
  async getApplication(slug: string): Promise<VaultApplicationDetail> {
    const { data } = await apiClient.get<VaultApplicationDetail>(
      `/api/vault/application/${encodeURIComponent(slug)}`
    );
    return data;
  },

  /** 지원서 편집 저장 */
  async updateApplication(
    slug: string,
    sections: Record<string, string>
  ): Promise<{ success: boolean; updatedAt: string }> {
    const { data } = await apiClient.put<{ success: boolean; updatedAt: string }>(
      `/api/vault/application/${encodeURIComponent(slug)}`,
      { sections }
    );
    return data;
  },

  /** 기업 정보 저장 */
  async saveCompany(companyData: Record<string, unknown>): Promise<{ success: boolean }> {
    const { data } = await apiClient.put<{ success: boolean }>(
      '/api/vault/company',
      companyData
    );
    return data;
  },

  /** 기업 정보 읽기 */
  async getCompany(): Promise<{ company: Record<string, unknown> | null; content: string }> {
    const { data } = await apiClient.get<{
      company: Record<string, unknown> | null;
      content: string;
    }>('/api/vault/company');
    return data;
  },

  /** 기업 서류 업로드 */
  async uploadCompanyDocument(
    name: string,
    fileName: string,
    fileData: string
  ): Promise<VaultDocumentMeta> {
    const { data } = await apiClient.post<{ success: boolean; document: VaultDocumentMeta }>(
      '/api/vault/company/documents',
      { name, fileName, fileData }
    );
    return data.document;
  },

  /** 기업 서류 목록 조회 */
  async getCompanyDocuments(): Promise<VaultDocumentMeta[]> {
    const { data } = await apiClient.get<{ documents: VaultDocumentMeta[] }>(
      '/api/vault/company/documents'
    );
    return data.documents;
  },

  /** 기업 서류 삭제 */
  async deleteCompanyDocument(docId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<{ success: boolean }>(
      `/api/vault/company/documents/${docId}`
    );
    return data;
  },

  /** 기업명 AI 딥리서치 */
  async researchCompany(companyName: string): Promise<{ success: boolean; company: Record<string, unknown> }> {
    const { data } = await apiClient.post<{ success: boolean; company: Record<string, unknown> }>(
      '/api/vault/company/research',
      { companyName }
    );
    return data;
  },
};

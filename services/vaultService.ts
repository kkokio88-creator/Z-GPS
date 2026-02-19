/**
 * Vault API 클라이언트
 * 서버의 /api/vault/* 엔드포인트와 통신
 */

import { apiClient } from './apiClient';
import { connectSSE, SSEProgressEvent } from './sseClient';
import type { SectionSchema, ApplicationSectionSchema, BenefitRecord, BenefitAnalysisResult, BenefitSummary, TaxScanResult, NpsLookupResult, TaxCalculationWorksheet } from '../types';

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
  // 세부 정보 필드
  requiredDocuments?: string[];
  fullDescription?: string;
  targetAudience?: string;
  department?: string;
  supportScale?: string;
  evaluationCriteria?: string[];
  contactPhone?: string;
  contactEmail?: string;
  applicationUrl?: string;
  // 적합도 분석 확장 필드
  dimensions?: FitDimensions;
  keyActions?: string[];
  eligibilityCriteria?: string[];
  exclusionCriteria?: string[];
}

export interface VaultProgramDetail {
  frontmatter: VaultProgram;
  content: string;
}

export interface FitDimensions {
  eligibilityMatch: number;
  industryRelevance: number;
  scaleFit: number;
  competitiveness: number;
  strategicAlignment: number;
}

export interface EligibilityDetails {
  met: string[];
  unmet: string[];
  unclear: string[];
}

export interface FitAnalysisResult {
  fitScore: number;
  eligibility: string;
  dimensions: FitDimensions;
  eligibilityDetails: EligibilityDetails;
  strengths: string[];
  weaknesses: string[];
  advice: string;
  recommendedStrategy: string;
  keyActions: string[];
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
  preScreenPassed?: number;
  preScreenRejected?: number;
  phase2Crawled?: number;
  phase3Enriched?: number;
  phase4Analyzed?: number;
  phase4Strategies?: number;
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

export interface BatchGenerateResult {
  success: boolean;
  total: number;
  generated: number;
  failed: number;
  processed?: number;
  skipped?: number;
  results: { slug: string; programName: string; success: boolean; error?: string }[];
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

  /** 3개 API → 볼트에 프로그램 동기화 (3단계 파이프라인) */
  async syncPrograms(options?: { forceReanalyze?: boolean }): Promise<SyncResult> {
    const { data } = await apiClient.post<SyncResult>('/api/vault/sync', {
      forceReanalyze: options?.forceReanalyze ?? false,
    });
    return data;
  },

  /** Vault 동기화 상태 조회 */
  async getSyncStatus(): Promise<{
    lastSyncedAt: string;
    programCount: number;
    applicationCount: number;
    companyExists: boolean;
  }> {
    const { data } = await apiClient.post<{
      lastSyncedAt: string;
      programCount: number;
      applicationCount: number;
      companyExists: boolean;
    }>('/api/vault/sync-status', {});
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

  /** SSE: 동기화 + 실시간 진행률 (3단계 파이프라인) */
  syncProgramsWithProgress(
    onProgress: (event: SSEProgressEvent) => void,
    options?: { forceReanalyze?: boolean }
  ): { promise: Promise<SyncResult>; abort: () => void } {
    let resolvePromise: (value: SyncResult) => void;
    let rejectPromise: (reason: Error) => void;

    const promise = new Promise<SyncResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const controller = connectSSE('/api/vault/sync', {
      onProgress,
      onComplete: (data) => resolvePromise!(data as unknown as SyncResult),
      onError: (error) => rejectPromise!(new Error(error)),
    }, { forceReanalyze: options?.forceReanalyze ?? false });

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

  /** 일괄 지원서 생성 (SSE 진행률) */
  generateAppsBatchWithProgress(
    onProgress: (event: SSEProgressEvent) => void,
    minFitScore?: number,
    maxCount?: number
  ): { promise: Promise<BatchGenerateResult>; abort: () => void } {
    let resolvePromise: (value: BatchGenerateResult) => void;
    let rejectPromise: (reason: Error) => void;

    const promise = new Promise<BatchGenerateResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const controller = connectSSE('/api/vault/generate-apps-batch', {
      onProgress,
      onComplete: (data) => resolvePromise!(data as unknown as BatchGenerateResult),
      onError: (error) => rejectPromise!(new Error(error)),
    }, { minFitScore: minFitScore ?? 70, maxCount: maxCount ?? 3 });

    return {
      promise,
      abort: () => controller.abort(),
    };
  },

  /** 일괄 지원서 생성 (비SSE) */
  async generateAppsBatch(minFitScore?: number): Promise<BatchGenerateResult> {
    const { data } = await apiClient.post<BatchGenerateResult>(
      '/api/vault/generate-apps-batch',
      { minFitScore: minFitScore ?? 70 }
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

  /** 지원서 섹션 목록 조회 */
  async getApplicationSections(
    slug: string
  ): Promise<{ sections: { sectionId: string; title: string; status: string; updatedAt: string }[] }> {
    const { data } = await apiClient.get<{
      sections: { sectionId: string; title: string; status: string; updatedAt: string }[];
    }>(`/api/vault/application/${encodeURIComponent(slug)}/sections`);
    return data;
  },

  /** 지원서 단일 섹션 조회 */
  async getApplicationSection(
    slug: string,
    sectionId: string
  ): Promise<{ frontmatter: Record<string, unknown>; content: string }> {
    const { data } = await apiClient.get<{ frontmatter: Record<string, unknown>; content: string }>(
      `/api/vault/application/${encodeURIComponent(slug)}/sections/${encodeURIComponent(sectionId)}`
    );
    return data;
  },

  /** 지원서 단일 섹션 수정 */
  async updateApplicationSection(
    slug: string,
    sectionId: string,
    content: string
  ): Promise<{ success: boolean; updatedAt: string }> {
    const { data } = await apiClient.put<{ success: boolean; updatedAt: string }>(
      `/api/vault/application/${encodeURIComponent(slug)}/sections/${encodeURIComponent(sectionId)}`,
      { content }
    );
    return data;
  },

  /** 지원서 섹션 피드백 전송 */
  async sendSectionFeedback(
    slug: string,
    sectionId: string,
    feedback: string,
    action: 'revise' | 'approve'
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<{ success: boolean }>(
      `/api/vault/application/${encodeURIComponent(slug)}/feedback`,
      { sectionId, feedback, action }
    );
    return data;
  },

  /** Gap #4 fix: 피드백 전송 + 섹션 데이터 재조회 (SSE 대신 수동 refetch) */
  async sendFeedbackAndRefetch(
    slug: string,
    sectionId: string,
    feedback: string,
    action: 'revise' | 'approve'
  ): Promise<{ success: boolean; updatedSection: { frontmatter: Record<string, unknown>; content: string } | null }> {
    const result = await this.sendSectionFeedback(slug, sectionId, feedback, action);
    if (!result.success) return { success: false, updatedSection: null };
    try {
      const section = await this.getApplicationSection(slug, sectionId);
      return { success: true, updatedSection: section };
    } catch {
      return { success: true, updatedSection: null };
    }
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

  /** 전략 문서 조회 */
  async getStrategy(slug: string): Promise<{ frontmatter: Record<string, unknown>; content: string } | null> {
    try {
      const { data } = await apiClient.get<{ frontmatter: Record<string, unknown>; content: string }>(
        `/api/vault/strategy/${encodeURIComponent(slug)}`
      );
      return data;
    } catch {
      return null;
    }
  },

  /** 수동 전략 문서 생성 */
  async generateStrategy(slug: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<{ success: boolean }>(
      `/api/vault/generate-strategy/${encodeURIComponent(slug)}`,
      {}
    );
    return data;
  },

  /** 공고별 동적 섹션 스키마 분석 */
  async analyzeSections(slug: string): Promise<{ sections: SectionSchema[]; source: 'ai_analyzed' | 'default_fallback' }> {
    const { data } = await apiClient.post<{ sections: SectionSchema[]; source: 'ai_analyzed' | 'default_fallback' }>(
      `/api/vault/analyze-sections/${encodeURIComponent(slug)}`,
      {}
    );
    return data;
  },

  /** 프로그램 첨부파일 목록 */
  async getAttachments(slug: string): Promise<{ name: string; path: string; analyzed: boolean; downloadUrl: string }[]> {
    try {
      const { data } = await apiClient.get<{ attachments: { name: string; path: string; analyzed: boolean; downloadUrl: string }[] }>(
        `/api/vault/program/${encodeURIComponent(slug)}/attachments`
      );
      return data.attachments;
    } catch {
      return [];
    }
  },

  /** 기업명 AI 딥리서치 */
  async researchCompany(companyName: string): Promise<{ success: boolean; company: Record<string, unknown> }> {
    const { data } = await apiClient.post<{ success: boolean; company: Record<string, unknown> }>(
      '/api/vault/company/research',
      { companyName }
    );
    return data;
  },

  // ===== Runtime Config =====

  /** 런타임 설정 저장 (API 키 등) */
  async saveConfig(config: Record<string, unknown>): Promise<{ success: boolean }> {
    const { data } = await apiClient.put<{ success: boolean }>('/api/vault/config', config);
    return data;
  },

  /** 런타임 설정 읽기 */
  async getConfig(): Promise<Record<string, unknown>> {
    const { data } = await apiClient.get<{ config: Record<string, unknown> }>('/api/vault/config');
    return data.config;
  },

  /** 설정 복원 (마스킹 없이 원본 반환) */
  async restoreConfig(): Promise<Record<string, unknown>> {
    const { data } = await apiClient.get<{ config: Record<string, unknown> }>('/api/vault/config?restore=true');
    return data.config;
  },

  // ===== Benefit Tracking =====

  /** 수령 이력 전체 목록 */
  async getBenefits(): Promise<BenefitRecord[]> {
    const { data } = await apiClient.get<{ benefits: BenefitRecord[] }>('/api/vault/benefits');
    return data.benefits;
  },

  /** 수령 이력 단일 조회 */
  async getBenefit(id: string): Promise<BenefitRecord> {
    const { data } = await apiClient.get<{ benefit: BenefitRecord }>(`/api/vault/benefits/${encodeURIComponent(id)}`);
    return data.benefit;
  },

  /** 수령 이력 등록 */
  async createBenefit(input: Omit<BenefitRecord, 'id' | 'registeredAt'>): Promise<BenefitRecord> {
    const { data } = await apiClient.post<{ success: boolean; benefit: BenefitRecord }>('/api/vault/benefits', input);
    return data.benefit;
  },

  /** 수령 이력 수정 */
  async updateBenefit(id: string, updates: Partial<BenefitRecord>): Promise<BenefitRecord> {
    const { data } = await apiClient.put<{ success: boolean; benefit: BenefitRecord }>(
      `/api/vault/benefits/${encodeURIComponent(id)}`,
      updates
    );
    return data.benefit;
  },

  /** 수령 이력 삭제 */
  async deleteBenefit(id: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<{ success: boolean }>(`/api/vault/benefits/${encodeURIComponent(id)}`);
    return data;
  },

  /** 수령 이력 통계 요약 */
  async getBenefitSummary(): Promise<BenefitSummary> {
    const { data } = await apiClient.get<{ summary: BenefitSummary }>('/api/vault/benefits/summary');
    return data.summary;
  },

  /** 단일 환급 분석 (AI) */
  async analyzeBenefit(id: string): Promise<BenefitAnalysisResult> {
    const { data } = await apiClient.post<{ success: boolean; analysis: BenefitAnalysisResult }>(
      `/api/vault/benefits/${encodeURIComponent(id)}/analyze`,
      {}
    );
    return data.analysis;
  },

  /** 저장된 분석 결과 조회 */
  async getBenefitAnalysis(id: string): Promise<BenefitAnalysisResult | null> {
    try {
      const { data } = await apiClient.get<{ analysis: BenefitAnalysisResult }>(
        `/api/vault/benefits/${encodeURIComponent(id)}/analysis`
      );
      return data.analysis;
    } catch {
      return null;
    }
  },

  /** 전체 일괄 환급 분석 */
  async analyzeAllBenefits(): Promise<{ analyzed: number; results: BenefitAnalysisResult[] }> {
    const { data } = await apiClient.post<{ analyzed: number; results: BenefitAnalysisResult[] }>(
      '/api/vault/benefits/analyze-all',
      {}
    );
    return data;
  },

  // ===== Tax Refund Scan =====

  /** 세금 환급 AI 스캔 실행 */
  async runTaxScan(): Promise<TaxScanResult> {
    const { data } = await apiClient.post<{ success: boolean; scan: TaxScanResult }>(
      '/api/vault/benefits/tax-scan',
      {}
    );
    return data.scan;
  },

  /** 최근 세금 환급 스캔 결과 조회 */
  async getLatestTaxScan(): Promise<TaxScanResult | null> {
    const { data } = await apiClient.get<{ scan: TaxScanResult | null }>(
      '/api/vault/benefits/tax-scan/latest'
    );
    return data.scan;
  },

  /** 국민연금 사업장 데이터 조회 */
  async npsLookup(): Promise<NpsLookupResult> {
    const { data } = await apiClient.get<{ npsData: NpsLookupResult }>('/api/vault/company/nps-lookup');
    return data.npsData;
  },

  /** 기회 상태 업데이트 */
  async updateOpportunityStatus(
    scanId: string,
    oppId: string,
    status: string
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.patch<{ success: boolean }>(
      `/api/vault/benefits/tax-scan/${encodeURIComponent(scanId)}/opportunities/${encodeURIComponent(oppId)}`,
      { status }
    );
    return data;
  },

  /** 계산서 생성 */
  async generateWorksheet(
    scanId: string,
    oppId: string
  ): Promise<TaxCalculationWorksheet> {
    const { data } = await apiClient.post<{ success: boolean; worksheet: TaxCalculationWorksheet; status: string }>(
      `/api/vault/benefits/tax-scan/${encodeURIComponent(scanId)}/opportunities/${encodeURIComponent(oppId)}/worksheet`,
      {}
    );
    return data.worksheet;
  },

  /** 계산서 사용자 수정 값 업데이트 + 재계산 */
  async updateWorksheetOverrides(
    scanId: string,
    oppId: string,
    overrides: Record<string, number | string>
  ): Promise<{ worksheet: TaxCalculationWorksheet }> {
    const { data } = await apiClient.patch<{ success: boolean; worksheet: TaxCalculationWorksheet }>(
      `/api/vault/benefits/tax-scan/${encodeURIComponent(scanId)}/opportunities/${encodeURIComponent(oppId)}`,
      { userOverrides: overrides }
    );
    return { worksheet: data.worksheet };
  },
};

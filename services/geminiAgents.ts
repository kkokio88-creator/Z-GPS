import { Company, SupportProgram, EligibilityStatus, StructureAgentResponse, ReviewResult, ConsistencyCheckResult, AuditDefenseResult, CompanySearchResult, DeepResearchResult } from "../types";
import { getContextForDrafting } from "./ontologyService";
import { getStoredAiModel } from "./storageService";
import { apiClient } from "./apiClient";

export type ReviewPersona = 'GENERAL' | 'TECHNICAL' | 'VC' | 'COMPLIANCE';

// --- Helper: HTTP-based Gemini call ---

interface GeminiResponse {
  text: string;
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data: string } }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
    };
  }>;
}

const callGemini = async (
  model: string,
  contents: string | unknown,
  config?: Record<string, unknown>
): Promise<GeminiResponse> => {
  try {
    const { data } = await apiClient.post<GeminiResponse>('/api/gemini/generate', {
      model,
      contents,
      config,
    });
    return data;
  } catch (error: unknown) {
    // 서버 에러 응답에서 상세 메시지 추출
    const axiosError = error as { response?: { data?: { error?: string }; status?: number }; message?: string };
    const serverMessage = axiosError?.response?.data?.error;
    const status = axiosError?.response?.status;
    if (serverMessage) {
      throw new Error(`${status || 'ERROR'}: ${serverMessage}`);
    }
    throw error;
  }
};

// Connection verification via backend
export const verifyGeminiConnection = async (apiKey: string): Promise<{ success: boolean; message: string; modelUsed?: string }> => {
    if (!apiKey || apiKey.trim().length < 10) {
        return { success: false, message: "API Key 형식이 올바르지 않습니다." };
    }

    try {
        const { data } = await apiClient.post<{ success: boolean; message: string; modelUsed?: string }>(
          '/api/gemini/verify',
          { apiKey: apiKey.trim() }
        );
        return data;
    } catch {
        return { success: false, message: "서버 연결에 실패했습니다. 네트워크 상태를 확인하세요." };
    }
};

const cleanAndParseJSON = (text: string): Record<string, unknown> | unknown[] => {
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        try {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
                return JSON.parse(match[1]);
            }
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                return JSON.parse(text.substring(start, end + 1));
            }
        } catch {
            if (import.meta.env.DEV) console.error("JSON Parse Failed for text:", text.substring(0, 100) + "...");
            return {};
        }
    }
    return {};
};

const handleGeminiError = (error: unknown, context: string = ""): string => {
    const errStr = String(error);
    if (import.meta.env.DEV) console.error(`Gemini API Error (${context}):`, error);
    if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
        return "API 사용량이 소진되었습니다. 잠시 후 다시 시도하거나 API Key를 확인하세요.";
    }
    if (errStr.includes("API key not valid") || errStr.includes("Invalid API key") || errStr.includes("403")) {
        return "API Key가 유효하지 않습니다. 설정에서 키를 확인해주세요.";
    }
    if (errStr.includes("not configured") || errStr.includes("GEMINI_API_KEY")) {
        return "서버에 Gemini API Key가 설정되지 않았습니다. 서버 환경변수를 확인하세요.";
    }
    if (errStr.includes("500")) {
        // 서버에서 보낸 상세 메시지가 있으면 표시
        const detailMatch = errStr.match(/500:\s*(.+)/);
        return detailMatch?.[1] || "서버 오류가 발생했습니다. 서버 로그를 확인하세요.";
    }
    if (errStr.includes("400")) {
        const detailMatch = errStr.match(/400:\s*(.+)/);
        return detailMatch?.[1] || "잘못된 요청입니다.";
    }
    return `AI 처리 중 오류: ${errStr.length > 200 ? errStr.substring(0, 200) + '...' : errStr}`;
};

class BaseAgent {
  protected get modelName() {
      return getStoredAiModel();
  }

  protected async callGemini(contents: string | unknown, config?: Record<string, unknown>): Promise<GeminiResponse> {
    return callGemini(this.modelName, contents, config);
  }
}

// --- V2.0 System Diagnosis Agent (Self-Healing) ---
export class SystemDiagnosisAgent {
    async diagnoseSystem(): Promise<{ status: 'HEALTHY' | 'WARNING' | 'CRITICAL', log: string[], actionsTaken: string[] }> {
        const log: string[] = [];
        const actionsTaken: string[] = [];
        let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

        // 1. Check Network/Internet
        if (!navigator.onLine) {
            log.push("오프라인 상태 감지");
            status = 'CRITICAL';
        } else {
            log.push("네트워크 연결 정상");
        }

        // 2. Local Storage Integrity Check
        try {
            const companyData = localStorage.getItem('zmis_company_v2');
            const authSession = localStorage.getItem('zmis_auth_session');

            if (companyData) {
                const parsedComp = JSON.parse(companyData);
                log.push(`기업 데이터 무결성 정상 (${parsedComp.name})`);

                if (authSession) {
                    const session = JSON.parse(authSession);
                    if (session.userId && !parsedComp.businessNumber.replace(/-/g,'').includes(session.userId)) {
                        log.push("세션 ID와 기업 데이터 불일치 감지");
                        status = 'WARNING';
                    }
                }
            } else {
                log.push("저장된 기업 데이터 없음");
            }
        } catch {
            log.push("데이터 손상 감지 (JSON Error)");
            status = 'CRITICAL';
            actionsTaken.push("손상된 데이터 초기화 권장");
        }

        // 3. Backend API Health Check
        if (navigator.onLine) {
            try {
                const { data } = await apiClient.get<{ status: string }>('/api/health');
                if (data.status === 'ok') {
                    log.push("백엔드 API 서버 정상");
                } else {
                    log.push("백엔드 API 서버 이상");
                    status = 'WARNING';
                }
            } catch {
                log.push("백엔드 API 서버 연결 실패");
                status = 'CRITICAL';
            }
        }

        return { status, log, actionsTaken };
    }
}

export class CompanyStructuringAgent extends BaseAgent {
  async structure(rawText: string, currentProfile: Company): Promise<StructureAgentResponse> {
    const prompt = `Analyze company description: "${rawText}". Extract structure. Output JSON.`;
    try {
      const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
      const result = cleanAndParseJSON(response.text || "{}") as Record<string, unknown>;
      return { company: { ...currentProfile, ...result, description: rawText }, inferredStrengths: (result.inferredStrengths as string[]) || [] };
    } catch { return { company: currentProfile, inferredStrengths: [] }; }
  }
}
export class ProgramAnalysisAgent extends BaseAgent {
  async analyzeRequirements(program: SupportProgram, company: Company): Promise<{ requiredDocuments: string[]; advice: string }> {
    const prompt = `Analyze Grant: "${program.programName}". Company: "${company.name}". Output JSON: { "documents": [], "advice": "" }`;
    try {
      const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
      const json = cleanAndParseJSON(response.text || "{}") as Record<string, unknown>;
      return { requiredDocuments: (json.documents as string[]) || [], advice: (json.advice as string) || "" };
    } catch { return { requiredDocuments: [], advice: "Error" }; }
  }
}
export class SuitabilityAssessmentAgent extends BaseAgent {
  async evaluate(company: Company, program: SupportProgram): Promise<Partial<SupportProgram>> {
    const prompt = `Evaluate compatibility. Company: ${company.name}. Program: ${program.programName}. Output JSON.`;
    try {
       const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
       const r = cleanAndParseJSON(response.text || "{}") as Record<string, unknown>;
       return {
           fitScore: (r.fitScore as number) || 0,
           expectedGrant: (r.expectedGrant as number) || 0,
           eligibility: r.eligibility === 'POSSIBLE' ? EligibilityStatus.POSSIBLE : (r.eligibility === 'IMPOSSIBLE' ? EligibilityStatus.IMPOSSIBLE : EligibilityStatus.REVIEW_NEEDED),
           eligibilityReason: (r.eligibilityReason as string) || "",
           successProbability: r.successProbability as string
        };
    } catch { return { fitScore: 0, eligibilityReason: "Error" }; }
  }
  async analyzeGap(company: Company, program: SupportProgram): Promise<{ gaps: string[], strengths: string[], advice: string }> {
      const prompt = `
        Act as a Government Grant Strategist.

        Target Program: ${program.programName}
        Organizer: ${program.organizer}
        Description: ${program.description}

        Applicant Company: ${company.name}
        Industry: ${company.industry}
        Desc: ${company.description}

        Task: Perform a Gap Analysis.
        1. Identify 3 key strengths of the company relevant to this specific program.
        2. Identify 3 potential gaps or risks that might cause disqualification.
        3. Provide concrete advice on how to write the application to overcome these gaps.

        Output JSON: { "gaps": [], "strengths": [], "advice": "" }
      `;

      try {
          const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
          return cleanAndParseJSON(response.text || "{}") as { gaps: string[]; strengths: string[]; advice: string };
      } catch (e) { return { gaps: [], strengths: [], advice: handleGeminiError(e, "Gap Analysis") }; }
  }
}
export class DraftWritingAgent extends BaseAgent {
  async writeSection(company: Company, program: SupportProgram, sectionTitle: string, useSearch: boolean = false, referenceContext: string = ""): Promise<{text: string, sources?: unknown[]}> {
    const ontologyContext = getContextForDrafting();
    const config: Record<string, unknown> = {};
    if (useSearch) config.tools = [{ googleSearch: {} }];

    const companyDetails = [
      `기업명: ${company.name}`,
      `업종: ${company.industry}`,
      `매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}`,
      `직원수: ${company.employees || 0}명`,
      company.address ? `소재지: ${company.address}` : '',
      company.description ? `사업 설명: ${company.description}` : '',
      company.coreCompetencies?.length ? `핵심역량: ${company.coreCompetencies.join(', ')}` : '',
      company.certifications?.length ? `보유 인증: ${company.certifications.join(', ')}` : '',
      company.history ? `기업 연혁: ${company.history.substring(0, 300)}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `
        Role: Professional Government Grant Writer (Korean).
        Task: Write the "${sectionTitle}" section for the grant application: "${program.programName}".

        ## 지원 기업 정보
        ${companyDetails}

        ## 지원사업 정보
        사업명: ${program.programName}
        주관기관: ${program.organizer}
        지원금: ${program.expectedGrant ? (program.expectedGrant / 100000000).toFixed(1) + '억원' : '미공개'}
        지원유형: ${program.supportType}
        ${program.description ? `사업설명: ${program.description.substring(0, 500)}` : ''}

        ## Reference Materials & Strategy
        ${referenceContext}
        ${ontologyContext}

        Requirements:
        - Language: Korean (Formal, Professional, '합니다' style).
        - Tone: Persuasive, Data-driven, Confident.
        - Length: Comprehensive (approx 500-800 characters).
        - Structure: Use bullet points where appropriate for readability.
        - IMPORTANT: 기업의 실제 정보(업종, 매출, 핵심역량, 인증 등)를 적극 반영하여 구체적이고 설득력 있게 작성하세요.

        Output only the text content for the section.
    `;

    try {
      const response = await this.callGemini(prompt, config);
      return { text: response.text || "AI 작성에 실패했습니다.", sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
    } catch (e) {
        return { text: handleGeminiError(e, "Draft Writing") };
    }
  }
}
export class ScheduleAgent extends BaseAgent {
    async generateGanttData(scheduleText: string): Promise<Record<string, unknown>> {
        const prompt = `Extract Gantt tasks from text. Output JSON: { "tasks": [{ "id", "name", "startMonth", "durationMonths", "owner" }] }`;
        try {
            const response = await this.callGemini(prompt + "\n" + scheduleText, { responseMimeType: "application/json" });
            return cleanAndParseJSON(response.text || "{}") as Record<string, unknown>;
        } catch { return { tasks: [] }; }
    }
}
export class PositioningAgent extends BaseAgent {
    async generateMatrix(industry: string): Promise<Record<string, unknown> | null> {
        const prompt = `Positioning Matrix for ${industry}. JSON output.`;
        try {
            const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
            return cleanAndParseJSON(response.text || "{}") as Record<string, unknown>;
        } catch { return null; }
    }
}
export class SupervisorAgent extends BaseAgent { async syncDeadlines(_p: unknown) { return []; } }
export class ConsultantAgent extends BaseAgent {
    createChatSession(_company: Company, _program: SupportProgram) {
        // Chat sessions require direct SDK access - not supported via HTTP proxy
        // Return null to indicate unavailability
        return null;
    }
}

export class ReviewAgent extends BaseAgent {
    async reviewApplication(_company: Company, _program: SupportProgram, _draftSections: unknown, persona: ReviewPersona): Promise<ReviewResult> {
        const prompt = `Review application as persona ${persona}. JSON output.`;
        try {
             const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
             return cleanAndParseJSON(response.text || "{}") as unknown as ReviewResult;
        } catch { return { totalScore: 0, scores: {} as ReviewResult['scores'], feedback: [] }; }
    }

    async askReviewer(persona: ReviewPersona, reviewContext: ReviewResult, question: string): Promise<string> {
        const prompt = `
            You are acting as a strict Government Grant Reviewer with the persona: ${persona}.
            You have just reviewed an application and gave these scores/feedback: ${JSON.stringify(reviewContext)}.

            The applicant asks: "${question}"

            Answer in Korean, explaining your reasoning based on the scores you gave.
            Be professional but stay in character (e.g., VC focuses on profit, Tech on innovation).
            Keep it under 3 sentences.
        `;

        try {
            const response = await this.callGemini(prompt);
            return response.text || "답변을 생성할 수 없습니다.";
        } catch {
            return "오류가 발생했습니다.";
        }
    }
}

export class OntologyLearningAgent extends BaseAgent {
    async extractSuccessPatterns(_text: string): Promise<string[]> { return []; }
}
export class DraftRefinementAgent extends BaseAgent {
    async refine(text: string, instruction: string): Promise<string> {
        try {
            const response = await this.callGemini(`다음 텍스트를 지시사항에 따라 수정하세요.\n\n텍스트:\n${text}\n\n지시사항: ${instruction}\n\n수정된 텍스트만 출력하세요.`);
            return response.text || text;
        } catch (e) {
            if (import.meta.env.DEV) console.error('Magic Edit Error:', e);
            return `[수정 실패] ${handleGeminiError(e, 'Magic Edit')}\n\n${text}`;
        }
    }
}
export class ProgramParserAgent extends BaseAgent {
    async parseAnnouncement(text: string): Promise<Record<string, unknown>> {
        const prompt = `
            Parse the following government grant announcement text into structured JSON.

            Text: ${text.substring(0, 15000)}...

            Output JSON with keys:
            - programName (string)
            - organizer (string)
            - supportType (string: R&D, Marketing, Export, etc.)
            - officialEndDate (YYYY-MM-DD)
            - expectedGrant (number, approximate)
            - requiredDocuments (array of strings)
            - description (summary)
        `;
        try {
            const response = await this.callGemini(prompt, {responseMimeType:"application/json"});
            return cleanAndParseJSON(response.text||"{}") as Record<string, unknown>;
        } catch (e) {
            if (import.meta.env.DEV) console.error("ProgramParserAgent Error:", e);
            return {};
        }
    }
}
export class DocumentAnalysisAgent extends BaseAgent {
    async analyzeDocument(b64: string): Promise<Record<string, unknown>> { const r = await this.callGemini({parts:[{inlineData:{mimeType:'image/jpeg', data:b64}}, {text:"Analyze"}]}, {responseMimeType:"application/json"}); return cleanAndParseJSON(r.text||"{}") as Record<string, unknown>; }
    async extractFinancials(b64: string): Promise<unknown[]> { const r = await callGemini('gemini-2.0-flash', {parts:[{inlineData:{mimeType:'image/jpeg', data:b64}}, {text:"Extract financials table. JSON"}]}, {responseMimeType:"application/json"}); const parsed = cleanAndParseJSON(r.text||"[]"); return Array.isArray(parsed) ? parsed : []; }
    async extractPatent(b64: string): Promise<Record<string, unknown>> { const r = await callGemini('gemini-2.0-flash', {parts:[{inlineData:{mimeType:'image/jpeg', data:b64}}, {text:"Extract patent. JSON"}]}, {responseMimeType:"application/json"}); return cleanAndParseJSON(r.text||"{}") as Record<string, unknown>; }
}
export class VoiceDictationAgent extends BaseAgent {
    async dictateAndRefine(b64: string): Promise<string> { const r = await callGemini('gemini-2.0-flash', {parts:[{inlineData:{mimeType:'audio/webm', data:b64}}, {text:"Transcribe"}]}); return r.text || ""; }
}
export class PresentationAgent extends BaseAgent {
    async generateSlides(n: string, _d: unknown): Promise<string> { const r = await this.callGemini(`Slides for ${n}. Markdown.`); return r.text || ""; }
}
export class BudgetAgent extends BaseAgent {
    async planBudget(g: number, _t: string): Promise<Record<string, unknown>> { const r = await this.callGemini(`Budget ${g}. JSON`, {responseMimeType:"application/json"}); return cleanAndParseJSON(r.text||"{}") as Record<string, unknown>; }
}
export class InterviewAgent extends BaseAgent {
    async generateQuestions(_t: string): Promise<string[]> { const r = await this.callGemini(`Interview Qs. JSON`, {responseMimeType:"application/json"}); const parsed = cleanAndParseJSON(r.text||"[]"); return Array.isArray(parsed) ? parsed as string[] : []; }
    async evaluateAnswer(q: string, a: string): Promise<string> { const r = await this.callGemini(`Eval answer. Q:${q} A:${a}`); return r.text || ""; }
}
export class CompetitorAnalysisAgent extends BaseAgent {
    async analyze(_c: unknown): Promise<Record<string, unknown>> { const r = await this.callGemini(`Competitors. JSON`, {responseMimeType:"application/json", tools:[{googleSearch:{}}]}); return cleanAndParseJSON(r.text||"{}") as Record<string, unknown>; }
}
export class TranslationAgent extends BaseAgent {
    async translateToBusinessEnglish(t: string): Promise<string> { const r = await this.callGemini(`Translate: ${t}`); return r.text || ""; }
}
export class SpeechSynthesisAgent extends BaseAgent {
    async speak(t: string): Promise<string|null> {
        const r = await callGemini('gemini-2.0-flash-tts', {parts:[{text:t}]}, {
            responseModalities:['audio'],
            speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}}
        });
        return r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    }
}
export class FinancialConsultantAgent extends BaseAgent { async analyze(_f:unknown): Promise<string> { return "Demo"; } }
export class IPEvaluationAgent extends BaseAgent { async evaluate(_i:unknown, _ind:string): Promise<string> { return "Demo"; } }
export class TrendAnalysisAgent extends BaseAgent { async analyzeTrends(_i:string): Promise<unknown[]> { return []; } }
export class DocumentClassifierAgent extends BaseAgent { async classifyAndAnalyze(_n:string, _b:string): Promise<Record<string, unknown>> { return {}; } }
export class MarketIntelligenceAgent extends BaseAgent { async research(_q:string, _i:string): Promise<Record<string, unknown>> { return {}; } }
export class SummaryAgent extends BaseAgent { async generateOnePager(_d:unknown): Promise<string> { const r = await this.callGemini(`Summary`); return r.text || ""; } }
export class DocumentQAAgent extends BaseAgent { async ask(_d:unknown, _q:string): Promise<string> { return "Demo"; } }
export class PitchCoachAgent extends BaseAgent { async analyzePitch(_t:string): Promise<Record<string, unknown>> { return {}; } }
export class FileParserAgent extends BaseAgent { async parseAndMap(_c:string, _s:unknown): Promise<Record<string, unknown>> { const r = await this.callGemini(`Map sections. JSON`, {responseMimeType:"application/json"}); return cleanAndParseJSON(r.text||"{}") as Record<string, unknown>; } }
export class VocAnalysisAgent extends BaseAgent { async analyzeReviews(_t:string): Promise<Record<string, unknown>> { return {}; } }
export class ImageGenerationAgent extends BaseAgent { async generateConceptImage(_p:string): Promise<string|null> { return null; } }
export class LabNoteAgent extends BaseAgent { async refineLog(l:string): Promise<string> { return l; } }
export class ProductVisionAgent extends BaseAgent { async analyzeCompetitorImage(_b:string): Promise<Record<string, unknown>> { return {}; } }
export class HaccpAgent extends BaseAgent { async auditFacility(_b:string, _c:string): Promise<string> { return "Demo"; } }

// --- Company Research Agent (기업 검색 + 딥 리서치) ---

export class CompanyResearchAgent extends BaseAgent {
    async searchByName(companyName: string): Promise<CompanySearchResult[]> {
        if (import.meta.env.DEV) {
            console.log("CompanyResearchAgent.searchByName called");
            console.log("   - Model:", this.modelName);
        }

        const prompt = `
당신은 기업 정보 검색 전문가입니다.

검색어: "${companyName}"

이 검색어와 관련된 한국 기업을 웹에서 검색하여 최대 5개까지 찾아주세요.
각 기업에 대해 다음 정보를 수집하세요:
- name: 정확한 기업명 (주식회사 포함)
- industry: 주요 업종
- address: 본사 주소
- description: 간략한 기업 설명 (1-2문장)
- establishedYear: 설립연도 (숫자)
- estimatedRevenue: 추정 매출 규모 (예: "약 100억원", "1조원 이상")
- source: 정보 출처

반드시 JSON 배열 형식으로만 응답하세요. 다른 설명 없이 JSON만 출력하세요.
예시: [{"name": "회사명", "industry": "업종", ...}]
정보가 없는 필드는 생략합니다.
        `;

        try {
            if (import.meta.env.DEV) console.log("Gemini API 호출 시작 (Google Search 그라운딩)...");

            const response = await this.callGemini(prompt, {
                tools: [{ googleSearch: {} }]
            });

            if (import.meta.env.DEV) {
                console.log("Gemini API 응답 수신");
                console.log("   - 응답 텍스트:", response.text?.substring(0, 300));
            }

            const results = cleanAndParseJSON(response.text || "[]");
            return Array.isArray(results) ? results as CompanySearchResult[] : [];
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("CompanyResearchAgent searchByName error:", errorMessage);

            if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
                throw new Error("API 사용량 한도 초과. 잠시 후 다시 시도해주세요.");
            }
            if (errorMessage.includes("403") || errorMessage.includes("API key not valid")) {
                throw new Error("API 키가 유효하지 않습니다. 설정을 확인해주세요.");
            }

            throw new Error(`검색 중 오류 발생: ${errorMessage}`);
        }
    }

    async deepResearch(companyName: string, onProgress?: (stage: string, progress: number) => void): Promise<DeepResearchResult | null> {
        if (import.meta.env.DEV) {
            console.log("CompanyResearchAgent.deepResearch called");
            console.log("   - Company:", companyName);
        }

        onProgress?.("기본 정보 수집 중...", 10);

        const prompt = `
당신은 McKinsey급 기업 분석 전문가이자 정부지원사업 컨설턴트입니다.

기업 "${companyName}"에 대해 웹에서 심층 검색하여 다음 정보를 수집하고 전략적 분석을 수행하세요:

## Part 1: 기본 정보 수집

1. basicInfo (기본 정보):
   - name, representativeName, businessNumber, establishedDate, address, website, employeeCount

2. financialInfo (재무 정보):
   - recentRevenue (숫자, 원 단위), revenueGrowth (예: "+15%")
   - financials: 최근 3년 데이터 [{year, revenue, operatingProfit, netIncome}]

3. businessInfo (사업 정보):
   - industry, mainProducts (배열), businessDescription (상세하게 300자)

4. certifications: 보유 인증 배열

5. ipList: [{id, title, type, status, date}]

6. marketPosition:
   - competitors (경쟁사), marketShare, uniqueSellingPoints (차별점)

7. history: 주요 연혁

8. coreCompetencies: 핵심 역량 3-5개

## Part 2: 심층 전략 분석

9. strategicAnalysis:
   - swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] }
   - competitiveAdvantage, growthPotential, riskFactors

10. industryInsights:
    - marketTrends, industryOutlook, regulatoryEnvironment, technologyTrends

11. governmentFundingFit:
    - recommendedPrograms, eligibilityStrengths, potentialChallenges, applicationTips

12. executiveSummary: 경영진을 위한 핵심 요약 (500자)

13. sources: [{title, uri}]

반드시 JSON 형식으로만 응답하세요.
        `;

        try {
            onProgress?.("웹 검색 및 데이터 수집 중...", 30);

            if (import.meta.env.DEV) console.log("Gemini API 딥 리서치 호출...");

            const response = await this.callGemini(prompt, {
                tools: [{ googleSearch: {} }]
            });

            onProgress?.("데이터 분석 및 정리 중...", 70);

            if (import.meta.env.DEV) {
                console.log("Gemini API 딥 리서치 응답 수신");
                console.log("   - 응답 길이:", response.text?.length);
            }

            const result = cleanAndParseJSON(response.text || "{}") as Record<string, unknown>;

            // 검색 결과의 grounding metadata에서 출처 추출
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const additionalSources = groundingChunks
                .filter((chunk) => chunk.web)
                .map((chunk) => ({
                    title: chunk.web?.title || "출처",
                    uri: chunk.web?.uri || ""
                }));

            onProgress?.("리서치 완료!", 100);

            return {
                basicInfo: (result.basicInfo as DeepResearchResult['basicInfo']) || { name: companyName },
                financialInfo: (result.financialInfo as DeepResearchResult['financialInfo']) || {},
                businessInfo: (result.businessInfo as DeepResearchResult['businessInfo']) || { industry: "", mainProducts: [], businessDescription: "" },
                certifications: (result.certifications as string[]) || [],
                ipList: (result.ipList as DeepResearchResult['ipList']) || [],
                marketPosition: (result.marketPosition as DeepResearchResult['marketPosition']) || { competitors: [], uniqueSellingPoints: [] },
                history: (result.history as string) || "",
                coreCompetencies: (result.coreCompetencies as string[]) || [],
                strategicAnalysis: result.strategicAnalysis as DeepResearchResult['strategicAnalysis'] || undefined,
                industryInsights: result.industryInsights as DeepResearchResult['industryInsights'] || undefined,
                governmentFundingFit: result.governmentFundingFit as DeepResearchResult['governmentFundingFit'] || undefined,
                executiveSummary: result.executiveSummary as string || undefined,
                sources: [...((result.sources as { title: string; uri: string }[]) || []), ...additionalSources],
                researchedAt: new Date().toISOString()
            };
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("CompanyResearchAgent deepResearch error:", errorMessage);

            if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
                throw new Error("API 사용량 한도 초과. 잠시 후 다시 시도해주세요.");
            }
            if (errorMessage.includes("403") || errorMessage.includes("API key not valid")) {
                throw new Error("API 키가 유효하지 않습니다. 설정을 확인해주세요.");
            }

            throw new Error(`딥 리서치 중 오류 발생: ${errorMessage}`);
        }
    }
}

// --- V1.4 New Agents ---

export class ConsistencyAgent extends BaseAgent {
    async checkConsistency(draftSections: {[key:string]: string}): Promise<ConsistencyCheckResult> {
        const fullText = Object.entries(draftSections).map(([k, v]) => `[${k}] ${v}`).join("\n\n");
        const prompt = `
            Act as a strict Logic Auditor for a government grant proposal.
            Analyze the following text sections for logical inconsistencies, contradictions, and data mismatches.

            Check for:
            1. Budget numbers vs. described scale.
            2. Schedule vs. technical difficulty.
            3. Goals (Section 2) vs. Outcomes (Section 6).
            4. Timelines mentioned in different sections.

            Content:
            ${fullText.substring(0, 20000)}

            Output JSON:
            {
                "score": 0-100 (100 is perfect),
                "issues": [{ "section": "Section Name", "description": "What is wrong", "severity": "HIGH"|"MEDIUM"|"LOW" }],
                "suggestion": "Overall advice to fix logic"
            }
        `;

        try {
            const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
            return cleanAndParseJSON(response.text || "{}") as unknown as ConsistencyCheckResult;
        } catch (e) {
            return { score: 0, issues: [], suggestion: handleGeminiError(e, "Consistency Check") };
        }
    }
}

export class DueDiligenceAgent extends BaseAgent {
    async generateDefenseStrategy(company: Company, draftSections: {[key:string]: string}): Promise<AuditDefenseResult> {
        const context = `Company: ${JSON.stringify(company)}\nDraft: ${JSON.stringify(draftSections).substring(0, 15000)}`;
        const prompt = `
            Role: Government Field Auditor (Very critical).
            Task: Review the applicant info and create 3 "Killer Questions" that aim to disqualify them based on weaknesses (Financial, Tech level, Marketability).
            Then, act as a Consultant and provide the best "Defense Strategy" and "Sample Answer".

            Context: ${context}

            Output JSON:
            {
                "questions": [
                    {
                        "question": "The hard question",
                        "intent": "Why asking this (Hidden motive)",
                        "defenseStrategy": "How to defend (Logic)",
                        "sampleAnswer": "What to say (Script)"
                    }
                ]
            }
        `;

        try {
            const response = await this.callGemini(prompt, { responseMimeType: "application/json" });
            return cleanAndParseJSON(response.text || "{}") as unknown as AuditDefenseResult;
        } catch {
            return { questions: [] };
        }
    }
}

// NEW EXPORTS V1.4 & V2.0
export const diagnosisAgent = new SystemDiagnosisAgent();
export const consistencyAgent = new ConsistencyAgent();
export const dueDiligenceAgent = new DueDiligenceAgent();

// Re-export all instances
export const structuringAgent = new CompanyStructuringAgent();
export const analysisAgent = new ProgramAnalysisAgent();
export const suitabilityAgent = new SuitabilityAssessmentAgent();
export const draftAgent = new DraftWritingAgent();
export const scheduleAgent = new ScheduleAgent();
export const positioningAgent = new PositioningAgent();
export const supervisorAgent = new SupervisorAgent();
export const consultantAgent = new ConsultantAgent();
export const reviewAgent = new ReviewAgent();
export const ontologyLearningAgent = new OntologyLearningAgent();
export const refinementAgent = new DraftRefinementAgent();
export const programParserAgent = new ProgramParserAgent();
export const documentAnalysisAgent = new DocumentAnalysisAgent();
export const voiceDictationAgent = new VoiceDictationAgent();
export const presentationAgent = new PresentationAgent();
export const budgetAgent = new BudgetAgent();
export const interviewAgent = new InterviewAgent();
export const competitorAgent = new CompetitorAnalysisAgent();
export const translationAgent = new TranslationAgent();
export const speechAgent = new SpeechSynthesisAgent();
export const financialAgent = new FinancialConsultantAgent();
export const ipAgent = new IPEvaluationAgent();
export const trendAgent = new TrendAnalysisAgent();
export const documentClassifierAgent = new DocumentClassifierAgent();
export const marketAgent = new MarketIntelligenceAgent();
export const summaryAgent = new SummaryAgent();
export const documentQAAgent = new DocumentQAAgent();
export const pitchCoachAgent = new PitchCoachAgent();
export const fileParserAgent = new FileParserAgent();
export const vocAgent = new VocAnalysisAgent();
export const imageGenAgent = new ImageGenerationAgent();
export const labNoteAgent = new LabNoteAgent();
export const productVisionAgent = new ProductVisionAgent();
export const haccpAgent = new HaccpAgent();
export const companyResearchAgent = new CompanyResearchAgent();

// --- Strategy Analysis Agent (공고별 맞춤 전략 분석) ---
export interface StrategyAnalysis {
  summary: string;
  fitAnalysis: {
    strengths: string[];
    gaps: string[];
    fitScore: number;
  };
  strategy: {
    positioning: string;
    keyMessages: string[];
    differentiation: string;
  };
  actionPlan: {
    immediate: string[];
    shortTerm: string[];
    documents: string[];
  };
  riskFactors: string[];
  successTips: string[];
}

class StrategyAnalysisAgent extends BaseAgent {
  async analyze(company: Company, program: SupportProgram): Promise<StrategyAnalysis> {
    try {
      const prompt = `당신은 정부 지원사업 전문 컨설턴트입니다. 아래 기업 정보와 지원사업 정보를 분석하여 맞춤 전략을 제시해주세요.

## 기업 정보
- 기업명: ${company.name}
- 업종: ${company.industry}
- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}
- 직원수: ${company.employees}명
- 소재지: ${company.address}
- 핵심역량: ${company.coreCompetencies?.join(', ') || '미등록'}
- 보유 인증: ${company.certifications?.join(', ') || '없음'}

## 지원사업 정보
- 사업명: ${program.programName}
- 주관기관: ${program.organizer}
- 지원유형: ${program.supportType}
- 지원금: ${(program.expectedGrant / 100000000).toFixed(1)}억원
- 마감일: ${program.officialEndDate}
- 사업설명: ${program.description || '없음'}

## 요청사항
위 정보를 바탕으로 JSON 형식으로 전략 분석을 제공해주세요:
{
  "summary": "한줄 전략 요약 (50자 이내)",
  "fitAnalysis": {
    "strengths": ["강점1", "강점2", "강점3"],
    "gaps": ["보완점1", "보완점2"],
    "fitScore": 75
  },
  "strategy": {
    "positioning": "어떤 포지션으로 접근해야 하는지",
    "keyMessages": ["핵심 어필 포인트 3개"],
    "differentiation": "경쟁사 대비 차별화 전략"
  },
  "actionPlan": {
    "immediate": ["즉시 해야 할 일 2-3개"],
    "shortTerm": ["1-2주 내 준비사항 2-3개"],
    "documents": ["필요 서류 목록"]
  },
  "riskFactors": ["리스크 요인 2-3개"],
  "successTips": ["성공 팁 2-3개"]
}`;

      const response = await this.callGemini(prompt);

      const text = response.text || '';
      const parsed = cleanAndParseJSON(text) as Record<string, unknown>;

      if (parsed && parsed.summary) {
        return parsed as unknown as StrategyAnalysis;
      }

      return this.getDefaultStrategy(company, program);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Strategy analysis error:', e);
      return this.getDefaultStrategy(company, program);
    }
  }

  private getDefaultStrategy(company: Company, program: SupportProgram): StrategyAnalysis {
    const isHighFit = company.industry?.includes(program.supportType) ||
                      program.supportType === '정부지원';

    return {
      summary: `${company.industry || '해당'} 분야 기업으로 ${program.supportType} 사업에 적합`,
      fitAnalysis: {
        strengths: [
          `${company.industry || '제조업'} 분야 전문성 보유`,
          company.employees > 10 ? '안정적 조직 규모' : '민첩한 조직 구조',
          company.certifications?.length ? '관련 인증 보유' : '성장 잠재력 보유'
        ],
        gaps: [
          '지원사업 수행 경험 확인 필요',
          '세부 자격요건 충족 여부 검토 필요'
        ],
        fitScore: isHighFit ? 78 : 65
      },
      strategy: {
        positioning: `${company.industry || '업종'} 전문기업으로서 기술력과 사업화 역량 강조`,
        keyMessages: [
          '명확한 사업 목표와 실현 가능한 계획',
          '보유 기술/역량의 차별성',
          '예상 성과 및 파급효과'
        ],
        differentiation: '기존 사업 실적과 연계한 구체적 성과 제시'
      },
      actionPlan: {
        immediate: [
          '공고문 세부 자격요건 확인',
          '기업 현황 자료 최신화'
        ],
        shortTerm: [
          '사업계획서 초안 작성',
          '필수 제출서류 준비',
          '재무제표 및 증빙서류 확보'
        ],
        documents: [
          '사업자등록증',
          '최근 3년 재무제표',
          '사업계획서',
          '회사소개서'
        ]
      },
      riskFactors: [
        '경쟁률에 따른 선정 불확실성',
        '서류 준비 기간 부족 가능성'
      ],
      successTips: [
        '평가 기준에 맞춘 사업계획서 작성',
        '차별화된 기술력/사업성 강조',
        '정량적 성과 목표 제시'
      ]
    };
  }
}

export const strategyAgent = new StrategyAnalysisAgent();

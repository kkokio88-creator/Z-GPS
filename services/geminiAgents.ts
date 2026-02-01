import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Company, SupportProgram, EligibilityStatus, StructureAgentResponse, FinancialData, IntellectualProperty, IndustryTrend, VaultDocument, ResearchReport, ReviewResult, ConsistencyCheckResult, AuditDefenseResult } from "../types";
import { getContextForDrafting } from "./ontologyService";
import { syncDeadlinesToCalendar } from "./calendarService";
import { getStoredApiKey, getStoredAiModel } from "./storageService";

export type ReviewPersona = 'GENERAL' | 'TECHNICAL' | 'VC' | 'COMPLIANCE';

// --- Helper Functions ---

const getAI = () => {
    // V1.7 Fix: Strictly prioritize Stored Key
    const storedKey = getStoredApiKey();
    const envKey = process.env.API_KEY || '';
    const key = storedKey || envKey;
    
    if (!key) {
        console.warn("Gemini API Key is missing. Using Demo Mode.");
    }
    return new GoogleGenAI({ apiKey: key });
};

// New: Robust Verification with Fallback & Diagnostics
export const verifyGeminiConnection = async (apiKey: string): Promise<{ success: boolean; message: string; modelUsed?: string }> => {
    if (!apiKey || apiKey.trim().length < 10) {
        return { success: false, message: "API Key 형식이 올바르지 않습니다." };
    }

    const cleanKey = apiKey.trim();
    const ai = new GoogleGenAI({ apiKey: cleanKey });
    
    // List of models to try in order (Resilience Strategy)
    const modelsToTry = ['gemini-3-flash-preview', 'gemini-2.5-flash-preview'];

    for (const model of modelsToTry) {
        try {
            console.log(`Testing connection with ${model}...`);
            await ai.models.generateContent({
                model: model,
                contents: 'ping',
            });
            // If successful
            return { success: true, message: "연동 성공", modelUsed: model };
        } catch (e: any) {
            console.warn(`Model ${model} failed:`, e);
            // If it's an authentication error, don't try other models, fail immediately
            if (String(e).includes("403") || String(e).includes("API key not valid")) {
                return { success: false, message: "API Key가 유효하지 않습니다 (403 Forbidden)." };
            }
            // If it's a quota issue, fail immediately
            if (String(e).includes("429")) {
                return { success: false, message: "API 사용량 한도를 초과했습니다 (429 Quota Exceeded)." };
            }
            // For other errors (timeouts, 500s), continue loop to next model
        }
    }

    return { success: false, message: "모든 모델 연결에 실패했습니다. 네트워크 상태를 확인하세요." };
};

const cleanAndParseJSON = (text: string): any => {
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (e) {
        try {
            // Remove Markdown code blocks
            const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
                return JSON.parse(match[1]);
            }
            // Find first { and last }
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                return JSON.parse(text.substring(start, end + 1));
            }
        } catch (e2) {
            console.error("JSON Parse Failed for text:", text.substring(0, 100) + "...");
            return {};
        }
    }
    return {};
};

const handleGeminiError = (error: any, context: string = ""): string => {
    const errStr = String(error);
    console.error(`Gemini API Error (${context}):`, error);
    if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
        return "⚠️ 무료 사용량이 소진되었습니다. 잠시 후 다시 시도하거나 API Key를 확인하세요.";
    }
    if (errStr.includes("API key not valid")) {
        return "⚠️ API Key가 유효하지 않습니다. 설정에서 키를 확인해주세요.";
    }
    return "AI 분석 중 오류가 발생했습니다.";
};

class BaseAgent {
  protected get modelName() {
      return getStoredAiModel();
  }
  
  protected checkApiKey() {
    const storedKey = getStoredApiKey();
    const envKey = process.env.API_KEY || '';
    return !!(storedKey || envKey);
  }

  protected get ai() {
      return getAI();
  }
}

// --- V2.0 System Diagnosis Agent (Self-Healing) ---
export class SystemDiagnosisAgent {
    async diagnoseSystem(): Promise<{ status: 'HEALTHY' | 'WARNING' | 'CRITICAL', log: string[], actionsTaken: string[] }> {
        const log: string[] = [];
        const actionsTaken: string[] = [];
        let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

        // 1. Check API Key Format
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            log.push("❌ Gemini API Key 미설정");
            status = 'WARNING';
        } else if (apiKey.includes(" ")) {
            log.push("⚠️ API Key에 공백 발견");
            actionsTaken.push("키 공백 감지 (수정 필요)");
            status = 'WARNING';
        } else {
            log.push("✅ API Key 형식 정상");
        }

        // 2. Check Network/Internet
        if (!navigator.onLine) {
            log.push("❌ 오프라인 상태 감지");
            status = 'CRITICAL';
        } else {
            log.push("✅ 네트워크 연결 정상");
        }

        // 3. Local Storage Integrity Check
        try {
            const companyData = localStorage.getItem('zmis_company_v2');
            const authSession = localStorage.getItem('zmis_auth_session');
            
            if (companyData) {
                const parsedComp = JSON.parse(companyData);
                log.push(`✅ 기업 데이터 무결성 정상 (${parsedComp.name})`);
                
                if (authSession) {
                    const session = JSON.parse(authSession);
                    if (session.userId && !parsedComp.businessNumber.replace(/-/g,'').includes(session.userId)) {
                        log.push("⚠️ 세션 ID와 기업 데이터 불일치 감지");
                        status = 'WARNING';
                    }
                }
            } else {
                log.push("⚠️ 저장된 기업 데이터 없음");
            }
        } catch (e) {
            log.push("❌ 데이터 손상 감지 (JSON Error)");
            status = 'CRITICAL';
            actionsTaken.push("손상된 데이터 초기화 권장");
        }

        // 4. API Connectivity Ping
        if (apiKey && navigator.onLine) {
            const result = await verifyGeminiConnection(apiKey);
            if (result.success) {
                log.push(`✅ AI 모델 응답 정상 (${result.modelUsed})`);
            } else {
                log.push(`❌ AI 모델 연결 실패: ${result.message}`);
                status = 'CRITICAL';
            }
        }

        return { status, log, actionsTaken };
    }
}

// ... [Existing Agents] ...

export class CompanyStructuringAgent extends BaseAgent {
  async structure(rawText: string, currentProfile: Company): Promise<StructureAgentResponse> {
    if (!this.checkApiKey()) return { company: { ...currentProfile, description: rawText }, inferredStrengths: ["데모 모드"] };
    const prompt = `Analyze company description: "${rawText}". Extract structure. Output JSON.`;
    try {
      const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt, config: { responseMimeType: "application/json" } });
      const result = cleanAndParseJSON(response.text || "{}");
      return { company: { ...currentProfile, ...result, description: rawText }, inferredStrengths: result.inferredStrengths || [] };
    } catch (e) { return { company: currentProfile, inferredStrengths: [] }; }
  }
}
export class ProgramAnalysisAgent extends BaseAgent {
  async analyzeRequirements(program: SupportProgram, company: Company): Promise<{ requiredDocuments: string[]; advice: string }> {
    if (!this.checkApiKey()) return { requiredDocuments: [], advice: "API Key required." };
    const prompt = `Analyze Grant: "${program.programName}". Company: "${company.name}". Output JSON: { "documents": [], "advice": "" }`;
    try {
      const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt, config: { responseMimeType: "application/json" } });
      const json = cleanAndParseJSON(response.text || "{}");
      return { requiredDocuments: json.documents || [], advice: json.advice || "" };
    } catch (e) { return { requiredDocuments: [], advice: "Error" }; }
  }
}
export class SuitabilityAssessmentAgent extends BaseAgent {
  async evaluate(company: Company, program: SupportProgram): Promise<Partial<SupportProgram>> {
    if (!this.checkApiKey()) {
        const isFood = program.programName.includes("식품") || program.programName.includes("HACCP");
        const isRandD = program.supportType === "R&D" || program.programName.includes("개발");
        
        const baseScore = isFood ? 85 : 75;
        const fitScore = program.fitScore > 0 ? program.fitScore : Math.min(100, baseScore + Math.floor(Math.random() * 10));
        
        let expectedGrant = program.expectedGrant;
        if (expectedGrant === 0) {
             const grantBase = isRandD ? 100000000 : 50000000;
             expectedGrant = grantBase + (Math.floor(Math.random() * 5) * 10000000);
        }

        return { 
            fitScore: fitScore, 
            expectedGrant: expectedGrant, 
            eligibility: fitScore > 80 ? EligibilityStatus.POSSIBLE : EligibilityStatus.REVIEW_NEEDED, 
            eligibilityReason: isFood ? "식품 제조 업종 적합성 높음 (Demo)" : "업종 연관성 검토 필요 (Demo)", 
            successProbability: fitScore > 85 ? "High" : "Medium" 
        };
    }

    const prompt = `Evaluate compatibility. Company: ${company.name}. Program: ${program.programName}. Output JSON.`;
    try {
       const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt, config: { responseMimeType: "application/json" } });
       const r = cleanAndParseJSON(response.text || "{}");
       return { 
           fitScore: r.fitScore || 0, 
           expectedGrant: r.expectedGrant || 0, 
           eligibility: r.eligibility === 'POSSIBLE' ? EligibilityStatus.POSSIBLE : (r.eligibility === 'IMPOSSIBLE' ? EligibilityStatus.IMPOSSIBLE : EligibilityStatus.REVIEW_NEEDED), 
           eligibilityReason: r.eligibilityReason || "", 
           successProbability: r.successProbability 
        };
    } catch (e) { return { fitScore: 0, eligibilityReason: "Error" }; }
  }
  async analyzeGap(company: Company, program: SupportProgram): Promise<{ gaps: string[], strengths: string[], advice: string }> {
      // V1.7: Improved Prompt for Strategy
      if (!this.checkApiKey()) {
          return { 
              gaps: ["자금 조달 계획 구체성 부족", "해외 인증 서류 미비"], 
              strengths: ["HACCP 인증 보유", "여성기업 가산점"], 
              advice: "데모: 매출 성장세를 강조하고, 고용 창출 효과를 수치화하여 제시하세요." 
          };
      }
      
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
          const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt, config: { responseMimeType: "application/json" } });
          return cleanAndParseJSON(response.text || "{}");
      } catch (e) { return { gaps: [], strengths: [], advice: handleGeminiError(e, "Gap Analysis") }; }
  }
}
export class DraftWritingAgent extends BaseAgent {
  async writeSection(company: Company, program: SupportProgram, sectionTitle: string, useSearch: boolean = false, referenceContext: string = ""): Promise<{text: string, sources?: any[]}> {
    if (!this.checkApiKey()) return { text: `[Demo Draft Mode] API Key를 입력하면 실제 AI가 작성합니다.\n\n섹션: ${sectionTitle}\n기업: ${company.name}` };
    
    const ontologyContext = getContextForDrafting();
    const config: any = {};
    if (useSearch) config.tools = [{ googleSearch: {} }];
    
    const prompt = `
        Role: Professional Government Grant Writer (Korean).
        Task: Write the "${sectionTitle}" section for the grant application: "${program.programName}".
        
        Applicant: "${company.name}" (${company.industry})
        Company Context: ${company.description}
        
        Reference Materials & Strategy:
        ${referenceContext}
        ${ontologyContext}
        
        Requirements:
        - Language: Korean (Formal, Professional, '합니다' style).
        - Tone: Persuasive, Data-driven, Confident.
        - Length: Comprehensive (approx 500-800 characters).
        - Structure: Use bullet points where appropriate for readability.
        
        Output only the text content for the section.
    `;
    
    try {
      const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt, config: config });
      return { text: response.text || "AI 작성에 실패했습니다.", sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
    } catch (e) { 
        return { text: handleGeminiError(e, "Draft Writing") }; 
    }
  }
}
export class ScheduleAgent extends BaseAgent {
    async generateGanttData(scheduleText: string): Promise<any> {
        if (!this.checkApiKey()) return { tasks: [{ id: 't1', name: '자료 조사 (Demo)', startMonth: 1, durationMonths: 1 }] };
        const prompt = `Extract Gantt tasks from text. Output JSON: { "tasks": [{ "id", "name", "startMonth", "durationMonths", "owner" }] }`;
        try {
            const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt + "\n" + scheduleText, config: { responseMimeType: "application/json" } });
            return cleanAndParseJSON(response.text || "{}");
        } catch (e) { return { tasks: [] }; }
    }
}
export class PositioningAgent extends BaseAgent {
    async generateMatrix(industry: string): Promise<any> {
        if (!this.checkApiKey()) return { xAxis: 'X', yAxis: 'Y', competitors: [], myCompany: { name: 'Me', x: 80, y: 80, note: 'Demo' } };
        const prompt = `Positioning Matrix for ${industry}. JSON output.`;
        try {
            const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt, config: { responseMimeType: "application/json" } });
            return cleanAndParseJSON(response.text || "{}");
        } catch (e) { return null; }
    }
}
export class SupervisorAgent extends BaseAgent { async syncDeadlines(p: any) { return []; } }
export class ConsultantAgent extends BaseAgent {
    createChatSession(company: Company, program: SupportProgram) {
        if (!this.checkApiKey()) return null;
        return this.ai.chats.create({ model: this.modelName, config: { systemInstruction: `Consultant for ${program.programName}.` } });
    }
}

export class ReviewAgent extends BaseAgent {
    async reviewApplication(company: Company, program: SupportProgram, draftSections: any, persona: ReviewPersona): Promise<ReviewResult> {
        if (!this.checkApiKey()) return { totalScore: 80, scores: { technology: 80, marketability: 80, originality: 80, capability: 80, socialValue: 80 }, feedback: ["Demo"] };
        const prompt = `Review application as persona ${persona}. JSON output.`;
        try {
             const response = await this.ai.models.generateContent({ model: this.modelName, contents: prompt, config: { responseMimeType: "application/json" } });
             return cleanAndParseJSON(response.text || "{}");
        } catch (e) { return { totalScore: 0, scores: {} as any, feedback: [] }; }
    }

    async askReviewer(persona: ReviewPersona, reviewContext: ReviewResult, question: string): Promise<string> {
        if (!this.checkApiKey()) return `[데모: ${persona}] API Key가 필요합니다. 질문: ${question}`;
        
        const prompt = `
            You are acting as a strict Government Grant Reviewer with the persona: ${persona}.
            You have just reviewed an application and gave these scores/feedback: ${JSON.stringify(reviewContext)}.
            
            The applicant asks: "${question}"
            
            Answer in Korean, explaining your reasoning based on the scores you gave. 
            Be professional but stay in character (e.g., VC focuses on profit, Tech on innovation).
            Keep it under 3 sentences.
        `;

        try {
            const response = await this.ai.models.generateContent({ 
                model: this.modelName, 
                contents: prompt 
            });
            return response.text || "답변을 생성할 수 없습니다.";
        } catch (e) {
            return "오류가 발생했습니다.";
        }
    }
}

export class OntologyLearningAgent extends BaseAgent {
    async extractSuccessPatterns(text: string): Promise<string[]> { if (!this.checkApiKey()) return []; return []; }
}
export class DraftRefinementAgent extends BaseAgent {
    async refine(text: string, instruction: string): Promise<string> { if(!this.checkApiKey()) return text; const response = await this.ai.models.generateContent({ model: this.modelName, contents: `Refine: ${text}. Instruction: ${instruction}` }); return response.text || text; }
}
export class ProgramParserAgent extends BaseAgent {
    async parseAnnouncement(text: string): Promise<any> { 
        if(!this.checkApiKey()) return {}; 
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
            const response = await this.ai.models.generateContent({ 
                model: this.modelName, 
                contents: prompt, 
                config: {responseMimeType:"application/json"} 
            }); 
            return cleanAndParseJSON(response.text||"{}");
        } catch (e) {
            console.error("ProgramParserAgent Error:", e);
            return {};
        }
    }
}
export class DocumentAnalysisAgent extends BaseAgent {
    async analyzeDocument(b64: string): Promise<any> { if(!this.checkApiKey()) return {}; const r = await this.ai.models.generateContent({ model: this.modelName, contents: {parts:[{inlineData:{mimeType:'image/jpeg', data:b64}}, {text:"Analyze"}]}, config: {responseMimeType:"application/json"} }); return cleanAndParseJSON(r.text||"{}"); }
    async extractFinancials(b64: string): Promise<any[]> { if(!this.checkApiKey()) return []; const r = await this.ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: {parts:[{inlineData:{mimeType:'image/jpeg', data:b64}}, {text:"Extract financials table. JSON"}]}, config: {responseMimeType:"application/json"} }); return cleanAndParseJSON(r.text||"[]"); }
    async extractPatent(b64: string): Promise<any> { if(!this.checkApiKey()) return {}; const r = await this.ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: {parts:[{inlineData:{mimeType:'image/jpeg', data:b64}}, {text:"Extract patent. JSON"}]}, config: {responseMimeType:"application/json"} }); return cleanAndParseJSON(r.text||"{}"); }
}
export class VoiceDictationAgent extends BaseAgent {
    async dictateAndRefine(b64: string): Promise<string> { if(!this.checkApiKey()) return "Demo"; const r = await this.ai.models.generateContent({ model: 'gemini-2.5-flash-native-audio-preview-12-2025', contents: {parts:[{inlineData:{mimeType:'audio/webm', data:b64}}, {text:"Transcribe"}]} }); return r.text || ""; }
}
export class PresentationAgent extends BaseAgent {
    async generateSlides(n: string, d: any): Promise<string> { if(!this.checkApiKey()) return "Demo"; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Slides for ${n}. Markdown.` }); return r.text || ""; }
}
export class BudgetAgent extends BaseAgent {
    async planBudget(g: number, t: string): Promise<any> { if(!this.checkApiKey()) return {items:[]}; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Budget ${g} for ${t}. JSON`, config: {responseMimeType:"application/json"} }); return cleanAndParseJSON(r.text||"{}"); }
}
export class InterviewAgent extends BaseAgent {
    async generateQuestions(t: string): Promise<string[]> { if(!this.checkApiKey()) return ["Q1"]; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Interview Qs. JSON`, config: {responseMimeType:"application/json"} }); return cleanAndParseJSON(r.text||"[]"); }
    async evaluateAnswer(q: string, a: string): Promise<string> { if(!this.checkApiKey()) return "Feedback"; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Eval answer. Q:${q} A:${a}` }); return r.text || ""; }
}
export class CompetitorAnalysisAgent extends BaseAgent {
    async analyze(c: any): Promise<any> { if(!this.checkApiKey()) return {competitors:[]}; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Competitors for ${c.name}. JSON`, config: {responseMimeType:"application/json", tools:[{googleSearch:{}}]} }); return cleanAndParseJSON(r.text||"{}"); }
}
export class TranslationAgent extends BaseAgent {
    async translateToBusinessEnglish(t: string): Promise<string> { if(!this.checkApiKey()) return t; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Translate: ${t}` }); return r.text || ""; }
}
export class SpeechSynthesisAgent extends BaseAgent {
    async speak(t: string): Promise<string|null> { if(!this.checkApiKey()) return null; const r = await this.ai.models.generateContent({ model: 'gemini-2.5-flash-preview-tts', contents: {parts:[{text:t}]}, config: {responseModalities:[Modality.AUDIO], speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}}} }); return r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null; }
}
export class FinancialConsultantAgent extends BaseAgent { async analyze(f:any): Promise<string> { return "Demo"; } }
export class IPEvaluationAgent extends BaseAgent { async evaluate(i:any, ind:string): Promise<string> { return "Demo"; } }
export class TrendAnalysisAgent extends BaseAgent { async analyzeTrends(i:string): Promise<any[]> { return []; } }
export class DocumentClassifierAgent extends BaseAgent { async classifyAndAnalyze(n:string, b:string): Promise<any> { return {}; } }
export class MarketIntelligenceAgent extends BaseAgent { async research(q:string, i:string): Promise<any> { return {}; } }
export class SummaryAgent extends BaseAgent { async generateOnePager(d:any): Promise<string> { if(!this.checkApiKey()) return "Demo"; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Summary` }); return r.text || ""; } }
export class DocumentQAAgent extends BaseAgent { async ask(d:any, q:string): Promise<string> { return "Demo"; } }
export class PitchCoachAgent extends BaseAgent { async analyzePitch(t:string): Promise<any> { return {}; } }
export class FileParserAgent extends BaseAgent { async parseAndMap(c:string, s:any): Promise<any> { if(!this.checkApiKey()) return {}; const r = await this.ai.models.generateContent({ model: this.modelName, contents: `Map sections. JSON`, config:{responseMimeType:"application/json"} }); return cleanAndParseJSON(r.text||"{}"); } }
export class VocAnalysisAgent extends BaseAgent { async analyzeReviews(t:string): Promise<any> { return {}; } }
export class ImageGenerationAgent extends BaseAgent { async generateConceptImage(p:string): Promise<string|null> { return null; } }
export class LabNoteAgent extends BaseAgent { async refineLog(l:string): Promise<string> { return l; } }
export class ProductVisionAgent extends BaseAgent { async analyzeCompetitorImage(b:string): Promise<any> { return {}; } }
export class HaccpAgent extends BaseAgent { async auditFacility(b:string, c:string): Promise<string> { return "Demo"; } }

// --- V1.4 New Agents ---

export class ConsistencyAgent extends BaseAgent {
    async checkConsistency(draftSections: {[key:string]: string}): Promise<ConsistencyCheckResult> {
        if (!this.checkApiKey()) {
            return {
                score: 75,
                issues: [{ section: "예산", description: "데모: 예산 총액과 세부 내역의 합계가 일치하지 않습니다.", severity: "HIGH" }],
                suggestion: "예산 섹션의 총 사업비 계산을 다시 확인하세요."
            };
        }

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
            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });
            return cleanAndParseJSON(response.text || "{}");
        } catch (e) {
            return { score: 0, issues: [], suggestion: handleGeminiError(e, "Consistency Check") };
        }
    }
}

export class DueDiligenceAgent extends BaseAgent {
    async generateDefenseStrategy(company: Company, draftSections: {[key:string]: string}): Promise<AuditDefenseResult> {
        if (!this.checkApiKey()) {
            return {
                questions: [{ 
                    question: "데모: 현재 부채비율이 높은데 자부담금 조달 계획은?", 
                    intent: "재무 리스크 확인", 
                    defenseStrategy: "최근 투자 유치 확약서 제시", 
                    sampleAnswer: "네, 지난달 A투자사로부터 1억원의 투자가 확정되어 부채 비율이 개선될 예정입니다." 
                }]
            };
        }

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
            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });
            return cleanAndParseJSON(response.text || "{}");
        } catch (e) {
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
/**
 * AI 분석 서비스
 * 프론트엔드 geminiAgents.ts 프롬프트를 서버에 이식
 */

import { callGeminiDirect, cleanAndParseJSON } from './geminiService.js';
import { extractRegionFromAddress, isRegionMismatch } from './programFetcher.js';
import type { NpsLookupResult } from './employeeDataService.js';

interface CompanyInfo {
  name: string;
  industry?: string;
  description?: string;
  revenue?: number;
  employees?: number;
  address?: string;
  certifications?: string[];
  coreCompetencies?: string[];
  ipList?: string[];
  history?: string;
  foundedYear?: number;
  businessType?: string;
  mainProducts?: string[];
  financialTrend?: string;
}

interface ProgramInfo {
  programName: string;
  organizer: string;
  supportType: string;
  description?: string;
  expectedGrant: number;
  officialEndDate: string;
  eligibilityCriteria?: string[];
  exclusionCriteria?: string[];
  targetAudience?: string;
  evaluationCriteria?: string[];
  requiredDocuments?: string[];
  supportDetails?: string;
  selectionProcess?: string[];
  totalBudget?: string;
  projectPeriod?: string;
  objectives?: string;
  categories?: string[];
  keywords?: string[];
  department?: string;
  regions?: string[];
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

export interface PdfAnalysisResult {
  requirements: string[];
  qualifications: string[];
  budget: string;
  schedule: string;
  keyPoints: string[];
  summary: string;
}

export interface DraftSectionResult {
  text: string;
}

export interface ReviewResult {
  totalScore: number;
  scores: {
    technology: number;
    marketability: number;
    originality: number;
    capability: number;
    socialValue: number;
  };
  feedback: string[];
}

export interface ConsistencyResult {
  score: number;
  issues: { section: string; description: string; severity: 'HIGH' | 'MEDIUM' | 'LOW' }[];
  suggestion: string;
}

// ===== Section Schema Types =====

export interface SectionSchema {
  id: string;
  title: string;
  description: string;
  order: number;
  required: boolean;
  evaluationWeight?: string;
  hints?: string[];
}

const DEFAULT_SECTIONS: SectionSchema[] = [
  { id: 'sec_project_overview', title: '1. 프로젝트 개요', description: '사업의 배경, 필요성 및 기업의 핵심 역량을 기술하세요.', order: 1, required: true },
  { id: 'sec_objectives', title: '2. 사업화 목표', description: '최종 달성하고자 하는 정량적/정성적 목표를 기술하세요.', order: 2, required: true },
  { id: 'sec_market_strategy', title: '3. 시장 분석 및 마케팅 전략', description: '타겟 시장 분석 및 구체적인 판로 개척 방안을 기술하세요.', order: 3, required: true },
  { id: 'sec_product_excellence', title: '4. 기술/제품의 우수성', description: '보유한 레시피, 공정 기술의 차별성을 기술하세요.', order: 4, required: true },
  { id: 'sec_schedule_budget', title: '5. 추진 일정 및 예산', description: '구체적인 사업 추진 일정과 정부지원금 활용 계획을 기술하세요.', order: 5, required: true },
  { id: 'sec_expected_outcomes', title: '6. 기대효과', description: '지역 경제 활성화, 고용 창출 등 파급 효과를 기술하세요.', order: 6, required: true },
];

// ===== AI 사전심사 =====

export interface PreScreenInput {
  id: string;
  programName: string;
  supportType: string;
  targetAudience: string;
  description: string;
}

export interface PreScreenResult {
  id: string;
  pass: boolean;
  reason: string;
}

/** AI 사전심사: 공고 제목+간략 정보만으로 부적합 공고를 배치 제외 */
export async function preScreenPrograms(
  company: CompanyInfo,
  programs: PreScreenInput[]
): Promise<PreScreenResult[]> {
  if (programs.length === 0) return [];

  const companyBlock = [
    `- 기업명: ${company.name}`,
    `- 업종: ${company.industry || '미등록'}`,
    `- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}`,
    `- 직원수: ${company.employees || 0}명`,
    `- 소재지: ${company.address || '미등록'}`,
    `- 핵심역량: ${company.coreCompetencies?.join(', ') || '미등록'}`,
    company.mainProducts?.length ? `- 주력 제품/서비스: ${company.mainProducts.join(', ')}` : '',
    company.businessType ? `- 기업형태: ${company.businessType}` : '',
  ].filter(Boolean).join('\n');

  // 50개씩 배치 분할
  const BATCH_SIZE = 50;
  const allResults: PreScreenResult[] = [];

  for (let batchStart = 0; batchStart < programs.length; batchStart += BATCH_SIZE) {
    const batch = programs.slice(batchStart, batchStart + BATCH_SIZE);

    const programList = batch.map((p, i) => (
      `${i + 1}. [ID: ${p.id}] "${p.programName}" | 유형: ${p.supportType} | 대상: ${p.targetAudience || '없음'} | 설명: ${(p.description || '').substring(0, 200)}`
    )).join('\n');

    const prompt = `당신은 한국 정부 지원사업 적합성 사전심사 전문가입니다.

## 기업 정보
${companyBlock}

## 공고 목록 (${batch.length}건)
${programList}

## 작업
위 기업 정보를 바탕으로 각 공고가 이 기업에 **명백히 부적합**한지 빠르게 판단하세요.

## 판단 기준 (pass: false 조건)
- 업종이 완전히 다른 분야 (예: IT기업인데 농업 전용 지원사업)
- 기업 규모/형태가 명시적으로 제외됨
- 대상이 개인/학생/비영리 등 기업이 아닌 경우
- 지원 유형이 기업과 전혀 무관한 경우

## 판단 기준 (pass: true 조건)
- 조금이라도 관련 가능성이 있으면 통과
- 판단 근거가 불충분하면 통과
- 범용적 중소기업 지원사업은 통과

반드시 아래 JSON 형식만 반환하세요:
[
  { "id": "공고ID", "pass": true/false, "reason": "판단 근거 한 줄" }
]`;

    try {
      const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
      const parsed = cleanAndParseJSON(response.text) as PreScreenResult[];

      if (Array.isArray(parsed)) {
        allResults.push(...parsed);
      } else {
        // 파싱 실패 시 전부 통과 처리
        allResults.push(...batch.map(p => ({ id: p.id, pass: true, reason: '사전심사 파싱 실패' })));
      }
    } catch (e) {
      console.error(`[analysisService] preScreenPrograms batch error:`, e);
      // API 실패 시 전부 통과 처리 (안전 우선)
      allResults.push(...batch.map(p => ({ id: p.id, pass: true, reason: '사전심사 API 오류' })));
    }

    // 배치 간 rate limit 방지
    if (batchStart + BATCH_SIZE < programs.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return allResults;
}

/** 공고별 동적 섹션 스키마 분석 */
export async function analyzeSections(
  programData: {
    programName: string;
    evaluationCriteria?: string[];
    requiredDocuments?: string[];
    objectives?: string[];
    supportDetails?: string[];
    selectionProcess?: string[];
    fullDescription?: string;
    targetAudience?: string;
  },
  pdfAnalysis?: string,
  crawledContent?: string
): Promise<{ sections: SectionSchema[]; source: 'ai_analyzed' | 'default_fallback' }> {
  try {
    const contextParts: string[] = [];

    if (programData.evaluationCriteria?.length) {
      contextParts.push(`평가 기준:\n${programData.evaluationCriteria.map(c => `- ${c}`).join('\n')}`);
    }
    if (programData.requiredDocuments?.length) {
      contextParts.push(`필수 서류:\n${programData.requiredDocuments.map(d => `- ${d}`).join('\n')}`);
    }
    if (programData.objectives?.length) {
      contextParts.push(`사업 목적:\n${programData.objectives.map(o => `- ${o}`).join('\n')}`);
    }
    if (programData.supportDetails?.length) {
      contextParts.push(`지원 내용:\n${programData.supportDetails.map(s => `- ${s}`).join('\n')}`);
    }
    if (programData.selectionProcess?.length) {
      contextParts.push(`선정 절차:\n${programData.selectionProcess.map(s => `- ${s}`).join('\n')}`);
    }
    if (programData.fullDescription) {
      contextParts.push(`사업 설명:\n${programData.fullDescription.substring(0, 2000)}`);
    }
    if (programData.targetAudience) {
      contextParts.push(`지원 대상:\n${programData.targetAudience}`);
    }
    if (pdfAnalysis) {
      contextParts.push(`PDF 분석:\n${pdfAnalysis.substring(0, 2000)}`);
    }
    if (crawledContent) {
      contextParts.push(`상세페이지 내용:\n${crawledContent.substring(0, 2000)}`);
    }

    // 데이터가 너무 적으면 기본 스키마로 폴백
    if (contextParts.length === 0) {
      return { sections: DEFAULT_SECTIONS, source: 'default_fallback' };
    }

    const prompt = `당신은 한국 정부 지원사업 신청서 작성 전문 컨설턴트입니다.

## 사업명
"${programData.programName}"

## 공고 정보
${contextParts.join('\n\n')}

## 작업
위 공고 정보를 분석하여 이 사업의 신청서에 포함되어야 할 작성 섹션(항목) 목록을 도출하세요.

## 규칙
1. 최소 4개, 최대 10개의 섹션을 생성
2. 각 섹션의 id는 "sec_" 접두사 + 영문 snake_case (예: "sec_project_overview")
3. title은 번호 포함 한국어 (예: "1. 사업 개요 및 추진 배경")
4. description은 해당 섹션에서 무엇을 작성해야 하는지 안내
5. 평가 기준에 배점이 있으면 evaluationWeight에 반영 (예: "기술성 30점")
6. hints는 작성 시 유의사항이나 팁 (2-3개)
7. **지원서 양식 파일(PDF)의 실제 입력 항목이 분석 결과에 포함되어 있으면, 그 양식의 섹션 구조를 최우선으로 반영하세요.**
   - 빈 밑줄(___), 작성란, 괄호( ), 표 등은 작성해야 할 항목을 의미합니다.
   - 양식 파일의 항목명을 섹션 title에 그대로 사용하세요.
8. 양식 파일이 없으면 공고에 명시된 작성 항목을 반영
9. 둘 다 없으면 일반적인 정부 지원사업 계획서 구조를 따름

반드시 아래 JSON 형식만 반환하세요:
{
  "sections": [
    {
      "id": "sec_...",
      "title": "1. ...",
      "description": "...",
      "order": 1,
      "required": true,
      "evaluationWeight": "기술성 30점",
      "hints": ["힌트1", "힌트2"]
    }
  ]
}`;

    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as { sections: SectionSchema[] };

    if (!result.sections || !Array.isArray(result.sections) || result.sections.length < 3) {
      return { sections: DEFAULT_SECTIONS, source: 'default_fallback' };
    }

    // id와 order가 올바른지 보정
    const sections = result.sections.map((s, i) => ({
      id: s.id || `sec_section_${i + 1}`,
      title: s.title || `${i + 1}. 섹션 ${i + 1}`,
      description: s.description || '',
      order: s.order || i + 1,
      required: s.required !== false,
      evaluationWeight: s.evaluationWeight,
      hints: Array.isArray(s.hints) ? s.hints : undefined,
    }));

    return { sections, source: 'ai_analyzed' };
  } catch (e) {
    console.error('[analysisService] analyzeSections error:', e);
    return { sections: DEFAULT_SECTIONS, source: 'default_fallback' };
  }
}

/** 섹션별 초안 생성 V2 (공고 요구사항 반영) */
export async function generateDraftSectionV2(
  company: CompanyInfo,
  program: ProgramInfo,
  sectionTitle: string,
  context: string = '',
  options?: {
    evaluationCriteria?: string[];
    hints?: string[];
    evaluationWeight?: string;
    sectionDescription?: string;
  }
): Promise<DraftSectionResult> {
  const evalBlock = options?.evaluationCriteria?.length
    ? `\n\n평가 기준:\n${options.evaluationCriteria.map(c => `- ${c}`).join('\n')}`
    : '';
  const hintBlock = options?.hints?.length
    ? `\n\n작성 힌트:\n${options.hints.map(h => `- ${h}`).join('\n')}`
    : '';
  const weightBlock = options?.evaluationWeight
    ? `\n\n이 섹션의 평가 배점: ${options.evaluationWeight}`
    : '';
  const descBlock = options?.sectionDescription
    ? `\n\n섹션 안내: ${options.sectionDescription}`
    : '';

  const prompt = `Role: Professional Government Grant Writer (Korean).
Task: Write the "${sectionTitle}" section for the grant application: "${program.programName}".

Applicant: "${company.name}" (${company.industry || '미등록'})
Company Context: ${company.description || '없음'}
Core Competencies: ${company.coreCompetencies?.join(', ') || '없음'}
Certifications: ${company.certifications?.join(', ') || '없음'}

Program: ${program.programName}
Organizer: ${program.organizer}
Grant: ${(program.expectedGrant / 100000000).toFixed(1)}억원
Description: ${program.description || '없음'}
${descBlock}${evalBlock}${weightBlock}${hintBlock}

${context ? `Reference Materials: ${context}` : ''}

Requirements:
- Language: Korean (Formal, Professional, '합니다' style)
- Tone: Persuasive, Data-driven, Confident
- Length: 500-800 characters
- Structure: Use bullet points where appropriate
${options?.evaluationWeight ? `- IMPORTANT: This section carries "${options.evaluationWeight}" in evaluation. Emphasize accordingly.` : ''}

Output only the text content for the section.`;

  try {
    const response = await callGeminiDirect(prompt);
    return { text: response.text || 'AI 작성에 실패했습니다.' };
  } catch (e) {
    console.error('[analysisService] generateDraftSectionV2 error:', e);
    return { text: 'AI 작성 중 오류가 발생했습니다.' };
  }
}

/** 적합도 분석 (5개 차원 + 자격요건 상세 매칭) */
export async function analyzeFit(
  company: CompanyInfo,
  program: ProgramInfo,
  attachmentText?: string
): Promise<FitAnalysisResult> {
  // ─── 지역 불일치 사전 체크 (Gemini 호출 전에 걸러냄) ───
  const companyRegion = extractRegionFromAddress(company.address || '');
  if (companyRegion) {
    const regionMismatch = isRegionMismatch(
      program.programName,
      program.regions || [],
      companyRegion
    );
    if (regionMismatch) {
      console.log(`[analysisService] 지역 불일치 → 부적합: ${program.programName} (회사: ${companyRegion})`);
      return {
        fitScore: 5,
        eligibility: '부적합',
        dimensions: {
          eligibilityMatch: 0,
          industryRelevance: 0,
          scaleFit: 0,
          competitiveness: 0,
          strategicAlignment: 0,
        },
        eligibilityDetails: {
          met: [],
          unmet: [`지역 불일치: 회사 소재지(${companyRegion})와 공고 대상 지역이 다릅니다.`],
          unclear: [],
        },
        strengths: [],
        weaknesses: ['지역 요건 미충족'],
        advice: `이 공고는 ${companyRegion} 소재 기업에 적합하지 않습니다.`,
        recommendedStrategy: '',
        keyActions: [],
      };
    }
  }

  // 기업 정보 블록
  const companyBlock = [
    `- 기업명: ${company.name}`,
    `- 업종: ${company.industry || '미등록'}`,
    `- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}`,
    `- 직원수: ${company.employees || 0}명`,
    `- 소재지: ${company.address || '미등록'}`,
    `- 핵심역량: ${company.coreCompetencies?.join(', ') || '미등록'}`,
    `- 보유 인증: ${company.certifications?.join(', ') || '없음'}`,
    `- 기업 설명: ${company.description || '없음'}`,
    company.ipList?.length ? `- 지식재산(IP): ${company.ipList.join(', ')}` : '',
    company.mainProducts?.length ? `- 주력 제품/서비스: ${company.mainProducts.join(', ')}` : '',
    company.foundedYear ? `- 설립연도: ${company.foundedYear}년` : '',
    company.businessType ? `- 기업형태: ${company.businessType}` : '',
    company.history ? `- 사업 이력: ${company.history.substring(0, 300)}` : '',
    company.financialTrend ? `- 매출 추이: ${company.financialTrend}` : '',
  ].filter(Boolean).join('\n');

  // 프로그램 정보 블록
  const programBlock = [
    `- 사업명: ${program.programName}`,
    `- 주관기관: ${program.organizer}${program.department ? ` / ${program.department}` : ''}`,
    `- 지원유형: ${program.supportType}`,
    `- 지원금: ${(program.expectedGrant / 100000000).toFixed(1)}억원`,
    `- 마감일: ${program.officialEndDate}`,
    program.totalBudget ? `- 총 사업예산: ${program.totalBudget}` : '',
    program.projectPeriod ? `- 사업기간: ${program.projectPeriod}` : '',
    program.objectives ? `- 사업목적: ${program.objectives}` : '',
    `- 사업설명: ${program.description || '없음'}`,
    program.supportDetails ? `- 지원내용: ${program.supportDetails}` : '',
    program.targetAudience ? `- 지원대상: ${program.targetAudience}` : '',
    program.categories?.length ? `- 분류: ${program.categories.join(', ')}` : '',
    program.keywords?.length ? `- 키워드: ${program.keywords.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  // 자격요건/제외대상 블록
  const eligibilityBlock = [
    program.eligibilityCriteria?.length
      ? `\n### 자격요건\n${program.eligibilityCriteria.map(c => `- ${c}`).join('\n')}`
      : '',
    program.exclusionCriteria?.length
      ? `\n### 제외대상\n${program.exclusionCriteria.map(c => `- ${c}`).join('\n')}`
      : '',
    program.evaluationCriteria?.length
      ? `\n### 평가기준\n${program.evaluationCriteria.map(c => `- ${c}`).join('\n')}`
      : '',
    program.selectionProcess?.length
      ? `\n### 선정절차\n${program.selectionProcess.map(c => `- ${c}`).join('\n')}`
      : '',
    program.requiredDocuments?.length
      ? `\n### 필수서류\n${program.requiredDocuments.map(c => `- ${c}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  const attachmentBlock = attachmentText
    ? `\n## 공고문 첨부파일 원문 (발췌)\n아래는 공고문에 첨부된 PDF/HWPX 문서에서 추출한 텍스트입니다. 자격요건, 제출서류, 평가기준 등 핵심 정보가 포함되어 있을 수 있습니다.\n${attachmentText}`
    : '';

  const prompt = `당신은 정부 지원사업 전문 컨설턴트입니다. 기업과 지원사업의 적합도를 5개 차원으로 정밀 분석하세요.

## 기업 정보
${companyBlock}

## 지원사업 정보
${programBlock}
${eligibilityBlock}
${attachmentBlock}

## 분석 요청 (5개 차원별 평가)
아래 5개 차원을 각각 0~100으로 평가하되, 근거를 명확히 제시하세요.

1. **자격요건 부합도** (가중치 35%): 자격요건 항목별 충족/미충족/불명확 판단
2. **업종/기술 관련성** (가중치 25%): 사업 목적과 기업 업종/역량 매칭도
3. **규모 적합성** (가중치 15%): 매출, 직원 수, 지원금 규모와 기업 규모 대비
4. **경쟁력/선정가능성** (가중치 15%): 평가기준 대비 기업 강점, 인증/IP 보유
5. **전략적 부합도** (가중치 10%): 기업 성장방향과 사업목적 정렬도

## 종합 점수 산정
fitScore = (자격요건부합도 × 0.35) + (업종기술관련성 × 0.25) + (규모적합성 × 0.15) + (경쟁력 × 0.15) + (전략적부합도 × 0.10)
소수점 반올림하여 정수로 반환하세요.

반드시 아래 JSON 형식만 반환하세요:
{
  "fitScore": 0-100,
  "eligibility": "가능" | "불가" | "검토 필요",
  "dimensions": {
    "eligibilityMatch": 0-100,
    "industryRelevance": 0-100,
    "scaleFit": 0-100,
    "competitiveness": 0-100,
    "strategicAlignment": 0-100
  },
  "eligibilityDetails": {
    "met": ["충족하는 자격요건"],
    "unmet": ["미충족 자격요건"],
    "unclear": ["확인 필요 사항"]
  },
  "strengths": ["강점 3-5개"],
  "weaknesses": ["약점 2-3개"],
  "advice": "전략적 조언 200자",
  "recommendedStrategy": "추천 접근 전략 100자",
  "keyActions": ["즉시 실행할 핵심 액션 3-5개"]
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;
    const dims = (result.dimensions || {}) as Record<string, number>;
    const elig = (result.eligibilityDetails || {}) as Record<string, string[]>;

    return {
      fitScore: (result.fitScore as number) || 0,
      eligibility: (result.eligibility as string) || '검토 필요',
      dimensions: {
        eligibilityMatch: dims.eligibilityMatch || 0,
        industryRelevance: dims.industryRelevance || 0,
        scaleFit: dims.scaleFit || 0,
        competitiveness: dims.competitiveness || 0,
        strategicAlignment: dims.strategicAlignment || 0,
      },
      eligibilityDetails: {
        met: elig.met || [],
        unmet: elig.unmet || [],
        unclear: elig.unclear || [],
      },
      strengths: (result.strengths as string[]) || [],
      weaknesses: (result.weaknesses as string[]) || [],
      advice: (result.advice as string) || '',
      recommendedStrategy: (result.recommendedStrategy as string) || '',
      keyActions: (result.keyActions as string[]) || [],
    };
  } catch (e) {
    console.error('[analysisService] analyzeFit error:', e);
    return {
      fitScore: 0,
      eligibility: '검토 필요',
      dimensions: {
        eligibilityMatch: 0,
        industryRelevance: 0,
        scaleFit: 0,
        competitiveness: 0,
        strategicAlignment: 0,
      },
      eligibilityDetails: { met: [], unmet: [], unclear: [] },
      strengths: [],
      weaknesses: [],
      advice: 'AI 분석 중 오류가 발생했습니다.',
      recommendedStrategy: '',
      keyActions: [],
    };
  }
}

/** PDF 내용 분석 */
export async function analyzePdf(
  base64: string,
  programName: string
): Promise<PdfAnalysisResult> {
  const prompt = `당신은 정부 지원사업 공고문 분석 전문가입니다.

다음은 "${programName}" 지원사업의 공고문 PDF입니다.
내용을 분석하여 JSON으로 출력하세요:
{
  "requirements": ["지원 자격 요건 목록"],
  "qualifications": ["필수 서류 목록"],
  "budget": "지원 예산 및 자부담 비율 설명",
  "schedule": "일정(접수기간, 심사일정 등) 설명",
  "keyPoints": ["핵심 사항 3-5개"],
  "summary": "공고문 요약 300자"
}

PDF 내용(base64): ${base64.substring(0, 30000)}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;

    return {
      requirements: (result.requirements as string[]) || [],
      qualifications: (result.qualifications as string[]) || [],
      budget: (result.budget as string) || '',
      schedule: (result.schedule as string) || '',
      keyPoints: (result.keyPoints as string[]) || [],
      summary: (result.summary as string) || '',
    };
  } catch (e) {
    console.error('[analysisService] analyzePdf error:', e);
    return {
      requirements: [],
      qualifications: [],
      budget: '',
      schedule: '',
      keyPoints: [],
      summary: 'PDF 분석 중 오류가 발생했습니다.',
    };
  }
}

/** 섹션별 초안 생성 */
export async function generateDraftSection(
  company: CompanyInfo,
  program: ProgramInfo,
  sectionTitle: string,
  context: string = ''
): Promise<DraftSectionResult> {
  const prompt = `Role: Professional Government Grant Writer (Korean).
Task: Write the "${sectionTitle}" section for the grant application: "${program.programName}".

Applicant: "${company.name}" (${company.industry || '미등록'})
Company Context: ${company.description || '없음'}
Core Competencies: ${company.coreCompetencies?.join(', ') || '없음'}
Certifications: ${company.certifications?.join(', ') || '없음'}

Program: ${program.programName}
Organizer: ${program.organizer}
Grant: ${(program.expectedGrant / 100000000).toFixed(1)}억원
Description: ${program.description || '없음'}

${context ? `Reference Materials: ${context}` : ''}

Requirements:
- Language: Korean (Formal, Professional, '합니다' style)
- Tone: Persuasive, Data-driven, Confident
- Length: 500-800 characters
- Structure: Use bullet points where appropriate

Output only the text content for the section.`;

  try {
    const response = await callGeminiDirect(prompt);
    return { text: response.text || 'AI 작성에 실패했습니다.' };
  } catch (e) {
    console.error('[analysisService] generateDraftSection error:', e);
    return { text: 'AI 작성 중 오류가 발생했습니다.' };
  }
}

/** 리뷰 점수 + 피드백 */
export async function reviewDraft(
  sections: Record<string, string>
): Promise<ReviewResult> {
  const fullText = Object.entries(sections)
    .map(([k, v]) => `[${k}]\n${v}`)
    .join('\n\n');

  const prompt = `Act as a strict Government Grant Proposal Reviewer.
Review the following grant application draft and score it.

${fullText.substring(0, 20000)}

Output JSON:
{
  "totalScore": 0-100,
  "scores": {
    "technology": 0-100,
    "marketability": 0-100,
    "originality": 0-100,
    "capability": 0-100,
    "socialValue": 0-100
  },
  "feedback": ["피드백 항목 3-5개 (한국어)"]
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;
    const scores = (result.scores || {}) as Record<string, number>;

    return {
      totalScore: (result.totalScore as number) || 0,
      scores: {
        technology: scores.technology || 0,
        marketability: scores.marketability || 0,
        originality: scores.originality || 0,
        capability: scores.capability || 0,
        socialValue: scores.socialValue || 0,
      },
      feedback: (result.feedback as string[]) || [],
    };
  } catch (e) {
    console.error('[analysisService] reviewDraft error:', e);
    return {
      totalScore: 0,
      scores: { technology: 0, marketability: 0, originality: 0, capability: 0, socialValue: 0 },
      feedback: ['리뷰 중 오류가 발생했습니다.'],
    };
  }
}

/** 전략 문서 인터페이스 */
export interface StrategyDocument {
  programOverview: string;
  fitAnalysisDetail: string;
  applicationStrategy: string;
  writingGuide: string;
  documentChecklist: string;
  executionTimeline: string;
  expectedQnA: string;
  risksAndNotes: string;
}

/** fitScore >= 80 공고에 대한 상세 전략 문서 생성 */
export async function generateStrategyDocument(
  company: CompanyInfo,
  program: ProgramInfo,
  fitAnalysis: FitAnalysisResult,
  attachmentText?: string
): Promise<StrategyDocument> {
  const attachmentBlock = attachmentText
    ? `\n## 공고문 첨부파일 원문 (발췌)\n아래는 공고문에 첨부된 PDF/HWPX 문서에서 추출한 텍스트입니다. 자격요건, 평가기준, 제출서류 양식 등의 원문이 포함되어 있습니다. 전략 수립 시 반드시 참고하세요.\n${attachmentText}`
    : '';

  const prompt = `당신은 한국 정부 지원사업 전문 컨설턴트입니다. 아래 기업-지원사업 조합에 대해 실무자가 즉시 활용 가능한 상세 전략 문서를 작성하세요.

## 기업 정보
- 기업명: ${company.name}
- 업종: ${company.industry || '미등록'}
- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}
- 직원수: ${company.employees || 0}명
- 핵심역량: ${company.coreCompetencies?.join(', ') || '없음'}
- 보유 인증: ${company.certifications?.join(', ') || '없음'}
${company.ipList?.length ? `- 지식재산: ${company.ipList.join(', ')}` : ''}
${company.mainProducts?.length ? `- 주력 제품: ${company.mainProducts.join(', ')}` : ''}

## 지원사업 정보
- 사업명: ${program.programName}
- 주관기관: ${program.organizer}${program.department ? ` / ${program.department}` : ''}
- 지원금: ${(program.expectedGrant / 100000000).toFixed(1)}억원
- 마감일: ${program.officialEndDate}
${program.objectives ? `- 사업목적: ${program.objectives}` : ''}
${program.targetAudience ? `- 지원대상: ${program.targetAudience}` : ''}
${program.supportDetails ? `- 지원내용: ${program.supportDetails}` : ''}
${program.eligibilityCriteria?.length ? `- 자격요건: ${program.eligibilityCriteria.join(' / ')}` : ''}
${program.evaluationCriteria?.length ? `- 평가기준: ${program.evaluationCriteria.join(' / ')}` : ''}
${program.requiredDocuments?.length ? `- 필수서류: ${program.requiredDocuments.join(' / ')}` : ''}
${program.selectionProcess?.length ? `- 선정절차: ${program.selectionProcess.join(' → ')}` : ''}

## 적합도 분석 결과
- 종합 점수: ${fitAnalysis.fitScore}/100
- 자격요건 부합도: ${fitAnalysis.dimensions.eligibilityMatch}/100
- 업종/기술 관련성: ${fitAnalysis.dimensions.industryRelevance}/100
- 규모 적합성: ${fitAnalysis.dimensions.scaleFit}/100
- 경쟁력: ${fitAnalysis.dimensions.competitiveness}/100
- 전략적 부합도: ${fitAnalysis.dimensions.strategicAlignment}/100
- 강점: ${fitAnalysis.strengths.join(', ')}
- 약점: ${fitAnalysis.weaknesses.join(', ')}
${attachmentBlock}

## 작성 요청
아래 8개 섹션을 모두 작성하세요. 각 섹션은 구체적이고 실행 가능한 내용이어야 합니다.

반드시 아래 JSON 형식만 반환하세요:
{
  "programOverview": "## 1. 사업 개요 및 핵심 포인트\\n- 이 사업이 무엇인지, 왜 우리에게 적합한지 (300자 이상)",
  "fitAnalysisDetail": "## 2. 적합도 상세 분석\\n- 5개 차원별 구체적 근거와 판단 이유 (400자 이상)",
  "applicationStrategy": "## 3. 신청 전략\\n- 핵심 강조점(평가기준 매핑)\\n- 차별화 전략\\n- 약점 보완 방안 (400자 이상)",
  "writingGuide": "## 4. 사업계획서 작성 가이드\\n- 섹션별 핵심 작성 포인트\\n- 평가위원 관점 체크리스트 (500자 이상)",
  "documentChecklist": "## 5. 필수 준비 서류 체크리스트\\n- 각 서류별 설명 + 준비 팁 (300자 이상)",
  "executionTimeline": "## 6. 실행 일정표\\n- D-day 역산 기반 주단위 일정 (마감일: ${program.officialEndDate})",
  "expectedQnA": "## 7. 예상 질의응답\\n- 발표심사 대비 5-10개 Q&A",
  "risksAndNotes": "## 8. 유의사항 및 리스크\\n- 실패 요인, 주의점, 회피 전략"
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, string>;

    return {
      programOverview: result.programOverview || '',
      fitAnalysisDetail: result.fitAnalysisDetail || '',
      applicationStrategy: result.applicationStrategy || '',
      writingGuide: result.writingGuide || '',
      documentChecklist: result.documentChecklist || '',
      executionTimeline: result.executionTimeline || '',
      expectedQnA: result.expectedQnA || '',
      risksAndNotes: result.risksAndNotes || '',
    };
  } catch (e) {
    console.error('[analysisService] generateStrategyDocument error:', e);
    return {
      programOverview: '전략 문서 생성 중 오류가 발생했습니다.',
      fitAnalysisDetail: '',
      applicationStrategy: '',
      writingGuide: '',
      documentChecklist: '',
      executionTimeline: '',
      expectedQnA: '',
      risksAndNotes: '',
    };
  }
}

// ===== Benefit Tracking AI Analysis =====

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

/** 단일 환급/추가 청구 분석 */
export async function analyzeRefundEligibility(
  company: CompanyInfo,
  benefit: {
    programName: string;
    category: string;
    receivedAmount: number;
    receivedDate: string;
    conditions?: string;
    conditionsMet?: boolean | null;
  }
): Promise<BenefitAnalysisResult> {
  const prompt = `당신은 한국 정부 지원금 환급 및 추가 청구 전문가입니다.

## 기업 정보
- 기업명: ${company.name}
- 업종: ${company.industry || '미등록'}
- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}
- 직원수: ${company.employees || 0}명
- 핵심역량: ${company.coreCompetencies?.join(', ') || '없음'}
- 보유 인증: ${company.certifications?.join(', ') || '없음'}

## 과거 수령 지원금 정보
- 사업명: ${benefit.programName}
- 카테고리: ${benefit.category}
- 수령 금액: ${(benefit.receivedAmount / 10000).toFixed(0)}만원
- 수령일: ${benefit.receivedDate}
${benefit.conditions ? `- 의무 조건: ${benefit.conditions}` : ''}
- 의무이행 여부: ${benefit.conditionsMet === true ? '이행 완료' : benefit.conditionsMet === false ? '미이행' : '확인 안 됨'}

## 분석 요청
아래 항목을 분석하세요:
1. 환급 또는 추가 청구가 가능한지 여부
2. 추정 환급/추가 청구 가능 금액
3. 관련 법적 근거 (법률, 시행령, 지침 등)
4. 필요한 서류 목록
5. 리스크 평가 (LOW/MEDIUM/HIGH)
6. 예상 처리 기간
7. 실무 조언

반드시 아래 JSON 형식만 반환하세요:
{
  "isEligible": true|false,
  "estimatedRefund": 0,
  "riskLevel": "LOW"|"MEDIUM"|"HIGH",
  "legalBasis": ["관련 법적 근거 목록"],
  "requiredDocuments": ["필요 서류 목록"],
  "risks": ["리스크 항목"],
  "timeline": "예상 처리 기간 설명",
  "advice": "실무 조언 300자 이상"
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;

    return {
      benefitId: '',
      isEligible: (result.isEligible as boolean) ?? false,
      estimatedRefund: (result.estimatedRefund as number) || 0,
      riskLevel: (result.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
      legalBasis: (result.legalBasis as string[]) || [],
      requiredDocuments: (result.requiredDocuments as string[]) || [],
      risks: (result.risks as string[]) || [],
      timeline: (result.timeline as string) || '',
      advice: (result.advice as string) || '',
      analyzedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[analysisService] analyzeRefundEligibility error:', e);
    return {
      benefitId: '',
      isEligible: false,
      estimatedRefund: 0,
      riskLevel: 'HIGH',
      legalBasis: [],
      requiredDocuments: [],
      risks: ['AI 분석 중 오류가 발생했습니다.'],
      timeline: '',
      advice: 'AI 분석 중 오류가 발생했습니다. 다시 시도해 주세요.',
      analyzedAt: new Date().toISOString(),
    };
  }
}

/** 전체 포트폴리오 인사이트 */
export async function generateBenefitSummaryInsight(
  company: CompanyInfo,
  benefits: { programName: string; category: string; receivedAmount: number; receivedDate: string }[],
  summary: { totalReceived: number; totalCount: number; byCategory: { category: string; amount: number; count: number }[] }
): Promise<{ insight: string; recommendations: string[] }> {
  const benefitsList = benefits
    .map(b => `- ${b.programName} (${b.category}) : ${(b.receivedAmount / 10000).toFixed(0)}만원 (${b.receivedDate})`)
    .join('\n');

  const categoryBreakdown = summary.byCategory
    .map(c => `- ${c.category}: ${c.count}건, ${(c.amount / 10000).toFixed(0)}만원`)
    .join('\n');

  const prompt = `당신은 정부 지원금 포트폴리오 분석가입니다.

## 기업 정보
- 기업명: ${company.name}
- 업종: ${company.industry || '미등록'}
- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}

## 과거 수령 이력 (총 ${summary.totalCount}건, ${(summary.totalReceived / 10000).toFixed(0)}만원)
${benefitsList}

## 카테고리별 분포
${categoryBreakdown}

## 분석 요청
과거 수령 패턴을 분석하고, 향후 지원금 신청 전략을 제안하세요.
- 수령 패턴의 강점과 약점
- 놓치고 있는 지원금 카테고리
- 향후 추천 신청 전략 3-5개

반드시 아래 JSON 형식만 반환하세요:
{
  "insight": "전체 인사이트 분석 500자 이상",
  "recommendations": ["추천 전략 1", "추천 전략 2", ...]
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;

    return {
      insight: (result.insight as string) || '',
      recommendations: (result.recommendations as string[]) || [],
    };
  } catch (e) {
    console.error('[analysisService] generateBenefitSummaryInsight error:', e);
    return {
      insight: '인사이트 생성 중 오류가 발생했습니다.',
      recommendations: [],
    };
  }
}

// ===== Tax Refund Scan =====

export interface TaxRefundOpportunity {
  id: string;
  taxBenefitName: string;
  taxBenefitCode: string;
  estimatedRefund: number;
  applicableYears: number[];
  difficulty: 'EASY' | 'MODERATE' | 'COMPLEX';
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
  dataSource?: 'NPS_API' | 'COMPANY_PROFILE' | 'ESTIMATED' | 'DART_API';
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
}

interface DartFinancialYear {
  year: number;
  revenue: number;
  operatingProfit: number;
  netIncome: number;
  rndExpense: number;
  personnelExpense: number;
  totalAssets: number;
  totalEquity: number;
}

/** AI 세금 환급 스캔: 놓친 세금 혜택 탐지 */
export async function scanMissedTaxBenefits(
  company: CompanyInfo,
  benefitHistory: { programName: string; category: string; receivedAmount: number; receivedDate: string }[],
  npsData?: NpsLookupResult | null,
  dartFinancials?: DartFinancialYear[],
  researchContent?: string,
  documentsMeta?: string,
  programFitData?: string,
  eiData?: string,
  bizStatusData?: string
): Promise<{ opportunities: TaxRefundOpportunity[]; summary: string; disclaimer: string }> {
  const companyBlock = [
    `- 기업명: ${company.name}`,
    `- 업종: ${company.industry || '미등록'}`,
    `- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}`,
    `- 직원수: ${company.employees || 0}명`,
    `- 소재지: ${company.address || '미등록'}`,
    `- 핵심역량: ${company.coreCompetencies?.join(', ') || '없음'}`,
    `- 보유 인증: ${company.certifications?.join(', ') || '없음'}`,
    company.foundedYear ? `- 설립연도: ${company.foundedYear}년` : '',
    company.businessType ? `- 기업형태: ${company.businessType}` : '',
    company.mainProducts?.length ? `- 주력 제품/서비스: ${company.mainProducts.join(', ')}` : '',
    company.financialTrend ? `- 매출 추이: ${company.financialTrend}` : '',
  ].filter(Boolean).join('\n');

  const historyBlock = benefitHistory.length > 0
    ? benefitHistory.map(b => `- ${b.programName} (${b.category}): ${(b.receivedAmount / 10000).toFixed(0)}만원 (${b.receivedDate})`).join('\n')
    : '과거 수령 이력 없음';

  const currentYear = new Date().getFullYear();

  // DART 재무데이터 블록
  const dartBlock = dartFinancials && dartFinancials.length > 0
    ? `## DART 공시 재무데이터 (${dartFinancials.length}년)
${dartFinancials.map(f => `### ${f.year}년
- 매출액: ${f.revenue.toLocaleString()}원
- 영업이익: ${f.operatingProfit.toLocaleString()}원
- 당기순이익: ${f.netIncome.toLocaleString()}원
- 연구개발비: ${f.rndExpense.toLocaleString()}원
- 인건비(급여): ${f.personnelExpense.toLocaleString()}원
- 자산총계: ${f.totalAssets.toLocaleString()}원
- 자본총계: ${f.totalEquity.toLocaleString()}원`).join('\n\n')}`
    : '';

  // 추가 데이터 블록 구성
  const researchBlock = researchContent
    ? `## AI 기업 딥리서치 데이터
${researchContent.substring(0, 6000)}

위 딥리서치에 포함된 SWOT 분석, 산업 분류, 정부지원 적합성, 매출/투자 정보를
세금 혜택 적용 가능성 판단에 적극 활용하세요.

`
    : '';

  const documentsBlock = documentsMeta
    ? `## 보유 문서 현황
${documentsMeta}

`
    : '';

  const programFitBlock = programFitData
    ? `## 과거 지원사업 적합도 분석 이력
${programFitData}

적합도 분석에서 확인된 기업 강점, 보유 인증, 업종 매칭 정보를
세금 혜택 자격 판단에 교차 검증 자료로 활용하세요.

`
    : '';

  const prompt = `당신은 한국 중소기업 세무 전문가입니다. 아래 기업 정보와 과거 수령 이력을 분석하여, 이 기업이 놓치고 있을 가능성이 있는 세금 혜택(세액공제/감면/경정청구)을 스캔하세요.

## 기업 정보
${companyBlock}

## 과거 지원금 수령 이력
${historyBlock}

${dartBlock ? dartBlock + '\n\n' : ''}${researchBlock}${documentsBlock}${programFitBlock}${eiData ? `## 고용/산재보험 데이터 (근로복지공단 API)\n${eiData}\n\n고용보험 가입자수는 NPS(국민연금)보다 넓은 범위(1인 이상)입니다.\nNPS와 교차 검증하여 실제 직원수를 보다 정확하게 판단하세요.\n\n` : ''}${bizStatusData ? `## 국세청 사업자등록 상태\n${bizStatusData}\n\n과세유형(일반/간이/면세)과 영업상태를 세금 혜택 자격 검증에 활용하세요.\n간이과세자는 일부 세액공제 적용이 제한될 수 있습니다.\n\n` : ''}## 국민연금 사업장 데이터 (실제 조회)
${npsData?.found && npsData.workplace ? (() => {
    const lines = [
      `### 기본 현황`,
      `- 데이터 출처: 국민연금공단 사업장 API (실제 데이터)`,
      `- 총 사업장 수: ${npsData.allWorkplaces ? npsData.allWorkplaces.length : 1}개${npsData.allWorkplaces ? ' (통합 조회)' : ''}`,
      `- 매칭 방식: ${npsData.matchedByBusinessNumber ? '사업자등록번호 정확매칭' : '사업장명 검색'}`,
      `- 현재 직원수(가입자수 합계): ${npsData.workplace.nrOfJnng}명`,
      `- 당월 국민연금 고지액 합계: ${npsData.workplace.crtmNtcAmt.toLocaleString()}원`,
      `- 연간 추정 국민연금: ${(npsData.workplace.crtmNtcAmt * 12).toLocaleString()}원`,
      `- 신규 입사(취득자): ${npsData.workplace.nwAcqzrCnt}명`,
      `- 퇴사(상실자): ${npsData.workplace.lssJnngpCnt}명`,
      `- 기준연월: ${npsData.workplace.dataCrtYm}`,
      `- 데이터 완성도: ${npsData.dataCompleteness}%`,
    ];

    // 연도별 고용 추이 (히스토리 데이터가 있을 때)
    if (npsData.historical?.yearSummary?.length) {
      lines.push('', '### 연도별 고용 추이 (과거 60개월)');
      for (const ys of npsData.historical.yearSummary) {
        lines.push(`**${ys.year}년**: 평균 ${ys.avgEmployees}명 | 신규 +${ys.totalNewHires}명 | 퇴사 -${ys.totalDepartures}명 | 순증감 ${ys.netChange >= 0 ? '+' : ''}${ys.netChange}명`);
      }
    }

    // 월별 현황 (최근 12개월)
    if (npsData.historical?.monthlyData?.length) {
      lines.push('', '### 월별 현황 (최근 12개월)');
      const recent12 = npsData.historical.monthlyData.slice(0, 12);
      for (const md of recent12) {
        lines.push(`- ${md.dataCrtYm}: ${md.employeeCount}명 (신규 +${md.newHires}, 상실 -${md.departures})`);
      }
    }

    // 고용증대 세액공제 사전 검증
    if (npsData.historical?.yearSummary?.length && npsData.historical.yearSummary.length >= 2) {
      const sorted = [...npsData.historical.yearSummary].sort((a, b) => b.year - a.year);
      const thisYear = sorted[0];
      const lastYear = sorted[1];
      const diff = thisYear.avgEmployees - lastYear.avgEmployees;
      lines.push('', '### 고용증대 세액공제 사전 검증');
      lines.push(`- ${thisYear.year}년 vs ${lastYear.year}년: ${diff >= 0 ? '+' : ''}${diff}명 ${diff > 0 ? '증가 → 적용 가능 ✓' : diff === 0 ? '변동 없음' : '감소 → 적용 불가'}`);
      if (diff > 0) {
        lines.push(`- 예상 공제 (1인당 1,550만원 기준): ${(diff * 15500000).toLocaleString()}원`);
      }
    }

    return lines.join('\n');
  })() : '국민연금 데이터 조회 불가 — 모든 수치는 추정치입니다.'}

## 스캔 대상: 19대 세금 혜택

1. **고용증대 세액공제** (조특법 §29의7) - 코드: EMPLOYMENT_INCREASE
   - 직전 연도 대비 상시근로자 수 증가 시 1인당 최대 1,550만원 공제
2. **중소기업 특별세액감면** (조특법 §7) - 코드: SME_SPECIAL
   - 업종별 5~30% 소득세/법인세 감면 (수도권 외 추가 감면)
3. **연구·인력개발비 세액공제** (조특법 §10) - 코드: RND_CREDIT
   - R&D 비용의 최대 25% 세액공제
4. **투자세액공제** (조특법 §24) - 코드: INVESTMENT_CREDIT
   - 시설투자 금액의 3~12% 세액공제
5. **사회보험료 세액공제** (조특법 §30의4) - 코드: SOCIAL_INSURANCE
   - 신규 채용 시 사회보험료 사업주 부담분 공제
6. **정규직 전환 세액공제** (조특법 §30의2) - 코드: PERMANENT_CONVERSION
   - 비정규직→정규직 전환 시 1인당 최대 1,300만원
7. **경력단절여성 고용 세액공제** (조특법 §29의3) - 코드: CAREER_BREAK_WOMEN
   - 경력단절여성 채용 시 인건비의 30% 공제
8. **중소기업 접대비 한도 특례** (법인세법 시행령 §45) - 코드: ENTERTAINMENT_SPECIAL
   - 중소기업 접대비 한도 추가 적용
9. **창업중소기업 세액감면** (조특법 §6) - 코드: STARTUP_EXEMPTION
   - 창업 후 5년간 소득세/법인세 50~100% 감면
10. **경정청구** (국세기본법 §45의2) - 코드: AMENDED_RETURN
    - 최근 5년간 과다 납부 세금 환급 청구
11. **청년 고용 세액공제** (조특법 §30의7) - 코드: YOUTH_EMPLOYMENT
    - 15-34세 청년 정규직 채용 시 1인당 연 최대 1,200만원 (3년간)
12. **장애인 고용 세액공제** (조특법 §29의8) - 코드: DISABLED_EMPLOYMENT
    - 장애인 고용 시 1인당 연 1,000~1,500만원 공제
13. **육아휴직 복귀자 세액공제** (조특법 §29의3의2) - 코드: PARENTAL_LEAVE_RETURN
    - 육아휴직 후 복귀자 1인당 연 1,000만원 (2년간)
14. **근로소득증대 세액공제** (조특법 §29의4) - 코드: WAGE_INCREASE_CREDIT
    - 직전 3개 과세연도 대비 평균 임금 증가액의 20~30% 공제
15. **고용유지 중소기업 세액공제** (조특법 §30의3) - 코드: EMPLOYMENT_RETENTION
    - 경영위기에도 고용 유지 시 1인당 최대 1,000만원
16. **고용증가 사회보험료 세액공제** (조특법 §30의4의2) - 코드: SOCIAL_INSURANCE_INCREASE
    - 상시근로자 증가 인원의 사회보험료 사업주 부담분 추가 공제
17. **통합투자 세액공제** (조특법 §24의2) - 코드: INTEGRATED_INVESTMENT
    - 신성장·원천기술 사업화 시설투자 시 최대 15% 공제
18. **성과공유 중소기업 세액공제** (조특법 §19) - 코드: PROFIT_SHARING
    - 근로자 성과급 지급 시 성과급의 10% 공제
19. **중소기업 재직자 우대저축 공제** (조특법 §91의21) - 코드: SAVINGS_CREDIT
    - 재직자 우대저축 기업 불입액의 40% 소득공제

## 경정청구 5년 소급 분석 지침
- 국세기본법 §45의2에 따라 과거 5년(${currentYear - 5}~${currentYear}) 이내 경정청구 가능
- 각 혜택별로 applicableYears에 소급 가능 연도를 **모두** 명시하세요
- DART 재무데이터가 있으면 해당 연도의 실제 수치로 계산하세요
- R&D 세액공제: DART 연구개발비 실데이터 사용 (있으면 dataSource='DART_API')
- 고용증대 공제: NPS 60개월 히스토리로 연도별 증감 실산출

## 분석 규칙
- **19개 혜택 전체**를 이 기업에 적용 가능한지 판단. 적용 가능성이 있는 항목만 반환 (해당 없는 항목은 제외하되, 제외 사유를 summary에 간략 기재)
- 각 기회에 대해 추정 환급액, 적용 연도, 난이도, 확신도를 산출
- taxBenefitCode가 "AMENDED_RETURN"인 항목은 반드시 "isAmendedReturn": true로 설정
- 그 외 항목은 "isAmendedReturn": false
- 과거 수령한 지원금 중 추가 공제/환급 가능한 건도 경정청구 대상에 포함
- estimatedRefund는 원(KRW) 단위
- applicableYears는 ${currentYear - 5}~${currentYear} 범위

### NPS 히스토리 활용 규칙 (중요)
- **연도별 고용 추이 데이터가 있으면**: 실제 연도별 평균 직원수 증감으로 고용증대/사회보험료 공제액 산출. confidence 80 이상
- **사회보험료**: 월 고지액 × 12 × (증가인원 / 현재 직원수) 비율로 자동 추정
- **고용증대 세액공제**: 연도별 yearSummary의 netChange > 0 이면 적용 가능. 1인당 1,550만원 × netChange로 estimatedRefund 산출

### DART 재무데이터 활용 규칙
- DART 재무데이터가 있는 경우:
  - R&D 세액공제: DART 연구개발비 실데이터 × 25%로 estimatedRefund 산출. dataSource="DART_API", confidence 85-95
  - 중소기업 특별세액감면: DART 당기순이익 기반 계산. dataSource="DART_API"
  - 투자세액공제: DART 자산총계 증감 기반. dataSource="DART_API"
  - 인건비/급여 기반 항목: DART 인건비 실데이터 참고. NPS + DART 양쪽 확인 시 confidence 상향
- DART + NPS 모두 있는 경우: confidence 85-95
- DART만 있는 경우: confidence 70-80
- NPS만 있는 경우: confidence 65-80
- 둘 다 없는 경우: confidence 30-50

### 리서치 데이터 활용 규칙
- 딥리서치에 SWOT, R&D 비중, 수출/내수 비율 등이 있으면 관련 항목의 confidence +5~10
- 딥리서치의 '정부지원 적합도' 분석이 세금 혜택 카테고리와 일치하면 confidence 추가 상향
- 보유 문서(사업자등록증, 재무제표 원본 등)가 확인되면 해당 항목의 confidence +5
- dataSource: 리서치 기반 판단일 경우 "RESEARCH" 사용

### 고용/산재보험 데이터 활용 규칙
- 고용보험 가입자수가 NPS 가입자수보다 크면: 실제 직원수는 고용보험 기준 사용
- 고용보험 성립일로 사업 개시 시기를 더 정확하게 파악 → 창업기업 세액감면 자격 검증
- 고용보험 데이터가 있으면 사회보험료 관련 항목의 confidence +5
- 고용보험 기반 판단 시: dataSource를 "EI_API"로

### 국세청 사업자등록 상태 활용 규칙
- 영업상태가 "계속사업자"가 아닌 경우: 대부분의 세액공제 적용 불가 → 해당 항목 제외
- 간이과세자: 부가세 관련 세액공제 제한, confidence 하향 조정
- 면세사업자: 부가가치세 항목 해당 없음
- 국세청 데이터 기반 판단 시: dataSource를 "NTS_API"로

### dataSource 및 confidence 규칙
- DART 재무데이터로 산출한 항목 (R&D, 매출 기반 등): dataSource를 "DART_API"로
- 국민연금 히스토리 데이터가 있는 경우:
  - 고용증대/사회보험료/청년고용/고용유지 등 직원수·보험료 기반 항목: dataSource를 "NPS_API"로, confidence 80 이상
  - estimatedRefund 산출 시 실제 연도별 증감·고지액 기반 계산 근거를 eligibilityReason에 명시
- 국민연금 단월 데이터만 있는 경우:
  - 고용증대/사회보험료: dataSource를 "NPS_API"로, confidence 70
- 국민연금 데이터가 없는 경우:
  - 프로필(업종·매출·설립연도)만으로 판단 가능한 항목: dataSource를 "COMPANY_PROFILE"로, confidence 40~60
  - 나머지 항목: dataSource를 "ESTIMATED"로, confidence 50 이하, eligibilityReason에 "(추정치)" 표시
- 국민연금 데이터가 있어도 직원수·보험료와 무관한 항목(R&D, 투자 등): dataSource를 "DART_API" (DART 데이터 있을 때) 또는 "COMPANY_PROFILE" 또는 "ESTIMATED"로

반드시 아래 JSON 형식만 반환하세요:
{
  "opportunities": [
    {
      "id": "tax-opp-001",
      "taxBenefitName": "혜택명",
      "taxBenefitCode": "코드",
      "estimatedRefund": 0,
      "applicableYears": [${currentYear - 1}, ${currentYear}],
      "difficulty": "EASY"|"MODERATE"|"COMPLEX",
      "confidence": 0-100,
      "legalBasis": ["법조문"],
      "description": "혜택 설명",
      "eligibilityReason": "이 기업에 적용 가능한 이유",
      "requiredActions": ["실행 단계"],
      "requiredDocuments": ["필요 서류"],
      "filingDeadline": "신고 기한 (해당 시)",
      "estimatedProcessingTime": "예상 처리 기간",
      "risks": ["리스크"],
      "isAmendedReturn": true,
      "status": "identified",
      "dataSource": "NPS_API"|"COMPANY_PROFILE"|"ESTIMATED"|"DART_API"|"RESEARCH"|"EI_API"|"NTS_API"
    }
  ],
  "summary": "전체 분석 요약 300자 이상",
  "disclaimer": "면책 조항"
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;

    const rawOpps = (result.opportunities as Record<string, unknown>[]) || [];
    // 후처리: isAmendedReturn 보장 + boolean 강제 변환
    const opportunities: TaxRefundOpportunity[] = rawOpps.map((o, i) => {
      const code = (o.taxBenefitCode as string) || '';
      const isAmended = code === 'AMENDED_RETURN' || o.isAmendedReturn === true || o.isAmendedReturn === 'true';
      return {
        ...o,
        id: (o.id as string) || `tax-opp-${String(i + 1).padStart(3, '0')}`,
        isAmendedReturn: isAmended,
        confidence: Math.min(Math.max(Number(o.confidence) || 0, 0), 100),
        estimatedRefund: Number(o.estimatedRefund) || 0,
        applicableYears: Array.isArray(o.applicableYears) ? o.applicableYears.map(Number) : [],
        status: (o.status as string) || 'identified',
        dataSource: (['NPS_API', 'COMPANY_PROFILE', 'ESTIMATED', 'DART_API', 'RESEARCH', 'EI_API', 'NTS_API'].includes(o.dataSource as string)
          ? o.dataSource as 'NPS_API' | 'COMPANY_PROFILE' | 'ESTIMATED' | 'DART_API' | 'RESEARCH' | 'EI_API' | 'NTS_API'
          : (dartFinancials?.length ? 'DART_API' : npsData?.found ? 'COMPANY_PROFILE' : 'ESTIMATED')),
      } as TaxRefundOpportunity;
    });
    const summary = (result.summary as string) || '';
    const disclaimer = (result.disclaimer as string) || '본 분석은 AI 기반 참고 자료이며, 본인 책임하에 검토 및 신고하시기 바랍니다. 복잡한 사안은 세무 전문가 자문을 권장합니다.';

    return { opportunities, summary, disclaimer };
  } catch (e) {
    console.error('[analysisService] scanMissedTaxBenefits error:', e);
    return {
      opportunities: [],
      summary: 'AI 세금 혜택 스캔 중 오류가 발생했습니다.',
      disclaimer: '본 분석은 AI 기반 참고 자료이며, 본인 책임하에 검토 및 신고하시기 바랍니다. 복잡한 사안은 세무 전문가 자문을 권장합니다.',
    };
  }
}

// ===== Tax Calculation Worksheet =====

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

/** AI 세금 계산서 생성 */
export async function generateTaxCalculationWorksheet(
  company: CompanyInfo,
  opportunity: TaxRefundOpportunity,
  npsData?: NpsLookupResult | null
): Promise<TaxCalculationWorksheet> {
  const companyBlock = [
    `- 기업명: ${company.name}`,
    `- 업종: ${company.industry || '미등록'}`,
    `- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}`,
    `- 직원수: ${company.employees || 0}명`,
    `- 소재지: ${company.address || '미등록'}`,
    company.foundedYear ? `- 설립연도: ${company.foundedYear}년` : '',
    company.businessType ? `- 기업형태: ${company.businessType}` : '',
  ].filter(Boolean).join('\n');

  const npsBlock = npsData?.found && npsData.workplace ? [
    `- 현재 직원수(가입자수): ${npsData.workplace.nrOfJnng}명`,
    `- 당월 국민연금 고지액: ${npsData.workplace.crtmNtcAmt.toLocaleString()}원`,
    `- 신규 입사(취득자): ${npsData.workplace.nwAcqzrCnt}명`,
    `- 퇴사(상실자): ${npsData.workplace.lssJnngpCnt}명`,
    `- 기준연월: ${npsData.workplace.dataCrtYm}`,
  ].join('\n') : '국민연금 데이터 없음 — 추정치 기반';

  const prompt = `당신은 한국 중소기업 세무 전문가입니다. 아래 기업 정보와 세금 혜택 기회를 기반으로 상세 계산서를 생성하세요.

## 기업 정보
${companyBlock}

## 국민연금 데이터
${npsBlock}

## 세금 혜택 기회
- 혜택명: ${opportunity.taxBenefitName}
- 혜택코드: ${opportunity.taxBenefitCode}
- 법적 근거: ${opportunity.legalBasis.join(', ')}
- 추정 환급액: ${opportunity.estimatedRefund.toLocaleString()}원
- 적용 연도: ${opportunity.applicableYears.join(', ')}
- 적용 사유: ${opportunity.eligibilityReason}

## 계산서 생성 규칙
1. 혜택코드(${opportunity.taxBenefitCode})에 맞는 세금 계산 항목을 나열하세요
2. 각 항목(lineItem)에는:
   - key: 영문 camelCase 식별자 (예: currentEmployees, previousEmployees)
   - label: 한국어 항목명
   - value: 숫자 또는 문자열 값
   - unit: 단위 (명, 원, %, 개월 등)
   - source: 데이터 출처
     - "NPS_API": 국민연금 데이터에서 가져온 값
     - "COMPANY_PROFILE": 기업 프로필에서 가져온 값
     - "USER_INPUT": 사용자가 직접 입력해야 하는 값 (추정치로 초기화)
     - "CALCULATED": 다른 항목의 값으로 계산된 값
     - "TAX_LAW": 법정 단가/비율
   - editable: 사용자가 수정 가능한지 (USER_INPUT, COMPANY_PROFILE → true, TAX_LAW → false, CALCULATED → false)
   - formula: CALCULATED 항목의 경우 계산 수식 (다른 lineItem의 key를 변수로 사용, 예: "currentEmployees - previousEmployees")
   - note: 참고 사항 (선택)
3. subtotals: 소계 항목들 (label, amount, formula)
4. totalRefund: 최종 예상 환급/공제액 (원 단위)
5. assumptions: 계산에 사용된 가정 목록
6. formula에서 사용하는 변수명은 반드시 lineItems의 key와 일치해야 합니다

반드시 아래 JSON 형식만 반환하세요:
{
  "title": "${opportunity.taxBenefitName} 계산서",
  "lineItems": [
    { "key": "...", "label": "...", "value": 0, "unit": "...", "source": "...", "editable": true/false, "formula": "...", "note": "..." }
  ],
  "subtotals": [
    { "label": "...", "amount": 0, "formula": "..." }
  ],
  "totalRefund": 0,
  "assumptions": ["가정 1", "가정 2"]
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;

    const lineItems = (Array.isArray(result.lineItems) ? result.lineItems : []) as TaxCalculationLineItem[];
    const subtotals = (Array.isArray(result.subtotals) ? result.subtotals : []) as { label: string; amount: number; formula?: string }[];

    return {
      generatedAt: new Date().toISOString(),
      benefitCode: opportunity.taxBenefitCode,
      title: (result.title as string) || `${opportunity.taxBenefitName} 계산서`,
      lineItems,
      subtotals,
      totalRefund: Number(result.totalRefund) || 0,
      assumptions: Array.isArray(result.assumptions) ? result.assumptions as string[] : [],
      userOverrides: {},
    };
  } catch (e) {
    console.error('[analysisService] generateTaxCalculationWorksheet error:', e);
    return {
      generatedAt: new Date().toISOString(),
      benefitCode: opportunity.taxBenefitCode,
      title: `${opportunity.taxBenefitName} 계산서`,
      lineItems: [],
      subtotals: [],
      totalRefund: 0,
      assumptions: [],
      userOverrides: {},
    };
  }
}

/** 사용자 수정 값 기반 재계산 (AI 재호출 없이 서버에서 즉시 계산) */
export function recalculateWorksheet(
  worksheet: TaxCalculationWorksheet,
  overrides: Record<string, number | string>
): TaxCalculationWorksheet {
  // 현재 값 맵 구성: lineItem key → value
  const valueMap: Record<string, number> = {};
  for (const item of worksheet.lineItems) {
    const v = overrides[item.key] !== undefined ? overrides[item.key] : item.value;
    valueMap[item.key] = typeof v === 'number' ? v : parseFloat(String(v)) || 0;
  }

  // formula 평가: 안전한 수식만 허용 (+, -, *, / 와 lineItem key 변수)
  const safeEval = (formula: string): number => {
    try {
      // 변수명을 값으로 치환
      let expr = formula;
      for (const [key, val] of Object.entries(valueMap)) {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val));
      }
      // 안전 검증: 숫자, 연산자, 괄호, 공백만 허용
      if (!/^[\d\s+\-*/().]+$/.test(expr)) return 0;
      return Function(`"use strict"; return (${expr})`)() as number;
    } catch {
      return 0;
    }
  };

  // lineItems 재계산
  const updatedItems = worksheet.lineItems.map(item => {
    if (overrides[item.key] !== undefined && item.editable) {
      const newVal = overrides[item.key];
      valueMap[item.key] = typeof newVal === 'number' ? newVal : parseFloat(String(newVal)) || 0;
      return { ...item, value: newVal };
    }
    return item;
  });

  // CALCULATED 항목 재계산 (순서 보장을 위해 2회 패스)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      if (item.source === 'CALCULATED' && item.formula) {
        const newVal = safeEval(item.formula);
        valueMap[item.key] = newVal;
        updatedItems[i] = { ...item, value: newVal };
      }
    }
  }

  // subtotals 재계산
  const updatedSubtotals = worksheet.subtotals.map(sub => {
    if (sub.formula) {
      return { ...sub, amount: safeEval(sub.formula) };
    }
    return sub;
  });

  // totalRefund: 마지막 subtotal의 amount 또는 직접 계산
  const totalRefund = updatedSubtotals.length > 0
    ? updatedSubtotals[updatedSubtotals.length - 1].amount
    : worksheet.totalRefund;

  return {
    ...worksheet,
    lineItems: updatedItems,
    subtotals: updatedSubtotals,
    totalRefund,
    userOverrides: { ...worksheet.userOverrides, ...overrides },
    lastRecalculatedAt: new Date().toISOString(),
  };
}

/** 일관성 검사 */
export async function checkConsistency(
  sections: Record<string, string>
): Promise<ConsistencyResult> {
  const fullText = Object.entries(sections)
    .map(([k, v]) => `[${k}]\n${v}`)
    .join('\n\n');

  const prompt = `Act as a strict Logic Auditor for a government grant proposal.
Analyze the following text sections for logical inconsistencies, contradictions, and data mismatches.

Check for:
1. Budget numbers vs. described scale.
2. Schedule vs. technical difficulty.
3. Goals vs. Outcomes.
4. Timelines mentioned in different sections.

Content:
${fullText.substring(0, 20000)}

Output JSON:
{
  "score": 0-100 (100 is perfect),
  "issues": [{ "section": "Section Name", "description": "What is wrong", "severity": "HIGH"|"MEDIUM"|"LOW" }],
  "suggestion": "Overall advice to fix logic"
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;

    return {
      score: (result.score as number) || 0,
      issues: (result.issues as ConsistencyResult['issues']) || [],
      suggestion: (result.suggestion as string) || '',
    };
  } catch (e) {
    console.error('[analysisService] checkConsistency error:', e);
    return {
      score: 0,
      issues: [],
      suggestion: '일관성 검사 중 오류가 발생했습니다.',
    };
  }
}

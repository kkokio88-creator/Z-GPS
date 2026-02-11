/**
 * AI 분석 서비스
 * 프론트엔드 geminiAgents.ts 프롬프트를 서버에 이식
 */

import { callGeminiDirect, cleanAndParseJSON } from './geminiService.js';
import { extractRegionFromAddress, isRegionMismatch } from './programFetcher.js';

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

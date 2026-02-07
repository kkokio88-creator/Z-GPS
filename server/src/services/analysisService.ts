/**
 * AI 분석 서비스
 * 프론트엔드 geminiAgents.ts 프롬프트를 서버에 이식
 */

import { callGeminiDirect, cleanAndParseJSON } from './geminiService.js';

interface CompanyInfo {
  name: string;
  industry?: string;
  description?: string;
  revenue?: number;
  employees?: number;
  address?: string;
  certifications?: string[];
  coreCompetencies?: string[];
}

interface ProgramInfo {
  programName: string;
  organizer: string;
  supportType: string;
  description?: string;
  expectedGrant: number;
  officialEndDate: string;
}

export interface FitAnalysisResult {
  fitScore: number;
  eligibility: string;
  strengths: string[];
  weaknesses: string[];
  advice: string;
  recommendedStrategy: string;
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

/** 적합도 분석 */
export async function analyzeFit(
  company: CompanyInfo,
  program: ProgramInfo
): Promise<FitAnalysisResult> {
  const prompt = `당신은 정부 지원사업 전문 컨설턴트입니다.

## 기업 정보
- 기업명: ${company.name}
- 업종: ${company.industry || '미등록'}
- 매출액: ${company.revenue ? (company.revenue / 100000000).toFixed(1) + '억원' : '미공개'}
- 직원수: ${company.employees || 0}명
- 소재지: ${company.address || '미등록'}
- 핵심역량: ${company.coreCompetencies?.join(', ') || '미등록'}
- 보유 인증: ${company.certifications?.join(', ') || '없음'}
- 기업 설명: ${company.description || '없음'}

## 지원사업 정보
- 사업명: ${program.programName}
- 주관기관: ${program.organizer}
- 지원유형: ${program.supportType}
- 지원금: ${(program.expectedGrant / 100000000).toFixed(1)}억원
- 마감일: ${program.officialEndDate}
- 사업설명: ${program.description || '없음'}

## 요청사항
기업과 지원사업의 적합도를 분석하세요. JSON으로 출력:
{
  "fitScore": 0-100 점수,
  "eligibility": "가능" | "불가" | "검토 필요",
  "strengths": ["강점1", "강점2", "강점3"],
  "weaknesses": ["약점1", "약점2"],
  "advice": "전략적 조언 200자",
  "recommendedStrategy": "추천 접근 전략 100자"
}`;

  try {
    const response = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const result = cleanAndParseJSON(response.text) as Record<string, unknown>;

    return {
      fitScore: (result.fitScore as number) || 0,
      eligibility: (result.eligibility as string) || '검토 필요',
      strengths: (result.strengths as string[]) || [],
      weaknesses: (result.weaknesses as string[]) || [],
      advice: (result.advice as string) || '',
      recommendedStrategy: (result.recommendedStrategy as string) || '',
    };
  } catch (e) {
    console.error('[analysisService] analyzeFit error:', e);
    return {
      fitScore: 0,
      eligibility: '검토 필요',
      strengths: [],
      weaknesses: [],
      advice: 'AI 분석 중 오류가 발생했습니다.',
      recommendedStrategy: '',
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

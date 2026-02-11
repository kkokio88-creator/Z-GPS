import { Router, Request, Response } from 'express';
import path from 'path';
import fg from 'fast-glob';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
  ensureVaultStructure,
  readNote,
  writeNote,
  listNotes,
  generateSlug,
  getVaultRoot,
  noteExists,
  writeBinaryFile,
  deleteBinaryFile,
  listFiles,
} from '../services/vaultFileService.js';
import {
  fetchAllProgramsServerSide,
  isLikelyStartupProgram,
  isRegionMismatch,
  extractRegionFromAddress,
} from '../services/programFetcher.js';
import type { ServerSupportProgram } from '../services/programFetcher.js';
import {
  analyzeFit,
  analyzePdf,
  generateDraftSection,
  reviewDraft,
  checkConsistency,
  analyzeSections,
  generateDraftSectionV2,
  generateStrategyDocument,
  preScreenPrograms,
} from '../services/analysisService.js';
import type {
  FitAnalysisResult,
  FitDimensions,
  EligibilityDetails,
  StrategyDocument,
  PreScreenInput,
} from '../services/analysisService.js';
import { callGeminiDirect, cleanAndParseJSON } from '../services/geminiService.js';
import {
  deepCrawlProgramFull,
  enrichFromApiOnly,
  enrichWithAI,
  extractStructuredFromAttachments,
  extractTextFromFile,
  crawlHtmlOnly,
  downloadAttachmentToBuffer,
  type DeepCrawlResult,
  type AttachmentStructuredData,
  type DetectedFileType,
  type HtmlCrawlResult,
} from '../services/deepCrawler.js';
import { initSSE, sendProgress, sendComplete, sendError } from '../utils/sse.js';

const router = Router();

// 초기화: 볼트 구조 보장
ensureVaultStructure().catch(e => console.error('[vault] Failed to ensure vault structure:', e));

// ─── Helper ────────────────────────────────────────────────────

/** 첨부파일 분석 텍스트 로드 (pdf-analysis/*.txt) */
async function loadAttachmentText(
  attachments: { path: string; name: string; analyzed: boolean }[],
  maxLength: number = 6000
): Promise<string> {
  let text = '';
  const analysisDir = path.join(getVaultRoot(), 'attachments', 'pdf-analysis');
  for (const att of attachments) {
    if (!att.analyzed) continue;
    const baseName = path.basename(att.path).replace(/\.[^.]+$/, '');
    const txtPath = path.join(analysisDir, baseName + '.txt');
    try {
      const txt = await fs.readFile(txtPath, 'utf-8');
      if (txt.length > 50) {
        text += txt + '\n\n---\n\n';
      }
    } catch { /* txt 파일 없으면 스킵 */ }
  }
  return text.substring(0, maxLength);
}

/** 개별 첨부파일 텍스트를 배열로 반환 (truncate 없음) → extractStructuredFromAttachments에 직접 전달 */
async function loadAttachmentTextsRaw(
  attachments: { path: string; name: string; analyzed: boolean }[]
): Promise<string[]> {
  const texts: string[] = [];
  const analysisDir = path.join(getVaultRoot(), 'attachments', 'pdf-analysis');
  for (const att of attachments) {
    if (!att.analyzed) continue;
    const baseName = path.basename(att.path).replace(/\.[^.]+$/, '');
    const txtPath = path.join(analysisDir, baseName + '.txt');
    try {
      const txt = await fs.readFile(txtPath, 'utf-8');
      if (txt.length > 50) {
        texts.push(txt);
      }
    } catch { /* txt 파일 없으면 스킵 */ }
  }
  return texts;
}

/** slug 검증: 경로순회 방지 (영문/한글/숫자/하이픈/언더스코어만 허용) */
function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9가-힣_-]+$/.test(slug) && !slug.includes('..');
}

/** 딥리서치 결과 → Obsidian 마크다운 */
function generateResearchMarkdown(companyName: string, data: Record<string, unknown>): string {
  const sa = data.strategicAnalysis as Record<string, unknown> | undefined;
  const swot = sa?.swot as Record<string, string[]> | undefined;
  const mp = data.marketPosition as Record<string, unknown> | undefined;
  const ii = data.industryInsights as Record<string, unknown> | undefined;
  const gf = data.governmentFundingFit as Record<string, unknown> | undefined;
  const fi = data.financialInfo as Record<string, unknown> | undefined;
  const ei = data.employmentInfo as Record<string, unknown> | undefined;
  const inv = data.investmentInfo as Record<string, unknown> | undefined;

  let md = `# ${data.name || companyName} 기업 리서치\n\n`;
  md += `> 리서치 일시: ${new Date().toISOString().split('T')[0]}\n\n`;

  // 기본 정보
  md += `## 기본 정보\n`;
  md += `| 항목 | 내용 |\n|------|------|\n`;
  if (data.representative) md += `| 대표자 | ${data.representative} |\n`;
  if (data.businessNumber) md += `| 사업자등록번호 | ${data.businessNumber} |\n`;
  if (data.foundedDate) md += `| 설립일 | ${data.foundedDate} |\n`;
  if (data.industry) md += `| 업종 | ${data.industry} |\n`;
  if (data.address) md += `| 주소 | ${data.address} |\n`;
  if (data.employees) md += `| 직원수 | ${data.employees}명 |\n`;
  if (data.website) md += `| 홈페이지 | ${data.website} |\n`;
  md += '\n';

  if (data.description) md += `## 기업 소개\n${data.description}\n\n`;
  if (data.history) md += `## 연혁\n${data.history}\n\n`;

  // 주요 제품/서비스
  const products = data.mainProducts as string[] | undefined;
  if (products?.length) {
    md += `## 주요 제품/서비스\n${products.map(p => `- ${p}`).join('\n')}\n\n`;
  }

  // 핵심역량
  const comps = data.coreCompetencies as string[] | undefined;
  if (comps?.length) {
    md += `## 핵심 역량\n${comps.map(c => `- ${c}`).join('\n')}\n\n`;
  }

  // 인증
  const certs = data.certifications as string[] | undefined;
  if (certs?.length) {
    md += `## 보유 인증\n${certs.map(c => `- ${c}`).join('\n')}\n\n`;
  }

  // SWOT 분석
  if (swot) {
    md += `## SWOT 분석\n\n`;
    md += `| 강점 (S) | 약점 (W) |\n|----------|----------|\n`;
    const maxSW = Math.max(swot.strengths?.length || 0, swot.weaknesses?.length || 0);
    for (let i = 0; i < maxSW; i++) {
      md += `| ${swot.strengths?.[i] || ''} | ${swot.weaknesses?.[i] || ''} |\n`;
    }
    md += `\n| 기회 (O) | 위협 (T) |\n|----------|----------|\n`;
    const maxOT = Math.max(swot.opportunities?.length || 0, swot.threats?.length || 0);
    for (let i = 0; i < maxOT; i++) {
      md += `| ${swot.opportunities?.[i] || ''} | ${swot.threats?.[i] || ''} |\n`;
    }
    md += '\n';
  }
  if (sa?.competitiveAdvantage) md += `### 경쟁 우위\n${sa.competitiveAdvantage}\n\n`;
  if (sa?.growthPotential) md += `### 성장 잠재력\n${sa.growthPotential}\n\n`;
  const risks = sa?.riskFactors as string[] | undefined;
  if (risks?.length) md += `### 리스크 요인\n${risks.map(r => `- ${r}`).join('\n')}\n\n`;

  // 시장 분석
  if (mp) {
    md += `## 시장 분석\n`;
    const comps2 = mp.competitors as string[] | undefined;
    if (comps2?.length) md += `### 경쟁사\n${comps2.map(c => `- ${c}`).join('\n')}\n\n`;
    if (mp.marketShare) md += `### 시장점유율\n${mp.marketShare}\n\n`;
    const usp = mp.uniqueSellingPoints as string[] | undefined;
    if (usp?.length) md += `### 차별화 포인트\n${usp.map(u => `- ${u}`).join('\n')}\n\n`;
  }

  // 산업 인사이트
  if (ii) {
    md += `## 산업 인사이트\n`;
    const trends = ii.marketTrends as string[] | undefined;
    if (trends?.length) md += `### 시장 트렌드\n${trends.map(t => `- ${t}`).join('\n')}\n\n`;
    if (ii.industryOutlook) md += `### 산업 전망\n${ii.industryOutlook}\n\n`;
    if (ii.regulatoryEnvironment) md += `### 규제 환경\n${ii.regulatoryEnvironment}\n\n`;
    const tTrends = ii.technologyTrends as string[] | undefined;
    if (tTrends?.length) md += `### 기술 트렌드\n${tTrends.map(t => `- ${t}`).join('\n')}\n\n`;
  }

  // 정부지원금 적합성
  if (gf) {
    md += `## 정부지원금 적합성\n`;
    const recs = gf.recommendedPrograms as string[] | undefined;
    if (recs?.length) md += `### 추천 지원사업\n${recs.map(r => `- ${r}`).join('\n')}\n\n`;
    const strengths = gf.eligibilityStrengths as string[] | undefined;
    if (strengths?.length) md += `### 자격 강점\n${strengths.map(s => `- ${s}`).join('\n')}\n\n`;
    const challenges = gf.potentialChallenges as string[] | undefined;
    if (challenges?.length) md += `### 도전과제\n${challenges.map(c => `- ${c}`).join('\n')}\n\n`;
    if (gf.applicationTips) md += `### 지원 팁\n> ${gf.applicationTips}\n\n`;
  }

  // 재무/고용
  if (fi?.recentRevenue) md += `## 재무 정보\n- 최근 매출: ${((fi.recentRevenue as number) / 100000000).toFixed(1)}억원\n- 성장률: ${fi.revenueGrowth || '정보 없음'}\n\n`;
  if (ei) {
    md += `## 고용 정보\n`;
    if (ei.averageSalary) md += `- 평균 연봉: ${((ei.averageSalary as number) / 10000).toFixed(0)}만원\n`;
    if (ei.creditRating) md += `- 신용등급: ${ei.creditRating}\n`;
    const benefits = ei.benefits as string[] | undefined;
    if (benefits?.length) md += `- 복리후생: ${benefits.join(', ')}\n`;
    md += '\n';
  }

  // 투자 정보
  if (inv && !inv.isBootstrapped) {
    md += `## 투자 정보\n`;
    if (inv.totalRaised) md += `- 총 투자유치: ${inv.totalRaised}\n`;
    const rounds = inv.fundingRounds as { round: string; amount: string; date: string; investor?: string }[] | undefined;
    if (rounds?.length) {
      md += `\n| 라운드 | 금액 | 일시 | 투자자 |\n|--------|------|------|--------|\n`;
      rounds.forEach(r => {
        md += `| ${r.round} | ${r.amount} | ${r.date} | ${r.investor || ''} |\n`;
      });
    }
    md += '\n';
  }

  return md;
}

function programToFrontmatter(
  p: ServerSupportProgram,
  slug: string,
  deepCrawl?: DeepCrawlResult | null,
  attachments?: { path: string; name: string; analyzed: boolean }[]
): Record<string, unknown> {
  const fm: Record<string, unknown> = {
    type: 'program',
    id: p.id,
    slug,
    programName: p.programName,
    organizer: p.organizer,
    department: deepCrawl?.department || p.department || '',
    supportType: p.supportType,
    supportScale: deepCrawl?.supportScale || p.supportScale || '',
    targetAudience: deepCrawl?.targetAudience || p.targetAudience || '',
    officialEndDate: p.officialEndDate,
    applicationStart: deepCrawl?.applicationPeriod?.start || p.applicationPeriod?.start || '',
    internalDeadline: p.internalDeadline,
    expectedGrant: p.expectedGrant,
    fitScore: 0,
    eligibility: '검토 필요',
    detailUrl: p.detailUrl,
    source: p.source,
    syncedAt: new Date().toISOString(),
    analyzedAt: '',
    deepCrawledAt: deepCrawl ? new Date().toISOString() : '',
    status: deepCrawl ? 'deep_crawled' : 'synced',
    regions: deepCrawl?.regions || p.regions || [],
    categories: deepCrawl?.categories || p.categories || [],
    tags: ['program', p.supportType, ...(deepCrawl?.categories || p.categories || [])],
    requiredDocuments: deepCrawl?.requiredDocuments || p.requiredDocuments || [],
    evaluationCriteria: deepCrawl?.evaluationCriteria || p.evaluationCriteria || [],
    applicationMethod: deepCrawl?.applicationMethod || p.applicationMethod || '',
    contactInfo: deepCrawl?.contactInfo || p.contactInfo || '',
    attachments: (attachments || []).map(a => ({
      path: a.path,
      name: a.name,
      analyzed: a.analyzed,
    })),
    // 고도화 추가 필드
    matchingRatio: deepCrawl?.matchingRatio || p.matchingRatio || '',
    totalBudget: deepCrawl?.totalBudget || p.totalBudget || '',
    projectPeriod: deepCrawl?.projectPeriod || p.projectPeriod || '',
    selectionDate: deepCrawl?.selectionDate || p.selectionDate || '',
    announcementDate: deepCrawl?.announcementDate || p.announcementDate || '',
    applicationUrl: deepCrawl?.applicationUrl || p.applicationUrl || '',
    contactPhone: deepCrawl?.contactPhone || p.contactPhone || '',
    contactEmail: deepCrawl?.contactEmail || p.contactEmail || '',
    keywords: deepCrawl?.keywords || p.keywords || [],
    dataQualityScore: deepCrawl?.dataQualityScore || 0,
    dataSources: deepCrawl?.dataSources || [p.source],
    // API 원본 데이터에서 추가 필드 (프론트 표시용)
    exclusionCriteria: deepCrawl?.exclusionCriteria || p.exclusionCriteria || [],
    specialNotes: deepCrawl?.specialNotes || p.specialNotes || [],
    fullDescription: deepCrawl?.fullDescription || p.fullDescription || p.description || '',
  };
  return fm;
}

function programToMarkdown(
  p: ServerSupportProgram,
  deepCrawl?: DeepCrawlResult | null,
  attachments?: { path: string; name: string; analyzed: boolean }[]
): string {
  const grantText = (p.expectedGrant / 100000000).toFixed(1);
  const scale = deepCrawl?.supportScale || p.supportScale || `${grantText}억원`;
  const period = deepCrawl?.applicationPeriod || p.applicationPeriod;
  const periodText = period?.start && period?.end
    ? `${period.start} ~ ${period.end}`
    : p.officialEndDate;
  const dept = deepCrawl?.department || p.department || '';
  const matching = deepCrawl?.matchingRatio || p.matchingRatio || '';
  const appMethod = deepCrawl?.applicationMethod || p.applicationMethod || '공고문 참조';
  const appUrl = deepCrawl?.applicationUrl || '';

  const totalBudget = deepCrawl?.totalBudget || p.totalBudget || '';
  const keywords = deepCrawl?.keywords || p.keywords || [];

  let md = `# ${p.programName}

> [!info] 기본 정보
> - **주관**: ${p.organizer}${dept ? ` / ${dept}` : ''}
> - **지원 규모**: ${scale}${matching ? ` (${matching})` : ''}${totalBudget ? `\n> - **총 사업예산**: ${totalBudget}` : ''}
> - **마감**: ${p.officialEndDate}
> - **신청기간**: ${periodText}
> - **신청방법**: ${appMethod}${appUrl ? ` ([온라인 신청](${appUrl}))` : ''}
`;

  // 지원 URL 바로가기 (별도 callout)
  if (appUrl) {
    md += `\n> [!tip] 온라인 신청\n> [신청 바로가기](${appUrl})\n`;
  }

  // 사업 목적
  const objectives = deepCrawl?.objectives || [];
  if (objectives.length > 0) {
    md += `\n## 사업 목적\n${objectives.map(o => `- ${o}`).join('\n')}\n`;
  }

  // 지원 대상 (데이터 있을 때만 표시)
  const target = deepCrawl?.targetAudience || p.targetAudience || '';
  if (target) {
    md += `\n## 지원 대상\n${target}\n`;
  }

  // 자격요건 (데이터 있을 때만 표시)
  const criteria = deepCrawl?.eligibilityCriteria || p.eligibilityCriteria || [];
  if (criteria.length > 0) {
    md += `\n## 자격요건\n${criteria.map(c => `- ${c}`).join('\n')}\n`;
  }

  // 참여 제한 대상
  const exclusion = deepCrawl?.exclusionCriteria || [];
  if (exclusion.length > 0) {
    md += `\n## 참여 제한 대상\n${exclusion.map(e => `- ${e}`).join('\n')}\n`;
  }

  // 지원 내용 상세
  const supportDetails = deepCrawl?.supportDetails || [];
  if (supportDetails.length > 0) {
    md += `\n## 지원 내용\n${supportDetails.map(s => `- ${s}`).join('\n')}\n`;
  }

  // 사업 상세 설명
  const fullDesc = deepCrawl?.fullDescription || p.fullDescription || p.description || '';
  if (fullDesc && fullDesc.length > 30) {
    md += `\n## 사업 상세 설명\n${fullDesc}\n`;
  }

  // 선정 절차
  const selProcess = deepCrawl?.selectionProcess || [];
  if (selProcess.length > 0) {
    md += `\n## 선정 절차\n${selProcess.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
  }

  // 필수서류 (데이터 있을 때만 표시)
  const docs = deepCrawl?.requiredDocuments || p.requiredDocuments || [];
  if (docs.length > 0) {
    md += `\n## 필수 제출 서류\n${docs.map(d => `- [ ] ${d}`).join('\n')}\n`;
  }

  // 평가기준 (데이터 있을 때만 표시)
  const evalCriteria = deepCrawl?.evaluationCriteria || p.evaluationCriteria || [];
  if (evalCriteria.length > 0) {
    md += `\n## 평가 기준\n${evalCriteria.map(e => `- ${e}`).join('\n')}\n`;
  }

  // 주요 일정 테이블
  const announcementDate = deepCrawl?.announcementDate || p.announcementDate || '';
  const selectionDate = deepCrawl?.selectionDate || '';
  const projectPeriod = deepCrawl?.projectPeriod || '';

  if (announcementDate || selectionDate || projectPeriod) {
    md += `\n## 주요 일정\n| 일정 | 날짜 |\n|------|------|\n`;
    if (announcementDate) md += `| 공고일 | ${announcementDate} |\n`;
    md += `| 접수기간 | ${periodText} |\n`;
    if (selectionDate) md += `| 선정발표 | ${selectionDate} |\n`;
    if (projectPeriod) md += `| 사업기간 | ${projectPeriod} |\n`;
  }

  // 유의사항
  const notes = deepCrawl?.specialNotes || p.specialNotes || [];
  if (notes.length > 0) {
    md += `\n> [!warning] 유의사항\n${notes.map(n => `> - ${n}`).join('\n')}\n`;
  }

  // 첨부파일
  if (attachments?.length) {
    md += `\n## 첨부파일\n${attachments.map(a => `- [[${a.path}|${a.name}]]`).join('\n')}\n`;
  }

  // 적합도
  md += `\n## 적합도\n(적합도 분석 후 채워짐)\n`;

  // 연락처
  const contact = deepCrawl?.contactInfo || p.contactInfo || '';
  const phone = deepCrawl?.contactPhone || p.contactPhone || '';
  const email = deepCrawl?.contactEmail || '';
  if (contact || phone || email) {
    md += `\n## 연락처\n`;
    if (contact) md += `- **담당**: ${contact}\n`;
    if (phone) md += `- **전화**: ${phone}\n`;
    if (email) md += `- **이메일**: ${email}\n`;
  } else {
    md += `\n## 연락처\n(공고문 참조)\n`;
  }

  // 키워드 태그
  if (keywords.length > 0) {
    md += `\n## 키워드\n${keywords.map(k => `\`${k}\``).join(' ')}\n`;
  }

  // 데이터 품질 표시
  const quality = deepCrawl?.dataQualityScore || 0;
  const sources = deepCrawl?.dataSources || [p.source];
  md += `\n---\n*데이터 품질: ${quality}/100 | 소스: ${sources.join(', ')} | 수집일: ${new Date().toISOString().split('T')[0]}*\n`;

  return md;
}

/** 분석 결과로 프로그램 MD의 적합도 섹션 교체 */
function buildFitSectionMarkdown(result: FitAnalysisResult, slug: string): string {
  const dimLabels: { key: keyof FitDimensions; label: string }[] = [
    { key: 'eligibilityMatch', label: '자격요건 부합' },
    { key: 'industryRelevance', label: '업종/기술 관련' },
    { key: 'scaleFit', label: '규모 적합성' },
    { key: 'competitiveness', label: '경쟁력' },
    { key: 'strategicAlignment', label: '전략적 부합' },
  ];

  let md = `\n## 적합도\n\n`;
  md += `**종합 점수: ${result.fitScore}/100** (${result.eligibility})\n\n`;

  // 차원별 점수 표
  md += `| 차원 | 점수 | 바 |\n|------|-----:|-----|\n`;
  for (const d of dimLabels) {
    const score = result.dimensions[d.key];
    const bar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
    md += `| ${d.label} | ${score} | ${bar} |\n`;
  }

  // 자격요건 상세
  if (result.eligibilityDetails.met.length || result.eligibilityDetails.unmet.length || result.eligibilityDetails.unclear.length) {
    md += `\n### 자격요건 매칭\n`;
    if (result.eligibilityDetails.met.length) {
      md += `**충족:**\n${result.eligibilityDetails.met.map(m => `- ✅ ${m}`).join('\n')}\n\n`;
    }
    if (result.eligibilityDetails.unmet.length) {
      md += `**미충족:**\n${result.eligibilityDetails.unmet.map(m => `- ❌ ${m}`).join('\n')}\n\n`;
    }
    if (result.eligibilityDetails.unclear.length) {
      md += `**확인 필요:**\n${result.eligibilityDetails.unclear.map(m => `- ❓ ${m}`).join('\n')}\n\n`;
    }
  }

  // 강점/약점
  if (result.strengths.length) {
    md += `### 강점\n${result.strengths.map(s => `- ${s}`).join('\n')}\n\n`;
  }
  if (result.weaknesses.length) {
    md += `### 약점\n${result.weaknesses.map(w => `- ${w}`).join('\n')}\n\n`;
  }

  // 전략 요약 + 링크
  if (result.recommendedStrategy) {
    md += `### 전략 요약\n${result.recommendedStrategy}\n\n`;
  }

  if (result.fitScore >= 80) {
    md += `> [!tip] 전략 문서\n> 상세 전략 문서: [[전략-${slug}]]\n`;
  }

  return md;
}

/** 전략 문서를 Obsidian 마크다운으로 변환 */
function strategyToMarkdown(
  programName: string,
  slug: string,
  fitScore: number,
  dimensions: FitDimensions,
  strategy: StrategyDocument
): { frontmatter: Record<string, unknown>; content: string } {
  const frontmatter: Record<string, unknown> = {
    type: 'strategy',
    programSlug: slug,
    programName,
    fitScore,
    dimensions,
    generatedAt: new Date().toISOString(),
  };

  const content = `# 전략 문서: ${programName}

> 적합도 **${fitScore}/100** | 생성일: ${new Date().toISOString().split('T')[0]}

${strategy.programOverview}

${strategy.fitAnalysisDetail}

${strategy.applicationStrategy}

${strategy.writingGuide}

${strategy.documentChecklist}

${strategy.executionTimeline}

${strategy.expectedQnA}

${strategy.risksAndNotes}
`;

  return { frontmatter, content };
}

const DRAFT_SECTION_TITLES = [
  '사업 개요',
  '기술 개발 내용',
  '시장 분석 및 사업화 계획',
  '추진 일정 및 추진 체계',
  '예산 계획',
  '기대 효과',
];

// ─── Routes ────────────────────────────────────────────────────

/**
 * GET /api/vault/stats
 * 볼트 통계 정보
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const vaultRoot = getVaultRoot();

    // 프로그램 통계
    const programFiles = await listNotes(path.join(vaultRoot, 'programs'));
    let analyzedCount = 0;
    let latestSyncedAt = '';
    let latestAnalyzedAt = '';

    for (const file of programFiles) {
      try {
        const { frontmatter } = await readNote(file);
        if (Number(frontmatter.fitScore) > 0) analyzedCount++;
        const syncedAt = frontmatter.syncedAt as string || '';
        const analyzedAt = frontmatter.analyzedAt as string || '';
        if (syncedAt > latestSyncedAt) latestSyncedAt = syncedAt;
        if (analyzedAt > latestAnalyzedAt) latestAnalyzedAt = analyzedAt;
      } catch { /* skip */ }
    }

    // 지원서 수
    const appFiles = await listNotes(path.join(vaultRoot, 'applications'));
    const draftCount = appFiles.filter(f => f.endsWith('draft.md')).length;

    // 첨부파일 수
    const pdfPattern = path.join(vaultRoot, 'attachments', 'pdfs', '*').replace(/\\/g, '/');
    const pdfFiles = await fg(pdfPattern, { onlyFiles: true });

    // 분석 파일 수
    const analysisFiles = await listNotes(path.join(vaultRoot, 'analysis'));

    // 기업 파일 수
    const companyFiles = await listFiles(path.join(vaultRoot, 'company'));

    // 폴더 구조 정보
    const folders = [
      { name: 'programs', label: '공고 목록', count: programFiles.length },
      { name: 'analysis', label: '분석 결과', count: analysisFiles.length },
      { name: 'applications', label: '지원서', count: draftCount },
      { name: 'attachments', label: '첨부파일', count: pdfFiles.length },
      { name: 'company', label: '기업 정보', count: companyFiles.length },
    ];

    res.json({
      vaultPath: vaultRoot,
      connected: true,
      totalPrograms: programFiles.length,
      analyzedPrograms: analyzedCount,
      applications: draftCount,
      attachments: pdfFiles.length,
      latestSyncedAt,
      latestAnalyzedAt,
      folders,
    });
  } catch (error) {
    console.error('[vault/stats] Error:', error);
    res.json({
      vaultPath: getVaultRoot(),
      connected: false,
      totalPrograms: 0,
      analyzedPrograms: 0,
      applications: 0,
      attachments: 0,
      latestSyncedAt: '',
      latestAnalyzedAt: '',
      folders: [],
    });
  }
});

/**
 * 크롤 메타데이터를 기존 frontmatter에 머지
 */
function mergeHtmlCrawlData(
  frontmatter: Record<string, unknown>,
  crawl: HtmlCrawlResult
): Record<string, unknown> {
  const meta = crawl.metadata;
  // _sectionContent는 메타에서 분리
  const sectionContent = meta['_sectionContent'] || '';
  delete meta['_sectionContent'];

  // 크롤 메타데이터에서 추출 가능한 필드 머지 (빈 값은 덮어쓰지 않음)
  const mergeIfEmpty = (key: string, value: string | undefined) => {
    if (value && (!frontmatter[key] || (frontmatter[key] as string) === '')) {
      frontmatter[key] = value;
    }
  };

  mergeIfEmpty('department', meta['organizer'] || meta['department']);
  mergeIfEmpty('applicationMethod', meta['applicationMethod']);
  mergeIfEmpty('contactInfo', meta['contactInfo']);
  mergeIfEmpty('targetAudience', meta['targetAudience']);
  mergeIfEmpty('supportScale', meta['supportScale']);

  // 크롤 본문이 기존 설명보다 긴 경우 대체
  if (crawl.content.length > ((frontmatter.fullDescription as string) || '').length) {
    frontmatter.crawledContent = crawl.content.substring(0, 15000);
  }
  if (sectionContent) {
    frontmatter.crawledSections = sectionContent.substring(0, 10000);
  }

  // 첨부파일 링크 저장
  if (crawl.attachmentLinks.length > 0) {
    frontmatter.attachmentLinks = crawl.attachmentLinks.slice(0, 10).map(l => ({
      url: l.url,
      filename: l.filename,
    }));
  }

  return frontmatter;
}

/**
 * POST /api/vault/sync
 * 5단계 점진적 파이프라인:
 *   1단계: API 수집 → 노트 저장 (enrichmentPhase: 1)
 *   클린업: 중복/창업/지역 제거
 *   1.5단계: AI 사전심사 → 부적합 공고 제외 (enrichmentPhase: 99)
 *   2단계: URL 크롤링 → 메타데이터 머지 (enrichmentPhase: 2)
 *   3단계: 첨부파일 + AI 강화 (enrichmentPhase: 3)
 *   4단계: 적합도 분석 (fitScore > 0)
 */
router.post('/sync', async (req: Request, res: Response) => {
  const useSSE = req.headers.accept === 'text/event-stream';

  try {
    await ensureVaultStructure();
    if (useSSE) initSSE(res);

    // 회사 주소 읽기 (지역 필터용)
    let companyAddress = '';
    try {
      const companyPath = path.join('company', 'profile.md');
      if (await noteExists(companyPath)) {
        const { frontmatter: cf } = await readNote(companyPath);
        companyAddress = (cf.address as string) || '';
      }
    } catch { /* company 정보 없으면 무시 */ }

    // ═══════════════════════════════════════════════════════════
    // 1단계: API 수집 (Gemini 호출 없음)
    // ═══════════════════════════════════════════════════════════
    if (useSSE) sendProgress(res, 'API 데이터 수집 중', 0, 1, '', 1);

    const { programs, filterStats } = await fetchAllProgramsServerSide({ companyAddress });
    const total = programs.length;

    if (useSSE) sendProgress(res, 'API 수집 완료', 1, 1, '', 1);

    let created = 0;
    let updated = 0;

    for (let i = 0; i < programs.length; i++) {
      const p = programs[i];
      const slug = generateSlug(p.programName, p.id);
      const filePath = path.join('programs', `${slug}.md`);
      const exists = await noteExists(filePath);

      if (useSSE) sendProgress(res, '프로그램 저장 중', i + 1, total, p.programName, 1);

      if (exists) {
        const existing = await readNote(filePath);
        existing.frontmatter.syncedAt = new Date().toISOString();
        await writeNote(filePath, existing.frontmatter, existing.content);
        updated++;
      } else {
        // skipAI: true → Gemini 호출 없이 directMap만 사용
        const crawlResult = await enrichFromApiOnly(p, { skipAI: true });
        const frontmatter = programToFrontmatter(p, slug, crawlResult);
        frontmatter.enrichmentPhase = 1;
        frontmatter.status = 'synced';
        const content = programToMarkdown(p, crawlResult);
        await writeNote(filePath, frontmatter, content);
        created++;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 클린업: 중복/창업/지역 필터 (1-3초)
    // ═══════════════════════════════════════════════════════════
    if (useSSE) sendProgress(res, '중복/필터 클린업 중', 0, 1, '', 1);

    const companyRegion = extractRegionFromAddress(companyAddress);
    let cleanedStartup = 0;
    let cleanedRegion = 0;
    let cleanedDuplicates = 0;

    try {
      const vaultRoot = getVaultRoot();
      const existingFiles = await listNotes(path.join(vaultRoot, 'programs'));

      // 중복 제거 (같은 programName → 최고 품질만 유지)
      const notesByName = new Map<string, { file: string; syncedAt: string; dqs: number }[]>();
      for (const file of existingFiles) {
        try {
          const { frontmatter: ef } = await readNote(file);
          const pName = (ef.programName as string) || '';
          if (!pName) continue;
          const entry = {
            file,
            syncedAt: (ef.syncedAt as string) || '',
            dqs: Number(ef.dataQualityScore) || 0,
          };
          const arr = notesByName.get(pName) || [];
          arr.push(entry);
          notesByName.set(pName, arr);
        } catch { /* 읽기 실패 무시 */ }
      }

      const survivingFiles = new Set<string>();
      for (const [, entries] of notesByName) {
        if (entries.length > 1) {
          entries.sort((a, b) => b.dqs - a.dqs || b.syncedAt.localeCompare(a.syncedAt));
          survivingFiles.add(entries[0].file);
          for (let i = 1; i < entries.length; i++) {
            await fs.unlink(entries[i].file);
            cleanedDuplicates++;
          }
        } else {
          survivingFiles.add(entries[0].file);
        }
      }

      // 창업/지역 필터
      for (const file of survivingFiles) {
        try {
          const { frontmatter: ef } = await readNote(file);
          const pName = (ef.programName as string) || '';
          const desc = (ef.fullDescription as string) || (ef.description as string) || '';
          const target = (ef.targetAudience as string) || '';
          const regions = (ef.regions as string[]) || [];

          if (isLikelyStartupProgram(pName, desc, target)) {
            await fs.unlink(file);
            cleanedStartup++;
            continue;
          }
          if (companyRegion && isRegionMismatch(pName, regions, companyRegion)) {
            await fs.unlink(file);
            cleanedRegion++;
          }
        } catch { /* 개별 파일 에러 무시 */ }
      }

      if (cleanedDuplicates > 0 || cleanedStartup > 0 || cleanedRegion > 0) {
        console.log(`[vault/sync] 클린업: 중복 ${cleanedDuplicates}건, 창업 ${cleanedStartup}건, 지역 ${cleanedRegion}건 삭제`);
      }
    } catch (e) {
      console.warn('[vault/sync] 클린업 중 에러:', e);
    }

    // ═══════════════════════════════════════════════════════════
    // 1.5단계: AI 사전심사 (Gemini 1회 배치 호출)
    // enrichmentPhase === 1인 신규 공고만 대상
    // ═══════════════════════════════════════════════════════════
    let preScreenPassed = 0;
    let preScreenRejected = 0;

    // 기업 정보 로드 (사전심사용)
    let companyForPreScreen: Record<string, unknown> = {};
    try {
      const companyPath = path.join('company', 'profile.md');
      if (await noteExists(companyPath)) {
        const { frontmatter: cf } = await readNote(companyPath);
        companyForPreScreen = cf;
      }
    } catch { /* 기업 정보 없으면 무시 */ }

    const hasCompanyInfo = !!(companyForPreScreen.name && companyForPreScreen.industry);

    if (hasCompanyInfo) {
      const preScreenVaultRoot = getVaultRoot();
      const preScreenFiles = await listNotes(path.join(preScreenVaultRoot, 'programs'));
      const preScreenTargets: { file: string; frontmatter: Record<string, unknown>; content: string; input: PreScreenInput }[] = [];

      for (const file of preScreenFiles) {
        try {
          const { frontmatter: ef, content: ec } = await readNote(file);
          const ep = Number(ef.enrichmentPhase) || 0;
          if (ep !== 1) continue; // 신규 수집 공고만 대상
          preScreenTargets.push({
            file,
            frontmatter: ef,
            content: ec,
            input: {
              id: (ef.id as string) || path.basename(file, '.md'),
              programName: (ef.programName as string) || '',
              supportType: (ef.supportType as string) || '',
              targetAudience: (ef.targetAudience as string) || '',
              description: ((ef.fullDescription as string) || (ef.description as string) || '').substring(0, 200),
            },
          });
        } catch { /* 읽기 실패 무시 */ }
      }

      if (preScreenTargets.length > 0) {
        if (useSSE) sendProgress(res, 'AI 사전심사 중', 0, preScreenTargets.length, '', 2);

        const companyInfo = {
          name: (companyForPreScreen.name as string) || '미등록 기업',
          industry: companyForPreScreen.industry as string,
          description: companyForPreScreen.description as string,
          revenue: companyForPreScreen.revenue as number,
          employees: companyForPreScreen.employees as number,
          address: companyForPreScreen.address as string,
          certifications: companyForPreScreen.certifications as string[],
          coreCompetencies: companyForPreScreen.coreCompetencies as string[],
          mainProducts: companyForPreScreen.mainProducts as string[],
          businessType: companyForPreScreen.businessType as string,
        };

        const screenResults = await preScreenPrograms(
          companyInfo,
          preScreenTargets.map(t => t.input)
        );

        // 결과를 ID로 매핑
        const resultMap = new Map(screenResults.map(r => [r.id, r]));

        for (let i = 0; i < preScreenTargets.length; i++) {
          const { file, frontmatter: ef, content: ec, input } = preScreenTargets[i];
          const result = resultMap.get(input.id);

          if (useSSE) sendProgress(res, 'AI 사전심사 중', i + 1, preScreenTargets.length, input.programName, 2);

          if (result && !result.pass) {
            // 탈락 → 이후 모든 Phase 건너뜀
            ef.fitScore = 3;
            ef.eligibility = '부적합';
            ef.enrichmentPhase = 99;
            ef.preScreenReason = result.reason;
            ef.status = 'pre_screen_rejected';
            await writeNote(file, ef, ec);
            preScreenRejected++;
          } else {
            // 통과 → enrichmentPhase 유지 (1)
            preScreenPassed++;
          }
        }

        console.log(`[vault/sync] 사전심사: ${preScreenPassed}건 통과, ${preScreenRejected}건 탈락`);
      }
    } else {
      console.log('[vault/sync] 기업 정보 미등록 → 사전심사 건너뜀');
    }

    // ═══════════════════════════════════════════════════════════
    // 2단계: URL 크롤링 (Gemini 호출 없음)
    // enrichmentPhase < 2 && detailUrl이 있는 노트만 대상
    // ═══════════════════════════════════════════════════════════
    let phase2Count = 0;
    const vaultRoot2 = getVaultRoot();
    const phase2Files = await listNotes(path.join(vaultRoot2, 'programs'));
    const phase2Targets: { file: string; frontmatter: Record<string, unknown>; content: string }[] = [];

    for (const file of phase2Files) {
      try {
        const { frontmatter: ef, content: ec } = await readNote(file);
        const ep = Number(ef.enrichmentPhase) || 0;
        const status = (ef.status as string) || '';
        // 이미 deep_crawled된 노트는 phase 3으로 간주
        if (status === 'deep_crawled' || ep >= 2) continue;
        const detailUrl = (ef.detailUrl as string) || '';
        if (!detailUrl) continue;
        phase2Targets.push({ file, frontmatter: ef, content: ec });
      } catch { /* 읽기 실패 무시 */ }
    }

    const phase2Total = phase2Targets.length;
    if (useSSE && phase2Total > 0) sendProgress(res, 'URL 크롤링 시작', 0, phase2Total, '', 3);

    for (let i = 0; i < phase2Targets.length; i++) {
      const { file, frontmatter: ef, content: ec } = phase2Targets[i];
      const pName = (ef.programName as string) || '';
      const detailUrl = (ef.detailUrl as string) || '';

      if (useSSE) sendProgress(res, 'URL 크롤링 중', i + 1, phase2Total, pName, 3);

      try {
        const crawlResult = await crawlHtmlOnly(detailUrl, pName);
        if (crawlResult) {
          mergeHtmlCrawlData(ef, crawlResult);
          phase2Count++;
        }
        ef.enrichmentPhase = 2;
        ef.status = 'crawled';
        await writeNote(file, ef, ec);
        // rate limit 방지
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`[vault/sync] Phase 2 실패 (${pName}):`, e);
        ef.enrichmentPhase = 2; // 실패해도 재시도 방지
        await writeNote(file, ef, ec);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3단계: 첨부파일 + AI 강화 (유일한 Gemini 사용 단계)
    // enrichmentPhase === 2인 노트만 대상
    // ═══════════════════════════════════════════════════════════
    let phase3Count = 0;
    let phase3Attachments = 0;
    const phase3Files = await listNotes(path.join(vaultRoot2, 'programs'));
    const phase3Targets: { file: string; frontmatter: Record<string, unknown>; content: string }[] = [];

    for (const file of phase3Files) {
      try {
        const { frontmatter: ef, content: ec } = await readNote(file);
        const ep = Number(ef.enrichmentPhase) || 0;
        const status = (ef.status as string) || '';
        if (status === 'deep_crawled' || ep >= 3) continue;
        if (ep < 2) continue; // 2단계 미완료는 건너뜀
        phase3Targets.push({ file, frontmatter: ef, content: ec });
      } catch { /* 읽기 실패 무시 */ }
    }

    const phase3Total = phase3Targets.length;
    if (useSSE && phase3Total > 0) sendProgress(res, 'AI 강화 시작', 0, phase3Total, '', 4);

    for (let i = 0; i < phase3Targets.length; i++) {
      const { file, frontmatter: ef } = phase3Targets[i];
      const pName = (ef.programName as string) || '';
      const slug = (ef.slug as string) || '';
      const detailUrl = (ef.detailUrl as string) || '';

      if (useSSE) sendProgress(res, 'AI 강화 중', i + 1, phase3Total, pName, 4);

      try {
        // 크롤된 본문 + 메타데이터 복원
        const crawledContent = (ef.crawledContent as string) || '';
        const crawledSections = (ef.crawledSections as string) || '';
        const storedLinks = (ef.attachmentLinks as { url: string; filename: string }[]) || [];

        // 첨부파일 다운로드 + 텍스트 추출
        const attachmentTexts: string[] = [];
        const attachments: { path: string; name: string; analyzed: boolean }[] = [];
        const existingAttachments = (ef.attachments as { path: string; name: string; analyzed: boolean }[]) || [];

        // 이미 첨부파일이 있으면 기존 텍스트 로드
        if (existingAttachments.length > 0) {
          const rawTexts = await loadAttachmentTextsRaw(existingAttachments);
          attachmentTexts.push(...rawTexts);
          attachments.push(...existingAttachments);
        } else if (storedLinks.length > 0) {
          // 2단계에서 추출한 링크로 다운로드
          const extMap: Record<string, string> = {
            pdf: 'pdf', hwpx: 'hwpx', hwp5: 'hwp', zip: 'zip', docx: 'docx', png: 'png', unknown: 'bin',
          };

          for (let j = 0; j < storedLinks.length && j < 5; j++) {
            const link = storedLinks[j];
            const buffer = await downloadAttachmentToBuffer(link.url);
            if (!buffer) continue;

            const { type, text } = await extractTextFromFile(buffer);
            if (type === 'png') continue;

            const ext = extMap[type] || 'bin';
            const savePath = path.join('attachments', 'pdfs', `${slug}-${j}.${ext}`);
            await writeBinaryFile(savePath, buffer);

            attachments.push({ path: savePath, name: link.filename, analyzed: text.length > 50 });
            phase3Attachments++;

            if (text.length > 50) {
              attachmentTexts.push(text);
              const analysisPath = path.join('attachments', 'pdf-analysis', `${slug}-${j}.txt`);
              await writeBinaryFile(analysisPath, Buffer.from(text, 'utf-8'));
            }
          }
        }

        // AI 재가공
        const attachmentData = attachmentTexts.length > 0
          ? extractStructuredFromAttachments(attachmentTexts)
          : null;

        // API 원본 데이터 복원 (frontmatter에서)
        const apiData: Partial<ServerSupportProgram> = {
          programName: pName,
          organizer: (ef.organizer as string) || '',
          department: (ef.department as string) || '',
          supportScale: (ef.supportScale as string) || '',
          targetAudience: (ef.targetAudience as string) || '',
          fullDescription: (ef.fullDescription as string) || '',
          applicationMethod: (ef.applicationMethod as string) || '',
          contactInfo: (ef.contactInfo as string) || '',
          eligibilityCriteria: (ef.eligibilityCriteria as string[]) || [],
          requiredDocuments: (ef.requiredDocuments as string[]) || [],
          evaluationCriteria: (ef.evaluationCriteria as string[]) || [],
          regions: (ef.regions as string[]) || [],
          categories: (ef.categories as string[]) || [],
          matchingRatio: (ef.matchingRatio as string) || '',
          applicationPeriod: {
            start: (ef.applicationStart as string) || '',
            end: (ef.officialEndDate as string) || '',
          },
        };

        // 크롤 메타데이터 복원
        const crawlMeta: Record<string, string> = {};
        if (crawledSections) crawlMeta['_sectionContent'] = crawledSections;

        const aiResult = await enrichWithAI(
          apiData,
          crawledContent || (ef.fullDescription as string) || '',
          crawlMeta,
          attachmentData
        );

        // frontmatter 업데이트
        const updatedFm = programToFrontmatter(
          { ...apiData, id: (ef.id as string) || '', detailUrl, source: (ef.source as string) || '', supportType: (ef.supportType as string) || '', officialEndDate: (ef.officialEndDate as string) || '', internalDeadline: (ef.internalDeadline as string) || '', expectedGrant: Number(ef.expectedGrant) || 0 } as ServerSupportProgram,
          slug,
          aiResult,
          attachments
        );
        // 기존 분석 데이터 보존
        updatedFm.fitScore = ef.fitScore || 0;
        updatedFm.eligibility = ef.eligibility || '검토 필요';
        updatedFm.analyzedAt = ef.analyzedAt || '';
        updatedFm.enrichmentPhase = 3;
        updatedFm.status = 'deep_crawled';

        const updatedContent = programToMarkdown(
          { ...apiData, id: (ef.id as string) || '', detailUrl, source: (ef.source as string) || '', supportType: (ef.supportType as string) || '', officialEndDate: (ef.officialEndDate as string) || '', internalDeadline: (ef.internalDeadline as string) || '', expectedGrant: Number(ef.expectedGrant) || 0 } as ServerSupportProgram,
          aiResult,
          attachments
        );

        await writeNote(file, updatedFm, updatedContent);
        phase3Count++;

        // Gemini rate limit 방지
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        console.warn(`[vault/sync] Phase 3 실패 (${pName}):`, e);
        // 실패해도 phase는 올리지 않음 → 다음 동기화에서 재시도
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4단계: AI 적합도 분석
    // 미분석 프로그램만 대상 (fitScore === 0, enrichmentPhase !== 99)
    // ═══════════════════════════════════════════════════════════
    let phase4Analyzed = 0;
    let phase4Errors = 0;
    let phase4Strategies = 0;

    // 기업 정보 로드 (사전심사에서 이미 로드했으면 재사용)
    const companyForAnalysis = Object.keys(companyForPreScreen).length > 0
      ? companyForPreScreen
      : await (async () => {
          try {
            const companyPath = path.join('company', 'profile.md');
            if (await noteExists(companyPath)) {
              const { frontmatter: cf } = await readNote(companyPath);
              return cf;
            }
          } catch { /* 기업 정보 없으면 무시 */ }
          return {} as Record<string, unknown>;
        })();

    const companyInfoForFit = {
      name: (companyForAnalysis.name as string) || '미등록 기업',
      industry: companyForAnalysis.industry as string,
      description: companyForAnalysis.description as string,
      revenue: companyForAnalysis.revenue as number,
      employees: companyForAnalysis.employees as number,
      address: companyForAnalysis.address as string,
      certifications: companyForAnalysis.certifications as string[],
      coreCompetencies: companyForAnalysis.coreCompetencies as string[],
      ipList: companyForAnalysis.ipList as string[],
      history: companyForAnalysis.history as string,
      foundedYear: companyForAnalysis.foundedYear as number,
      businessType: companyForAnalysis.businessType as string,
      mainProducts: companyForAnalysis.mainProducts as string[],
      financialTrend: companyForAnalysis.financialTrend as string,
    };

    const phase4Files = await listNotes(path.join(vaultRoot2, 'programs'));
    const phase4Targets: { file: string }[] = [];

    for (const file of phase4Files) {
      try {
        const { frontmatter: ef } = await readNote(file);
        const fitScore = Number(ef.fitScore) || 0;
        const ep = Number(ef.enrichmentPhase) || 0;
        const status = (ef.status as string) || '';
        // 이미 분석됨 또는 사전심사 탈락 → 건너뜀
        if (fitScore > 0 || status === 'analyzed' || ep === 99) continue;
        phase4Targets.push({ file });
      } catch { /* 읽기 실패 무시 */ }
    }

    const phase4Total = phase4Targets.length;
    if (useSSE && phase4Total > 0) sendProgress(res, 'AI 분석 시작', 0, phase4Total, '', 5);

    for (let i = 0; i < phase4Targets.length; i++) {
      const { file } = phase4Targets[i];
      try {
        const { frontmatter: pf, content: pc } = await readNote(file);
        const slug = (pf.slug as string) || '';
        if (!slug) continue;

        const pName = (pf.programName as string) || '';
        if (useSSE) sendProgress(res, 'AI 분석 중', i + 1, phase4Total, pName, 5);

        const programInfo = {
          programName: pName,
          organizer: (pf.organizer as string) || '',
          supportType: (pf.supportType as string) || '',
          description: (pf.fullDescription as string) || (pf.description as string) || pc.substring(0, 500),
          expectedGrant: (pf.expectedGrant as number) || 0,
          officialEndDate: (pf.officialEndDate as string) || '',
          eligibilityCriteria: pf.eligibilityCriteria as string[],
          exclusionCriteria: pf.exclusionCriteria as string[],
          targetAudience: pf.targetAudience as string,
          evaluationCriteria: pf.evaluationCriteria as string[],
          requiredDocuments: pf.requiredDocuments as string[],
          supportDetails: Array.isArray(pf.supportDetails) ? (pf.supportDetails as string[]).join('; ') : pf.supportDetails as string,
          selectionProcess: pf.selectionProcess as string[],
          totalBudget: pf.totalBudget as string,
          projectPeriod: pf.projectPeriod as string,
          objectives: Array.isArray(pf.objectives) ? (pf.objectives as string[]).join('; ') : pf.objectives as string,
          categories: pf.categories as string[],
          keywords: pf.keywords as string[],
          department: pf.department as string,
          regions: pf.regions as string[],
        };

        const attachText = await loadAttachmentText(
          (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || []
        );

        const fitResult = await analyzeFit(companyInfoForFit, programInfo, attachText || undefined);

        // 분석 파일 저장
        const analysisPath = path.join('analysis', `${slug}-fit.md`);
        await writeNote(analysisPath, {
          slug,
          programName: pName,
          fitScore: fitResult.fitScore,
          eligibility: fitResult.eligibility,
          dimensions: fitResult.dimensions,
          analyzedAt: new Date().toISOString(),
        }, `# 적합도 분석: ${pName}\n\n${buildFitSectionMarkdown(fitResult, slug)}`);

        // 프로그램 노트 업데이트
        const fitSection = buildFitSectionMarkdown(fitResult, slug);
        const updatedContent = pc.replace(
          /\n## 적합도\n[\s\S]*?(?=\n## |\n---|\n\*데이터|$)/,
          fitSection
        );
        pf.fitScore = fitResult.fitScore;
        pf.eligibility = fitResult.eligibility;
        pf.dimensions = fitResult.dimensions;
        pf.keyActions = fitResult.keyActions;
        pf.analyzedAt = new Date().toISOString();
        pf.status = 'analyzed';
        await writeNote(file, pf, updatedContent.includes('## 적합도') ? updatedContent : pc + '\n' + fitSection);

        phase4Analyzed++;

        // 고적합도 → 전략 문서 생성
        if (fitResult.fitScore >= 80) {
          try {
            if (useSSE) sendProgress(res, '전략 문서 생성 중', i + 1, phase4Total, pName, 5);
            const strategy = await generateStrategyDocument(companyInfoForFit, programInfo, fitResult, attachText || undefined);
            const { frontmatter: sFm, content: sContent } = strategyToMarkdown(pName, slug, fitResult.fitScore, fitResult.dimensions, strategy);
            await writeNote(path.join('strategies', `전략-${slug}.md`), sFm, sContent);
            phase4Strategies++;
            await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
            console.warn(`[vault/sync] Phase 4 전략 생성 실패 (${slug}):`, e);
          }
        }

        // Gemini rate limit (지역 불일치로 스킵된 경우 대기 불필요)
        if (fitResult.fitScore > 5) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        console.warn(`[vault/sync] Phase 4 분석 실패:`, e);
        phase4Errors++;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 결과
    // ═══════════════════════════════════════════════════════════
    const resultData = {
      success: true,
      totalFetched: filterStats.totalFetched,
      afterFiltering: filterStats.finalCount,
      filteredByRegion: filterStats.filteredByRegion,
      filteredByStartup: filterStats.filteredByStartup,
      created,
      updated,
      preScreenPassed,
      preScreenRejected,
      phase2Crawled: phase2Count,
      phase3Enriched: phase3Count,
      attachmentsDownloaded: phase3Attachments,
      phase4Analyzed,
      phase4Errors,
      phase4Strategies,
      cleanedDuplicates,
      cleanedStartup,
      cleanedRegion,
      syncedAt: new Date().toISOString(),
    };

    if (useSSE) {
      sendComplete(res, resultData);
    } else {
      res.json(resultData);
    }
  } catch (error) {
    console.error('[vault/sync] Error:', error);
    if (useSSE) {
      sendError(res, `동기화 실패: ${String(error)}`);
    } else {
      res.status(500).json({ error: '동기화 실패', details: String(error) });
    }
  }
});

/**
 * POST /api/vault/deep-crawl/:slug
 * 단일 프로그램 딥크롤 (수동 트리거)
 */
router.post('/deep-crawl/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter: pf, content: _pc } = await readNote(programPath);
    const detailUrl = pf.detailUrl as string;

    if (!detailUrl) {
      res.status(400).json({ error: '공고 URL이 없습니다.' });
      return;
    }

    // frontmatter에서 API 데이터 복원
    const apiDataForCrawl: Partial<ServerSupportProgram> = {
      programName: pf.programName as string,
      organizer: pf.organizer as string,
      supportType: pf.supportType as string,
      description: pf.description as string || '',
      targetAudience: pf.targetAudience as string || undefined,
      applicationMethod: pf.applicationMethod as string || undefined,
      contactInfo: pf.contactInfo as string || undefined,
      supportScale: pf.supportScale as string || undefined,
      requiredDocuments: pf.requiredDocuments as string[] || [],
      evaluationCriteria: pf.evaluationCriteria as string[] || [],
      regions: pf.regions as string[] || [],
      categories: pf.categories as string[] || [],
    };

    const { crawlResult, attachments } = await deepCrawlProgramFull(
      detailUrl,
      pf.programName as string,
      slug,
      apiDataForCrawl
    );

    if (!crawlResult) {
      res.status(502).json({ error: '딥크롤 실패: 상세페이지를 분석할 수 없습니다.' });
      return;
    }

    // frontmatter 업데이트 (기존 fitScore/eligibility 유지)
    const updatedFm: Record<string, unknown> = {
      ...pf,
      type: 'program',
      department: crawlResult.department || pf.department || '',
      supportScale: crawlResult.supportScale || pf.supportScale || '',
      targetAudience: crawlResult.targetAudience || pf.targetAudience || '',
      applicationStart: crawlResult.applicationPeriod?.start || pf.applicationStart || '',
      deepCrawledAt: new Date().toISOString(),
      status: pf.status === 'analyzed' ? 'analyzed' : 'deep_crawled',
      regions: crawlResult.regions || pf.regions as string[] || [],
      categories: crawlResult.categories || pf.categories as string[] || [],
      tags: ['program', pf.supportType as string, ...(crawlResult.categories || pf.categories as string[] || [])],
      requiredDocuments: crawlResult.requiredDocuments || pf.requiredDocuments as string[] || [],
      evaluationCriteria: crawlResult.evaluationCriteria || pf.evaluationCriteria as string[] || [],
      applicationMethod: crawlResult.applicationMethod || pf.applicationMethod || '',
      contactInfo: crawlResult.contactInfo || pf.contactInfo || '',
      attachments: attachments.map(a => ({
        path: a.path,
        name: a.name,
        analyzed: a.analyzed,
      })),
      // 고도화 추가 필드 (sync와 동일하게)
      matchingRatio: crawlResult.matchingRatio || pf.matchingRatio || '',
      totalBudget: crawlResult.totalBudget || pf.totalBudget || '',
      projectPeriod: crawlResult.projectPeriod || pf.projectPeriod || '',
      selectionDate: crawlResult.selectionDate || pf.selectionDate || '',
      announcementDate: crawlResult.announcementDate || pf.announcementDate || '',
      applicationUrl: crawlResult.applicationUrl || pf.applicationUrl || '',
      contactPhone: crawlResult.contactPhone || pf.contactPhone || '',
      contactEmail: crawlResult.contactEmail || pf.contactEmail || '',
      keywords: crawlResult.keywords || pf.keywords as string[] || [],
      dataQualityScore: crawlResult.dataQualityScore || 0,
      dataSources: crawlResult.dataSources || [pf.source],
      exclusionCriteria: crawlResult.exclusionCriteria || pf.exclusionCriteria as string[] || [],
      specialNotes: crawlResult.specialNotes || pf.specialNotes as string[] || [],
      fullDescription: crawlResult.fullDescription || pf.fullDescription || pf.description || '',
    };

    // 마크다운 재생성
    const programData: ServerSupportProgram = {
      id: pf.id as string,
      organizer: pf.organizer as string,
      programName: pf.programName as string,
      supportType: pf.supportType as string,
      officialEndDate: pf.officialEndDate as string,
      internalDeadline: pf.internalDeadline as string,
      expectedGrant: pf.expectedGrant as number,
      fitScore: pf.fitScore as number,
      eligibility: pf.eligibility as string,
      priorityRank: 99,
      eligibilityReason: '',
      requiredDocuments: crawlResult.requiredDocuments || [],
      description: pf.description as string || '',
      successProbability: '',
      detailUrl: detailUrl,
      source: pf.source as string,
    };

    const content = programToMarkdown(programData, crawlResult, attachments);
    await writeNote(programPath, updatedFm, content);

    res.json({
      success: true,
      deepCrawled: true,
      attachmentsDownloaded: attachments.length,
      crawlResult,
    });
  } catch (error) {
    console.error('[vault/deep-crawl] Error:', error);
    res.status(500).json({ error: '딥크롤 실패', details: String(error) });
  }
});

/**
 * GET /api/vault/programs
 * 전체 프로그램 목록 (frontmatter 배열)
 */
router.get('/programs', async (_req: Request, res: Response) => {
  try {
    const files = await listNotes(path.join(getVaultRoot(), 'programs'));

    const programs: Record<string, unknown>[] = [];
    for (const file of files) {
      try {
        const { frontmatter } = await readNote(file);
        programs.push(frontmatter);
      } catch (e) {
        console.warn('[vault/programs] Failed to read:', file, e);
      }
    }

    // fitScore 내림차순 정렬
    programs.sort((a, b) => (Number(b.fitScore) || 0) - (Number(a.fitScore) || 0));

    res.json({ programs, total: programs.length });
  } catch (error) {
    console.error('[vault/programs] Error:', error);
    res.status(500).json({ error: '프로그램 목록 조회 실패' });
  }
});

/**
 * GET /api/vault/program/:slug
 * 프로그램 상세 (frontmatter + content)
 */
router.get('/program/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const filePath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(filePath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter, content } = await readNote(filePath);
    res.json({ frontmatter, content });
  } catch (error) {
    console.error('[vault/program] Error:', error);
    res.status(500).json({ error: '프로그램 조회 실패' });
  }
});

/**
 * POST /api/vault/analyze/:slug
 * 단일 프로그램 적합도 분석
 */
router.post('/analyze/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const companyPath = path.join('company', 'profile.md');
    let company: Record<string, unknown> = {};
    if (await noteExists(companyPath)) {
      const { frontmatter } = await readNote(companyPath);
      company = frontmatter;
    }

    const { frontmatter: programFm, content: programContent } = await readNote(programPath);

    const companyInfo = {
      name: (company.name as string) || '미등록 기업',
      industry: company.industry as string,
      description: company.description as string,
      revenue: company.revenue as number,
      employees: company.employees as number,
      address: company.address as string,
      certifications: company.certifications as string[],
      coreCompetencies: company.coreCompetencies as string[],
      ipList: company.ipList as string[],
      history: company.history as string,
      foundedYear: company.foundedYear as number,
      businessType: company.businessType as string,
      mainProducts: company.mainProducts as string[],
      financialTrend: company.financialTrend as string,
    };

    const programInfo = {
      programName: programFm.programName as string,
      organizer: programFm.organizer as string,
      supportType: programFm.supportType as string,
      description: (programFm.fullDescription as string) || (programFm.description as string) || programContent.substring(0, 500),
      expectedGrant: programFm.expectedGrant as number,
      officialEndDate: programFm.officialEndDate as string,
      eligibilityCriteria: programFm.eligibilityCriteria as string[],
      exclusionCriteria: programFm.exclusionCriteria as string[],
      targetAudience: programFm.targetAudience as string,
      evaluationCriteria: programFm.evaluationCriteria as string[],
      requiredDocuments: programFm.requiredDocuments as string[],
      supportDetails: Array.isArray(programFm.supportDetails) ? (programFm.supportDetails as string[]).join('; ') : programFm.supportDetails as string,
      selectionProcess: programFm.selectionProcess as string[],
      totalBudget: programFm.totalBudget as string,
      projectPeriod: programFm.projectPeriod as string,
      objectives: Array.isArray(programFm.objectives) ? (programFm.objectives as string[]).join('; ') : programFm.objectives as string,
      categories: programFm.categories as string[],
      keywords: programFm.keywords as string[],
      department: programFm.department as string,
      regions: programFm.regions as string[],
    };

    const attachmentText = await loadAttachmentText(
      (programFm.attachments as { path: string; name: string; analyzed: boolean }[]) || []
    );

    const result = await analyzeFit(companyInfo, programInfo, attachmentText || undefined);

    const analysisPath = path.join('analysis', `${slug}-fit.md`);
    await writeNote(
      analysisPath,
      {
        slug,
        programName: programFm.programName,
        fitScore: result.fitScore,
        eligibility: result.eligibility,
        dimensions: result.dimensions,
        analyzedAt: new Date().toISOString(),
      },
      `# 적합도 분석: ${programFm.programName}\n\n${buildFitSectionMarkdown(result, slug)}`
    );

    // 프로그램 MD의 적합도 섹션 업데이트
    const fitSection = buildFitSectionMarkdown(result, slug);
    const updatedContent = programContent.replace(
      /\n## 적합도\n[\s\S]*?(?=\n## |\n---|\n\*데이터|$)/,
      fitSection
    );

    programFm.fitScore = result.fitScore;
    programFm.eligibility = result.eligibility;
    programFm.dimensions = result.dimensions;
    programFm.keyActions = result.keyActions;
    programFm.analyzedAt = new Date().toISOString();
    programFm.status = 'analyzed';
    await writeNote(programPath, programFm, updatedContent);

    // fitScore >= 80이면 전략 문서 자동 생성
    let strategyGenerated = false;
    if (result.fitScore >= 80) {
      try {
        const strategy = await generateStrategyDocument(companyInfo, programInfo, result, attachmentText || undefined);
        const { frontmatter: sFm, content: sContent } = strategyToMarkdown(
          programFm.programName as string, slug, result.fitScore, result.dimensions, strategy
        );
        await writeNote(path.join('strategies', `전략-${slug}.md`), sFm, sContent);
        strategyGenerated = true;
      } catch (e) {
        console.warn('[vault/analyze] 전략 문서 생성 실패:', e);
      }
    }

    res.json({ success: true, result, strategyGenerated });
  } catch (error) {
    console.error('[vault/analyze] Error:', error);
    res.status(500).json({ error: '분석 실패', details: String(error) });
  }
});

/**
 * POST /api/vault/analyze-all
 * 전체 프로그램 일괄 분석 (순차, 2초 간격)
 */
router.post('/analyze-all', async (req: Request, res: Response) => {
  const useSSE = req.headers.accept === 'text/event-stream';

  try {
    if (useSSE) initSSE(res);

    const files = await listNotes(path.join(getVaultRoot(), 'programs'));
    const total = files.length;
    const results: { slug: string; fitScore: number; eligibility: string }[] = [];
    let errors = 0;

    // 기업 정보 1회만 로드
    const companyPath = path.join('company', 'profile.md');
    let company: Record<string, unknown> = {};
    if (await noteExists(companyPath)) {
      const { frontmatter: cf } = await readNote(companyPath);
      company = cf;
    }

    const companyInfo = {
      name: (company.name as string) || '미등록 기업',
      industry: company.industry as string,
      description: company.description as string,
      revenue: company.revenue as number,
      employees: company.employees as number,
      address: company.address as string,
      certifications: company.certifications as string[],
      coreCompetencies: company.coreCompetencies as string[],
      ipList: company.ipList as string[],
      history: company.history as string,
      foundedYear: company.foundedYear as number,
      businessType: company.businessType as string,
      mainProducts: company.mainProducts as string[],
      financialTrend: company.financialTrend as string,
    };

    let strategiesGenerated = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const { frontmatter } = await readNote(file);
        const slug = frontmatter.slug as string;

        if (!slug) continue;

        const { frontmatter: pf, content: pc } = await readNote(file);

        if (useSSE) sendProgress(res, 'AI 분석 중', i + 1, total, pf.programName as string);

        const programInfo = {
          programName: pf.programName as string,
          organizer: pf.organizer as string,
          supportType: pf.supportType as string,
          description: (pf.fullDescription as string) || (pf.description as string) || pc.substring(0, 500),
          expectedGrant: pf.expectedGrant as number,
          officialEndDate: pf.officialEndDate as string,
          eligibilityCriteria: pf.eligibilityCriteria as string[],
          exclusionCriteria: pf.exclusionCriteria as string[],
          targetAudience: pf.targetAudience as string,
          evaluationCriteria: pf.evaluationCriteria as string[],
          requiredDocuments: pf.requiredDocuments as string[],
          supportDetails: Array.isArray(pf.supportDetails) ? (pf.supportDetails as string[]).join('; ') : pf.supportDetails as string,
          selectionProcess: pf.selectionProcess as string[],
          totalBudget: pf.totalBudget as string,
          projectPeriod: pf.projectPeriod as string,
          objectives: Array.isArray(pf.objectives) ? (pf.objectives as string[]).join('; ') : pf.objectives as string,
          categories: pf.categories as string[],
          keywords: pf.keywords as string[],
          department: pf.department as string,
          regions: pf.regions as string[],
        };

        const attachmentText = await loadAttachmentText(
          (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || []
        );

        const result = await analyzeFit(companyInfo, programInfo, attachmentText || undefined);

        const analysisPath = path.join('analysis', `${slug}-fit.md`);
        await writeNote(
          analysisPath,
          {
            slug,
            programName: pf.programName,
            fitScore: result.fitScore,
            eligibility: result.eligibility,
            dimensions: result.dimensions,
            analyzedAt: new Date().toISOString(),
          },
          `# 적합도 분석: ${pf.programName}\n\n${buildFitSectionMarkdown(result, slug)}`
        );

        // 프로그램 MD 적합도 섹션 업데이트
        const fitSection = buildFitSectionMarkdown(result, slug);
        const updatedContent = pc.replace(
          /\n## 적합도\n[\s\S]*?(?=\n## |\n---|\n\*데이터|$)/,
          fitSection
        );

        pf.fitScore = result.fitScore;
        pf.eligibility = result.eligibility;
        pf.dimensions = result.dimensions;
        pf.keyActions = result.keyActions;
        pf.analyzedAt = new Date().toISOString();
        pf.status = 'analyzed';
        await writeNote(file, pf, updatedContent);

        results.push({ slug, fitScore: result.fitScore, eligibility: result.eligibility as string });

        // fitScore >= 80이면 전략 문서 생성
        if (result.fitScore >= 80) {
          try {
            if (useSSE) sendProgress(res, '전략 문서 생성 중', i + 1, total, pf.programName as string);
            const strategy = await generateStrategyDocument(companyInfo, programInfo, result, attachmentText || undefined);
            const { frontmatter: sFm, content: sContent } = strategyToMarkdown(
              pf.programName as string, slug, result.fitScore, result.dimensions, strategy
            );
            await writeNote(path.join('strategies', `전략-${slug}.md`), sFm, sContent);
            strategiesGenerated++;
            await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
            console.warn(`[vault/analyze-all] 전략 문서 생성 실패 (${slug}):`, e);
          }
        }

        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error('[vault/analyze-all] Error for file:', file, e);
        errors++;
      }
    }

    const resultData = { success: true, analyzed: results.length, errors, strategiesGenerated, results };

    if (useSSE) {
      sendComplete(res, resultData);
    } else {
      res.json(resultData);
    }
  } catch (error) {
    console.error('[vault/analyze-all] Error:', error);
    if (useSSE) {
      sendError(res, `일괄 분석 실패: ${String(error)}`);
    } else {
      res.status(500).json({ error: '일괄 분석 실패' });
    }
  }
});

/**
 * POST /api/vault/download-pdf/:slug
 * PDF 다운로드 + AI 분석
 */
router.post('/download-pdf/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter } = await readNote(programPath);
    const detailUrl = frontmatter.detailUrl as string;

    if (!detailUrl) {
      res.status(400).json({ error: '공고 URL이 없습니다.' });
      return;
    }

    let pdfBase64 = '';
    try {
      const response = await fetch(detailUrl);
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('pdf')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeBinaryFile(
          path.join('attachments', 'pdfs', `${slug}.pdf`),
          buffer
        );
        pdfBase64 = buffer.toString('base64');
      } else {
        const html = await response.text();
        pdfBase64 = Buffer.from(html.substring(0, 30000)).toString('base64');
      }
    } catch (e) {
      console.warn('[vault/download-pdf] Download failed:', e);
      res.status(502).json({ error: 'PDF 다운로드 실패' });
      return;
    }

    const analysis = await analyzePdf(pdfBase64, frontmatter.programName as string);

    const analysisPath = path.join('attachments', 'pdf-analysis', `${slug}.md`);
    await writeNote(
      analysisPath,
      {
        slug,
        programName: frontmatter.programName,
        analyzedAt: new Date().toISOString(),
      },
      `# PDF 분석: ${frontmatter.programName}

## 요약
${analysis.summary}

## 지원 자격
${analysis.requirements.map(r => `- ${r}`).join('\n')}

## 필수 서류
${analysis.qualifications.map(q => `- ${q}`).join('\n')}

## 예산
${analysis.budget}

## 일정
${analysis.schedule}

## 핵심 사항
${analysis.keyPoints.map(k => `- ${k}`).join('\n')}
`
    );

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('[vault/download-pdf] Error:', error);
    res.status(500).json({ error: 'PDF 분석 실패' });
  }
});

/**
 * POST /api/vault/analyze-sections/:slug
 * 공고별 동적 섹션 스키마 분석
 * 첨부파일 중 지원서 양식 PDF → 텍스트 추출 → AI 분석에 포함
 */
router.post('/analyze-sections/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter: pf, content: pc } = await readNote(programPath);

    // PDF 분석 결과 읽기
    let pdfAnalysis = '';
    const pdfAnalysisPath = path.join('attachments', 'pdf-analysis', `${slug}.md`);
    if (await noteExists(pdfAnalysisPath)) {
      const { content: pdc } = await readNote(pdfAnalysisPath);
      pdfAnalysis = pdc;
    }

    // 첨부파일 중 지원서 양식 PDF 탐색 및 텍스트 추출
    let applicationFormText = '';
    const attachments = (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [];
    const formPatterns = ['서식', '양식', '지원서', '신청서', '사업계획서', '작성', '신청양식', '제출서류'];
    const formAttachments = attachments.filter(a =>
      formPatterns.some(pattern => a.name.includes(pattern)) && a.path.endsWith('.pdf')
    );

    if (formAttachments.length > 0) {
      const vaultRoot = getVaultRoot();
      for (const att of formAttachments.slice(0, 2)) {
        try {
          const pdfPath = path.join(vaultRoot, att.path);
          const pdfBuffer = await fs.readFile(pdfPath);
          const base64 = pdfBuffer.toString('base64');
          const analysis = await analyzePdf(base64, `${pf.programName} - ${att.name}`);
          applicationFormText += `\n\n[지원서 양식: ${att.name}]\n${analysis.summary}\n필수 항목: ${analysis.qualifications.join(', ')}\n핵심 사항: ${analysis.keyPoints.join(', ')}`;
        } catch (e) {
          console.warn(`[vault/analyze-sections] 양식 PDF 분석 실패: ${att.name}`, e);
        }
      }
    }

    // raw txt 파일도 로드하여 컨텍스트 보강
    const rawAttachmentText = await loadAttachmentText(attachments, 4000);
    const combinedPdfAnalysis = [pdfAnalysis, applicationFormText, rawAttachmentText].filter(Boolean).join('\n');

    const result = await analyzeSections(
      {
        programName: pf.programName as string,
        evaluationCriteria: pf.evaluationCriteria as string[] || [],
        requiredDocuments: pf.requiredDocuments as string[] || [],
        objectives: pf.objectives as string[] || [],
        supportDetails: pf.supportDetails as string[] || [],
        selectionProcess: pf.selectionProcess as string[] || [],
        fullDescription: pf.fullDescription as string || pf.description as string || '',
        targetAudience: pf.targetAudience as string || '',
      },
      combinedPdfAnalysis,
      pc.substring(0, 3000)
    );

    res.json(result);
  } catch (error) {
    console.error('[vault/analyze-sections] Error:', error);
    res.status(500).json({ error: '섹션 분석 실패', details: String(error) });
  }
});

/**
 * POST /api/vault/generate-app/:slug
 * 지원서 자동 생성 (동적 섹션 + 리뷰 + 일관성)
 */
router.post('/generate-app/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const companyPath = path.join('company', 'profile.md');
    let company: Record<string, unknown> = {};
    if (await noteExists(companyPath)) {
      const { frontmatter } = await readNote(companyPath);
      company = frontmatter;
    }

    const { frontmatter: pf, content: pc } = await readNote(programPath);

    let analysisContext = '';
    const analysisPath = path.join('analysis', `${slug}-fit.md`);
    if (await noteExists(analysisPath)) {
      const { content: ac } = await readNote(analysisPath);
      analysisContext = ac;
    }

    let pdfContext = '';
    const pdfAnalysisPath = path.join('attachments', 'pdf-analysis', `${slug}.md`);
    if (await noteExists(pdfAnalysisPath)) {
      const { content: pdc } = await readNote(pdfAnalysisPath);
      pdfContext = pdc;
    }

    // raw txt 파일도 로드하여 컨텍스트 보강
    const rawAttachmentText = await loadAttachmentText(
      (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [], 4000
    );

    const fullContext = [analysisContext, pdfContext, rawAttachmentText].filter(Boolean).join('\n\n');

    const companyInfo = {
      name: (company.name as string) || '미등록 기업',
      industry: company.industry as string,
      description: company.description as string,
      revenue: company.revenue as number,
      employees: company.employees as number,
      address: company.address as string,
      certifications: company.certifications as string[],
      coreCompetencies: company.coreCompetencies as string[],
    };

    const programInfo = {
      programName: pf.programName as string,
      organizer: pf.organizer as string,
      supportType: pf.supportType as string,
      description: (pf.description as string) || pc.substring(0, 500),
      expectedGrant: pf.expectedGrant as number,
      officialEndDate: pf.officialEndDate as string,
    };

    // 동적 섹션 스키마 분석
    const schemaResult = await analyzeSections(
      {
        programName: pf.programName as string,
        evaluationCriteria: pf.evaluationCriteria as string[] || [],
        requiredDocuments: pf.requiredDocuments as string[] || [],
        objectives: pf.objectives as string[] || [],
        supportDetails: pf.supportDetails as string[] || [],
        selectionProcess: pf.selectionProcess as string[] || [],
        fullDescription: pf.fullDescription as string || pf.description as string || '',
        targetAudience: pf.targetAudience as string || '',
      },
      pdfContext,
      pc.substring(0, 3000)
    );

    const sectionSchema = schemaResult.sections;
    const sections: Record<string, string> = {};

    for (const sec of sectionSchema) {
      const result = await generateDraftSectionV2(companyInfo, programInfo, sec.title, fullContext, {
        evaluationCriteria: pf.evaluationCriteria as string[] || [],
        hints: sec.hints,
        evaluationWeight: sec.evaluationWeight,
        sectionDescription: sec.description,
      });
      sections[sec.id] = result.text;
      await new Promise(r => setTimeout(r, 2000));
    }

    const appDir = path.join('applications', slug);
    const draftContent = sectionSchema
      .map(sec => `## ${sec.title}\n\n${sections[sec.id] || ''}`)
      .join('\n\n---\n\n');

    await writeNote(
      path.join(appDir, 'draft.md'),
      {
        slug,
        programName: pf.programName,
        generatedAt: new Date().toISOString(),
        status: 'draft',
        sectionSchema: {
          programSlug: slug,
          sections: sectionSchema,
          generatedAt: new Date().toISOString(),
          source: schemaResult.source,
        },
        sections: sectionSchema.map(s => s.id),
      },
      `# 지원서 초안: ${pf.programName}\n\n${draftContent}`
    );

    // 리뷰용: section ID → title 매핑
    const reviewSections: Record<string, string> = {};
    for (const sec of sectionSchema) {
      reviewSections[sec.title] = sections[sec.id] || '';
    }

    await new Promise(r => setTimeout(r, 2000));
    const reviewResult = await reviewDraft(reviewSections);

    await writeNote(
      path.join(appDir, 'review.md'),
      {
        slug,
        totalScore: reviewResult.totalScore,
        reviewedAt: new Date().toISOString(),
        ...reviewResult.scores,
      },
      `# 리뷰 결과: ${pf.programName}

## 총점: ${reviewResult.totalScore}/100

## 세부 점수
- 기술성: ${reviewResult.scores.technology}
- 사업성: ${reviewResult.scores.marketability}
- 독창성: ${reviewResult.scores.originality}
- 수행역량: ${reviewResult.scores.capability}
- 사회적 가치: ${reviewResult.scores.socialValue}

## 피드백
${reviewResult.feedback.map(f => `- ${f}`).join('\n')}
`
    );

    await new Promise(r => setTimeout(r, 2000));
    const consistencyResult = await checkConsistency(reviewSections);

    await writeNote(
      path.join(appDir, 'consistency.md'),
      {
        slug,
        score: consistencyResult.score,
        checkedAt: new Date().toISOString(),
      },
      `# 일관성 검사: ${pf.programName}

## 점수: ${consistencyResult.score}/100

## 발견된 문제
${consistencyResult.issues.map(i => `- [${i.severity}] ${i.section}: ${i.description}`).join('\n')}

## 개선 제안
${consistencyResult.suggestion}
`
    );

    pf.status = 'applied';
    await writeNote(programPath, pf, pc);

    res.json({
      success: true,
      sections,
      sectionSchema: {
        programSlug: slug,
        sections: sectionSchema,
        generatedAt: new Date().toISOString(),
        source: schemaResult.source,
      },
      review: reviewResult,
      consistency: consistencyResult,
    });
  } catch (error) {
    console.error('[vault/generate-app] Error:', error);
    res.status(500).json({ error: '지원서 생성 실패', details: String(error) });
  }
});

/**
 * GET /api/vault/applications
 * 생성된 지원서 목록
 */
router.get('/applications', async (_req: Request, res: Response) => {
  try {
    const vaultRoot = getVaultRoot();
    const appsDir = path.join(vaultRoot, 'applications');

    const files = await listNotes(appsDir);
    const applications: Record<string, unknown>[] = [];

    const draftFiles = files.filter(f => f.endsWith('draft.md'));

    for (const file of draftFiles) {
      try {
        const { frontmatter } = await readNote(file);
        applications.push(frontmatter);
      } catch (e) {
        console.warn('[vault/applications] Failed to read:', file, e);
      }
    }

    res.json({ applications, total: applications.length });
  } catch (error) {
    console.error('[vault/applications] Error:', error);
    res.status(500).json({ error: '지원서 목록 조회 실패' });
  }
});

/**
 * GET /api/vault/application/:slug
 * 지원서 상세
 */
router.get('/application/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const draftPath = path.join('applications', slug, 'draft.md');

    if (!(await noteExists(draftPath))) {
      res.status(404).json({ error: '지원서를 찾을 수 없습니다.' });
      return;
    }

    const draft = await readNote(draftPath);

    let review: { frontmatter: Record<string, unknown>; content: string } | null = null;
    let consistency: { frontmatter: Record<string, unknown>; content: string } | null = null;

    const reviewPath = path.join('applications', slug, 'review.md');
    if (await noteExists(reviewPath)) {
      review = await readNote(reviewPath);
    }

    const consistencyPath = path.join('applications', slug, 'consistency.md');
    if (await noteExists(consistencyPath)) {
      consistency = await readNote(consistencyPath);
    }

    res.json({
      draft: { frontmatter: draft.frontmatter, content: draft.content },
      review: review ? { frontmatter: review.frontmatter, content: review.content } : null,
      consistency: consistency
        ? { frontmatter: consistency.frontmatter, content: consistency.content }
        : null,
    });
  } catch (error) {
    console.error('[vault/application] Error:', error);
    res.status(500).json({ error: '지원서 조회 실패' });
  }
});

/**
 * PUT /api/vault/application/:slug
 * 지원서 편집
 */
router.put('/application/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const { sections } = req.body as { sections: Record<string, string> };

    if (!sections) {
      res.status(400).json({ error: 'sections 필드가 필요합니다.' });
      return;
    }

    const draftPath = path.join('applications', slug, 'draft.md');

    if (!(await noteExists(draftPath))) {
      res.status(404).json({ error: '지원서를 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter } = await readNote(draftPath);
    frontmatter.updatedAt = new Date().toISOString();
    frontmatter.status = 'edited';

    const draftContent = Object.entries(sections)
      .map(([title, text]) => `## ${title}\n\n${text}`)
      .join('\n\n---\n\n');

    await writeNote(
      draftPath,
      frontmatter,
      `# 지원서: ${frontmatter.programName}\n\n${draftContent}`
    );

    res.json({ success: true, updatedAt: frontmatter.updatedAt });
  } catch (error) {
    console.error('[vault/application PUT] Error:', error);
    res.status(500).json({ error: '지원서 저장 실패' });
  }
});

/**
 * PUT /api/vault/company
 * 기업 정보 저장
 */
router.put('/company', async (req: Request, res: Response) => {
  try {
    const companyData = req.body as Record<string, unknown>;

    await ensureVaultStructure();
    const companyPath = path.join('company', 'profile.md');

    const content = `# ${companyData.name || '기업 프로필'}

## 기본 정보
- **사업자번호**: ${companyData.businessNumber || ''}
- **업종**: ${companyData.industry || ''}
- **주소**: ${companyData.address || ''}
- **매출액**: ${companyData.revenue ? (Number(companyData.revenue) / 100000000).toFixed(1) + '억원' : ''}
- **직원수**: ${companyData.employees || 0}명

## 기업 설명
${companyData.description || ''}

## 핵심 역량
${(companyData.coreCompetencies as string[] || []).map(c => `- ${c}`).join('\n')}

## 보유 인증
${(companyData.certifications as string[] || []).map(c => `- ${c}`).join('\n')}
`;

    await writeNote(companyPath, companyData, content);
    res.json({ success: true });
  } catch (error) {
    console.error('[vault/company PUT] Error:', error);
    res.status(500).json({ error: '기업 정보 저장 실패' });
  }
});

/**
 * GET /api/vault/company
 * 기업 정보 읽기
 */
router.get('/company', async (_req: Request, res: Response) => {
  try {
    const companyPath = path.join('company', 'profile.md');

    if (!(await noteExists(companyPath))) {
      res.json({ company: null });
      return;
    }

    const { frontmatter, content } = await readNote(companyPath);
    res.json({ company: frontmatter, content });
  } catch (error) {
    console.error('[vault/company GET] Error:', error);
    res.status(500).json({ error: '기업 정보 조회 실패' });
  }
});

/**
 * POST /api/vault/company/research
 * 기업명으로 AI 딥리서치 → 기업 정보 자동 입력
 */
router.post('/company/research', async (req: Request, res: Response) => {
  try {
    const { companyName } = req.body as { companyName: string };

    if (!companyName || companyName.trim().length < 2) {
      res.status(400).json({ error: '기업명을 입력해주세요 (2글자 이상).' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다. 서버 환경 변수를 확인하세요.' });
      return;
    }

    const prompt = `당신은 한국 기업 정보 전문 리서처입니다.

## 작업
"${companyName.trim()}" 기업에 대해 알고 있는 모든 정보를 아래 JSON 형식으로 정리하세요.

## 규칙
1. 정확히 확인된 정보만 포함. 추측은 하지 마세요.
2. 모르는 필드는 빈 문자열, 빈 배열 또는 null로 유지
3. 매출액은 원(KRW) 단위 숫자로 반환 (예: 10억 = 1000000000)
4. 사업자등록번호는 "000-00-00000" 형식
5. 핵심역량과 인증은 구체적으로 작성
6. SWOT 분석은 각 항목 3~5개씩 구체적으로 작성
7. 정부지원금 적합성은 해당 기업의 실제 강점을 기반으로 분석

반드시 아래 JSON 형식만 반환하세요:
{
  "name": "정식 법인명",
  "brandName": "브랜드명",
  "businessNumber": "사업자등록번호",
  "representative": "대표자명",
  "foundedDate": "설립일 (YYYY-MM-DD)",
  "industry": "업종 (업태/종목)",
  "address": "본사 주소",
  "factoryAddress": "공장/생산시설 주소",
  "revenue": 0,
  "employees": 0,
  "description": "기업 소개 (3~5문장)",
  "coreCompetencies": ["핵심역량1", "핵심역량2"],
  "certifications": ["인증1", "인증2"],
  "mainProducts": ["주요 제품/서비스1"],
  "phone": "대표 전화번호",
  "email": "대표 이메일",
  "website": "홈페이지 URL",
  "vision": "기업 비전/미션",
  "salesChannels": ["유통채널1"],
  "history": "기업 연혁 요약 (설립배경, 주요 이정표)",
  "strategicAnalysis": {
    "swot": {
      "strengths": ["강점1", "강점2", "강점3"],
      "weaknesses": ["약점1", "약점2"],
      "opportunities": ["기회1", "기회2"],
      "threats": ["위협1", "위협2"]
    },
    "competitiveAdvantage": "핵심 경쟁우위 설명",
    "growthPotential": "성장 잠재력 평가",
    "riskFactors": ["리스크1", "리스크2"]
  },
  "marketPosition": {
    "competitors": ["경쟁사1", "경쟁사2"],
    "marketShare": "시장점유율 추정",
    "uniqueSellingPoints": ["차별화 포인트1"]
  },
  "industryInsights": {
    "marketTrends": ["시장 트렌드1"],
    "industryOutlook": "산업 전망",
    "regulatoryEnvironment": "규제 환경",
    "technologyTrends": ["기술 트렌드1"]
  },
  "governmentFundingFit": {
    "recommendedPrograms": ["추천 지원사업1", "추천 지원사업2"],
    "eligibilityStrengths": ["지원 자격 강점1"],
    "potentialChallenges": ["도전과제1"],
    "applicationTips": "지원 시 조언"
  },
  "financialInfo": {
    "recentRevenue": 0,
    "revenueGrowth": "매출 성장률",
    "financials": []
  },
  "employmentInfo": {
    "averageSalary": 0,
    "creditRating": "",
    "benefits": ["복리후생1"],
    "turnoverRate": ""
  },
  "investmentInfo": {
    "totalRaised": "",
    "fundingRounds": [],
    "isBootstrapped": true
  },
  "ipList": []
}`;

    const result = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const parsed = cleanAndParseJSON(result.text) as Record<string, unknown>;

    // Vault에 리서치 결과 마크다운으로 저장
    try {
      const researchMd = generateResearchMarkdown(companyName.trim(), parsed);
      const researchPath = path.join('company', 'research.md');
      await writeNote(researchPath, {
        type: 'company-research',
        companyName: parsed.name || companyName.trim(),
        researchedAt: new Date().toISOString(),
      }, researchMd);
    } catch (e) {
      console.warn('[vault/company/research] Failed to save research markdown:', e);
    }

    res.json({ success: true, company: parsed });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[vault/company/research] Error:', errMsg, error instanceof Error ? error.stack : '');
    res.status(500).json({ error: '기업 리서치 실패', details: errMsg });
  }
});

// ─── Strategy (전략 문서) ─────────────────────────────────────

/**
 * GET /api/vault/strategy/:slug
 * 전략 문서 조회
 */
router.get('/strategy/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const strategyPath = path.join('strategies', `전략-${slug}.md`);

    if (!(await noteExists(strategyPath))) {
      res.status(404).json({ error: '전략 문서를 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter, content } = await readNote(strategyPath);
    res.json({ frontmatter, content });
  } catch (error) {
    console.error('[vault/strategy GET] Error:', error);
    res.status(500).json({ error: '전략 문서 조회 실패' });
  }
});

/**
 * POST /api/vault/generate-strategy/:slug
 * 수동 전략 문서 생성
 */
router.post('/generate-strategy/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const companyPath = path.join('company', 'profile.md');
    let company: Record<string, unknown> = {};
    if (await noteExists(companyPath)) {
      const { frontmatter: cf } = await readNote(companyPath);
      company = cf;
    }

    const { frontmatter: pf } = await readNote(programPath);

    if (!pf.fitScore || Number(pf.fitScore) === 0) {
      res.status(400).json({ error: '먼저 적합도 분석을 실행하세요.' });
      return;
    }

    const companyInfo = {
      name: (company.name as string) || '미등록 기업',
      industry: company.industry as string,
      description: company.description as string,
      revenue: company.revenue as number,
      employees: company.employees as number,
      address: company.address as string,
      certifications: company.certifications as string[],
      coreCompetencies: company.coreCompetencies as string[],
      ipList: company.ipList as string[],
      mainProducts: company.mainProducts as string[],
    };

    const programInfo = {
      programName: pf.programName as string,
      organizer: pf.organizer as string,
      supportType: pf.supportType as string,
      description: (pf.fullDescription as string) || (pf.description as string) || '',
      expectedGrant: pf.expectedGrant as number,
      officialEndDate: pf.officialEndDate as string,
      eligibilityCriteria: pf.eligibilityCriteria as string[],
      exclusionCriteria: pf.exclusionCriteria as string[],
      targetAudience: pf.targetAudience as string,
      evaluationCriteria: pf.evaluationCriteria as string[],
      requiredDocuments: pf.requiredDocuments as string[],
      supportDetails: Array.isArray(pf.supportDetails) ? (pf.supportDetails as string[]).join('; ') : pf.supportDetails as string,
      selectionProcess: pf.selectionProcess as string[],
      department: pf.department as string,
    };

    // fitAnalysis 결과 재구성 (frontmatter에서)
    const dims = (pf.dimensions || {}) as Record<string, number>;
    const fitAnalysis: FitAnalysisResult = {
      fitScore: Number(pf.fitScore) || 0,
      eligibility: (pf.eligibility as string) || '검토 필요',
      dimensions: {
        eligibilityMatch: dims.eligibilityMatch || 0,
        industryRelevance: dims.industryRelevance || 0,
        scaleFit: dims.scaleFit || 0,
        competitiveness: dims.competitiveness || 0,
        strategicAlignment: dims.strategicAlignment || 0,
      },
      eligibilityDetails: { met: [], unmet: [], unclear: [] },
      strengths: (pf.strengths as string[]) || [],
      weaknesses: (pf.weaknesses as string[]) || [],
      advice: '',
      recommendedStrategy: '',
      keyActions: (pf.keyActions as string[]) || [],
    };

    const attachmentText = await loadAttachmentText(
      (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || []
    );

    const strategy = await generateStrategyDocument(companyInfo, programInfo, fitAnalysis, attachmentText || undefined);
    const { frontmatter: sFm, content: sContent } = strategyToMarkdown(
      pf.programName as string, slug, fitAnalysis.fitScore, fitAnalysis.dimensions, strategy
    );
    await writeNote(path.join('strategies', `전략-${slug}.md`), sFm, sContent);

    res.json({ success: true, strategy });
  } catch (error) {
    console.error('[vault/generate-strategy] Error:', error);
    res.status(500).json({ error: '전략 문서 생성 실패', details: String(error) });
  }
});

// ─── Company Documents (기업 서류함) ─────────────────────────

interface VaultDocumentMeta {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  uploadDate: string;
  status: 'VALID' | 'EXPIRED' | 'REVIEW_NEEDED';
}

const DOCS_INDEX_PATH = path.join('company', 'documents', '_index.md');

async function readDocIndex(): Promise<VaultDocumentMeta[]> {
  if (!(await noteExists(DOCS_INDEX_PATH))) {
    await writeNote(DOCS_INDEX_PATH, { type: 'document-index', documents: [] }, '# 기업 서류 목록\n');
    return [];
  }
  const { frontmatter } = await readNote(DOCS_INDEX_PATH);
  return (frontmatter.documents as VaultDocumentMeta[]) || [];
}

async function writeDocIndex(documents: VaultDocumentMeta[]): Promise<void> {
  const content = documents.length > 0
    ? `# 기업 서류 목록\n\n${documents.map(d => `- **${d.name}** (${d.fileName}) - ${d.uploadDate}`).join('\n')}\n`
    : '# 기업 서류 목록\n\n등록된 서류가 없습니다.\n';
  await writeNote(DOCS_INDEX_PATH, { type: 'document-index', documents }, content);
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\[\](){}]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 60);
}

function detectFileType(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'PDF', hwp: 'HWP', doc: 'DOC', docx: 'DOCX',
    jpg: 'IMAGE', jpeg: 'IMAGE', png: 'IMAGE',
    zip: 'ZIP', xlsx: 'EXCEL', xls: 'EXCEL',
  };
  return map[ext.toLowerCase()] || 'OTHER';
}

/**
 * POST /api/vault/company/documents
 * 서류 업로드 (base64)
 */
router.post('/company/documents', async (req: Request, res: Response) => {
  try {
    const { name, fileName, fileData } = req.body as {
      name: string;
      fileName: string;
      fileData: string; // base64
    };

    if (!name || !fileName || !fileData) {
      res.status(400).json({ error: 'name, fileName, fileData가 필요합니다.' });
      return;
    }

    await ensureVaultStructure();

    const ext = fileName.split('.').pop() || '';
    const id = crypto.randomUUID().substring(0, 8);
    const sanitized = sanitizeFileName(fileName.replace(/\.[^.]+$/, ''));
    const storedFileName = `${id}-${sanitized}.${ext}`;
    const filePath = path.join('company', 'documents', storedFileName);

    // base64 → Buffer → 파일 저장
    const buffer = Buffer.from(fileData, 'base64');
    await writeBinaryFile(filePath, buffer);

    const doc: VaultDocumentMeta = {
      id,
      name,
      fileName: storedFileName,
      fileType: detectFileType(ext),
      uploadDate: new Date().toISOString(),
      status: 'VALID',
    };

    const documents = await readDocIndex();
    documents.push(doc);
    await writeDocIndex(documents);

    res.json({ success: true, document: doc });
  } catch (error) {
    console.error('[vault/company/documents POST] Error:', error);
    res.status(500).json({ error: '서류 업로드 실패', details: String(error) });
  }
});

/**
 * GET /api/vault/company/documents
 * 서류 목록 조회
 */
router.get('/company/documents', async (_req: Request, res: Response) => {
  try {
    const documents = await readDocIndex();

    // 각 문서의 파일 존재 여부 확인
    const vaultRoot = getVaultRoot();
    const verified: VaultDocumentMeta[] = [];
    for (const doc of documents) {
      const filePath = path.join(vaultRoot, 'company', 'documents', doc.fileName);
      try {
        await fs.access(filePath);
        verified.push(doc);
      } catch {
        verified.push({ ...doc, status: 'REVIEW_NEEDED' });
      }
    }

    res.json({ documents: verified });
  } catch (error) {
    console.error('[vault/company/documents GET] Error:', error);
    res.json({ documents: [] });
  }
});

/**
 * DELETE /api/vault/company/documents/:docId
 * 서류 삭제
 */
router.delete('/company/documents/:docId', async (req: Request, res: Response) => {
  try {
    const docId = String(req.params.docId);
    const documents = await readDocIndex();
    const doc = documents.find(d => d.id === docId);

    if (!doc) {
      res.status(404).json({ error: '서류를 찾을 수 없습니다.' });
      return;
    }

    // 파일 삭제
    await deleteBinaryFile(path.join('company', 'documents', doc.fileName));

    // 인덱스에서 제거
    const updated = documents.filter(d => d.id !== docId);
    await writeDocIndex(updated);

    res.json({ success: true });
  } catch (error) {
    console.error('[vault/company/documents DELETE] Error:', error);
    res.status(500).json({ error: '서류 삭제 실패', details: String(error) });
  }
});

/**
 * GET /api/vault/program/:slug/attachments
 * 프로그램 첨부파일 목록 + 서빙
 */
router.get('/program/:slug/attachments', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.json({ attachments: [] });
      return;
    }

    const { frontmatter } = await readNote(programPath);
    const attachments = (frontmatter.attachments as { path: string; name: string; analyzed: boolean }[]) || [];

    const result = attachments.map(a => ({
      name: a.name,
      path: a.path,
      analyzed: a.analyzed,
      downloadUrl: `/api/vault/attachment/${encodeURIComponent(a.path)}`,
    }));

    res.json({ attachments: result });
  } catch (error) {
    console.error('[vault/program/attachments] Error:', error);
    res.status(500).json({ error: '첨부파일 목록 조회 실패' });
  }
});

/**
 * GET /api/vault/attachment/:filePath
 * 첨부파일 다운로드 (PDF 등)
 */
router.get('/attachment/*', async (req: Request, res: Response) => {
  try {
    const filePath = req.params[0] || '';
    if (!filePath || filePath.includes('..')) {
      res.status(400).json({ error: '잘못된 경로입니다.' });
      return;
    }

    const vaultRoot = getVaultRoot();
    const fullPath = path.join(vaultRoot, filePath);

    // 보안: vault 루트 내부 파일만 허용
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(vaultRoot))) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }

    await fs.access(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.hwp': 'application/x-hwp',
      '.hwpx': 'application/x-hwpx',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.zip': 'application/zip',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`);

    const fileBuffer = await fs.readFile(fullPath);
    res.send(fileBuffer);
  } catch (error) {
    console.error('[vault/attachment] Error:', error);
    res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
});

/**
 * POST /api/vault/reprocess-attachments
 * 기존 첨부파일 일괄 재분석: magic bytes 타입 감지 → 텍스트 추출 → 확장자 수정
 */
router.post('/reprocess-attachments', async (req: Request, res: Response) => {
  initSSE(res);

  try {
    const vaultRoot = getVaultRoot();
    const pdfsDir = path.join(vaultRoot, 'attachments', 'pdfs');
    const analysisDir = path.join(vaultRoot, 'attachments', 'pdf-analysis');

    // 디렉토리 존재 확인
    try {
      await fs.access(pdfsDir);
    } catch {
      sendError(res, '첨부파일 디렉토리가 존재하지 않습니다.');
      return;
    }

    // 분석 결과 디렉토리 보장
    await fs.mkdir(analysisDir, { recursive: true });

    // 전체 파일 목록
    const allFiles = await fs.readdir(pdfsDir);
    const total = allFiles.length;

    if (total === 0) {
      sendComplete(res, { message: '처리할 첨부파일이 없습니다.', total: 0 });
      return;
    }

    sendProgress(res, 'scanning', 0, total, `총 ${total}개 파일 스캔 시작`);

    const stats = {
      total,
      pdf: 0,
      hwpx: 0,
      hwp5: 0,
      png: 0,
      zip: 0,
      docx: 0,
      unknown: 0,
      textExtracted: 0,
      renamed: 0,
      pngDeleted: 0,
      errors: 0,
    };

    const extMap: Record<DetectedFileType, string> = {
      pdf: 'pdf', hwpx: 'hwpx', hwp5: 'hwp', zip: 'zip', docx: 'docx', png: 'png', unknown: 'bin',
    };

    for (let i = 0; i < allFiles.length; i++) {
      const filename = allFiles[i];
      const filePath = path.join(pdfsDir, filename);

      try {
        const buffer = await fs.readFile(filePath);
        const { type, text } = await extractTextFromFile(buffer);

        stats[type]++;

        // PNG → 삭제 (썸네일 등)
        if (type === 'png') {
          await fs.unlink(filePath);
          stats.pngDeleted++;
          sendProgress(res, 'processing', i + 1, total, `${filename} → PNG 삭제`);
          continue;
        }

        // 확장자가 실제 타입과 다르면 이름 변경
        const currentExt = path.extname(filename).toLowerCase();
        const correctExt = '.' + extMap[type];
        let finalPath = filePath;
        let finalFilename = filename;

        if (currentExt !== correctExt && type !== 'unknown') {
          const baseName = filename.replace(/\.[^.]+$/, '');
          finalFilename = baseName + correctExt;
          finalPath = path.join(pdfsDir, finalFilename);

          // 이름 충돌 방지
          try {
            await fs.access(finalPath);
            // 이미 존재하면 숫자 접미사 추가
            finalFilename = baseName + '-r' + correctExt;
            finalPath = path.join(pdfsDir, finalFilename);
          } catch {
            // 파일 없음 → 정상
          }

          await fs.rename(filePath, finalPath);
          stats.renamed++;
        }

        // 텍스트 추출 결과 저장
        if (text.length > 50) {
          const analysisFilename = finalFilename.replace(/\.[^.]+$/, '.txt');
          const analysisPath = path.join(analysisDir, analysisFilename);
          await fs.writeFile(analysisPath, text, 'utf-8');
          stats.textExtracted++;
        }

        sendProgress(res, 'processing', i + 1, total, `${filename} → ${type}${currentExt !== correctExt ? ` (${currentExt}→${correctExt})` : ''}`);
      } catch (e) {
        stats.errors++;
        console.error(`[reprocess] 파일 처리 실패: ${filename}`, e);
        sendProgress(res, 'processing', i + 1, total, `${filename} → 에러`);
      }
    }

    // 프로그램 frontmatter 업데이트: 변경된 파일 경로 반영
    sendProgress(res, 'updating', 0, 1, '프로그램 노트 업데이트 중...');

    try {
      const programFiles = await listNotes('programs');
      let updatedPrograms = 0;

      for (const pf of programFiles) {
        try {
          const { frontmatter, content } = await readNote(pf);
          const attachments = (frontmatter.attachments as { path: string; name: string; analyzed: boolean }[]) || [];
          if (attachments.length === 0) continue;

          let changed = false;
          for (const att of attachments) {
            const attFilename = path.basename(att.path);
            const attBaseName = attFilename.replace(/\.[^.]+$/, '');

            // 해당 파일이 pdfsDir에 존재하는지 확인 (변경된 확장자로)
            for (const ext of ['pdf', 'hwpx', 'hwp', 'zip', 'docx', 'bin']) {
              const candidateName = attBaseName + '.' + ext;
              const candidatePath = path.join(pdfsDir, candidateName);
              try {
                await fs.access(candidatePath);
                const newRelPath = path.join('attachments', 'pdfs', candidateName);
                if (att.path !== newRelPath) {
                  att.path = newRelPath;
                  changed = true;
                }
                // analyzed 상태 업데이트
                const analysisPath = path.join(analysisDir, attBaseName + '.txt');
                try {
                  await fs.access(analysisPath);
                  if (!att.analyzed) {
                    att.analyzed = true;
                    changed = true;
                  }
                } catch {
                  // 분석 결과 없음
                }
                break;
              } catch {
                // 해당 확장자 파일 없음
              }
            }

            // -r 접미사로 리네임된 파일도 확인
            const renamedBaseName = attBaseName + '-r';
            for (const ext of ['pdf', 'hwpx', 'hwp', 'zip', 'docx', 'bin']) {
              const candidateName = renamedBaseName + '.' + ext;
              const candidatePath = path.join(pdfsDir, candidateName);
              try {
                await fs.access(candidatePath);
                const newRelPath = path.join('attachments', 'pdfs', candidateName);
                if (att.path !== newRelPath) {
                  att.path = newRelPath;
                  changed = true;
                }
                break;
              } catch {
                // 해당 파일 없음
              }
            }
          }

          if (changed) {
            frontmatter.attachments = attachments;
            await writeNote(pf, frontmatter, content);
            updatedPrograms++;
          }
        } catch {
          // 개별 프로그램 노트 업데이트 실패 → 계속 진행
        }
      }

      sendProgress(res, 'updating', 1, 1, `${updatedPrograms}개 프로그램 노트 업데이트`);
    } catch (e) {
      console.error('[reprocess] 프로그램 노트 업데이트 실패:', e);
    }

    sendComplete(res, {
      message: '첨부파일 재처리 완료',
      stats,
    });
  } catch (error) {
    console.error('[vault/reprocess-attachments] Error:', error);
    sendError(res, `재처리 실패: ${String(error)}`);
  }
});

/**
 * POST /api/vault/re-enrich/:slug
 * 기존 프로그램의 첨부파일 텍스트를 활용해 AI 재가공 수행
 */
router.post('/re-enrich/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter: pf, content: _pc } = await readNote(programPath);
    const attachments = (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [];

    // 1. 첨부파일 텍스트 로드 + 구조화
    const rawTexts = await loadAttachmentTextsRaw(attachments);
    const attachmentData = rawTexts.length > 0
      ? extractStructuredFromAttachments(rawTexts)
      : null;

    if (!attachmentData && !pf.detailUrl) {
      res.status(400).json({ error: '재가공할 데이터가 없습니다 (첨부파일 텍스트 없음, 상세 URL 없음).' });
      return;
    }

    // 2. (선택) reCrawl=true이면 detailUrl도 재크롤
    let crawledText = '';
    let crawledMetadata: Record<string, string> = {};
    const reCrawl = req.query.reCrawl === 'true';

    if (reCrawl && pf.detailUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(pf.detailUrl as string, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok) {
          const html = await response.text();
          const cheerio = await import('cheerio');
          const $ = cheerio.load(html);
          $('script, style, nav, header, footer').remove();
          crawledText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 15000);
        }
      } catch (e) {
        console.warn(`[re-enrich] 재크롤 실패: ${pf.detailUrl}`, e);
      }
    }

    // 3. enrichWithAI 호출
    const apiDataForEnrich: Record<string, unknown> = {
      programName: pf.programName,
      organizer: pf.organizer,
      description: pf.fullDescription || pf.description || '',
      targetAudience: pf.targetAudience || '',
      applicationMethod: pf.applicationMethod || '',
      contactInfo: pf.contactInfo || '',
      supportScale: pf.supportScale || '',
      regions: pf.regions || [],
      categories: pf.categories || [],
    };

    const crawlResult = await enrichWithAI(
      apiDataForEnrich as Partial<ServerSupportProgram>,
      crawledText,
      crawledMetadata,
      attachmentData
    );

    // 4. 프론트매터 업데이트 (기존 값 ← 새 값 merge, 비어있지 않은 값만)
    const mergeField = <T>(newVal: T, oldVal: T): T => {
      if (Array.isArray(newVal)) return (newVal.length > 0 ? newVal : oldVal) as T;
      if (typeof newVal === 'string') return ((newVal as string).length > 0 ? newVal : oldVal) as T;
      return newVal || oldVal;
    };

    const updatedFm: Record<string, unknown> = {
      ...pf,
      department: mergeField(crawlResult.department, pf.department as string || ''),
      supportScale: mergeField(crawlResult.supportScale, pf.supportScale as string || ''),
      targetAudience: mergeField(crawlResult.targetAudience, pf.targetAudience as string || ''),
      applicationStart: mergeField(crawlResult.applicationPeriod?.start, pf.applicationStart as string || ''),
      regions: mergeField(crawlResult.regions, pf.regions as string[] || []),
      categories: mergeField(crawlResult.categories, pf.categories as string[] || []),
      requiredDocuments: mergeField(crawlResult.requiredDocuments, pf.requiredDocuments as string[] || []),
      evaluationCriteria: mergeField(crawlResult.evaluationCriteria, pf.evaluationCriteria as string[] || []),
      eligibilityCriteria: crawlResult.eligibilityCriteria.length > 0 ? crawlResult.eligibilityCriteria : (pf.eligibilityCriteria as string[] || []),
      applicationMethod: mergeField(crawlResult.applicationMethod, pf.applicationMethod as string || ''),
      contactInfo: mergeField(crawlResult.contactInfo, pf.contactInfo as string || ''),
      matchingRatio: mergeField(crawlResult.matchingRatio, pf.matchingRatio as string || ''),
      totalBudget: mergeField(crawlResult.totalBudget, pf.totalBudget as string || ''),
      projectPeriod: mergeField(crawlResult.projectPeriod, pf.projectPeriod as string || ''),
      selectionDate: mergeField(crawlResult.selectionDate, pf.selectionDate as string || ''),
      announcementDate: mergeField(crawlResult.announcementDate, pf.announcementDate as string || ''),
      applicationUrl: mergeField(crawlResult.applicationUrl, pf.applicationUrl as string || ''),
      contactPhone: mergeField(crawlResult.contactPhone, pf.contactPhone as string || ''),
      contactEmail: mergeField(crawlResult.contactEmail, pf.contactEmail as string || ''),
      keywords: mergeField(crawlResult.keywords, pf.keywords as string[] || []),
      exclusionCriteria: mergeField(crawlResult.exclusionCriteria, pf.exclusionCriteria as string[] || []),
      specialNotes: mergeField(crawlResult.specialNotes, pf.specialNotes as string[] || []),
      fullDescription: mergeField(crawlResult.fullDescription, pf.fullDescription as string || ''),
      objectives: crawlResult.objectives.length > 0 ? crawlResult.objectives : (pf.objectives as string[] || []),
      supportDetails: crawlResult.supportDetails.length > 0 ? crawlResult.supportDetails : (pf.supportDetails as string[] || []),
      selectionProcess: crawlResult.selectionProcess.length > 0 ? crawlResult.selectionProcess : (pf.selectionProcess as string[] || []),
      dataQualityScore: Math.max(crawlResult.dataQualityScore, Number(pf.dataQualityScore) || 0),
      dataSources: crawlResult.dataSources,
      reEnrichedAt: new Date().toISOString(),
    };

    // 5. 마크다운 재생성
    const programData: ServerSupportProgram = {
      id: pf.id as string,
      organizer: pf.organizer as string,
      programName: pf.programName as string,
      supportType: pf.supportType as string,
      officialEndDate: pf.officialEndDate as string,
      internalDeadline: pf.internalDeadline as string,
      expectedGrant: pf.expectedGrant as number,
      fitScore: pf.fitScore as number,
      eligibility: pf.eligibility as string,
      priorityRank: 99,
      eligibilityReason: '',
      requiredDocuments: updatedFm.requiredDocuments as string[] || [],
      description: pf.description as string || '',
      successProbability: '',
      detailUrl: pf.detailUrl as string,
      source: pf.source as string,
    };

    const content = programToMarkdown(programData, crawlResult, attachments);
    await writeNote(programPath, updatedFm, content);

    const oldScore = Number(pf.dataQualityScore) || 0;
    res.json({
      success: true,
      slug,
      oldQualityScore: oldScore,
      newQualityScore: crawlResult.dataQualityScore,
      improved: crawlResult.dataQualityScore > oldScore,
      eligibilityCriteria: crawlResult.eligibilityCriteria.length,
      requiredDocuments: crawlResult.requiredDocuments.length,
      evaluationCriteria: crawlResult.evaluationCriteria.length,
      attachmentDataUsed: !!attachmentData,
      totalAttachmentChars: attachmentData?.totalCharCount || 0,
    });
  } catch (error) {
    console.error('[vault/re-enrich] Error:', error);
    res.status(500).json({ error: 'AI 재가공 실패', details: String(error) });
  }
});

/**
 * POST /api/vault/re-enrich-all
 * dataQualityScore < 50 OR eligibilityCriteria.length === 0인 프로그램 일괄 재가공
 * SSE로 진행률 전달
 */
router.post('/re-enrich-all', async (req: Request, res: Response) => {
  const useSSE = req.headers.accept === 'text/event-stream';

  try {
    if (useSSE) initSSE(res);

    const files = await listNotes(path.join(getVaultRoot(), 'programs'));
    const candidates: { file: string; slug: string; pf: Record<string, unknown> }[] = [];

    // 대상 프로그램 필터링
    for (const file of files) {
      try {
        const { frontmatter: pf } = await readNote(file);
        const slug = pf.slug as string;
        if (!slug) continue;

        const dqs = Number(pf.dataQualityScore) || 0;
        const eligLen = Array.isArray(pf.eligibilityCriteria) ? pf.eligibilityCriteria.length : 0;
        const attachments = (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [];
        const hasAnalyzedAttachments = attachments.some(a => a.analyzed);

        // 조건: 품질 점수 낮거나 핵심 필드 비어있고, 첨부파일 텍스트가 있는 경우
        if ((dqs < 50 || eligLen === 0) && hasAnalyzedAttachments) {
          candidates.push({ file, slug, pf });
        }
      } catch { /* skip */ }
    }

    if (useSSE) sendProgress(res, '대상 프로그램 선별 완료', 0, candidates.length, `${candidates.length}개 대상`);

    const total = candidates.length;
    let processed = 0;
    let improved = 0;
    let errors = 0;

    for (let i = 0; i < candidates.length; i++) {
      const { file, slug, pf } = candidates[i];
      try {
        if (useSSE) sendProgress(res, 'AI 재가공 중', i + 1, total, pf.programName as string);

        const attachments = (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [];
        const rawTexts = await loadAttachmentTextsRaw(attachments);
        if (rawTexts.length === 0) continue;

        const attachmentData = extractStructuredFromAttachments(rawTexts);

        const apiDataForEnrich: Record<string, unknown> = {
          programName: pf.programName,
          organizer: pf.organizer,
          description: pf.fullDescription || pf.description || '',
          targetAudience: pf.targetAudience || '',
          applicationMethod: pf.applicationMethod || '',
          contactInfo: pf.contactInfo || '',
          supportScale: pf.supportScale || '',
          regions: pf.regions || [],
          categories: pf.categories || [],
        };

        const crawlResult = await enrichWithAI(
          apiDataForEnrich as Partial<ServerSupportProgram>,
          '',
          {},
          attachmentData
        );

        const mergeField = <T>(newVal: T, oldVal: T): T => {
          if (Array.isArray(newVal)) return (newVal.length > 0 ? newVal : oldVal) as T;
          if (typeof newVal === 'string') return ((newVal as string).length > 0 ? newVal : oldVal) as T;
          return newVal || oldVal;
        };

        const oldScore = Number(pf.dataQualityScore) || 0;

        const updatedFm: Record<string, unknown> = {
          ...pf,
          department: mergeField(crawlResult.department, pf.department as string || ''),
          supportScale: mergeField(crawlResult.supportScale, pf.supportScale as string || ''),
          targetAudience: mergeField(crawlResult.targetAudience, pf.targetAudience as string || ''),
          regions: mergeField(crawlResult.regions, pf.regions as string[] || []),
          categories: mergeField(crawlResult.categories, pf.categories as string[] || []),
          requiredDocuments: mergeField(crawlResult.requiredDocuments, pf.requiredDocuments as string[] || []),
          evaluationCriteria: mergeField(crawlResult.evaluationCriteria, pf.evaluationCriteria as string[] || []),
          eligibilityCriteria: crawlResult.eligibilityCriteria.length > 0 ? crawlResult.eligibilityCriteria : (pf.eligibilityCriteria as string[] || []),
          applicationMethod: mergeField(crawlResult.applicationMethod, pf.applicationMethod as string || ''),
          contactInfo: mergeField(crawlResult.contactInfo, pf.contactInfo as string || ''),
          matchingRatio: mergeField(crawlResult.matchingRatio, pf.matchingRatio as string || ''),
          totalBudget: mergeField(crawlResult.totalBudget, pf.totalBudget as string || ''),
          exclusionCriteria: mergeField(crawlResult.exclusionCriteria, pf.exclusionCriteria as string[] || []),
          specialNotes: mergeField(crawlResult.specialNotes, pf.specialNotes as string[] || []),
          fullDescription: mergeField(crawlResult.fullDescription, pf.fullDescription as string || ''),
          objectives: crawlResult.objectives.length > 0 ? crawlResult.objectives : (pf.objectives as string[] || []),
          supportDetails: crawlResult.supportDetails.length > 0 ? crawlResult.supportDetails : (pf.supportDetails as string[] || []),
          selectionProcess: crawlResult.selectionProcess.length > 0 ? crawlResult.selectionProcess : (pf.selectionProcess as string[] || []),
          keywords: mergeField(crawlResult.keywords, pf.keywords as string[] || []),
          dataQualityScore: Math.max(crawlResult.dataQualityScore, oldScore),
          dataSources: crawlResult.dataSources,
          reEnrichedAt: new Date().toISOString(),
        };

        // 마크다운 재생성
        const programData: ServerSupportProgram = {
          id: pf.id as string,
          organizer: pf.organizer as string,
          programName: pf.programName as string,
          supportType: pf.supportType as string,
          officialEndDate: pf.officialEndDate as string,
          internalDeadline: pf.internalDeadline as string,
          expectedGrant: pf.expectedGrant as number,
          fitScore: pf.fitScore as number,
          eligibility: pf.eligibility as string,
          priorityRank: 99,
          eligibilityReason: '',
          requiredDocuments: updatedFm.requiredDocuments as string[] || [],
          description: pf.description as string || '',
          successProbability: '',
          detailUrl: pf.detailUrl as string,
          source: pf.source as string,
        };

        const content = programToMarkdown(programData, crawlResult, attachments);
        await writeNote(file, updatedFm, content);

        processed++;
        if (crawlResult.dataQualityScore > oldScore) improved++;

        // Rate limit (3초 딜레이)
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        console.error(`[re-enrich-all] Error for ${slug}:`, e);
        errors++;
      }
    }

    const resultData = {
      success: true,
      totalCandidates: total,
      processed,
      improved,
      errors,
    };

    if (useSSE) {
      sendComplete(res, resultData);
    } else {
      res.json(resultData);
    }
  } catch (error) {
    console.error('[vault/re-enrich-all] Error:', error);
    if (useSSE) {
      sendError(res, `일괄 재가공 실패: ${String(error)}`);
    } else {
      res.status(500).json({ error: '일괄 재가공 실패', details: String(error) });
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// Benefit Tracking (과거 수령 이력 관리)
// ═══════════════════════════════════════════════════════════════

/** 수령 이력 전체 목록 */
router.get('/benefits', async (_req: Request, res: Response) => {
  try {
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);
    const benefits: Record<string, unknown>[] = [];

    for (const file of files) {
      const basename = path.basename(file);
      if (!basename.startsWith('수령-')) continue;
      try {
        const { frontmatter } = await readNote(file);
        if (frontmatter.type === 'benefit') {
          benefits.push(frontmatter);
        }
      } catch { /* skip */ }
    }

    res.json({ benefits });
  } catch (error) {
    console.error('[vault/benefits] List error:', error);
    res.status(500).json({ error: '수령 이력 목록 조회 실패' });
  }
});

/** 수령 이력 통계 요약 — /benefits/summary는 :id보다 먼저 등록 */
router.get('/benefits/summary', async (_req: Request, res: Response) => {
  try {
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);
    const benefits: Record<string, unknown>[] = [];

    for (const file of files) {
      const basename = path.basename(file);
      if (!basename.startsWith('수령-')) continue;
      try {
        const { frontmatter } = await readNote(file);
        if (frontmatter.type === 'benefit') benefits.push(frontmatter);
      } catch { /* skip */ }
    }

    let totalReceived = 0;
    const catMap: Record<string, { amount: number; count: number }> = {};
    const yearMap: Record<number, { amount: number; count: number }> = {};
    let refundEligible = 0;
    let estimatedTotalRefund = 0;

    for (const b of benefits) {
      const amount = Number(b.receivedAmount) || 0;
      totalReceived += amount;

      const cat = (b.category as string) || '기타';
      if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0 };
      catMap[cat].amount += amount;
      catMap[cat].count++;

      const year = new Date(b.receivedDate as string).getFullYear();
      if (!isNaN(year)) {
        if (!yearMap[year]) yearMap[year] = { amount: 0, count: 0 };
        yearMap[year].amount += amount;
        yearMap[year].count++;
      }

      if (b.status === 'refund_eligible') {
        refundEligible++;
        // 분석 노트에서 estimatedRefund 읽기 시도
        const benefitId = b.id as string;
        const analysisFile = path.join(getVaultRoot(), 'benefits', `분석-${benefitId}.md`);
        try {
          if (await noteExists(analysisFile)) {
            const { frontmatter: af } = await readNote(analysisFile);
            estimatedTotalRefund += Number(af.estimatedRefund) || 0;
          }
        } catch { /* skip */ }
      }
    }

    const summary = {
      totalReceived,
      totalCount: benefits.length,
      byCategory: Object.entries(catMap).map(([category, v]) => ({ category, ...v })),
      byYear: Object.entries(yearMap)
        .map(([year, v]) => ({ year: Number(year), ...v }))
        .sort((a, b) => a.year - b.year),
      refundEligible,
      estimatedTotalRefund,
    };

    res.json({ summary });
  } catch (error) {
    console.error('[vault/benefits/summary] Error:', error);
    res.status(500).json({ error: '수령 이력 통계 조회 실패' });
  }
});

/** 세금 환급 AI 스캔 실행 */
router.post('/benefits/tax-scan', async (_req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다' });
    }

    // 기업 프로필 로드
    const companyFile = path.join(getVaultRoot(), '기업정보.md');
    if (!(await noteExists(companyFile))) {
      return res.status(400).json({ error: '기업 정보가 등록되지 않았습니다. 설정에서 기업 프로필을 먼저 등록해주세요.' });
    }
    const { frontmatter: company } = await readNote(companyFile);

    // 수령 이력 로드
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);
    const benefitHistory: { programName: string; category: string; receivedAmount: number; receivedDate: string }[] = [];

    for (const file of files) {
      const basename = path.basename(file);
      if (!basename.startsWith('수령-')) continue;
      try {
        const { frontmatter: bf } = await readNote(file);
        if (bf.type === 'benefit') {
          benefitHistory.push({
            programName: bf.programName as string,
            category: bf.category as string,
            receivedAmount: Number(bf.receivedAmount) || 0,
            receivedDate: bf.receivedDate as string,
          });
        }
      } catch { /* skip */ }
    }

    // AI 스캔
    const { scanMissedTaxBenefits } = await import('../services/analysisService.js');
    const result = await scanMissedTaxBenefits(
      {
        name: company.name as string,
        industry: company.industry as string,
        revenue: Number(company.revenue) || 0,
        employees: Number(company.employees) || 0,
        address: company.address as string,
        certifications: company.certifications as string[],
        coreCompetencies: company.coreCompetencies as string[],
        foundedYear: company.foundedYear ? Number(company.foundedYear) : undefined,
        businessType: company.businessType as string,
        mainProducts: company.mainProducts as string[],
        description: company.description as string,
      },
      benefitHistory
    );

    // 결과 조합
    const scanId = `scan-${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    const totalEstimatedRefund = result.opportunities.reduce((sum, o) => sum + (o.estimatedRefund || 0), 0);

    const scan = {
      id: scanId,
      scannedAt: now,
      opportunities: result.opportunities,
      totalEstimatedRefund,
      opportunityCount: result.opportunities.length,
      companySnapshot: {
        name: company.name as string,
        industry: (company.industry as string) || '',
        employees: Number(company.employees) || 0,
        revenue: Number(company.revenue) || 0,
        foundedYear: company.foundedYear ? Number(company.foundedYear) : undefined,
      },
      summary: result.summary,
      disclaimer: result.disclaimer,
    };

    // vault에 저장
    const scanFrontmatter: Record<string, unknown> = {
      type: 'tax-scan',
      ...scan,
    };
    const scanFilePath = path.join(getVaultRoot(), 'benefits', `세금환급-스캔-${scanId}.md`);
    await writeNote(scanFilePath, scanFrontmatter, result.summary);

    res.json({ success: true, scan });
  } catch (error) {
    console.error('[vault/benefits/tax-scan] Error:', error);
    res.status(500).json({ error: '세금 환급 스캔 실패' });
  }
});

/** 최근 세금 환급 스캔 결과 조회 */
router.get('/benefits/tax-scan/latest', async (_req: Request, res: Response) => {
  try {
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);
    const scanFiles: { file: string; scannedAt: string }[] = [];

    for (const file of files) {
      const basename = path.basename(file);
      if (!basename.startsWith('세금환급-스캔-')) continue;
      try {
        const { frontmatter } = await readNote(file);
        if (frontmatter.type === 'tax-scan') {
          scanFiles.push({ file, scannedAt: frontmatter.scannedAt as string });
        }
      } catch { /* skip */ }
    }

    if (scanFiles.length === 0) {
      return res.json({ scan: null });
    }

    // 최신 스캔 결과 반환
    scanFiles.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
    const { frontmatter } = await readNote(scanFiles[0].file);
    const { type: _type, ...scan } = frontmatter;

    res.json({ scan });
  } catch (error) {
    console.error('[vault/benefits/tax-scan/latest] Error:', error);
    res.status(500).json({ error: '세금 환급 스캔 결과 조회 실패' });
  }
});

/** 수령 이력 단일 조회 */
router.get('/benefits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);

    for (const file of files) {
      try {
        const { frontmatter, content } = await readNote(file);
        if (frontmatter.type === 'benefit' && frontmatter.id === id) {
          return res.json({ benefit: frontmatter, content });
        }
      } catch { /* skip */ }
    }

    res.status(404).json({ error: '수령 이력을 찾을 수 없습니다' });
  } catch (error) {
    console.error('[vault/benefits/:id] Error:', error);
    res.status(500).json({ error: '수령 이력 조회 실패' });
  }
});

/** 수령 이력 등록 */
router.post('/benefits', async (req: Request, res: Response) => {
  try {
    const { programName, category, receivedAmount, receivedDate, organizer, conditions, expiryDate, tags, programSlug, conditionsMet, status: inputStatus } = req.body;
    if (!programName || !receivedAmount || !receivedDate || !organizer) {
      return res.status(400).json({ error: '필수 필드 누락 (programName, receivedAmount, receivedDate, organizer)' });
    }

    const id = `benefit-${crypto.randomBytes(6).toString('hex')}`;
    const slug = generateSlug(programName, id);
    const now = new Date().toISOString();

    const frontmatter: Record<string, unknown> = {
      type: 'benefit',
      id,
      programName,
      programSlug: programSlug || '',
      category: category || '기타',
      receivedAmount: Number(receivedAmount),
      receivedDate,
      expiryDate: expiryDate || '',
      organizer,
      conditions: conditions || '',
      conditionsMet: conditionsMet ?? null,
      status: inputStatus || 'completed',
      attachments: [],
      registeredAt: now,
      tags: tags || [],
    };

    const filePath = path.join(getVaultRoot(), 'benefits', `수령-${slug}.md`);
    await writeNote(filePath, frontmatter, '\n# 수령 내역 메모\n\n');

    res.json({ success: true, benefit: frontmatter });
  } catch (error) {
    console.error('[vault/benefits] Create error:', error);
    res.status(500).json({ error: '수령 이력 등록 실패' });
  }
});

/** 수령 이력 수정 */
router.put('/benefits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);

    for (const file of files) {
      try {
        const { frontmatter, content } = await readNote(file);
        if (frontmatter.type === 'benefit' && frontmatter.id === id) {
          const updated = { ...frontmatter, ...updates, id, type: 'benefit' };
          await writeNote(file, updated, content);
          return res.json({ success: true, benefit: updated });
        }
      } catch { /* skip */ }
    }

    res.status(404).json({ error: '수령 이력을 찾을 수 없습니다' });
  } catch (error) {
    console.error('[vault/benefits/:id] Update error:', error);
    res.status(500).json({ error: '수령 이력 수정 실패' });
  }
});

/** 수령 이력 삭제 */
router.delete('/benefits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);

    for (const file of files) {
      try {
        const { frontmatter } = await readNote(file);
        if (frontmatter.type === 'benefit' && frontmatter.id === id) {
          await fs.unlink(file);
          // 분석 노트도 삭제
          const analysisFile = path.join(benefitsDir, `분석-${id}.md`);
          try { await fs.unlink(analysisFile); } catch { /* 없으면 무시 */ }
          return res.json({ success: true });
        }
      } catch { /* skip */ }
    }

    res.status(404).json({ error: '수령 이력을 찾을 수 없습니다' });
  } catch (error) {
    console.error('[vault/benefits/:id] Delete error:', error);
    res.status(500).json({ error: '수령 이력 삭제 실패' });
  }
});

/** 저장된 분석 결과 조회 */
router.get('/benefits/:id/analysis', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const analysisFile = path.join(getVaultRoot(), 'benefits', `분석-${id}.md`);

    if (!(await noteExists(analysisFile))) {
      return res.status(404).json({ error: '분석 결과가 없습니다' });
    }

    const { frontmatter, content } = await readNote(analysisFile);
    res.json({
      analysis: {
        benefitId: frontmatter.benefitId,
        isEligible: frontmatter.isEligible,
        estimatedRefund: Number(frontmatter.estimatedRefund) || 0,
        riskLevel: frontmatter.riskLevel || 'MEDIUM',
        legalBasis: frontmatter.legalBasis || [],
        requiredDocuments: frontmatter.requiredDocuments || [],
        risks: frontmatter.risks || [],
        timeline: frontmatter.timeline || '',
        advice: frontmatter.advice || '',
        analyzedAt: frontmatter.analyzedAt || '',
        content,
      },
    });
  } catch (error) {
    console.error('[vault/benefits/:id/analysis] Error:', error);
    res.status(500).json({ error: '분석 결과 조회 실패' });
  }
});

/** 단일 환급 분석 (AI) */
router.post('/benefits/:id/analyze', async (req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY 미설정' });
    }

    const { id } = req.params;
    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);

    let benefitData: Record<string, unknown> | null = null;
    for (const file of files) {
      try {
        const { frontmatter } = await readNote(file);
        if (frontmatter.type === 'benefit' && frontmatter.id === id) {
          benefitData = frontmatter;
          break;
        }
      } catch { /* skip */ }
    }

    if (!benefitData) {
      return res.status(404).json({ error: '수령 이력을 찾을 수 없습니다' });
    }

    // 기업 정보 로드
    let companyInfo: Record<string, unknown> = {};
    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    try {
      if (await noteExists(companyFile)) {
        const { frontmatter: cf } = await readNote(companyFile);
        companyInfo = cf;
      }
    } catch { /* skip */ }

    // AI 분석 실행
    const { analyzeRefundEligibility } = await import('../services/analysisService.js');
    const analysis = await analyzeRefundEligibility(
      companyInfo as any,
      {
        programName: benefitData.programName as string,
        category: benefitData.category as string,
        receivedAmount: Number(benefitData.receivedAmount),
        receivedDate: benefitData.receivedDate as string,
        conditions: (benefitData.conditions as string) || undefined,
        conditionsMet: benefitData.conditionsMet as boolean | null | undefined,
      }
    );

    // 분석 결과 저장
    const analysisFile = path.join(benefitsDir, `분석-${id}.md`);
    const analysisFrontmatter: Record<string, unknown> = {
      type: 'benefit-analysis',
      benefitId: id,
      analyzedAt: analysis.analyzedAt,
      isEligible: analysis.isEligible,
      estimatedRefund: analysis.estimatedRefund,
      riskLevel: analysis.riskLevel,
      legalBasis: analysis.legalBasis,
      requiredDocuments: analysis.requiredDocuments,
      risks: analysis.risks,
      timeline: analysis.timeline,
      advice: analysis.advice,
    };

    await writeNote(analysisFile, analysisFrontmatter, `\n# AI 환급 분석 결과\n\n${analysis.advice}\n`);

    // benefit 상태 업데이트
    if (analysis.isEligible) {
      for (const file of files) {
        try {
          const { frontmatter, content } = await readNote(file);
          if (frontmatter.type === 'benefit' && frontmatter.id === id) {
            frontmatter.status = 'refund_eligible';
            await writeNote(file, frontmatter, content);
            break;
          }
        } catch { /* skip */ }
      }
    }

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('[vault/benefits/:id/analyze] Error:', error);
    res.status(500).json({ error: '환급 분석 실패', details: String(error) });
  }
});

/** 포트폴리오 인사이트 생성 */
router.post('/benefits/summary-insight', async (_req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY 미설정' });
    }

    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);
    const benefits: Record<string, unknown>[] = [];

    for (const file of files) {
      const basename = path.basename(file);
      if (!basename.startsWith('수령-')) continue;
      try {
        const { frontmatter } = await readNote(file);
        if (frontmatter.type === 'benefit') benefits.push(frontmatter);
      } catch { /* skip */ }
    }

    if (benefits.length === 0) {
      return res.json({ insight: '등록된 수령 이력이 없습니다.', recommendations: [] });
    }

    // 통계 계산
    let totalReceived = 0;
    const catMap: Record<string, { amount: number; count: number }> = {};
    for (const b of benefits) {
      const amount = Number(b.receivedAmount) || 0;
      totalReceived += amount;
      const cat = (b.category as string) || '기타';
      if (!catMap[cat]) catMap[cat] = { amount: 0, count: 0 };
      catMap[cat].amount += amount;
      catMap[cat].count++;
    }

    // 기업 정보 로드
    let companyInfo: Record<string, unknown> = {};
    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    try {
      if (await noteExists(companyFile)) {
        const { frontmatter: cf } = await readNote(companyFile);
        companyInfo = cf;
      }
    } catch { /* skip */ }

    const { generateBenefitSummaryInsight } = await import('../services/analysisService.js');
    const result = await generateBenefitSummaryInsight(
      companyInfo as any,
      benefits.map(b => ({
        programName: b.programName as string,
        category: b.category as string,
        receivedAmount: Number(b.receivedAmount),
        receivedDate: b.receivedDate as string,
      })),
      {
        totalReceived,
        totalCount: benefits.length,
        byCategory: Object.entries(catMap).map(([category, v]) => ({ category, ...v })),
      }
    );

    res.json(result);
  } catch (error) {
    console.error('[vault/benefits/summary-insight] Error:', error);
    res.status(500).json({ error: '인사이트 생성 실패' });
  }
});

/** 전체 일괄 환급 분석 */
router.post('/benefits/analyze-all', async (req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY 미설정' });
    }

    const benefitsDir = path.join(getVaultRoot(), 'benefits');
    const files = await listNotes(benefitsDir);
    const benefits: { file: string; frontmatter: Record<string, unknown> }[] = [];

    for (const file of files) {
      const basename = path.basename(file);
      if (!basename.startsWith('수령-')) continue;
      try {
        const { frontmatter } = await readNote(file);
        if (frontmatter.type === 'benefit') {
          benefits.push({ file, frontmatter });
        }
      } catch { /* skip */ }
    }

    // 기업 정보 로드
    let companyInfo: Record<string, unknown> = {};
    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    try {
      if (await noteExists(companyFile)) {
        const { frontmatter: cf } = await readNote(companyFile);
        companyInfo = cf;
      }
    } catch { /* skip */ }

    const { analyzeRefundEligibility } = await import('../services/analysisService.js');
    const results: any[] = [];

    for (const { file, frontmatter: b } of benefits) {
      try {
        const analysis = await analyzeRefundEligibility(
          companyInfo as any,
          {
            programName: b.programName as string,
            category: b.category as string,
            receivedAmount: Number(b.receivedAmount),
            receivedDate: b.receivedDate as string,
            conditions: (b.conditions as string) || undefined,
            conditionsMet: b.conditionsMet as boolean | null | undefined,
          }
        );

        // 분석 결과 저장
        const analysisFile = path.join(benefitsDir, `분석-${b.id}.md`);
        await writeNote(analysisFile, {
          type: 'benefit-analysis',
          benefitId: b.id,
          analyzedAt: analysis.analyzedAt,
          isEligible: analysis.isEligible,
          estimatedRefund: analysis.estimatedRefund,
          riskLevel: analysis.riskLevel,
          legalBasis: analysis.legalBasis,
          requiredDocuments: analysis.requiredDocuments,
          risks: analysis.risks,
          timeline: analysis.timeline,
          advice: analysis.advice,
        }, `\n# AI 환급 분석 결과\n\n${analysis.advice}\n`);

        if (analysis.isEligible) {
          const { frontmatter: bf, content: bc } = await readNote(file);
          bf.status = 'refund_eligible';
          await writeNote(file, bf, bc);
        }

        results.push(analysis);
        // rate limit
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[benefit analyze-all] Error for ${b.id}:`, e);
      }
    }

    res.json({ analyzed: results.length, results });
  } catch (error) {
    console.error('[vault/benefits/analyze-all] Error:', error);
    res.status(500).json({ error: '일괄 환급 분석 실패' });
  }
});

export default router;

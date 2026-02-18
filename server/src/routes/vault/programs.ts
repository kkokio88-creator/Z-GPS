import { Router, Request, Response } from 'express';
import path from 'path';
import fg from 'fast-glob';
import fs from 'fs/promises';
import { isSupabaseConfigured, upsertProgramsBatch } from '../../services/supabaseService.js';
import {
  ensureVaultStructure,
  readNote,
  writeNote,
  listNotes,
  generateSlug,
  getVaultRoot,
  noteExists,
  writeBinaryFile,
  listFiles,
} from '../../services/vaultFileService.js';
import {
  fetchAllProgramsServerSide,
  isLikelyStartupProgram,
  isRegionMismatch,
  extractRegionFromAddress,
} from '../../services/programFetcher.js';
import type { ServerSupportProgram } from '../../services/programFetcher.js';
import {
  analyzeFit,
  analyzePdf,
  generateStrategyDocument,
  preScreenPrograms,
} from '../../services/analysisService.js';
import type {
  FitAnalysisResult,
  FitDimensions,
  StrategyDocument,
  PreScreenInput,
} from '../../services/analysisService.js';
import {
  enrichFromApiOnly,
  enrichWithAI,
  extractStructuredFromAttachments,
  extractTextFromFile,
  crawlHtmlOnly,
  downloadAttachmentToBuffer,
  type DeepCrawlResult,
  type DetectedFileType,
  type HtmlCrawlResult,
} from '../../services/deepCrawler.js';
import { deepCrawlProgramFull } from '../../services/deepCrawler.js';
import { initSSE, sendProgress, sendComplete, sendError } from '../../utils/sse.js';
import {
  parseAmountFromScale,
  extractGrantFromText,
  reParseExpectedGrant,
} from '../../utils/amountParser.js';

const router = Router();

// 초기화: 볼트 구조 보장
ensureVaultStructure().catch(e => console.error('[vault] Failed to ensure vault structure:', e));

// ─── Helper ────────────────────────────────────────────────────

/** PDF 분석 텍스트를 슬러그 기반으로 로드 */
export async function loadPdfAnalysisForSlug(slug: string): Promise<string> {
  const analysisDir = path.join(getVaultRoot(), 'attachments', 'pdf-analysis');
  try {
    const files = await fs.readdir(analysisDir);
    const matched = files.filter(f => f.startsWith(slug) && f.endsWith('.txt'));
    let text = '';
    for (const f of matched) {
      try {
        const content = await fs.readFile(path.join(analysisDir, f), 'utf-8');
        text += content.substring(0, 3000) + '\n';
      } catch { /* skip */ }
    }
    return text;
  } catch { return ''; }
}

/** 첨부파일 분석 텍스트 로드 (pdf-analysis/*.txt) */
export async function loadAttachmentText(
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

/** 개별 첨부파일 텍스트를 배열로 반환 */
export async function loadAttachmentTextsRaw(
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

/** slug 검증: 경로순회 방지 */
export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9가-힣_-]+$/.test(slug) && !slug.includes('..');
}

export function programToFrontmatter(
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
    expectedGrant: p.expectedGrant || 0,
    fitScore: 0,
    eligibility: '검토 필요',
    detailUrl: p.detailUrl,
    source: p.source,
    syncedAt: new Date().toISOString(),
    analyzedAt: '',
    deepCrawledAt: deepCrawl ? new Date().toISOString() : '',
    status: deepCrawl ? 'deep_crawled' : 'synced',
    eligibilityCriteria: deepCrawl?.eligibilityCriteria || p.eligibilityCriteria || [],
    description: deepCrawl?.fullDescription || p.description || '',
    objectives: deepCrawl?.objectives || p.objectives || [],
    supportDetails: deepCrawl?.supportDetails || p.supportDetails || [],
    selectionProcess: deepCrawl?.selectionProcess || p.selectionProcess || [],
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
    exclusionCriteria: deepCrawl?.exclusionCriteria || p.exclusionCriteria || [],
    specialNotes: deepCrawl?.specialNotes || p.specialNotes || [],
    fullDescription: deepCrawl?.fullDescription || p.fullDescription || p.description || '',
  };

  if (!fm.expectedGrant || Number(fm.expectedGrant) === 0) {
    for (const src of [String(fm.supportScale || ''), String(fm.totalBudget || '')]) {
      const parsed = parseAmountFromScale(src);
      if (parsed > 0) { fm.expectedGrant = parsed; break; }
    }
    if (!fm.expectedGrant || Number(fm.expectedGrant) === 0) {
      const fromDesc = extractGrantFromText(String(fm.fullDescription || ''));
      if (fromDesc > 0) fm.expectedGrant = fromDesc;
    }
  }

  return fm;
}

export function programToMarkdown(
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

  if (appUrl) {
    md += `\n> [!tip] 온라인 신청\n> [신청 바로가기](${appUrl})\n`;
  }

  const objectives = deepCrawl?.objectives || [];
  if (objectives.length > 0) {
    md += `\n## 사업 목적\n${objectives.map(o => `- ${o}`).join('\n')}\n`;
  }

  const target = deepCrawl?.targetAudience || p.targetAudience || '';
  if (target) {
    md += `\n## 지원 대상\n${target}\n`;
  }

  const criteria = deepCrawl?.eligibilityCriteria || p.eligibilityCriteria || [];
  if (criteria.length > 0) {
    md += `\n## 자격요건\n${criteria.map(c => `- ${c}`).join('\n')}\n`;
  }

  const exclusion = deepCrawl?.exclusionCriteria || [];
  if (exclusion.length > 0) {
    md += `\n## 참여 제한 대상\n${exclusion.map(e => `- ${e}`).join('\n')}\n`;
  }

  const supportDetails = deepCrawl?.supportDetails || [];
  if (supportDetails.length > 0) {
    md += `\n## 지원 내용\n${supportDetails.map(s => `- ${s}`).join('\n')}\n`;
  }

  const fullDesc = deepCrawl?.fullDescription || p.fullDescription || p.description || '';
  if (fullDesc && fullDesc.length > 30) {
    md += `\n## 사업 상세 설명\n${fullDesc}\n`;
  }

  const selProcess = deepCrawl?.selectionProcess || [];
  if (selProcess.length > 0) {
    md += `\n## 선정 절차\n${selProcess.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
  }

  const docs = deepCrawl?.requiredDocuments || p.requiredDocuments || [];
  if (docs.length > 0) {
    md += `\n## 필수 제출 서류\n${docs.map(d => `- [ ] ${d}`).join('\n')}\n`;
  }

  const evalCriteria = deepCrawl?.evaluationCriteria || p.evaluationCriteria || [];
  if (evalCriteria.length > 0) {
    md += `\n## 평가 기준\n${evalCriteria.map(e => `- ${e}`).join('\n')}\n`;
  }

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

  const notes = deepCrawl?.specialNotes || p.specialNotes || [];
  if (notes.length > 0) {
    md += `\n> [!warning] 유의사항\n${notes.map(n => `> - ${n}`).join('\n')}\n`;
  }

  if (attachments?.length) {
    md += `\n## 첨부파일\n${attachments.map(a => `- [[${a.path}|${a.name}]]`).join('\n')}\n`;
  }

  md += `\n## 적합도\n(적합도 분석 후 채워짐)\n`;

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

  if (keywords.length > 0) {
    md += `\n## 키워드\n${keywords.map(k => `\`${k}\``).join(' ')}\n`;
  }

  const quality = deepCrawl?.dataQualityScore || 0;
  const sources = deepCrawl?.dataSources || [p.source];
  md += `\n---\n*데이터 품질: ${quality}/100 | 소스: ${sources.join(', ')} | 수집일: ${new Date().toISOString().split('T')[0]}*\n`;

  return md;
}

function mergeHtmlCrawlData(
  frontmatter: Record<string, unknown>,
  crawl: HtmlCrawlResult
): Record<string, unknown> {
  const meta = crawl.metadata;
  const sectionContent = meta['_sectionContent'] || '';
  delete meta['_sectionContent'];

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

  if (crawl.content.length > ((frontmatter.fullDescription as string) || '').length) {
    frontmatter.crawledContent = crawl.content.substring(0, 15000);
  }
  if (sectionContent) {
    frontmatter.crawledSections = sectionContent.substring(0, 10000);
  }

  if (crawl.attachmentLinks.length > 0) {
    frontmatter.attachmentLinks = crawl.attachmentLinks.slice(0, 10).map(l => ({
      url: l.url,
      filename: l.filename,
    }));
  }

  return frontmatter;
}

// ─── Routes ────────────────────────────────────────────────────

/**
 * GET /api/vault/stats
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const vaultRoot = getVaultRoot();
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

    const appFiles = await listNotes(path.join(vaultRoot, 'applications'));
    const draftCount = appFiles.filter(f => f.endsWith('draft.md')).length;

    const pdfPattern = path.join(vaultRoot, 'attachments', 'pdfs', '*').replace(/\\/g, '/');
    const pdfFiles = await fg(pdfPattern, { onlyFiles: true });

    const analysisFiles = await listNotes(path.join(vaultRoot, 'analysis'));
    const companyFiles = await listFiles(path.join(vaultRoot, 'company'));

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
 * POST /api/vault/sync
 * 5단계 점진적 파이프라인
 */
router.post('/sync', async (req: Request, res: Response) => {
  const useSSE = req.headers.accept === 'text/event-stream';
  const forceReanalyze = req.body?.forceReanalyze === true;

  try {
    await ensureVaultStructure();
    if (useSSE) initSSE(res);

    let companyAddress = '';
    try {
      const companyPath = path.join('company', 'profile.md');
      if (await noteExists(companyPath)) {
        const { frontmatter: cf } = await readNote(companyPath);
        companyAddress = (cf.address as string) || '';
      }
    } catch { /* company 정보 없으면 무시 */ }

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
        const crawlResult = await enrichFromApiOnly(p, { skipAI: true });
        const frontmatter = programToFrontmatter(p, slug, crawlResult);
        frontmatter.enrichmentPhase = 1;
        frontmatter.status = 'synced';
        const content = programToMarkdown(p, crawlResult);
        await writeNote(filePath, frontmatter, content);
        created++;
      }
    }

    if (useSSE) sendProgress(res, '중복/필터 클린업 중', 0, 1, '', 1);

    const companyRegion = extractRegionFromAddress(companyAddress);
    let cleanedStartup = 0;
    let cleanedRegion = 0;
    let cleanedDuplicates = 0;

    try {
      const vaultRoot = getVaultRoot();
      const existingFiles = await listNotes(path.join(vaultRoot, 'programs'));

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

    let preScreenPassed = 0;
    let preScreenRejected = 0;

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
          if (ep !== 1) continue;
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

        const resultMap = new Map(screenResults.map(r => [r.id, r]));

        for (let i = 0; i < preScreenTargets.length; i++) {
          const { file, frontmatter: ef, content: ec, input } = preScreenTargets[i];
          const result = resultMap.get(input.id);

          if (useSSE) sendProgress(res, 'AI 사전심사 중', i + 1, preScreenTargets.length, input.programName, 2);

          if (result && !result.pass) {
            ef.fitScore = 3;
            ef.eligibility = '부적합';
            ef.enrichmentPhase = 99;
            ef.preScreenReason = result.reason;
            ef.status = 'pre_screen_rejected';
            await writeNote(file, ef, ec);
            preScreenRejected++;
          } else {
            preScreenPassed++;
          }
        }

        console.log(`[vault/sync] 사전심사: ${preScreenPassed}건 통과, ${preScreenRejected}건 탈락`);
      }
    } else {
      console.log('[vault/sync] 기업 정보 미등록 → 사전심사 건너뜀');
    }

    let phase2Count = 0;
    const vaultRoot2 = getVaultRoot();
    const phase2Files = await listNotes(path.join(vaultRoot2, 'programs'));
    const phase2Targets: { file: string; frontmatter: Record<string, unknown>; content: string }[] = [];

    for (const file of phase2Files) {
      try {
        const { frontmatter: ef, content: ec } = await readNote(file);
        const ep = Number(ef.enrichmentPhase) || 0;
        const status = (ef.status as string) || '';
        if (!forceReanalyze && (status === 'deep_crawled' || ep >= 2)) continue;
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
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`[vault/sync] Phase 2 실패 (${pName}):`, e);
        ef.enrichmentPhase = 2;
        await writeNote(file, ef, ec);
      }
    }

    let phase3Count = 0;
    let phase3Attachments = 0;
    const phase3Files = await listNotes(path.join(vaultRoot2, 'programs'));
    const phase3Targets: { file: string; frontmatter: Record<string, unknown>; content: string }[] = [];

    for (const file of phase3Files) {
      try {
        const { frontmatter: ef, content: ec } = await readNote(file);
        const ep = Number(ef.enrichmentPhase) || 0;
        const status = (ef.status as string) || '';
        if (!forceReanalyze && (status === 'deep_crawled' || ep >= 3)) continue;
        if (!forceReanalyze && ep < 2) continue;
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
        const crawledContent = (ef.crawledContent as string) || '';
        const crawledSections = (ef.crawledSections as string) || '';
        const storedLinks = (ef.attachmentLinks as { url: string; filename: string }[]) || [];

        const attachmentTexts: string[] = [];
        const attachments: { path: string; name: string; analyzed: boolean }[] = [];
        const existingAttachments = (ef.attachments as { path: string; name: string; analyzed: boolean }[]) || [];

        if (existingAttachments.length > 0) {
          const rawTexts = await loadAttachmentTextsRaw(existingAttachments);
          attachmentTexts.push(...rawTexts);
          attachments.push(...existingAttachments);
        } else if (storedLinks.length > 0) {
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

        const attachmentData = attachmentTexts.length > 0
          ? extractStructuredFromAttachments(attachmentTexts)
          : null;

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

        const crawlMeta: Record<string, string> = {};
        if (crawledSections) crawlMeta['_sectionContent'] = crawledSections;

        const aiResult = await enrichWithAI(
          apiData,
          crawledContent || (ef.fullDescription as string) || '',
          crawlMeta,
          attachmentData
        );

        const updatedFm = programToFrontmatter(
          { ...apiData, id: (ef.id as string) || '', detailUrl, source: (ef.source as string) || '', supportType: (ef.supportType as string) || '', officialEndDate: (ef.officialEndDate as string) || '', internalDeadline: (ef.internalDeadline as string) || '', expectedGrant: Number(ef.expectedGrant) || 0 } as ServerSupportProgram,
          slug,
          aiResult,
          attachments
        );
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

        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        console.warn(`[vault/sync] Phase 3 실패 (${pName}):`, e);
      }
    }

    let phase4Analyzed = 0;
    let phase4Errors = 0;
    let phase4Strategies = 0;

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
        if (!forceReanalyze && (fitScore > 0 || status === 'analyzed' || ep === 99)) continue;
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

        const analysisPath = path.join('analysis', `${slug}-fit.md`);
        await writeNote(analysisPath, {
          slug,
          programName: pName,
          fitScore: fitResult.fitScore,
          eligibility: fitResult.eligibility,
          dimensions: fitResult.dimensions,
          analyzedAt: new Date().toISOString(),
        }, `# 적합도 분석: ${pName}\n\n${buildFitSectionMarkdown(fitResult, slug)}`);

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

        if (fitResult.fitScore >= 60) {
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

        if (fitResult.fitScore > 5) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        console.warn(`[vault/sync] Phase 4 분석 실패:`, e);
        phase4Errors++;
      }
    }

    // Supabase 동기화 (설정된 경우에만)
    if (isSupabaseConfigured()) {
      try {
        const allFiles = await listNotes(path.join(vaultRoot2, 'programs'));
        const supabasePrograms: { slug: string; programName: string; organizer?: string; fitScore?: number; eligibility?: string; status?: string; frontmatter?: Record<string, unknown> }[] = [];
        for (const file of allFiles) {
          try {
            const { frontmatter: sf } = await readNote(file);
            supabasePrograms.push({
              slug: (sf.slug as string) || '',
              programName: (sf.programName as string) || '',
              organizer: sf.organizer as string,
              fitScore: Number(sf.fitScore) || 0,
              eligibility: sf.eligibility as string,
              status: sf.status as string,
              frontmatter: sf,
            });
          } catch { /* skip */ }
        }
        const synced = await upsertProgramsBatch(supabasePrograms.filter(p => p.slug));
        if (synced > 0) console.log(`[vault/sync] Supabase: ${synced}건 동기화`);
      } catch (e) {
        console.warn('[vault/sync] Supabase 동기화 실패:', e);
      }
    }

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
 */
router.get('/programs', async (_req: Request, res: Response) => {
  try {
    const files = await listNotes(path.join(getVaultRoot(), 'programs'));

    const programs: Record<string, unknown>[] = [];
    const lazyUpdates: { file: string; fm: Record<string, unknown>; content: string }[] = [];

    for (const file of files) {
      try {
        const { frontmatter, content } = await readNote(file);

        if (!frontmatter.expectedGrant || Number(frontmatter.expectedGrant) === 0) {
          const slug = String(frontmatter.slug || '');
          const pdfText = slug ? await loadPdfAnalysisForSlug(slug) : '';
          const parsed = reParseExpectedGrant(frontmatter, content, pdfText);
          if (parsed > 0) {
            frontmatter.expectedGrant = parsed;
            lazyUpdates.push({ file, fm: frontmatter, content });
          }
        }

        programs.push(frontmatter);
      } catch (e) {
        console.warn('[vault/programs] Failed to read:', file, e);
      }
    }

    for (const { file, fm, content } of lazyUpdates) {
      try {
        await writeNote(file, fm, content);
      } catch (e) {
        console.warn('[vault/programs] Lazy update failed:', file, e);
      }
    }
    if (lazyUpdates.length > 0) {
      console.log(`[vault/programs] Lazy migrated ${lazyUpdates.length} grant amounts`);
    }

    programs.sort((a, b) => (Number(b.fitScore) || 0) - (Number(a.fitScore) || 0));

    res.json({ programs, total: programs.length });
  } catch (error) {
    console.error('[vault/programs] Error:', error);
    res.status(500).json({ error: '프로그램 목록 조회 실패' });
  }
});

/**
 * GET /api/vault/program/:slug
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

    if (!frontmatter.expectedGrant || Number(frontmatter.expectedGrant) === 0) {
      const pdfText = await loadPdfAnalysisForSlug(slug);
      const parsed = reParseExpectedGrant(frontmatter, content, pdfText);
      if (parsed > 0) frontmatter.expectedGrant = parsed;
    }

    res.json({ frontmatter, content });
  } catch (error) {
    console.error('[vault/program] Error:', error);
    res.status(500).json({ error: '프로그램 조회 실패' });
  }
});

/**
 * POST /api/vault/download-pdf/:slug
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
 * GET /api/vault/program/:slug/attachments
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
 */
router.post('/reprocess-attachments', async (req: Request, res: Response) => {
  initSSE(res);

  try {
    const vaultRoot = getVaultRoot();
    const pdfsDir = path.join(vaultRoot, 'attachments', 'pdfs');
    const analysisDir = path.join(vaultRoot, 'attachments', 'pdf-analysis');

    try {
      await fs.access(pdfsDir);
    } catch {
      sendError(res, '첨부파일 디렉토리가 존재하지 않습니다.');
      return;
    }

    await fs.mkdir(analysisDir, { recursive: true });

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

        if (type === 'png') {
          await fs.unlink(filePath);
          stats.pngDeleted++;
          sendProgress(res, 'processing', i + 1, total, `${filename} → PNG 삭제`);
          continue;
        }

        const currentExt = path.extname(filename).toLowerCase();
        const correctExt = '.' + extMap[type];
        let finalPath = filePath;
        let finalFilename = filename;

        if (currentExt !== correctExt && type !== 'unknown') {
          const baseName = filename.replace(/\.[^.]+$/, '');
          finalFilename = baseName + correctExt;
          finalPath = path.join(pdfsDir, finalFilename);

          try {
            await fs.access(finalPath);
            finalFilename = baseName + '-r' + correctExt;
            finalPath = path.join(pdfsDir, finalFilename);
          } catch {
            // 파일 없음 → 정상
          }

          await fs.rename(filePath, finalPath);
          stats.renamed++;
        }

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

    const rawTexts = await loadAttachmentTextsRaw(attachments);
    const attachmentData = rawTexts.length > 0
      ? extractStructuredFromAttachments(rawTexts)
      : null;

    if (!attachmentData && !pf.detailUrl) {
      res.status(400).json({ error: '재가공할 데이터가 없습니다 (첨부파일 텍스트 없음, 상세 URL 없음).' });
      return;
    }

    let crawledText = '';
    const crawledMetadata: Record<string, string> = {};
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

    if (!updatedFm.expectedGrant || Number(updatedFm.expectedGrant) === 0) {
      const parsed = parseAmountFromScale(String(updatedFm.supportScale || ''))
        || parseAmountFromScale(String(updatedFm.totalBudget || ''));
      if (parsed > 0) updatedFm.expectedGrant = parsed;
    }

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
 */
router.post('/re-enrich-all', async (req: Request, res: Response) => {
  const useSSE = req.headers.accept === 'text/event-stream';

  try {
    if (useSSE) initSSE(res);

    const files = await listNotes(path.join(getVaultRoot(), 'programs'));
    const candidates: { file: string; slug: string; pf: Record<string, unknown> }[] = [];

    for (const file of files) {
      try {
        const { frontmatter: pf } = await readNote(file);
        const slug = pf.slug as string;
        if (!slug) continue;

        const dqs = Number(pf.dataQualityScore) || 0;
        const eligLen = Array.isArray(pf.eligibilityCriteria) ? pf.eligibilityCriteria.length : 0;
        const attachments = (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [];
        const hasAnalyzedAttachments = attachments.some(a => a.analyzed);

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

        if (!updatedFm.expectedGrant || Number(updatedFm.expectedGrant) === 0) {
          const parsed = parseAmountFromScale(String(updatedFm.supportScale || ''))
            || parseAmountFromScale(String(updatedFm.totalBudget || ''));
          if (parsed > 0) updatedFm.expectedGrant = parsed;
        }

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

/**
 * POST /api/vault/migrate-grants
 */
router.post('/migrate-grants', async (_req: Request, res: Response) => {
  try {
    const files = await listNotes(path.join(getVaultRoot(), 'programs'));
    let updated = 0;
    let total = 0;
    const details: { slug: string; before: number; after: number; source: string }[] = [];

    for (const file of files) {
      total++;
      try {
        const { frontmatter, content } = await readNote(file);
        const current = Number(frontmatter.expectedGrant) || 0;
        if (current > 0) continue;

        const slug = String(frontmatter.slug || '');
        const pdfText = slug ? await loadPdfAnalysisForSlug(slug) : '';

        const parsed = reParseExpectedGrant(frontmatter, content, pdfText);
        if (parsed > 0) {
          frontmatter.expectedGrant = parsed;
          await writeNote(file, frontmatter, content);
          updated++;

          let source = 'unknown';
          if (parseAmountFromScale(String(frontmatter.supportScale || '')) > 0) source = 'supportScale';
          else if (parseAmountFromScale(String(frontmatter.totalBudget || '')) > 0) source = 'totalBudget';
          else if (extractGrantFromText(String(frontmatter.fullDescription || '')) > 0) source = 'fullDescription';
          else if (extractGrantFromText(content) > 0) source = 'bodyContent';
          else if (extractGrantFromText(pdfText) > 0) source = 'pdfAnalysis';

          details.push({
            slug,
            before: current,
            after: parsed,
            source,
          });
        }
      } catch (e) {
        console.warn('[migrate-grants] Skip file:', file, e);
      }
    }

    res.json({
      total,
      updated,
      remaining: total - updated,
      details,
    });
  } catch (error) {
    console.error('[vault/migrate-grants] Error:', error);
    res.status(500).json({ error: '마이그레이션 실패' });
  }
});

// buildFitSectionMarkdown과 strategyToMarkdown은 analysis.ts에서도 필요하므로 여기서도 export
export function buildFitSectionMarkdown(result: FitAnalysisResult, slug: string): string {
  const dimLabels: { key: keyof FitDimensions; label: string }[] = [
    { key: 'eligibilityMatch', label: '자격요건 부합' },
    { key: 'industryRelevance', label: '업종/기술 관련' },
    { key: 'scaleFit', label: '규모 적합성' },
    { key: 'competitiveness', label: '경쟁력' },
    { key: 'strategicAlignment', label: '전략적 부합' },
  ];

  let md = `\n## 적합도\n\n`;
  md += `**종합 점수: ${result.fitScore}/100** (${result.eligibility})\n\n`;

  md += `| 차원 | 점수 | 바 |\n|------|-----:|-----|\n`;
  for (const d of dimLabels) {
    const score = result.dimensions[d.key];
    const bar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
    md += `| ${d.label} | ${score} | ${bar} |\n`;
  }

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

  if (result.strengths.length) {
    md += `### 강점\n${result.strengths.map(s => `- ${s}`).join('\n')}\n\n`;
  }
  if (result.weaknesses.length) {
    md += `### 약점\n${result.weaknesses.map(w => `- ${w}`).join('\n')}\n\n`;
  }

  if (result.recommendedStrategy) {
    md += `### 전략 요약\n${result.recommendedStrategy}\n\n`;
  }

  if (result.fitScore >= 60) {
    md += `> [!tip] 전략 문서\n> 상세 전략 문서: [[전략-${slug}]]\n`;
  }

  return md;
}

export function strategyToMarkdown(
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

export default router;

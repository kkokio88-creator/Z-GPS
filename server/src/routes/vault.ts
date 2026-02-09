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
import { fetchAllProgramsServerSide } from '../services/programFetcher.js';
import type { ServerSupportProgram } from '../services/programFetcher.js';
import {
  analyzeFit,
  analyzePdf,
  generateDraftSection,
  reviewDraft,
  checkConsistency,
} from '../services/analysisService.js';
import {
  deepCrawlProgramFull,
  enrichFromApiOnly,
  type DeepCrawlResult,
} from '../services/deepCrawler.js';

const router = Router();

// 초기화: 볼트 구조 보장
ensureVaultStructure().catch(e => console.error('[vault] Failed to ensure vault structure:', e));

// ─── Helper ────────────────────────────────────────────────────

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

  let md = `# ${p.programName}

> [!info] 기본 정보
> - **주관**: ${p.organizer}${dept ? ` / ${dept}` : ''}
> - **지원 규모**: ${scale}${matching ? ` (${matching})` : ''}
> - **마감**: ${p.officialEndDate}
> - **신청기간**: ${periodText}
> - **신청방법**: ${appMethod}${appUrl ? ` ([온라인 신청](${appUrl}))` : ''}
`;

  // 사업 목적
  const objectives = deepCrawl?.objectives || [];
  if (objectives.length > 0) {
    md += `\n## 사업 목적\n${objectives.map(o => `- ${o}`).join('\n')}\n`;
  }

  const detailLink = p.detailUrl ? `[공고문 원문 확인](${p.detailUrl})` : '공고문 참조';

  // 지원 대상
  const target = deepCrawl?.targetAudience || p.targetAudience || '';
  md += `\n## 지원 대상\n${target || detailLink}\n`;

  // 자격요건
  const criteria = deepCrawl?.eligibilityCriteria || p.eligibilityCriteria || [];
  md += `\n## 자격요건\n${criteria.length
    ? criteria.map(c => `- ${c}`).join('\n')
    : detailLink}\n`;

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
  md += `\n## 사업 상세 설명\n${fullDesc || '상세 내용은 공고문을 참조하세요.'}\n`;

  // 선정 절차
  const selProcess = deepCrawl?.selectionProcess || [];
  if (selProcess.length > 0) {
    md += `\n## 선정 절차\n${selProcess.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
  }

  // 필수서류
  const docs = deepCrawl?.requiredDocuments || p.requiredDocuments || [];
  md += `\n## 필수 제출 서류\n${docs.length
    ? docs.map(d => `- [ ] ${d}`).join('\n')
    : detailLink}\n`;

  // 평가기준
  const evalCriteria = deepCrawl?.evaluationCriteria || p.evaluationCriteria || [];
  md += `\n## 평가 기준\n${evalCriteria.length
    ? evalCriteria.map(e => `- ${e}`).join('\n')
    : detailLink}\n`;

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

  // 데이터 품질 표시
  const quality = deepCrawl?.dataQualityScore || 0;
  const sources = deepCrawl?.dataSources || [p.source];
  md += `\n---\n*데이터 품질: ${quality}/100 | 소스: ${sources.join(', ')} | 수집일: ${new Date().toISOString().split('T')[0]}*\n`;

  return md;
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
 * POST /api/vault/sync
 * 3개 API → 볼트에 프로그램 노트 생성/갱신
 * ?deepCrawl=true → 각 프로그램 상세페이지 딥크롤 포함
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    await ensureVaultStructure();
    const programs = await fetchAllProgramsServerSide();
    const deepCrawlMode = req.query.deepCrawl === 'true';
    const enrichMode = req.query.enrich === 'true';

    let created = 0;
    let updated = 0;
    let deepCrawled = 0;
    let enriched = 0;
    let attachmentsDownloaded = 0;

    for (const p of programs) {
      const slug = generateSlug(p.programName, p.id);
      const filePath = path.join('programs', `${slug}.md`);
      const exists = await noteExists(filePath);

      if (exists) {
        const existing = await readNote(filePath);
        existing.frontmatter.syncedAt = new Date().toISOString();
        await writeNote(filePath, existing.frontmatter, existing.content);
        updated++;
      } else {
        // API 데이터에 이미 풍부한 정보가 있는 경우 항상 활용
        const hasRichApiData = !!(p.fullDescription && p.fullDescription.length > 100);

        if (deepCrawlMode && p.detailUrl) {
          try {
            const { crawlResult, attachments } = await deepCrawlProgramFull(
              p.detailUrl,
              p.programName,
              slug,
              p // API 데이터 전달
            );
            const frontmatter = programToFrontmatter(p, slug, crawlResult, attachments);
            const content = programToMarkdown(p, crawlResult, attachments);
            await writeNote(filePath, frontmatter, content);
            if (crawlResult) deepCrawled++;
            attachmentsDownloaded += attachments.length;
            // rate limit 방지
            await new Promise(r => setTimeout(r, 3000));
          } catch (e) {
            console.warn(`[vault/sync] Deep crawl failed for ${p.programName}:`, e);
            // API 데이터만으로 노트 생성 (풍부한 데이터 활용)
            const frontmatter = programToFrontmatter(p, slug);
            const content = programToMarkdown(p);
            await writeNote(filePath, frontmatter, content);
          }
        } else if (enrichMode && hasRichApiData) {
          // enrich 모드: 크롤링 없이 API 텍스트 데이터만 AI에 전달
          try {
            const crawlResult = await enrichFromApiOnly(p);
            const frontmatter = programToFrontmatter(p, slug, crawlResult);
            const content = programToMarkdown(p, crawlResult);
            await writeNote(filePath, frontmatter, content);
            enriched++;
            // Gemini rate limit 방지: 2초 딜레이
            await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
            console.warn(`[vault/sync] Enrich failed for ${p.programName}:`, e);
            const frontmatter = programToFrontmatter(p, slug);
            const content = programToMarkdown(p);
            await writeNote(filePath, frontmatter, content);
          }
        } else {
          const frontmatter = programToFrontmatter(p, slug);
          const content = programToMarkdown(p);
          await writeNote(filePath, frontmatter, content);
        }
        created++;
      }
    }

    res.json({
      success: true,
      totalFetched: programs.length,
      created,
      updated,
      deepCrawled,
      enriched,
      attachmentsDownloaded,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[vault/sync] Error:', error);
    res.status(500).json({ error: '동기화 실패', details: String(error) });
  }
});

/**
 * POST /api/vault/deep-crawl/:slug
 * 단일 프로그램 딥크롤 (수동 트리거)
 */
router.post('/deep-crawl/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
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

    const result = await analyzeFit(
      {
        name: (company.name as string) || '미등록 기업',
        industry: company.industry as string,
        description: company.description as string,
        revenue: company.revenue as number,
        employees: company.employees as number,
        address: company.address as string,
        certifications: company.certifications as string[],
        coreCompetencies: company.coreCompetencies as string[],
      },
      {
        programName: programFm.programName as string,
        organizer: programFm.organizer as string,
        supportType: programFm.supportType as string,
        description: (programFm.description as string) || programContent.substring(0, 500),
        expectedGrant: programFm.expectedGrant as number,
        officialEndDate: programFm.officialEndDate as string,
      }
    );

    const analysisPath = path.join('analysis', `${slug}-fit.md`);
    await writeNote(
      analysisPath,
      {
        slug,
        programName: programFm.programName,
        fitScore: result.fitScore,
        eligibility: result.eligibility,
        analyzedAt: new Date().toISOString(),
      },
      `# 적합도 분석: ${programFm.programName}

## 점수: ${result.fitScore}/100

## 판정: ${result.eligibility}

## 강점
${result.strengths.map(s => `- ${s}`).join('\n')}

## 약점
${result.weaknesses.map(w => `- ${w}`).join('\n')}

## 전략적 조언
${result.advice}

## 추천 접근 전략
${result.recommendedStrategy}
`
    );

    programFm.fitScore = result.fitScore;
    programFm.eligibility = result.eligibility;
    programFm.analyzedAt = new Date().toISOString();
    programFm.status = 'analyzed';
    await writeNote(programPath, programFm, programContent);

    res.json({ success: true, result });
  } catch (error) {
    console.error('[vault/analyze] Error:', error);
    res.status(500).json({ error: '분석 실패', details: String(error) });
  }
});

/**
 * POST /api/vault/analyze-all
 * 전체 프로그램 일괄 분석 (순차, 2초 간격)
 */
router.post('/analyze-all', async (_req: Request, res: Response) => {
  try {
    const files = await listNotes(path.join(getVaultRoot(), 'programs'));
    const results: { slug: string; fitScore: number; eligibility: string }[] = [];
    let errors = 0;

    for (const file of files) {
      try {
        const { frontmatter } = await readNote(file);
        const slug = frontmatter.slug as string;

        if (!slug) continue;

        const companyPath = path.join('company', 'profile.md');
        let company: Record<string, unknown> = {};
        if (await noteExists(companyPath)) {
          const { frontmatter: cf } = await readNote(companyPath);
          company = cf;
        }

        const { frontmatter: pf, content: pc } = await readNote(file);

        const result = await analyzeFit(
          {
            name: (company.name as string) || '미등록 기업',
            industry: company.industry as string,
            description: company.description as string,
            revenue: company.revenue as number,
            employees: company.employees as number,
            address: company.address as string,
            certifications: company.certifications as string[],
            coreCompetencies: company.coreCompetencies as string[],
          },
          {
            programName: pf.programName as string,
            organizer: pf.organizer as string,
            supportType: pf.supportType as string,
            description: (pf.description as string) || pc.substring(0, 500),
            expectedGrant: pf.expectedGrant as number,
            officialEndDate: pf.officialEndDate as string,
          }
        );

        const analysisPath = path.join('analysis', `${slug}-fit.md`);
        await writeNote(
          analysisPath,
          {
            slug,
            programName: pf.programName,
            fitScore: result.fitScore,
            eligibility: result.eligibility,
            analyzedAt: new Date().toISOString(),
          },
          `# 적합도 분석: ${pf.programName}\n\n점수: ${result.fitScore}/100\n판정: ${result.eligibility}\n\n## 강점\n${result.strengths.map(s => `- ${s}`).join('\n')}\n\n## 약점\n${result.weaknesses.map(w => `- ${w}`).join('\n')}\n\n## 조언\n${result.advice}`
        );

        pf.fitScore = result.fitScore;
        pf.eligibility = result.eligibility;
        pf.analyzedAt = new Date().toISOString();
        pf.status = 'analyzed';
        await writeNote(file, pf, pc);

        results.push({ slug, fitScore: result.fitScore, eligibility: result.eligibility as string });

        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error('[vault/analyze-all] Error for file:', file, e);
        errors++;
      }
    }

    res.json({ success: true, analyzed: results.length, errors, results });
  } catch (error) {
    console.error('[vault/analyze-all] Error:', error);
    res.status(500).json({ error: '일괄 분석 실패' });
  }
});

/**
 * POST /api/vault/download-pdf/:slug
 * PDF 다운로드 + AI 분석
 */
router.post('/download-pdf/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
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
 * POST /api/vault/generate-app/:slug
 * 지원서 자동 생성 (6섹션 + 리뷰 + 일관성)
 */
router.post('/generate-app/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
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

    const fullContext = [analysisContext, pdfContext].filter(Boolean).join('\n\n');

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

    const sections: Record<string, string> = {};
    for (const title of DRAFT_SECTION_TITLES) {
      const result = await generateDraftSection(companyInfo, programInfo, title, fullContext);
      sections[title] = result.text;
      await new Promise(r => setTimeout(r, 2000));
    }

    const appDir = path.join('applications', slug);
    const draftContent = Object.entries(sections)
      .map(([title, text]) => `## ${title}\n\n${text}`)
      .join('\n\n---\n\n');

    await writeNote(
      path.join(appDir, 'draft.md'),
      {
        slug,
        programName: pf.programName,
        generatedAt: new Date().toISOString(),
        status: 'draft',
        sections: DRAFT_SECTION_TITLES,
      },
      `# 지원서 초안: ${pf.programName}\n\n${draftContent}`
    );

    await new Promise(r => setTimeout(r, 2000));
    const reviewResult = await reviewDraft(sections);

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
    const consistencyResult = await checkConsistency(sections);

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

    const { callGeminiDirect, cleanAndParseJSON } = await import('../services/geminiService.js');

    const prompt = `당신은 한국 기업 정보 전문 리서처입니다.

## 작업
"${companyName.trim()}" 기업에 대해 알고 있는 모든 정보를 아래 JSON 형식으로 정리하세요.

## 규칙
1. 정확히 확인된 정보만 포함. 추측은 하지 마세요.
2. 모르는 필드는 빈 문자열 또는 빈 배열로 유지
3. 매출액은 원(KRW) 단위 숫자로 반환 (예: 10억 = 1000000000)
4. 사업자등록번호는 "000-00-00000" 형식
5. 핵심역량과 인증은 구체적으로 작성

반드시 아래 JSON 형식만 반환하세요:
{
  "name": "정식 법인명",
  "brandName": "브랜드명 (있을 경우)",
  "businessNumber": "사업자등록번호",
  "representative": "대표자명",
  "foundedDate": "설립일 (YYYY-MM-DD)",
  "industry": "업종 (업태/종목)",
  "address": "본사 주소",
  "factoryAddress": "공장/생산시설 주소 (있을 경우)",
  "revenue": 0,
  "employees": 0,
  "description": "기업 소개 (3~5문장, 핵심 사업과 차별점 포함)",
  "coreCompetencies": ["핵심역량1", "핵심역량2"],
  "certifications": ["인증1", "인증2"],
  "mainProducts": ["주요 제품/서비스1", "주요 제품/서비스2"],
  "phone": "대표 전화번호",
  "email": "대표 이메일",
  "website": "홈페이지 URL",
  "vision": "기업 비전/미션",
  "salesChannels": ["유통채널1", "유통채널2"]
}`;

    const result = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const parsed = cleanAndParseJSON(result.text) as Record<string, unknown>;

    res.json({ success: true, company: parsed });
  } catch (error) {
    console.error('[vault/company/research] Error:', error);
    res.status(500).json({ error: '기업 리서치 실패', details: String(error) });
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

export default router;

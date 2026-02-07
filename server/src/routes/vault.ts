import { Router, Request, Response } from 'express';
import path from 'path';
import {
  ensureVaultStructure,
  readNote,
  writeNote,
  listNotes,
  generateSlug,
  getVaultRoot,
  noteExists,
  writeBinaryFile,
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

const router = Router();

// 초기화: 볼트 구조 보장
ensureVaultStructure().catch(e => console.error('[vault] Failed to ensure vault structure:', e));

// ─── Helper ────────────────────────────────────────────────────

function programToFrontmatter(p: ServerSupportProgram, slug: string): Record<string, unknown> {
  return {
    id: p.id,
    slug,
    programName: p.programName,
    organizer: p.organizer,
    supportType: p.supportType,
    officialEndDate: p.officialEndDate,
    internalDeadline: p.internalDeadline,
    expectedGrant: p.expectedGrant,
    fitScore: 0,
    eligibility: '검토 필요',
    detailUrl: p.detailUrl,
    source: p.source,
    syncedAt: new Date().toISOString(),
    analyzedAt: '',
    status: 'synced',
    tags: ['program', p.supportType],
  };
}

function programToMarkdown(p: ServerSupportProgram): string {
  return `
# ${p.programName}

> [!info] 기본 정보
> - **주관**: ${p.organizer}
> - **지원금**: ${(p.expectedGrant / 100000000).toFixed(1)}억원 | **마감**: ${p.officialEndDate}

## 사업 설명
${p.description || '상세 내용은 공고문을 참조하세요.'}

## 자격요건
(AI 분석 후 채워짐)

## 필수서류
(AI 분석 후 채워짐)

## 공고문 분석
> [!note] PDF 분석
> (PDF 분석 후 채워짐)

## 적합도
(적합도 분석 후 채워짐)
`;
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
 * POST /api/vault/sync
 * 3개 API → 볼트에 프로그램 노트 생성/갱신
 */
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    await ensureVaultStructure();
    const programs = await fetchAllProgramsServerSide();

    let created = 0;
    let updated = 0;

    for (const p of programs) {
      const slug = generateSlug(p.programName, p.id);
      const filePath = path.join('programs', `${slug}.md`);
      const exists = await noteExists(filePath);

      if (exists) {
        // 기존 노트 업데이트: frontmatter의 syncedAt만 갱신
        const existing = await readNote(filePath);
        existing.frontmatter.syncedAt = new Date().toISOString();
        await writeNote(filePath, existing.frontmatter, existing.content);
        updated++;
      } else {
        const frontmatter = programToFrontmatter(p, slug);
        const content = programToMarkdown(p);
        await writeNote(filePath, frontmatter, content);
        created++;
      }
    }

    res.json({
      success: true,
      totalFetched: programs.length,
      created,
      updated,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[vault/sync] Error:', error);
    res.status(500).json({ error: '동기화 실패', details: String(error) });
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
    const { slug } = req.params;
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
    const { slug } = req.params;
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    // 기업 정보 로드
    const companyPath = path.join('company', 'profile.md');
    let company: Record<string, unknown> = {};
    if (await noteExists(companyPath)) {
      const { frontmatter } = await readNote(companyPath);
      company = frontmatter;
    }

    // 프로그램 정보 로드
    const { frontmatter: programFm, content: programContent } = await readNote(programPath);

    // AI 분석 실행
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

    // 분석 결과 노트 저장
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

    // 프로그램 frontmatter 업데이트
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

        // 기업 정보 로드
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

        // 분석 결과 저장
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

        // 프로그램 frontmatter 업데이트
        pf.fitScore = result.fitScore;
        pf.eligibility = result.eligibility;
        pf.analyzedAt = new Date().toISOString();
        pf.status = 'analyzed';
        await writeNote(file, pf, pc);

        results.push({ slug, fitScore: result.fitScore, eligibility: result.eligibility as string });

        // 2초 대기 (API rate limit)
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
    const { slug } = req.params;
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

    // PDF 다운로드 시도
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
        // HTML 페이지인 경우 텍스트로 분석
        const html = await response.text();
        pdfBase64 = Buffer.from(html.substring(0, 30000)).toString('base64');
      }
    } catch (e) {
      console.warn('[vault/download-pdf] Download failed:', e);
      res.status(502).json({ error: 'PDF 다운로드 실패' });
      return;
    }

    // AI 분석
    const analysis = await analyzePdf(pdfBase64, frontmatter.programName as string);

    // 분석 결과 저장
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
    const { slug } = req.params;
    const programPath = path.join('programs', `${slug}.md`);

    if (!(await noteExists(programPath))) {
      res.status(404).json({ error: '프로그램을 찾을 수 없습니다.' });
      return;
    }

    // 기업 정보
    const companyPath = path.join('company', 'profile.md');
    let company: Record<string, unknown> = {};
    if (await noteExists(companyPath)) {
      const { frontmatter } = await readNote(companyPath);
      company = frontmatter;
    }

    // 프로그램 정보
    const { frontmatter: pf, content: pc } = await readNote(programPath);

    // 분석 컨텍스트 로드
    let analysisContext = '';
    const analysisPath = path.join('analysis', `${slug}-fit.md`);
    if (await noteExists(analysisPath)) {
      const { content: ac } = await readNote(analysisPath);
      analysisContext = ac;
    }

    // PDF 분석 컨텍스트 로드
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

    // 6섹션 순차 생성 (2초 간격)
    const sections: Record<string, string> = {};
    for (const title of DRAFT_SECTION_TITLES) {
      const result = await generateDraftSection(companyInfo, programInfo, title, fullContext);
      sections[title] = result.text;
      await new Promise(r => setTimeout(r, 2000));
    }

    // 초안 저장
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

    // 리뷰 실행
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

    // 일관성 검사
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

    // 프로그램 status 업데이트
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

    // draft.md 파일만 필터
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
    const { slug } = req.params;
    const draftPath = path.join('applications', slug, 'draft.md');

    if (!(await noteExists(draftPath))) {
      res.status(404).json({ error: '지원서를 찾을 수 없습니다.' });
      return;
    }

    const draft = await readNote(draftPath);

    // 리뷰, 일관성 결과도 로드
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
    const { slug } = req.params;
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

export default router;

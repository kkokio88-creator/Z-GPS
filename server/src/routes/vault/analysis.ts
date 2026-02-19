import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import {
  readNote,
  writeNote,
  listNotes,
  getVaultRoot,
  noteExists,
} from '../../services/vaultFileService.js';
import {
  analyzeFit,
  analyzePdf,
  generateDraftSectionV2,
  reviewDraft,
  checkConsistency,
  analyzeSections,
  generateStrategyDocument,
} from '../../services/analysisService.js';
import type { FitAnalysisResult, FitDimensions } from '../../services/analysisService.js';
import { initSSE, sendProgress, sendComplete, sendError, isSSEConnected } from '../../utils/sse.js';
import { isSupabaseConfigured, upsertApplication } from '../../services/supabaseService.js';
import {
  loadAttachmentText,
  loadPdfAnalysisForSlug,
  isValidSlug,
  buildFitSectionMarkdown,
  strategyToMarkdown,
} from './programs.js';

const router = Router();

const DRAFT_SECTION_TITLES = [
  '사업 개요',
  '기술 개발 내용',
  '시장 분석 및 사업화 계획',
  '추진 일정 및 추진 체계',
  '예산 계획',
  '기대 효과',
];

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

    let strategyGenerated = false;
    if (result.fitScore >= 60) {
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
 * 전체 프로그램 일괄 분석
 */
router.post('/analyze-all', async (req: Request, res: Response) => {
  const useSSE = req.headers.accept === 'text/event-stream';

  try {
    if (useSSE) initSSE(res);

    const files = await listNotes(path.join(getVaultRoot(), 'programs'));
    const total = files.length;
    const results: { slug: string; fitScore: number; eligibility: string }[] = [];
    let errors = 0;

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

        if (result.fitScore >= 60) {
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
 * POST /api/vault/analyze-sections/:slug
 * 공고별 동적 섹션 스키마 분석
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

    let pdfAnalysis = '';
    const pdfAnalysisPath = path.join('attachments', 'pdf-analysis', `${slug}.md`);
    if (await noteExists(pdfAnalysisPath)) {
      const { content: pdc } = await readNote(pdfAnalysisPath);
      pdfAnalysis = pdc;
    }

    // slug 기반 PDF 분석 텍스트도 로드 (.txt 파일들)
    const pdfAnalysisText = await loadPdfAnalysisForSlug(slug);
    if (pdfAnalysisText) {
      pdfAnalysis = pdfAnalysis ? `${pdfAnalysis}\n\n${pdfAnalysisText}` : pdfAnalysisText;
    }

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

    // slug 기반 PDF 분석 텍스트도 로드 (.txt 파일들)
    const pdfAnalysisText = await loadPdfAnalysisForSlug(slug);

    const rawAttachmentText = await loadAttachmentText(
      (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [], 4000
    );

    const fullContext = [analysisContext, pdfContext, pdfAnalysisText, rawAttachmentText].filter(Boolean).join('\n\n');

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
      await new Promise(r => setTimeout(r, 4000)); // 429 방지: 4초 딜레이
    }

    // 초안 먼저 저장 (리뷰/일관성 실패해도 초안은 보존)
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

    const reviewSections: Record<string, string> = {};
    for (const sec of sectionSchema) {
      reviewSections[sec.title] = sections[sec.id] || '';
    }

    await new Promise(r => setTimeout(r, 4000));
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

    await new Promise(r => setTimeout(r, 4000));
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

    // Supabase 동기화
    if (isSupabaseConfigured()) {
      upsertApplication({
        programSlug: slug,
        draftSections: sections,
        sectionSchema: { programSlug: slug, sections: sectionSchema, generatedAt: new Date().toISOString(), source: schemaResult.source },
        review: reviewResult as unknown as Record<string, unknown>,
        consistency: consistencyResult as unknown as Record<string, unknown>,
        status: 'draft',
      }).catch(e => console.warn('[vault/generate-app] Supabase sync failed:', e));
    }

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

/**
 * POST /api/vault/generate-apps-batch
 * 적합도 70+ 공고에 대해 지원서 일괄 자동 생성 (SSE 진행률)
 */
router.post('/generate-apps-batch', async (req: Request, res: Response) => {
  const useSSE = req.headers.accept === 'text/event-stream';
  const minFitScore = Number(req.body?.minFitScore) || 70;
  const maxCount = Number(req.body?.maxCount) || 3; // API rate limit 보호: 기본 3건

  try {
    if (useSSE) initSSE(res);

    // 1. 기업 정보 로드
    const companyPath = path.join('company', 'profile.md');
    let company: Record<string, unknown> = {};
    if (await noteExists(companyPath)) {
      const { frontmatter } = await readNote(companyPath);
      company = frontmatter;
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
    };

    // 2. fitScore >= minFitScore인 프로그램 필터링
    const vaultRoot = getVaultRoot();
    const programFiles = await listNotes(path.join(vaultRoot, 'programs'));
    const allTargets: { file: string; slug: string; programName: string; fitScore: number }[] = [];

    for (const file of programFiles) {
      try {
        const { frontmatter: pf } = await readNote(file);
        const fitScore = Number(pf.fitScore) || 0;
        const slug = (pf.slug as string) || '';
        if (fitScore < minFitScore || !slug) continue;

        // 이미 지원서가 있으면 스킵
        const draftPath = path.join('applications', slug, 'draft.md');
        if (await noteExists(draftPath)) continue;

        allTargets.push({
          file,
          slug,
          programName: (pf.programName as string) || slug,
          fitScore,
        });
      } catch { /* 읽기 실패 무시 */ }
    }

    // fitScore 높은 순으로 정렬 후 maxCount로 제한
    allTargets.sort((a, b) => b.fitScore - a.fitScore);
    const targets = allTargets.slice(0, maxCount);
    const skipped = allTargets.length - targets.length;

    const total = targets.length;
    if (useSSE) sendProgress(res, `지원서 생성 시작 (${total}건${skipped > 0 ? `, ${skipped}건 대기` : ''})`, 0, total, '', 1);
    console.log(`[vault/generate-apps-batch] 대상: ${allTargets.length}건 중 상위 ${total}건 생성 (maxCount=${maxCount})`);

    const results: { slug: string; programName: string; success: boolean; error?: string }[] = [];

    // 3. 각 프로그램에 대해 지원서 생성
    for (let i = 0; i < targets.length; i++) {
      if (useSSE && !isSSEConnected(res)) { console.log('[vault/generate-apps-batch] 클라이언트 연결 끊김'); break; }
      const { file, slug, programName } = targets[i];

      if (useSSE) sendProgress(res, '지원서 생성 중', i + 1, total, programName, 1);

      try {
        const { frontmatter: pf, content: pc } = await readNote(file);

        // 분석 컨텍스트 로드
        let analysisContext = '';
        const analysisPath = path.join('analysis', `${slug}-fit.md`);
        if (await noteExists(analysisPath)) {
          const { content: ac } = await readNote(analysisPath);
          analysisContext = ac;
        }

        // PDF 분석 텍스트 로드
        const pdfContext = await loadPdfAnalysisForSlug(slug);
        const rawAttachmentText = await loadAttachmentText(
          (pf.attachments as { path: string; name: string; analyzed: boolean }[]) || [], 4000
        );
        const fullContext = [analysisContext, pdfContext, rawAttachmentText].filter(Boolean).join('\n\n');

        const programInfo = {
          programName: pf.programName as string,
          organizer: pf.organizer as string,
          supportType: pf.supportType as string,
          description: (pf.description as string) || pc.substring(0, 500),
          expectedGrant: pf.expectedGrant as number,
          officialEndDate: pf.officialEndDate as string,
        };

        // 섹션 스키마 분석
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

        // 각 섹션 초안 생성
        for (const sec of sectionSchema) {
          const result = await generateDraftSectionV2(companyInfo, programInfo, sec.title, fullContext, {
            evaluationCriteria: pf.evaluationCriteria as string[] || [],
            hints: sec.hints,
            evaluationWeight: sec.evaluationWeight,
            sectionDescription: sec.description,
          });
          sections[sec.id] = result.text;
          await new Promise(r => setTimeout(r, 4000)); // 429 방지: 4초 딜레이
        }

        // 초안 저장 (리뷰/일관성 실패해도 초안은 보존)
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

        // 리뷰 (실패해도 초안은 이미 저장됨)
        const reviewSections: Record<string, string> = {};
        for (const sec of sectionSchema) {
          reviewSections[sec.title] = sections[sec.id] || '';
        }

        await new Promise(r => setTimeout(r, 4000));
        const reviewResult = await reviewDraft(reviewSections);

        await writeNote(
          path.join(appDir, 'review.md'),
          {
            slug,
            totalScore: reviewResult.totalScore,
            reviewedAt: new Date().toISOString(),
            ...reviewResult.scores,
          },
          `# 리뷰 결과: ${pf.programName}\n\n## 총점: ${reviewResult.totalScore}/100\n\n## 피드백\n${reviewResult.feedback.map(f => `- ${f}`).join('\n')}\n`
        );

        // 일관성 검사
        await new Promise(r => setTimeout(r, 4000));
        const consistencyResult = await checkConsistency(reviewSections);

        await writeNote(
          path.join(appDir, 'consistency.md'),
          {
            slug,
            score: consistencyResult.score,
            checkedAt: new Date().toISOString(),
          },
          `# 일관성 검사: ${pf.programName}\n\n## 점수: ${consistencyResult.score}/100\n\n## 발견된 문제\n${consistencyResult.issues.map(i => `- [${i.severity}] ${i.section}: ${i.description}`).join('\n')}\n\n## 개선 제안\n${consistencyResult.suggestion}\n`
        );

        // 프로그램 상태 업데이트
        pf.status = 'applied';
        await writeNote(file, pf, pc);

        results.push({ slug, programName, success: true });
        console.log(`[vault/generate-apps-batch] ${programName} 완료`);
      } catch (e) {
        console.error(`[vault/generate-apps-batch] ${slug} 실패:`, e);
        results.push({ slug, programName, success: false, error: String(e) });
      }

      // 프로그램 간 쿨다운 (429 방지)
      if (i < targets.length - 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    const resultData = {
      success: true,
      total: allTargets.length,
      processed: total,
      generated: successCount,
      failed: failCount,
      skipped,
      results,
    };

    if (useSSE) {
      sendComplete(res, resultData);
    } else {
      res.json(resultData);
    }
  } catch (error) {
    console.error('[vault/generate-apps-batch] Error:', error);
    if (useSSE) {
      sendError(res, String(error));
    } else {
      res.status(500).json({ error: '일괄 지원서 생성 실패', details: String(error) });
    }
  }
});

export default router;

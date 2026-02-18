import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
  readNote,
  writeNote,
  listNotes,
  getVaultRoot,
  noteExists,
  generateSlug,
} from '../../services/vaultFileService.js';
import { fetchNpsEmployeeData, fetchNpsHistoricalData } from '../../services/employeeDataService.js';
import type { NpsLookupResult } from '../../services/employeeDataService.js';
import { findCorpCode, fetchFinancialStatements } from '../../services/dartFinancialService.js';
import type { DartFinancialYear } from '../../services/dartFinancialService.js';
import { fetchEmploymentInsurance, formatEIDataForPrompt } from '../../services/employmentInsuranceService.js';
import { fetchBusinessStatus, formatBusinessStatusForPrompt } from '../../services/businessStatusService.js';
import {
  recalculateWorksheet,
  generateTaxCalculationWorksheet,
} from '../../services/analysisService.js';
import type { TaxCalculationWorksheet, CompanyInfo } from '../../services/analysisService.js';

const router = Router();

/**
 * GET /api/vault/benefits
 * 수령 이력 전체 목록
 */
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

/**
 * GET /api/vault/benefits/summary
 * 수령 이력 통계 요약
 */
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

/**
 * POST /api/vault/benefits/tax-scan
 * 세금 환급 AI 스캔 실행
 */
router.post('/benefits/tax-scan', async (_req: Request, res: Response) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다' });
    }

    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    if (!(await noteExists(companyFile))) {
      return res.status(400).json({ error: '기업 정보가 등록되지 않았습니다. 설정에서 기업 프로필을 먼저 등록해주세요.' });
    }
    const { frontmatter: company } = await readNote(companyFile);

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

    let npsData: NpsLookupResult | null = null;
    const bizNo6 = company.businessNumber
      ? String(company.businessNumber).replace(/[^0-9]/g, '').substring(0, 6)
      : '';
    const npsCacheFile = bizNo6
      ? path.join(getVaultRoot(), 'benefits', `nps-cache-${bizNo6}.md`)
      : '';

    let cacheHit = false;
    if (npsCacheFile) {
      try {
        if (await noteExists(npsCacheFile)) {
          const { frontmatter: cached } = await readNote(npsCacheFile);
          const cachedAt = cached.cachedAt as string;
          if (cachedAt) {
            const ageMs = Date.now() - new Date(cachedAt).getTime();
            const TTL_30_DAYS = 30 * 24 * 60 * 60 * 1000;
            if (ageMs < TTL_30_DAYS) {
              npsData = cached.npsData as NpsLookupResult;
              cacheHit = true;
              console.log(`[tax-scan] NPS 캐시 hit (${Math.round(ageMs / 86400000)}일 전)`);
            }
          }
        }
      } catch { /* cache miss */ }
    }

    if (!cacheHit) {
      try {
        npsData = await fetchNpsEmployeeData(
          company.name as string,
          company.businessNumber as string | undefined
        );

        if (npsData?.found && npsData.workplace) {
          const workplacesForHistory = npsData.allWorkplaces
            ? npsData.allWorkplaces.filter(w => w.seq).map(w => ({
                seq: w.seq!,
                wkplNm: w.wkplNm,
                dataCrtYm: w.dataCrtYm,
                nrOfJnng: w.nrOfJnng,
              }))
            : npsData.workplace.seq
              ? [{ seq: npsData.workplace.seq, wkplNm: npsData.workplace.wkplNm, dataCrtYm: npsData.workplace.dataCrtYm, nrOfJnng: npsData.workplace.nrOfJnng }]
              : [];

          if (workplacesForHistory.length > 0) {
            console.log(`[tax-scan] NPS 히스토리 조회 시작: ${workplacesForHistory.length}개 사업장 × 60개월`);
            const historical = await fetchNpsHistoricalData(workplacesForHistory, 60);
            if (historical) {
              npsData = { ...npsData, historical };
              console.log(`[tax-scan] 히스토리 조회 완료: ${historical.monthlyData.length} 레코드`);
            }
          }

          if (npsCacheFile) {
            try {
              const cacheData: Record<string, unknown> = {
                type: 'nps-cache',
                cachedAt: new Date().toISOString(),
                npsData,
              };
              await writeNote(npsCacheFile, cacheData, 'NPS 데이터 캐시');
            } catch { /* cache save failure is non-critical */ }
          }
        }
      } catch (e) {
        console.warn('[vault/benefits/tax-scan] NPS lookup failed, continuing without:', e);
      }
    }

    let dartFinancials: DartFinancialYear[] = [];
    if (process.env.DART_API_KEY && company.name) {
      try {
        console.log(`[tax-scan] DART 재무제표 조회 시작: ${company.name}`);
        const corpCode = await findCorpCode(company.name as string);
        if (corpCode) {
          dartFinancials = await fetchFinancialStatements(corpCode, 5);
          console.log(`[tax-scan] DART 재무제표 조회 완료: ${dartFinancials.length}년분`);
        } else {
          console.log(`[tax-scan] DART corp_code 미발견: ${company.name}`);
        }
      } catch (e) {
        console.warn('[tax-scan] DART 재무 조회 실패:', e);
      }
    }

    let eiData: Awaited<ReturnType<typeof fetchEmploymentInsurance>> | null = null;
    let bizStatusData: Awaited<ReturnType<typeof fetchBusinessStatus>> | null = null;
    const fullBizNo = company.businessNumber ? String(company.businessNumber).replace(/[^0-9]/g, '') : '';
    if (fullBizNo.length >= 10) {
      const [eiResult, bizStatusResult] = await Promise.allSettled([
        fetchEmploymentInsurance(fullBizNo, company.name as string),
        fetchBusinessStatus(fullBizNo),
      ]);
      eiData = eiResult.status === 'fulfilled' ? eiResult.value : null;
      bizStatusData = bizStatusResult.status === 'fulfilled' ? bizStatusResult.value : null;
      if (eiData?.found) console.log(`[tax-scan] 고용보험 데이터 로드됨: ${eiData.info?.eiEmployeeCount}명`);
      if (bizStatusData?.found) console.log(`[tax-scan] 국세청 상태 조회됨: ${bizStatusData.info?.businessStatusName}`);
    }

    const [researchResult, analysisResult] = await Promise.allSettled([
      (async () => {
        const researchFile = path.join(getVaultRoot(), 'company', 'research.md');
        if (await noteExists(researchFile)) {
          const { content } = await readNote(researchFile);
          return content || '';
        }
        return '';
      })(),
      (async () => {
        const analysisDir = path.join(getVaultRoot(), 'analysis');
        const analysisFiles = await listNotes(analysisDir).catch(() => []);
        const summaries: string[] = [];
        for (const f of analysisFiles.slice(0, 10)) {
          try {
            const { frontmatter: af } = await readNote(f);
            if (af.fitScore && af.programName) {
              summaries.push(`- ${af.programName}: 적합도 ${af.fitScore}, 강점: ${(af.strengths as string[] || []).join(', ')}`);
            }
          } catch { /* skip */ }
        }
        return summaries.join('\n');
      })(),
    ]);

    const researchContent = researchResult.status === 'fulfilled' ? researchResult.value : '';
    const programFitData = analysisResult.status === 'fulfilled' ? analysisResult.value : '';

    const documentsMeta = Array.isArray(company.documents)
      ? (company.documents as Array<Record<string, unknown>>)
          .map(d => `- ${d.fileType || d.name}: ${d.status || '미확인'} (${d.uploadDate || '날짜 없음'})`)
          .join('\n')
      : '';

    const eiPromptData = eiData ? formatEIDataForPrompt(eiData) : '';
    const bizStatusPromptData = bizStatusData ? formatBusinessStatusForPrompt(bizStatusData) : '';

    if (researchContent) console.log('[tax-scan] 리서치 데이터 로드됨');
    if (programFitData) console.log('[tax-scan] 적합도 분석 데이터 로드됨');
    if (documentsMeta) console.log('[tax-scan] 보유 문서 메타 로드됨');

    const { scanMissedTaxBenefits } = await import('../../services/analysisService.js');
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
      benefitHistory,
      npsData,
      dartFinancials,
      researchContent,
      documentsMeta,
      programFitData,
      eiPromptData,
      bizStatusPromptData
    );

    const scanId = `scan-${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();
    const totalEstimatedRefund = result.opportunities.reduce((sum, o) => sum + (o.estimatedRefund || 0), 0);

    const cleanOpportunities = result.opportunities.map(o => {
      const cleaned: Record<string, unknown> = { ...o };
      for (const key of Object.keys(cleaned)) {
        if (cleaned[key] === undefined) delete cleaned[key];
      }
      return cleaned;
    });

    const scan = {
      id: scanId,
      scannedAt: now,
      opportunities: cleanOpportunities,
      totalEstimatedRefund,
      opportunityCount: cleanOpportunities.length,
      companySnapshot: {
        name: (company.name as string) || '',
        industry: (company.industry as string) || '',
        employees: Number(company.employees) || 0,
        revenue: Number(company.revenue) || 0,
        ...(company.foundedYear ? { foundedYear: Number(company.foundedYear) } : {}),
      },
      summary: result.summary,
      disclaimer: result.disclaimer,
      ...(npsData?.found ? {
        npsData,
        dataCompleteness: npsData.dataCompleteness,
      } : {}),
      ...(dartFinancials.length > 0 ? { dartFinancials } : {}),
      dataSources: {
        nps: !!npsData?.found,
        dart: dartFinancials.length > 0,
        ei: !!eiData?.found,
        bizStatus: !!bizStatusData?.found,
        research: !!researchContent,
        documents: !!documentsMeta,
        programFit: !!programFitData,
      },
    };

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

/**
 * GET /api/vault/benefits/tax-scan/latest
 * 최근 세금 환급 스캔 결과 조회
 */
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

    scanFiles.sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
    const { frontmatter } = await readNote(scanFiles[0].file);
    const { type: _type, ...scan } = frontmatter;

    res.json({ scan });
  } catch (error) {
    console.error('[vault/benefits/tax-scan/latest] Error:', error);
    res.status(500).json({ error: '세금 환급 스캔 결과 조회 실패' });
  }
});

/**
 * PATCH /api/vault/benefits/tax-scan/:scanId/opportunities/:oppId
 * 기회 상태 업데이트
 */
router.patch('/benefits/tax-scan/:scanId/opportunities/:oppId', async (req: Request, res: Response) => {
  try {
    const { scanId, oppId } = req.params;
    const { status, userOverrides } = req.body;
    const validStatuses = ['identified', 'in_progress', 'reviewing', 'filed', 'received', 'dismissed'];
    if (!status && !userOverrides) {
      return res.status(400).json({ error: 'status 또는 userOverrides가 필요합니다.' });
    }
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `유효하지 않은 상태입니다. 허용 값: ${validStatuses.join(', ')}` });
    }

    const scanFilePath = path.join(getVaultRoot(), 'benefits', `세금환급-스캔-${scanId}.md`);
    if (!(await noteExists(scanFilePath))) {
      return res.status(404).json({ error: '해당 스캔 결과를 찾을 수 없습니다.' });
    }

    const { frontmatter, content } = await readNote(scanFilePath);
    const opportunities = frontmatter.opportunities as Record<string, unknown>[];
    if (!Array.isArray(opportunities)) {
      return res.status(500).json({ error: '스캔 데이터 형식이 잘못되었습니다.' });
    }

    const oppIndex = opportunities.findIndex((o: Record<string, unknown>) => o.id === oppId);
    if (oppIndex === -1) {
      return res.status(404).json({ error: '해당 기회를 찾을 수 없습니다.' });
    }

    if (status) {
      opportunities[oppIndex].status = status;
    }

    if (userOverrides && typeof userOverrides === 'object') {
      const worksheet = opportunities[oppIndex].worksheet as TaxCalculationWorksheet | undefined;
      if (worksheet) {
        const recalculated = recalculateWorksheet(worksheet, userOverrides);
        opportunities[oppIndex].worksheet = recalculated as unknown as Record<string, unknown>;
        opportunities[oppIndex].estimatedRefund = recalculated.totalRefund;
      }
    }

    frontmatter.opportunities = opportunities;
    await writeNote(scanFilePath, frontmatter, content);

    const updatedOpp = opportunities[oppIndex];
    res.json({ success: true, oppId, status: updatedOpp.status, worksheet: updatedOpp.worksheet || null });
  } catch (error) {
    console.error('[vault/benefits/tax-scan/patch] Error:', error);
    res.status(500).json({ error: '기회 상태 업데이트 실패' });
  }
});

/**
 * POST /api/vault/benefits/tax-scan/:scanId/opportunities/:oppId/worksheet
 * 계산서 생성
 */
router.post('/benefits/tax-scan/:scanId/opportunities/:oppId/worksheet', async (req: Request, res: Response) => {
  try {
    const { scanId, oppId } = req.params;

    const scanFilePath = path.join(getVaultRoot(), 'benefits', `세금환급-스캔-${scanId}.md`);
    if (!(await noteExists(scanFilePath))) {
      return res.status(404).json({ error: '해당 스캔 결과를 찾을 수 없습니다.' });
    }

    const { frontmatter, content } = await readNote(scanFilePath);
    const opportunities = frontmatter.opportunities as Record<string, unknown>[];
    if (!Array.isArray(opportunities)) {
      return res.status(500).json({ error: '스캔 데이터 형식이 잘못되었습니다.' });
    }

    const oppIndex = opportunities.findIndex((o: Record<string, unknown>) => o.id === oppId);
    if (oppIndex === -1) {
      return res.status(404).json({ error: '해당 기회를 찾을 수 없습니다.' });
    }

    const companyDir = path.join(getVaultRoot(), 'company');
    const companyFiles = await listNotes(companyDir);
    let companyInfo: Record<string, unknown> = {};
    for (const f of companyFiles) {
      try {
        const { frontmatter: fm } = await readNote(f);
        if (fm.type === 'company') {
          companyInfo = fm;
          break;
        }
      } catch { /* skip */ }
    }

    if (!companyInfo.name) {
      return res.status(400).json({ error: '기업 정보가 등록되지 않았습니다.' });
    }

    let npsData = frontmatter.npsData as Record<string, unknown> | null;
    if (!npsData) {
      try {
        const bizNo = (companyInfo.businessNumber as string) || '';
        const name = (companyInfo.name as string) || '';
        if (bizNo || name) {
          npsData = await fetchNpsEmployeeData(bizNo, name) as unknown as Record<string, unknown>;
        }
      } catch { /* NPS 조회 실패 무시 */ }
    }

    const opp = opportunities[oppIndex] as unknown as Record<string, unknown>;
    const worksheet = await generateTaxCalculationWorksheet(
      {
        name: companyInfo.name as string,
        industry: companyInfo.industry as string | undefined,
        revenue: companyInfo.revenue as number | undefined,
        employees: companyInfo.employees as number | undefined,
        address: companyInfo.address as string | undefined,
        foundedYear: companyInfo.foundedYear as number | undefined,
        businessType: companyInfo.businessType as string | undefined,
      },
      {
        id: opp.id as string,
        taxBenefitName: opp.taxBenefitName as string,
        taxBenefitCode: opp.taxBenefitCode as string,
        estimatedRefund: opp.estimatedRefund as number,
        applicableYears: opp.applicableYears as number[],
        difficulty: opp.difficulty as 'EASY' | 'MODERATE' | 'COMPLEX',
        confidence: opp.confidence as number,
        legalBasis: opp.legalBasis as string[],
        description: opp.description as string,
        eligibilityReason: opp.eligibilityReason as string,
        requiredActions: opp.requiredActions as string[],
        requiredDocuments: opp.requiredDocuments as string[],
        estimatedProcessingTime: opp.estimatedProcessingTime as string,
        risks: opp.risks as string[],
        isAmendedReturn: opp.isAmendedReturn as boolean,
        status: (opp.status as string) as 'identified' | 'in_progress' | 'reviewing' | 'filed' | 'received' | 'dismissed',
      },
      npsData as unknown as NpsLookupResult | null
    );

    opportunities[oppIndex].worksheet = worksheet as unknown as Record<string, unknown>;
    opportunities[oppIndex].status = 'reviewing';
    frontmatter.opportunities = opportunities;
    await writeNote(scanFilePath, frontmatter, content);

    res.json({ success: true, worksheet, status: 'reviewing' });
  } catch (error) {
    console.error('[vault/benefits/tax-scan/worksheet] Error:', error);
    res.status(500).json({ error: '계산서 생성 실패' });
  }
});

/**
 * GET /api/vault/benefits/:id
 * 수령 이력 단일 조회
 */
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

/**
 * POST /api/vault/benefits
 * 수령 이력 등록
 */
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

/**
 * PUT /api/vault/benefits/:id
 * 수령 이력 수정
 */
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

/**
 * DELETE /api/vault/benefits/:id
 * 수령 이력 삭제
 */
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

/**
 * GET /api/vault/benefits/:id/analysis
 * 저장된 분석 결과 조회
 */
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

/**
 * POST /api/vault/benefits/:id/analyze
 * 단일 환급 분석 (AI)
 */
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

    let companyInfo: Record<string, unknown> = {};
    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    try {
      if (await noteExists(companyFile)) {
        const { frontmatter: cf } = await readNote(companyFile);
        companyInfo = cf;
      }
    } catch { /* skip */ }

    const { analyzeRefundEligibility } = await import('../../services/analysisService.js');
    const analysis = await analyzeRefundEligibility(
      companyInfo as unknown as CompanyInfo,
      {
        programName: benefitData.programName as string,
        category: benefitData.category as string,
        receivedAmount: Number(benefitData.receivedAmount),
        receivedDate: benefitData.receivedDate as string,
        conditions: (benefitData.conditions as string) || undefined,
        conditionsMet: benefitData.conditionsMet as boolean | null | undefined,
      }
    );

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

/**
 * POST /api/vault/benefits/summary-insight
 * 포트폴리오 인사이트 생성
 */
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

    let companyInfo: Record<string, unknown> = {};
    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    try {
      if (await noteExists(companyFile)) {
        const { frontmatter: cf } = await readNote(companyFile);
        companyInfo = cf;
      }
    } catch { /* skip */ }

    const { generateBenefitSummaryInsight } = await import('../../services/analysisService.js');
    const result = await generateBenefitSummaryInsight(
      companyInfo as unknown as CompanyInfo,
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

/**
 * POST /api/vault/benefits/analyze-all
 * 전체 일괄 환급 분석
 */
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

    let companyInfo: Record<string, unknown> = {};
    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    try {
      if (await noteExists(companyFile)) {
        const { frontmatter: cf } = await readNote(companyFile);
        companyInfo = cf;
      }
    } catch { /* skip */ }

    const { analyzeRefundEligibility } = await import('../../services/analysisService.js');
    const results: any[] = [];

    for (const { file, frontmatter: b } of benefits) {
      try {
        const analysis = await analyzeRefundEligibility(
          companyInfo as unknown as CompanyInfo,
          {
            programName: b.programName as string,
            category: b.category as string,
            receivedAmount: Number(b.receivedAmount),
            receivedDate: b.receivedDate as string,
            conditions: (b.conditions as string) || undefined,
            conditionsMet: b.conditionsMet as boolean | null | undefined,
          }
        );

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

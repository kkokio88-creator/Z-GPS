import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
  ensureVaultStructure,
  readNote,
  writeNote,
  listNotes,
  getVaultRoot,
  noteExists,
  writeBinaryFile,
  deleteBinaryFile,
} from '../../services/vaultFileService.js';
import { callGeminiDirect, cleanAndParseJSON } from '../../services/geminiService.js';
import { fetchNpsEmployeeData } from '../../services/employeeDataService.js';
import { isValidSlug } from './programs.js';

const router = Router();

// ─── Helper ────────────────────────────────────────────────────

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

  const products = data.mainProducts as string[] | undefined;
  if (products?.length) {
    md += `## 주요 제품/서비스\n${products.map(p => `- ${p}`).join('\n')}\n\n`;
  }

  const comps = data.coreCompetencies as string[] | undefined;
  if (comps?.length) {
    md += `## 핵심 역량\n${comps.map(c => `- ${c}`).join('\n')}\n\n`;
  }

  const certs = data.certifications as string[] | undefined;
  if (certs?.length) {
    md += `## 보유 인증\n${certs.map(c => `- ${c}`).join('\n')}\n\n`;
  }

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

  if (mp) {
    md += `## 시장 분석\n`;
    const comps2 = mp.competitors as string[] | undefined;
    if (comps2?.length) md += `### 경쟁사\n${comps2.map(c => `- ${c}`).join('\n')}\n\n`;
    if (mp.marketShare) md += `### 시장점유율\n${mp.marketShare}\n\n`;
    const usp = mp.uniqueSellingPoints as string[] | undefined;
    if (usp?.length) md += `### 차별화 포인트\n${usp.map(u => `- ${u}`).join('\n')}\n\n`;
  }

  if (ii) {
    md += `## 산업 인사이트\n`;
    const trends = ii.marketTrends as string[] | undefined;
    if (trends?.length) md += `### 시장 트렌드\n${trends.map(t => `- ${t}`).join('\n')}\n\n`;
    if (ii.industryOutlook) md += `### 산업 전망\n${ii.industryOutlook}\n\n`;
    if (ii.regulatoryEnvironment) md += `### 규제 환경\n${ii.regulatoryEnvironment}\n\n`;
    const tTrends = ii.technologyTrends as string[] | undefined;
    if (tTrends?.length) md += `### 기술 트렌드\n${tTrends.map(t => `- ${t}`).join('\n')}\n\n`;
  }

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

  if (fi?.recentRevenue) md += `## 재무 정보\n- 최근 매출: ${((fi.recentRevenue as number) / 100000000).toFixed(1)}억원\n- 성장률: ${fi.revenueGrowth || '정보 없음'}\n\n`;
  if (ei) {
    md += `## 고용 정보\n`;
    if (ei.averageSalary) md += `- 평균 연봉: ${((ei.averageSalary as number) / 10000).toFixed(0)}만원\n`;
    if (ei.creditRating) md += `- 신용등급: ${ei.creditRating}\n`;
    const benefits = ei.benefits as string[] | undefined;
    if (benefits?.length) md += `- 복리후생: ${benefits.join(', ')}\n`;
    md += '\n';
  }

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

// ─── Routes ────────────────────────────────────────────────────

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

    // 클라이언트가 보낸 키 우선 (사용자가 Settings에서 저장한 최신 키)
    const headerApiKey = req.headers['x-gemini-api-key'] as string | undefined;
    const effectiveApiKey = headerApiKey || process.env.GEMINI_API_KEY;
    if (!effectiveApiKey) {
      res.status(503).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다. 설정 > API 연동에서 키를 입력하세요.' });
      return;
    }
    // 서버 env에 유효한 키가 없으면 헤더 키로 런타임 복원
    if (headerApiKey && !process.env.GEMINI_API_KEY) {
      process.env.GEMINI_API_KEY = headerApiKey;
      console.log('[company/research] Restored GEMINI_API_KEY from client header');
    }

    const prompt = `당신은 한국 기업 정보 전문 리서처입니다.

## 작업
"${companyName.trim()}" 기업에 대해 알고 있는 모든 정보를 아래 JSON 형식으로 정리하세요.

## 중요 규칙
0. **반드시 "${companyName.trim()}"에 대한 정보만 반환하세요. 다른 기업의 정보를 반환하지 마세요.**
1. 정확히 확인된 정보만 포함. 추측은 하지 마세요.
2. 해당 기업을 찾을 수 없으면 {"name": null, "error": "기업 정보를 찾을 수 없습니다"}만 반환
3. 모르는 필드는 빈 문자열, 빈 배열 또는 null로 유지
4. 매출액은 원(KRW) 단위 숫자로 반환 (예: 10억 = 1000000000)
5. 사업자등록번호는 "000-00-00000" 형식
6. 핵심역량과 인증은 구체적으로 작성
7. SWOT 분석은 각 항목 3~5개씩 구체적으로 작성
8. 정부지원금 적합성은 해당 기업의 실제 강점을 기반으로 분석

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

    let userModel = 'gemini-2.0-flash';
    try {
      const cfgPath = path.join(getVaultRoot(), 'config.json');
      const cfgRaw = await fs.readFile(cfgPath, 'utf-8');
      const cfg = JSON.parse(cfgRaw);
      if (cfg.aiModel && typeof cfg.aiModel === 'string') userModel = cfg.aiModel;
    } catch { /* default model */ }

    const errors: string[] = [];
    let parsed: Record<string, unknown> | null = null;

    const hasValidContent = (obj: Record<string, unknown>): boolean => {
      const hasName = !!obj.name && String(obj.name).trim().length > 0;
      const hasDescription = !!obj.description && String(obj.description).trim().length > 0;
      const hasIndustry = !!obj.industry && String(obj.industry).trim().length > 0;
      const hasCompetencies = Array.isArray(obj.coreCompetencies) && obj.coreCompetencies.length > 0;
      const hasProducts = Array.isArray(obj.mainProducts) && obj.mainProducts.length > 0;
      const hasStrategic = !!(obj.strategicAnalysis &&
        typeof obj.strategicAnalysis === 'object' &&
        Object.keys(obj.strategicAnalysis as object).length > 0);
      return hasName && (hasDescription || hasIndustry || hasCompetencies || hasProducts || hasStrategic);
    };

    const tryGeminiStep = async (
      label: string,
      config: Record<string, unknown>
    ): Promise<boolean> => {
      try {
        const r = await callGeminiDirect(prompt, config, effectiveApiKey);
        const rawLen = r.text?.length || 0;
        console.log(`[company/research] ${label}: 응답 ${rawLen}자`);
        if (!r.text || rawLen < 10) {
          errors.push(`${label}: 응답 없음 (${rawLen}자)`);
          return false;
        }
        const raw = cleanAndParseJSON(r.text);
        const candidate = (Array.isArray(raw) && raw.length > 0 ? raw[0] : raw) as Record<string, unknown>;
        if (!candidate || typeof candidate !== 'object') {
          errors.push(`${label}: 파싱 결과가 객체가 아님`);
          return false;
        }
        const keys = Object.keys(candidate).filter(k => {
          const v = candidate[k];
          return v !== null && v !== undefined && v !== '' &&
            !(Array.isArray(v) && v.length === 0);
        });
        console.log(`[company/research] ${label}: 파싱 결과 유효 키 ${keys.length}개 [${keys.slice(0, 8).join(', ')}...]`);
        if (hasValidContent(candidate)) {
          parsed = candidate;
          console.log(`[company/research] ${label}: ✓ 유효 데이터 확인`);
          return true;
        }
        if (keys.length >= 3 && !parsed) {
          parsed = candidate;
          console.log(`[company/research] ${label}: △ 부분 데이터 사용 (유효 키 ${keys.length}개)`);
          return true;
        }
        errors.push(`${label}: 파싱 성공, 유효 키 ${keys.length}개이나 필수 조건 미충족`);
        return false;
      } catch (e) {
        errors.push(`${label}: ${String(e).substring(0, 200)}`);
        return false;
      }
    };

    await tryGeminiStep('1-Flash-JSON', {
      model: 'gemini-2.0-flash',
      responseMimeType: 'application/json',
    });

    if (!parsed && userModel !== 'gemini-2.0-flash') {
      await tryGeminiStep(`2-${userModel}-JSON`, {
        model: userModel,
        responseMimeType: 'application/json',
      });
    }

    if (!parsed) {
      await tryGeminiStep('3-Search', {
        model: 'gemini-2.0-flash',
        tools: [{ googleSearch: {} }],
      });
    }

    if (!parsed) {
      await tryGeminiStep('4-Text-fallback', {
        model: userModel,
      });
    }

    if (errors.length > 0) {
      console.warn(`[company/research] 폴백 로그 (${errors.length}회 시도):`, errors.join(' | '));
    }

    if (!parsed) {
      console.error(`[company/research] "${companyName.trim()}" 전체 실패: ${errors.join(' | ')}`);
      res.status(422).json({
        error: `"${companyName.trim()}" 기업 정보를 가져오지 못했습니다. 다시 시도해주세요.`,
        details: `AI 응답에서 유효한 기업 정보를 추출할 수 없습니다. (${errors.join(' | ')})`,
      });
      return;
    }

    const result = parsed as Record<string, unknown>;
    const queryName = companyName.trim();

    if (result.error) {
      res.status(404).json({
        error: `"${queryName}" 기업 정보를 찾을 수 없습니다. 정확한 기업명을 입력해주세요.`,
        notFound: true,
      });
      return;
    }

    if (!result.name || String(result.name).trim().length === 0) {
      result.name = queryName;
    }

    const returnedName = String(result.name || '').trim();
    const returnedBrand = String(result.brandName || '').trim();

    const normalizeName = (n: string) =>
      n.replace(/^(주식회사|㈜|\(주\)|\(사\)|사단법인|재단법인|유한회사|합자회사)\s*/g, '')
       .replace(/\s*(주식회사|㈜|\(주\))$/g, '')
       .replace(/\s+/g, '')
       .toLowerCase();

    const normalQuery = normalizeName(queryName);
    const checkMatch = (candidate: string) => {
      const nc = normalizeName(candidate);
      if (!nc) return false;
      return nc.includes(normalQuery) ||
        normalQuery.includes(nc) ||
        (normalQuery.length >= 2 && nc.length >= 2 &&
          (nc.startsWith(normalQuery.substring(0, 2)) ||
           normalQuery.startsWith(nc.substring(0, 2))));
    };

    const nameMatches = returnedName === queryName ||
      checkMatch(returnedName) ||
      checkMatch(returnedBrand);

    if (!nameMatches && returnedName.length > 0 && returnedName !== queryName) {
      console.warn(`[vault/company/research] 회사명 불완전 매칭: 검색="${queryName}" → 반환="${returnedName}" (brand="${returnedBrand}")`);
      const validKeys = Object.keys(result).filter(k => {
        const v = result[k];
        return v !== null && v !== undefined && v !== '' && v !== 0;
      });
      if (validKeys.length < 10) {
        res.status(422).json({
          error: `AI가 다른 기업 정보를 반환했습니다 ("${returnedName}"). "${queryName}"을(를) 다시 검색해주세요.`,
          details: `검색: ${queryName} → 반환: ${returnedName}`,
          mismatch: true,
        });
        return;
      }
    }

    if (process.env.DATA_GO_KR_API_KEY) {
      try {
        const npsData = await fetchNpsEmployeeData(
          companyName.trim(),
          (result.businessNumber as string) || undefined
        );
        if (npsData.found && npsData.workplace) {
          if (npsData.workplace.nrOfJnng > 0) {
            result.employees = npsData.workplace.nrOfJnng;
          }
          result.npsData = npsData;
        }
      } catch (e) {
        console.warn('[vault/company/research] NPS lookup during research failed:', e);
      }
    }

    try {
      const researchMd = generateResearchMarkdown(companyName.trim(), result);
      const researchPath = path.join('company', 'research.md');
      await writeNote(researchPath, {
        type: 'company-research',
        companyName: result.name || companyName.trim(),
        researchedAt: new Date().toISOString(),
      }, researchMd);
    } catch (e) {
      console.warn('[vault/company/research] Failed to save research markdown:', e);
    }

    res.json({ success: true, company: result });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[vault/company/research] Error:', errMsg, error instanceof Error ? error.stack : '');
    res.status(500).json({ error: '기업 리서치 실패', details: errMsg });
  }
});

/**
 * POST /api/vault/company/documents
 * 서류 업로드 (base64)
 */
router.post('/company/documents', async (req: Request, res: Response) => {
  try {
    const { name, fileName, fileData } = req.body as {
      name: string;
      fileName: string;
      fileData: string;
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

    await deleteBinaryFile(path.join('company', 'documents', doc.fileName));

    const updated = documents.filter(d => d.id !== docId);
    await writeDocIndex(updated);

    res.json({ success: true });
  } catch (error) {
    console.error('[vault/company/documents DELETE] Error:', error);
    res.status(500).json({ error: '서류 삭제 실패', details: String(error) });
  }
});

/**
 * GET /api/vault/company/nps-lookup
 * 국민연금 사업장 데이터 조회
 */
router.get('/company/nps-lookup', async (_req: Request, res: Response) => {
  try {
    const companyFile = path.join(getVaultRoot(), 'company', 'profile.md');
    if (!(await noteExists(companyFile))) {
      return res.status(400).json({ error: '기업 정보가 등록되지 않았습니다.' });
    }
    const { frontmatter: company } = await readNote(companyFile);
    const companyName = company.name as string;
    const businessNumber = company.businessNumber as string | undefined;

    if (!companyName) {
      return res.status(400).json({ error: '기업명이 등록되지 않았습니다.' });
    }

    const npsData = await fetchNpsEmployeeData(companyName, businessNumber);

    if (npsData.found && npsData.workplace) {
      const ym = npsData.workplace.dataCrtYm || new Date().toISOString().slice(0, 7).replace('-', '');
      const snapshotPath = path.join(getVaultRoot(), 'company', `nps-snapshot-${ym}.md`);
      const snapshotFm: Record<string, unknown> = {
        type: 'nps-snapshot',
        ...npsData.workplace,
        queriedAt: new Date().toISOString(),
        matchedByBusinessNumber: npsData.matchedByBusinessNumber,
      };
      await writeNote(snapshotPath, snapshotFm, `국민연금 사업장 데이터 (${ym})`);
    }

    const companyDir = path.join(getVaultRoot(), 'company');
    const companyFiles = await listNotes(companyDir);
    const snapshots: Record<string, unknown>[] = [];
    for (const f of companyFiles) {
      if (path.basename(f).startsWith('nps-snapshot-')) {
        try {
          const { frontmatter } = await readNote(f);
          if (frontmatter.type === 'nps-snapshot') snapshots.push(frontmatter);
        } catch { /* skip */ }
      }
    }

    res.json({ npsData, snapshots });
  } catch (error) {
    console.error('[vault/company/nps-lookup] Error:', error);
    res.status(500).json({ error: 'NPS 데이터 조회 실패' });
  }
});

export default router;

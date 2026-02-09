/**
 * 딥크롤링 서비스 (고도화)
 * 다단계 파이프라인: API 데이터 + 웹 크롤링 + AI 재가공
 * 사이트별 전용 파서 (어댑터 패턴)
 */

import { callGeminiDirect, cleanAndParseJSON } from './geminiService.js';
import { writeBinaryFile } from './vaultFileService.js';
import path from 'path';
import type { ServerSupportProgram } from './programFetcher.js';

// ─── 타입 정의 ─────────────────────────────────────────────

export interface DeepCrawlResult {
  department: string;
  supportScale: string;
  targetAudience: string;
  eligibilityCriteria: string[];
  requiredDocuments: string[];
  applicationPeriod: { start: string; end: string };
  evaluationCriteria: string[];
  contactInfo: string;
  fullDescription: string;
  applicationMethod: string;
  specialNotes: string[];
  regions: string[];
  categories: string[];
  // 고도화 추가 필드
  exclusionCriteria: string[];
  objectives: string[];
  supportDetails: string[];
  matchingRatio: string;
  totalBudget: string;
  selectionProcess: string[];
  announcementDate: string;
  selectionDate: string;
  projectPeriod: string;
  applicationUrl: string;
  contactPhone: string;
  contactEmail: string;
  keywords: string[];
  dataQualityScore: number;
  dataSources: string[];
}

export interface AttachmentLink {
  url: string;
  filename: string;
}

// ─── 크롤링 어댑터 인터페이스 ───────────────────────────────

interface CrawlAdapter {
  canHandle(url: string): boolean;
  extractMetadata(html: string): Record<string, string>;
  extractContent(html: string): string;
  extractAttachments(html: string, baseUrl: string): AttachmentLink[];
}

// ─── HTTP 요청 헤더 ─────────────────────────────────────────

const CRAWL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
};

// ─── 유틸리티 함수 ──────────────────────────────────────────

/** HTML에서 스크립트/스타일/네비게이션 제거 후 텍스트 추출 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** HTML 테이블에서 key-value 쌍 추출 */
function extractTableData(html: string): Record<string, string> {
  const result: Record<string, string> = {};

  // <th>키</th><td>값</td> 패턴
  const thTdRegex = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = thTdRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const value = match[2]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (key && value && value !== '-') {
      result[key] = value;
    }
  }

  // <dt>키</dt><dd>값</dd> 패턴
  const dtDdRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  while ((match = dtDdRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').trim();
    const value = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key && value) {
      result[key] = value;
    }
  }

  return result;
}

/** 본문 영역만 추출 (네비게이션/헤더/푸터 제외) */
function extractMainContent(html: string): string {
  // 우선순위별 콘텐츠 영역 셀렉터
  const patterns = [
    // bizinfo.go.kr
    /<div[^>]*class="[^"]*detail[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*class="[^"]*(?:btn|button|list)[^"]*")/i,
    /<div[^>]*class="[^"]*board[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*class="[^"]*(?:btn|button|list)[^"]*")/i,
    /<div[^>]*class="[^"]*view[_-]?content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*board[_-]?view[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*class)/i,
    // 일반적인 콘텐츠 영역
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*(?:id|class)="[^"]*(?:content|cont|detail|view)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1] && match[1].length > 300) {
      return match[1];
    }
  }

  // 폴백: body 전체
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch?.[1] || html;
}

// ─── 사이트별 어댑터 ────────────────────────────────────────

/** bizinfo.go.kr (기업마당) 전용 파서 */
class BizinfoAdapter implements CrawlAdapter {
  canHandle(url: string): boolean {
    return url.includes('bizinfo.go.kr');
  }

  extractMetadata(html: string): Record<string, string> {
    const tableData = extractTableData(html);
    const metadata: Record<string, string> = {};

    // 키 매핑
    const keyMap: Record<string, string> = {
      '사업명': 'programName',
      '공고명': 'programName',
      '공고기관': 'organizer',
      '주관기관': 'organizer',
      '수행기관': 'operatingOrg',
      '접수기간': 'applicationPeriod',
      '신청기간': 'applicationPeriod',
      '사업개요': 'description',
      '지원대상': 'targetAudience',
      '지원내용': 'supportDetails',
      '지원규모': 'supportScale',
      '지원금액': 'supportScale',
      '신청방법': 'applicationMethod',
      '제출서류': 'requiredDocuments',
      '문의처': 'contactInfo',
      '담당부서': 'department',
      '사업기간': 'projectPeriod',
      '선정방법': 'selectionProcess',
      '평가기준': 'evaluationCriteria',
      '참여제한': 'exclusionCriteria',
      '유의사항': 'specialNotes',
      '공고일': 'announcementDate',
    };

    for (const [rawKey, value] of Object.entries(tableData)) {
      for (const [pattern, mappedKey] of Object.entries(keyMap)) {
        if (rawKey.includes(pattern)) {
          metadata[mappedKey] = value;
          break;
        }
      }
    }

    return metadata;
  }

  extractContent(html: string): string {
    const mainContent = extractMainContent(html);
    return extractTextFromHtml(mainContent);
  }

  extractAttachments(html: string, baseUrl: string): AttachmentLink[] {
    return extractAttachmentLinks(html, baseUrl);
  }
}

/** K-Startup 전용 파서 */
class KStartupAdapter implements CrawlAdapter {
  canHandle(url: string): boolean {
    return url.includes('k-startup.go.kr');
  }

  extractMetadata(html: string): Record<string, string> {
    return extractTableData(html);
  }

  extractContent(html: string): string {
    const mainContent = extractMainContent(html);
    return extractTextFromHtml(mainContent);
  }

  extractAttachments(html: string, baseUrl: string): AttachmentLink[] {
    return extractAttachmentLinks(html, baseUrl);
  }
}

/** 범용 파서 (기타 사이트) */
class GenericAdapter implements CrawlAdapter {
  canHandle(_url: string): boolean {
    return true; // 항상 매칭 (폴백)
  }

  extractMetadata(html: string): Record<string, string> {
    return extractTableData(html);
  }

  extractContent(html: string): string {
    const mainContent = extractMainContent(html);
    return extractTextFromHtml(mainContent);
  }

  extractAttachments(html: string, baseUrl: string): AttachmentLink[] {
    return extractAttachmentLinks(html, baseUrl);
  }
}

// 어댑터 목록 (우선순위 순서)
const adapters: CrawlAdapter[] = [
  new BizinfoAdapter(),
  new KStartupAdapter(),
  new GenericAdapter(),
];

function getAdapter(url: string): CrawlAdapter {
  return adapters.find(a => a.canHandle(url)) || new GenericAdapter();
}

// ─── 첨부파일 처리 ──────────────────────────────────────────

/** HTML에서 첨부파일 링크 추출 */
export function extractAttachmentLinks(html: string, baseUrl: string): AttachmentLink[] {
  const links: AttachmentLink[] = [];
  const seenUrls = new Set<string>();
  const extensions = ['pdf', 'hwp', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'zip'];
  const extPattern = extensions.join('|');

  // 1. 직접 파일 링크 <a href="...파일.pdf">
  const anchorRegex = new RegExp(
    `<a[^>]+href=["']([^"']+\\.(?:${extPattern}))["'][^>]*>([^<]*)<\\/a>`,
    'gi'
  );
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    addLink(links, seenUrls, match[1], match[2].trim(), baseUrl);
  }

  // 2. 다운로드 API 링크
  const downloadRegex = /href=["']([^"']*(?:download|fileDown|filedown|attach|getFile|dnFile)[^"']*)["']/gi;
  while ((match = downloadRegex.exec(html)) !== null) {
    addLink(links, seenUrls, match[1], '', baseUrl);
  }

  // 3. onclick 이벤트에 숨겨진 다운로드
  const onclickRegex = /onclick=["'][^"']*(?:download|fileDown|fnDown)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((match = onclickRegex.exec(html)) !== null) {
    addLink(links, seenUrls, match[1], '', baseUrl);
  }

  // 4. data 속성에 숨겨진 URL
  const dataAttrRegex = /data-(?:file|download|url|href)=["']([^"']+\.(?:pdf|hwp|docx?|xlsx?|zip))["']/gi;
  while ((match = dataAttrRegex.exec(html)) !== null) {
    addLink(links, seenUrls, match[1], '', baseUrl);
  }

  return links;
}

function addLink(
  links: AttachmentLink[],
  seenUrls: Set<string>,
  href: string,
  text: string,
  baseUrl: string
): void {
  try {
    const absoluteUrl = new URL(href, baseUrl).toString();
    if (seenUrls.has(absoluteUrl)) return;
    seenUrls.add(absoluteUrl);
    const filename = text || decodeURIComponent(absoluteUrl.split('/').pop() || 'attachment');
    links.push({ url: absoluteUrl, filename });
  } catch {
    // 잘못된 URL 무시
  }
}

/** 첨부파일 다운로드 후 vault에 저장 */
export async function downloadAttachment(
  url: string,
  savePath: string
): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        ...CRAWL_HEADERS,
        'Referer': new URL(url).origin,
      },
    });

    if (!response.ok) {
      console.warn(`[deepCrawler] 다운로드 실패 (${response.status}): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // 파일 크기 제한 (50MB)
    if (buffer.length > 50 * 1024 * 1024) {
      console.warn(`[deepCrawler] 파일이 너무 큼 (${buffer.length} bytes): ${url}`);
      return null;
    }

    await writeBinaryFile(savePath, buffer);
    console.log(`[deepCrawler] 첨부파일 저장: ${savePath} (${buffer.length} bytes)`);
    return buffer;
  } catch (e) {
    console.error(`[deepCrawler] 첨부파일 다운로드 에러:`, e);
    return null;
  }
}

// ─── AI 재가공 ──────────────────────────────────────────────

/** API 데이터 + 크롤링 텍스트를 통합하여 Gemini로 구조화 */
async function enrichWithAI(
  apiData: Partial<ServerSupportProgram>,
  crawledText: string,
  crawledMetadata: Record<string, string>,
  attachmentTexts: string[]
): Promise<DeepCrawlResult> {
  const apiSummary = [
    apiData.programName ? `사업명: ${apiData.programName}` : '',
    apiData.organizer ? `주관: ${apiData.organizer}` : '',
    apiData.description ? `설명: ${apiData.description}` : '',
    apiData.targetAudience ? `대상: ${apiData.targetAudience}` : '',
    apiData.applicationMethod ? `신청방법: ${apiData.applicationMethod}` : '',
    apiData.contactInfo ? `연락처: ${apiData.contactInfo}` : '',
    apiData.supportScale ? `규모: ${apiData.supportScale}` : '',
    apiData.applicationPeriod ? `기간: ${apiData.applicationPeriod.start} ~ ${apiData.applicationPeriod.end}` : '',
    apiData.evaluationCriteria?.length ? `평가기준: ${apiData.evaluationCriteria.join(', ')}` : '',
    apiData.requiredDocuments?.length ? `서류: ${apiData.requiredDocuments.join(', ')}` : '',
    apiData.regions?.length ? `지역: ${apiData.regions.join(', ')}` : '',
    apiData.matchingRatio ? `매칭비율: ${apiData.matchingRatio}` : '',
  ].filter(Boolean).join('\n');

  const metadataSummary = Object.entries(crawledMetadata)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const attachmentSummary = attachmentTexts.length > 0
    ? attachmentTexts.join('\n\n---\n\n').substring(0, 10000)
    : '';

  // 크롤링 텍스트를 적절한 길이로 제한
  const trimmedCrawlText = crawledText.substring(0, 20000);

  const prompt = `당신은 정부 지원사업 공고 분석 전문가입니다.

## 입력 데이터

### 1. API에서 수집한 구조화 데이터:
${apiSummary || '(없음)'}

### 2. 웹페이지 메타데이터 (테이블에서 추출):
${metadataSummary || '(없음)'}

### 3. 웹페이지 본문 텍스트:
${trimmedCrawlText || '(없음)'}

${attachmentSummary ? `### 4. 첨부파일 텍스트:\n${attachmentSummary}` : ''}

## 작업
위 데이터를 종합하여 아래 JSON 형식으로 공고 정보를 **최대한 상세하게** 추출하세요.

## 규칙
1. 정보가 여러 소스에 있으면 가장 상세한 내용을 선택
2. 추측하지 말고, 원문에 있는 정보만 추출
3. 금액은 원문 그대로 유지 (예: "과제당 최대 2억원")
4. 날짜는 YYYY-MM-DD 형식으로 변환
5. 목록 항목은 각각 완전한 문장으로 작성
6. fullDescription은 원문의 핵심 내용을 3~5문단으로 풍부하게 정리
7. 없는 정보는 빈 문자열 또는 빈 배열로 유지

반드시 아래 JSON 형식만 반환하세요:
{
  "department": "담당 부서명",
  "supportScale": "지원 규모 (예: 과제당 최대 2억원, 자부담 30%)",
  "targetAudience": "지원 대상 설명 (최대한 상세하게)",
  "eligibilityCriteria": ["자격요건1 (상세 조건 포함)", "자격요건2"],
  "exclusionCriteria": ["참여 제한 대상1", "제외 대상2"],
  "requiredDocuments": ["필수서류1", "필수서류2"],
  "applicationPeriod": { "start": "2026-01-01", "end": "2026-12-31" },
  "evaluationCriteria": ["평가기준1 (배점)", "평가기준2 (배점)"],
  "selectionProcess": ["서류심사", "발표평가", "현장실사"],
  "contactInfo": "담당자/부서 연락처",
  "contactPhone": "전화번호",
  "contactEmail": "이메일",
  "fullDescription": "사업 상세 설명 (3~5문단, 500자 이상)",
  "objectives": ["사업 목적1", "사업 목적2"],
  "supportDetails": ["지원 내용 상세1", "지원 내용 상세2"],
  "applicationMethod": "신청 방법 상세 (온라인/오프라인/URL 등)",
  "applicationUrl": "온라인 신청 URL",
  "specialNotes": ["유의사항1", "유의사항2"],
  "matchingRatio": "매칭(자부담) 비율 설명",
  "totalBudget": "총 사업 예산",
  "announcementDate": "공고일 (YYYY-MM-DD)",
  "selectionDate": "선정 발표 예정일 (YYYY-MM-DD)",
  "projectPeriod": "사업 수행 기간",
  "regions": ["대상 지역1"],
  "categories": ["분류 카테고리1", "카테고리2"],
  "keywords": ["검색 키워드1", "키워드2"]
}`;

  try {
    const result = await callGeminiDirect(prompt, { responseMimeType: 'application/json' });
    const parsed = cleanAndParseJSON(result.text) as Record<string, unknown>;

    // 데이터 품질 점수 계산
    const qualityFields = [
      'fullDescription', 'targetAudience', 'eligibilityCriteria',
      'requiredDocuments', 'evaluationCriteria', 'applicationMethod',
      'contactInfo', 'supportScale'
    ];
    let filledCount = 0;
    for (const field of qualityFields) {
      const val = parsed[field];
      if (val && ((typeof val === 'string' && val.length > 5) ||
        (Array.isArray(val) && val.length > 0))) {
        filledCount++;
      }
    }
    const qualityScore = Math.round((filledCount / qualityFields.length) * 100);

    // 데이터 소스 추적
    const dataSources: string[] = [];
    if (apiSummary.length > 20) dataSources.push('api');
    if (crawledText.length > 100) dataSources.push('crawl');
    if (metadataSummary.length > 20) dataSources.push('metadata');
    if (attachmentSummary.length > 100) dataSources.push('attachment');

    return {
      department: (parsed.department as string) || '',
      supportScale: (parsed.supportScale as string) || '',
      targetAudience: (parsed.targetAudience as string) || '',
      eligibilityCriteria: (parsed.eligibilityCriteria as string[]) || [],
      requiredDocuments: (parsed.requiredDocuments as string[]) || [],
      applicationPeriod: {
        start: (parsed.applicationPeriod as Record<string, string>)?.start || '',
        end: (parsed.applicationPeriod as Record<string, string>)?.end || '',
      },
      evaluationCriteria: (parsed.evaluationCriteria as string[]) || [],
      contactInfo: (parsed.contactInfo as string) || '',
      fullDescription: (parsed.fullDescription as string) || '',
      applicationMethod: (parsed.applicationMethod as string) || '',
      specialNotes: (parsed.specialNotes as string[]) || [],
      regions: (parsed.regions as string[]) || [],
      categories: (parsed.categories as string[]) || [],
      // 고도화 추가 필드
      exclusionCriteria: (parsed.exclusionCriteria as string[]) || [],
      objectives: (parsed.objectives as string[]) || [],
      supportDetails: (parsed.supportDetails as string[]) || [],
      matchingRatio: (parsed.matchingRatio as string) || '',
      totalBudget: (parsed.totalBudget as string) || '',
      selectionProcess: (parsed.selectionProcess as string[]) || [],
      announcementDate: (parsed.announcementDate as string) || '',
      selectionDate: (parsed.selectionDate as string) || '',
      projectPeriod: (parsed.projectPeriod as string) || '',
      applicationUrl: (parsed.applicationUrl as string) || '',
      contactPhone: (parsed.contactPhone as string) || '',
      contactEmail: (parsed.contactEmail as string) || '',
      keywords: (parsed.keywords as string[]) || [],
      dataQualityScore: qualityScore,
      dataSources,
    };
  } catch (e) {
    console.error('[deepCrawler] AI 재가공 실패:', e);
    // AI 실패 시 API 데이터라도 활용
    if (apiData && Object.keys(apiData).length > 0) {
      console.log('[deepCrawler] API 데이터로 폴백 처리');
      return {
        department: apiData.department || '',
        supportScale: apiData.supportScale || '',
        targetAudience: apiData.targetAudience || '',
        eligibilityCriteria: apiData.eligibilityCriteria || [],
        requiredDocuments: apiData.requiredDocuments || [],
        applicationPeriod: apiData.applicationPeriod || { start: '', end: '' },
        evaluationCriteria: apiData.evaluationCriteria || [],
        contactInfo: apiData.contactInfo || '',
        fullDescription: apiData.fullDescription || apiData.description || '',
        applicationMethod: apiData.applicationMethod || '',
        specialNotes: apiData.specialNotes || [],
        regions: apiData.regions || [],
        categories: apiData.categories || [],
        exclusionCriteria: apiData.exclusionCriteria || [],
        objectives: apiData.objectives || [],
        supportDetails: apiData.supportDetails || [],
        matchingRatio: apiData.matchingRatio || '',
        totalBudget: apiData.totalBudget || '',
        selectionProcess: apiData.selectionProcess || [],
        announcementDate: apiData.announcementDate || '',
        selectionDate: apiData.selectionDate || '',
        projectPeriod: apiData.projectPeriod || '',
        applicationUrl: apiData.applicationUrl || '',
        contactPhone: apiData.contactPhone || '',
        contactEmail: apiData.contactEmail || '',
        keywords: apiData.keywords || [],
        dataQualityScore: 25,
        dataSources: ['api'],
      };
    }
    return createEmptyResult();
  }
}

/** API 데이터만으로 AI 재가공 (크롤링 실패 시 폴백) */
async function enrichFromApiOnly(
  apiData: Partial<ServerSupportProgram>
): Promise<DeepCrawlResult> {
  // API에 이미 풍부한 데이터가 있으면 AI 없이 직접 매핑
  if (apiData.fullDescription && apiData.fullDescription.length > 200) {
    return {
      department: apiData.department || '',
      supportScale: apiData.supportScale || '',
      targetAudience: apiData.targetAudience || '',
      eligibilityCriteria: apiData.eligibilityCriteria || [],
      requiredDocuments: apiData.requiredDocuments || [],
      applicationPeriod: apiData.applicationPeriod || { start: '', end: '' },
      evaluationCriteria: apiData.evaluationCriteria || [],
      contactInfo: apiData.contactInfo || '',
      fullDescription: apiData.fullDescription,
      applicationMethod: apiData.applicationMethod || '',
      specialNotes: apiData.specialNotes || [],
      regions: apiData.regions || [],
      categories: apiData.categories || [],
      exclusionCriteria: apiData.exclusionCriteria || [],
      objectives: apiData.objectives || [],
      supportDetails: apiData.supportDetails || [],
      matchingRatio: apiData.matchingRatio || '',
      totalBudget: apiData.totalBudget || '',
      selectionProcess: apiData.selectionProcess || [],
      announcementDate: apiData.announcementDate || '',
      selectionDate: apiData.selectionDate || '',
      projectPeriod: apiData.projectPeriod || '',
      applicationUrl: apiData.applicationUrl || '',
      contactPhone: apiData.contactPhone || '',
      contactEmail: apiData.contactEmail || '',
      keywords: apiData.keywords || [],
      dataQualityScore: 50,
      dataSources: ['api'],
    };
  }

  // API 데이터를 AI로 보강
  return enrichWithAI(apiData, '', {}, []);
}

function createEmptyResult(): DeepCrawlResult {
  return {
    department: '', supportScale: '', targetAudience: '',
    eligibilityCriteria: [], requiredDocuments: [],
    applicationPeriod: { start: '', end: '' },
    evaluationCriteria: [], contactInfo: '', fullDescription: '',
    applicationMethod: '', specialNotes: [], regions: [], categories: [],
    exclusionCriteria: [], objectives: [], supportDetails: [],
    matchingRatio: '', totalBudget: '', selectionProcess: [],
    announcementDate: '', selectionDate: '', projectPeriod: '',
    applicationUrl: '', contactPhone: '', contactEmail: '',
    keywords: [], dataQualityScore: 0, dataSources: [],
  };
}

// ─── 메인 크롤링 함수 ───────────────────────────────────────

/**
 * 공고 상세페이지 딥크롤 → 구조화 데이터 추출
 * 다단계 파이프라인: 크롤링 → 메타데이터 추출 → AI 재가공
 */
export async function deepCrawlProgram(
  detailUrl: string,
  programName: string,
  apiData?: Partial<ServerSupportProgram>
): Promise<DeepCrawlResult | null> {
  try {
    console.log(`[deepCrawler] 딥크롤 시작: ${programName}`);
    console.log(`[deepCrawler] URL: ${detailUrl}`);

    // URL 유효성 검증
    if (!detailUrl || detailUrl === 'https://www.mss.go.kr/' || detailUrl === 'https://www.k-startup.go.kr/') {
      console.warn(`[deepCrawler] 유효하지 않은 상세 URL, API 데이터로 폴백: ${detailUrl}`);
      if (apiData) {
        return enrichFromApiOnly(apiData);
      }
      return null;
    }

    // 메인 페이지 URL인지 확인 (경로가 / 또는 빈 문자열)
    try {
      const parsedUrl = new URL(detailUrl);
      if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
        console.warn(`[deepCrawler] 메인 페이지 URL 감지, API 데이터로 폴백: ${detailUrl}`);
        if (apiData) {
          return enrichFromApiOnly(apiData);
        }
        return null;
      }
    } catch {
      console.warn(`[deepCrawler] URL 파싱 실패: ${detailUrl}`);
      if (apiData) {
        return enrichFromApiOnly(apiData);
      }
      return null;
    }

    // HTTP 요청 (10초 타임아웃)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let html: string;
    try {
      const response = await fetch(detailUrl, {
        headers: CRAWL_HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[deepCrawler] 페이지 로드 실패 (${response.status}): ${detailUrl}`);
        if (apiData) {
          return enrichFromApiOnly(apiData);
        }
        return null;
      }

      html = await response.text();
    } catch (fetchError) {
      clearTimeout(timeout);
      console.warn(`[deepCrawler] 페이지 요청 실패: ${detailUrl}`, fetchError);
      if (apiData) {
        return enrichFromApiOnly(apiData);
      }
      return null;
    }

    // 어댑터 선택 및 파싱
    const adapter = getAdapter(detailUrl);
    const metadata = adapter.extractMetadata(html);
    const content = adapter.extractContent(html);

    if (content.length < 50 && !apiData?.fullDescription) {
      console.warn(`[deepCrawler] 내용이 너무 짧음 (${content.length}자): ${programName}`);
      if (apiData) {
        return enrichFromApiOnly(apiData);
      }
      return null;
    }

    // AI 재가공 (API 데이터 + 크롤링 데이터 통합)
    const crawlResult = await enrichWithAI(
      apiData || {},
      content,
      metadata,
      []
    );

    console.log(`[deepCrawler] 딥크롤 완료: ${programName} (품질 점수: ${crawlResult.dataQualityScore})`);
    return crawlResult;
  } catch (e) {
    console.error(`[deepCrawler] 딥크롤 실패 (${programName}):`, e);
    if (apiData) {
      return enrichFromApiOnly(apiData);
    }
    return null;
  }
}

/**
 * 단일 프로그램 전체 딥크롤 파이프라인
 * (API 데이터 + 상세페이지 크롤 + 첨부파일 다운로드 + AI 재가공)
 */
export async function deepCrawlProgramFull(
  detailUrl: string,
  programName: string,
  slug: string,
  apiData?: Partial<ServerSupportProgram>
): Promise<{
  crawlResult: DeepCrawlResult | null;
  attachments: { path: string; name: string; analyzed: boolean }[];
}> {
  const attachments: { path: string; name: string; analyzed: boolean }[] = [];

  // URL 유효성 검증
  if (!detailUrl) {
    if (apiData) return { crawlResult: await enrichFromApiOnly(apiData), attachments };
    return { crawlResult: null, attachments };
  }

  let isValidUrl = false;
  try {
    const parsedUrl = new URL(detailUrl);
    isValidUrl = parsedUrl.pathname !== '/' && parsedUrl.pathname !== '';
  } catch {
    // invalid URL
  }

  if (!isValidUrl ||
      detailUrl === 'https://www.mss.go.kr/' ||
      detailUrl === 'https://www.k-startup.go.kr/') {
    console.warn(`[deepCrawler] 유효하지 않은 URL, API 데이터로 폴백: ${detailUrl}`);
    if (apiData) return { crawlResult: await enrichFromApiOnly(apiData), attachments };
    return { crawlResult: null, attachments };
  }

  // 1. 한 번만 HTML fetch (크롤링 + 첨부파일 공유)
  let html: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(detailUrl, {
      headers: CRAWL_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      html = await response.text();
    } else {
      console.warn(`[deepCrawler] 페이지 로드 실패 (${response.status}): ${detailUrl}`);
    }
  } catch (e) {
    console.warn(`[deepCrawler] 페이지 요청 실패: ${detailUrl}`, e);
  }

  // 2. 크롤링 + AI 재가공
  let crawlResult: DeepCrawlResult | null = null;

  if (html && html.length > 100) {
    try {
      console.log(`[deepCrawler] 딥크롤 시작: ${programName}`);
      const adapter = getAdapter(detailUrl);
      const metadata = adapter.extractMetadata(html);
      const content = adapter.extractContent(html);

      if (content.length >= 50 || apiData?.fullDescription) {
        crawlResult = await enrichWithAI(apiData || {}, content, metadata, []);
        console.log(`[deepCrawler] 딥크롤 완료: ${programName} (품질: ${crawlResult.dataQualityScore})`);
      } else {
        console.warn(`[deepCrawler] 내용 부족 (${content.length}자), API 폴백`);
        if (apiData) crawlResult = await enrichFromApiOnly(apiData);
      }
    } catch (e) {
      console.error(`[deepCrawler] 파싱/AI 실패 (${programName}):`, e);
      if (apiData) crawlResult = await enrichFromApiOnly(apiData);
    }
  } else {
    // HTML 가져오기 실패 → API 데이터 폴백
    if (apiData) crawlResult = await enrichFromApiOnly(apiData);
  }

  // 3. 첨부파일 추출 및 다운로드 (이미 가져온 HTML 재사용)
  if (html) {
    try {
      // API에서 제공한 첨부파일 URL도 포함
      const links = extractAttachmentLinks(html, detailUrl);

      // API에서 이미 알고 있는 첨부파일 URL 추가
      if (apiData?.attachmentUrls) {
        for (const url of apiData.attachmentUrls) {
          const filename = decodeURIComponent(url.split('/').pop() || 'attachment');
          if (!links.some(l => l.url === url)) {
            links.push({ url, filename });
          }
        }
      }

      for (let i = 0; i < links.length && i < 5; i++) {
        const link = links[i];
        const ext = link.filename.split('.').pop() || 'pdf';
        const savePath = path.join('attachments', 'pdfs', `${slug}-${i}.${ext}`);

        const buffer = await downloadAttachment(link.url, savePath);
        if (buffer) {
          attachments.push({ path: savePath, name: link.filename, analyzed: false });
        }
      }
    } catch (e) {
      console.warn(`[deepCrawler] 첨부파일 처리 에러:`, e);
    }
  }

  // 4. API 첨부파일 URL이 있고 HTML에서 못 찾은 경우 직접 다운로드
  if (attachments.length === 0 && apiData?.attachmentUrls?.length) {
    for (let i = 0; i < apiData.attachmentUrls.length && i < 5; i++) {
      const url = apiData.attachmentUrls[i];
      try {
        const filename = decodeURIComponent(url.split('/').pop() || 'attachment');
        const ext = filename.split('.').pop() || 'pdf';
        const savePath = path.join('attachments', 'pdfs', `${slug}-${i}.${ext}`);
        const buffer = await downloadAttachment(url, savePath);
        if (buffer) {
          attachments.push({ path: savePath, name: filename, analyzed: false });
        }
      } catch (e) {
        console.warn(`[deepCrawler] API 첨부파일 다운로드 실패: ${url}`, e);
      }
    }
  }

  return { crawlResult, attachments };
}

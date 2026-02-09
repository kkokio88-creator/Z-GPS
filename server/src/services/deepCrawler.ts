/**
 * 딥크롤링 서비스 (고도화 v2)
 * 다단계 파이프라인: API 데이터 + cheerio DOM 파싱 + PDF 추출 + AI 재가공
 * 사이트별 전용 파서 (어댑터 패턴)
 */

import { callGeminiDirect, cleanAndParseJSON } from './geminiService.js';
import { writeBinaryFile } from './vaultFileService.js';
import path from 'path';
import * as cheerio from 'cheerio';
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

// ─── cheerio 기반 유틸리티 함수 ──────────────────────────────

/** cheerio로 HTML 테이블에서 key-value 쌍 추출 */
function extractTableDataCheerio(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const result: Record<string, string> = {};

  // <th>키</th><td>값</td> 패턴
  $('table tr').each((_i, row) => {
    const $row = $(row);
    const ths = $row.find('th');
    const tds = $row.find('td');

    ths.each((j, th) => {
      const key = $(th).text().replace(/\s+/g, ' ').trim();
      const td = tds.eq(j);
      if (td.length && key) {
        // td 안의 br을 줄바꿈으로, 나머지 태그는 텍스트로
        const value = td.html()
          ?.replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim() || '';
        if (value && value !== '-') {
          result[key] = value;
        }
      }
    });
  });

  // <dt>키</dt><dd>값</dd> 패턴
  $('dl').each((_i, dl) => {
    const $dl = $(dl);
    $dl.find('dt').each((_j, dt) => {
      const key = $(dt).text().trim();
      const dd = $(dt).next('dd');
      if (dd.length && key) {
        const value = dd.text().replace(/\s+/g, ' ').trim();
        if (value) {
          result[key] = value;
        }
      }
    });
  });

  // .label/.value 또는 .tit/.cont 패턴 (한국 정부 사이트 공통)
  $('[class*=info] [class*=label], [class*=info] [class*=tit]').each((_i, el) => {
    const key = $(el).text().trim();
    const valueEl = $(el).next('[class*=value], [class*=cont], [class*=txt]');
    if (valueEl.length && key) {
      const value = valueEl.text().replace(/\s+/g, ' ').trim();
      if (value) {
        result[key] = value;
      }
    }
  });

  return result;
}

/** cheerio로 본문 영역 추출 (noise 제거) */
function extractMainContentCheerio(html: string): string {
  const $ = cheerio.load(html);

  // noise 요소 제거
  $('script, style, nav, header, footer, aside, .gnb, .lnb, .snb, #header, #footer, #gnb, .breadcrumb, .skip-nav, .top-banner').remove();

  // 우선순위별 콘텐츠 영역 시도
  const selectors = [
    '.detail-content', '.detail_content', '.detailContent',
    '.board-content', '.board_content', '.boardContent',
    '.view-content', '.view_content', '.viewContent',
    '.board-view', '.board_view', '.boardView',
    '.bbs_view', '.bbs-view',
    '.content-detail', '.content_detail',
    '.view-area', '.view_area',
    'article', 'main',
    '[class*="content"][class*="detail"]',
    '[class*="content"][class*="view"]',
    '[id*="content"]',
  ];

  for (const selector of selectors) {
    const el = $(selector);
    if (el.length && el.text().trim().length > 200) {
      return el.html() || '';
    }
  }

  // 폴백: body 전체 (noise 이미 제거됨)
  return $('body').html() || html;
}

/** HTML에서 텍스트 추출 (cheerio 기반) */
function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // 블록 요소 뒤에 줄바꿈 삽입
  $('br').replaceWith('\n');
  $('p, div, tr, li, h1, h2, h3, h4, h5, h6').each((_i, el) => {
    $(el).append('\n');
  });

  return $.text()
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** cheerio로 섹션 헤더 기반 구조적 콘텐츠 추출 */
function extractSectionContent($: cheerio.CheerioAPI, sectionHeaders: string[]): string {
  const sections: string[] = [];

  // h3, h4, strong, b 태그에서 섹션 헤더 찾기
  $('h3, h4, h5, strong, b, .tit, .title').each((_i, el) => {
    const headerText = $(el).text().trim();
    const isRelevant = sectionHeaders.some(h => headerText.includes(h));
    if (isRelevant) {
      // 헤더 이후의 형제 요소에서 콘텐츠 추출
      let content = '';
      let nextEl = $(el).parent().next();
      // 같은 형제가 없으면 부모의 다음 형제 시도
      if (!nextEl.length) {
        nextEl = $(el).next();
      }
      for (let j = 0; j < 5 && nextEl.length; j++) {
        const tag = nextEl.prop('tagName')?.toLowerCase() || '';
        // 다음 헤더를 만나면 중단
        if (['h3', 'h4', 'h5'].includes(tag)) break;
        content += nextEl.text().trim() + '\n';
        nextEl = nextEl.next();
      }
      if (content.trim()) {
        sections.push(`[${headerText}]\n${content.trim()}`);
      }
    }
  });

  return sections.join('\n\n');
}

// ─── 텍스트 전처리 ──────────────────────────────────────────

/** 크롤링된 텍스트에서 한국 정부 공고 섹션을 사전 추출 (라인 기반, ReDoS 안전) */
function preprocessCrawledText(text: string): {
  structuredSections: string;
  fullText: string;
} {
  const sectionHeaders: { name: string; keywords: string[] }[] = [
    { name: '자격요건', keywords: ['자격요건', '신청자격', '지원자격', '참여자격', '지원대상자격', '응모자격', '참여대상'] },
    { name: '필수서류', keywords: ['제출서류', '구비서류', '필수서류', '신청서류', '첨부서류', '제출서류목록'] },
    { name: '평가기준', keywords: ['평가기준', '심사기준', '선정기준', '배점기준', '심사항목', '평가항목', '선정방법'] },
    { name: '지원내용', keywords: ['지원내용', '사업내용', '지원사항', '지원규모'] },
    { name: '선정절차', keywords: ['선정절차', '심사절차', '선발절차', '선정과정', '심사과정'] },
  ];

  const lines = text.split('\n');
  const extracted: string[] = [];

  for (const section of sectionHeaders) {
    for (let i = 0; i < lines.length; i++) {
      const lineNoSpace = lines[i].replace(/\s/g, '');
      const matched = section.keywords.some(kw => lineNoSpace.includes(kw));
      if (!matched) continue;

      // 헤더 이후 줄들을 수집 (다음 헤더나 빈 줄 2개 연속까지, 최대 30줄)
      const contentLines: string[] = [];
      for (let j = i + 1; j < lines.length && j < i + 31; j++) {
        const line = lines[j].trim();
        // 다음 섹션 헤더를 만나면 중단
        const isNextHeader = sectionHeaders.some(s =>
          s.keywords.some(kw => line.replace(/\s/g, '').includes(kw)) && s.name !== section.name
        );
        if (isNextHeader) break;
        if (line === '' && contentLines.length > 0 && contentLines[contentLines.length - 1] === '') break;
        contentLines.push(line);
      }
      const content = contentLines.join('\n').trim();
      if (content.length > 10) {
        extracted.push(`[${section.name}]\n${content}`);
        break;
      }
    }
  }

  return {
    structuredSections: extracted.join('\n\n'),
    fullText: text.substring(0, 15000),
  };
}

// ─── PDF 텍스트 추출 ─────────────────────────────────────────

/** PDF 버퍼에서 텍스트 추출 (pdf-parse v2 API) */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    await parser.destroy();
    return textResult.text || '';
  } catch (e) {
    console.warn('[deepCrawler] PDF 텍스트 추출 실패:', e);
    return '';
  }
}

// ─── 사이트별 어댑터 ────────────────────────────────────────

/** bizinfo.go.kr (기업마당) 전용 파서 */
class BizinfoAdapter implements CrawlAdapter {
  canHandle(url: string): boolean {
    return url.includes('bizinfo.go.kr');
  }

  extractMetadata(html: string): Record<string, string> {
    const tableData = extractTableDataCheerio(html);
    const metadata: Record<string, string> = {};

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
      // Phase 4-2 추가: 자격요건 관련 키
      '자격요건': 'eligibilityCriteria',
      '신청자격': 'eligibilityCriteria',
      '참여자격': 'eligibilityCriteria',
      '지원자격': 'eligibilityCriteria',
      '구비서류': 'requiredDocuments',
      '필수서류': 'requiredDocuments',
      '신청서류': 'requiredDocuments',
    };

    for (const [rawKey, value] of Object.entries(tableData)) {
      for (const [pattern, mappedKey] of Object.entries(keyMap)) {
        if (rawKey.includes(pattern)) {
          metadata[mappedKey] = value;
          break;
        }
      }
    }

    // cheerio 기반 섹션 추출 (h3/h4/strong 헤더 → 다음 형제 콘텐츠)
    const $ = cheerio.load(html);
    const sectionHeaders = [
      '자격요건', '신청자격', '참여자격', '지원대상',
      '제출서류', '구비서류', '필수서류',
      '평가기준', '심사기준', '선정기준',
    ];
    const sectionContent = extractSectionContent($, sectionHeaders);
    if (sectionContent) {
      metadata['_sectionContent'] = sectionContent;
    }

    return metadata;
  }

  extractContent(html: string): string {
    const mainContent = extractMainContentCheerio(html);
    return extractTextFromHtml(mainContent);
  }

  extractAttachments(html: string, baseUrl: string): AttachmentLink[] {
    return extractAttachmentLinksCheerio(html, baseUrl);
  }
}

/** K-Startup 전용 파서 */
class KStartupAdapter implements CrawlAdapter {
  canHandle(url: string): boolean {
    return url.includes('k-startup.go.kr');
  }

  extractMetadata(html: string): Record<string, string> {
    const $ = cheerio.load(html);
    const metadata = extractTableDataCheerio(html);

    // K-Startup 특유의 div/table 구조 파싱
    // .tbl-view, .info-tbl 패턴
    $('.tbl-view th, .info-tbl th, .tbl_view th').each((_i, el) => {
      const key = $(el).text().trim();
      const td = $(el).next('td');
      if (td.length && key) {
        const value = td.text().replace(/\s+/g, ' ').trim();
        if (value && value !== '-') {
          metadata[key] = value;
        }
      }
    });

    // 섹션 헤더 기반 추출
    const sectionHeaders = [
      '자격요건', '신청자격', '참여자격', '지원대상',
      '제출서류', '구비서류', '필수서류',
      '평가기준', '심사기준', '선정기준',
      '지원내용', '사업내용',
    ];
    const sectionContent = extractSectionContent($, sectionHeaders);
    if (sectionContent) {
      metadata['_sectionContent'] = sectionContent;
    }

    return metadata;
  }

  extractContent(html: string): string {
    const mainContent = extractMainContentCheerio(html);
    return extractTextFromHtml(mainContent);
  }

  extractAttachments(html: string, baseUrl: string): AttachmentLink[] {
    return extractAttachmentLinksCheerio(html, baseUrl);
  }
}

/** 범용 파서 (기타 사이트) */
class GenericAdapter implements CrawlAdapter {
  canHandle(_url: string): boolean {
    return true; // 항상 매칭 (폴백)
  }

  extractMetadata(html: string): Record<string, string> {
    const metadata = extractTableDataCheerio(html);

    // 섹션 헤더 기반 추출
    const $ = cheerio.load(html);
    const sectionHeaders = [
      '자격요건', '신청자격', '참여자격', '지원대상',
      '제출서류', '구비서류', '필수서류',
      '평가기준', '심사기준', '선정기준',
    ];
    const sectionContent = extractSectionContent($, sectionHeaders);
    if (sectionContent) {
      metadata['_sectionContent'] = sectionContent;
    }

    return metadata;
  }

  extractContent(html: string): string {
    const mainContent = extractMainContentCheerio(html);
    return extractTextFromHtml(mainContent);
  }

  extractAttachments(html: string, baseUrl: string): AttachmentLink[] {
    return extractAttachmentLinksCheerio(html, baseUrl);
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

/** cheerio로 HTML에서 첨부파일 링크 추출 */
function extractAttachmentLinksCheerio(html: string, baseUrl: string): AttachmentLink[] {
  const $ = cheerio.load(html);
  const links: AttachmentLink[] = [];
  const seenUrls = new Set<string>();
  const extensions = ['pdf', 'hwp', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'zip'];

  // 1. <a> 태그 href에 파일 확장자가 있는 링크
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    const extMatch = href.match(/\.([a-zA-Z]+)(?:\?|$)/);
    if (extMatch && extensions.includes(extMatch[1].toLowerCase())) {
      addLink(links, seenUrls, href, text, baseUrl);
    }
  });

  // 2. 다운로드 API 링크
  $('a[href*="download"], a[href*="fileDown"], a[href*="attach"], a[href*="getFile"], a[href*="dnFile"]').each((_i, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    addLink(links, seenUrls, href, text, baseUrl);
  });

  // 3. onclick에 숨겨진 다운로드
  $('[onclick*="download"], [onclick*="fileDown"], [onclick*="fnDown"]').each((_i, el) => {
    const onclick = $(el).attr('onclick') || '';
    const urlMatch = onclick.match(/['"]([^'"]+)['"]/);
    if (urlMatch) {
      addLink(links, seenUrls, urlMatch[1], $(el).text().trim(), baseUrl);
    }
  });

  // 4. data 속성
  $('[data-file], [data-download], [data-url]').each((_i, el) => {
    const url = $(el).attr('data-file') || $(el).attr('data-download') || $(el).attr('data-url') || '';
    if (url) {
      addLink(links, seenUrls, url, $(el).text().trim(), baseUrl);
    }
  });

  // 5. .file-list, .attach-list 등의 파일 목록 영역
  $('.file-list a, .attach-list a, .file_list a, .attach_list a, .file-area a, .file_area a').each((_i, el) => {
    const href = $(el).attr('href') || '';
    if (href) {
      addLink(links, seenUrls, href, $(el).text().trim(), baseUrl);
    }
  });

  return links;
}

/** 레거시 regex 기반 첨부파일 링크 추출 (하위호환) */
export function extractAttachmentLinks(html: string, baseUrl: string): AttachmentLink[] {
  return extractAttachmentLinksCheerio(html, baseUrl);
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
    apiData.eligibilityCriteria?.length ? `자격요건: ${apiData.eligibilityCriteria.join(', ')}` : '',
    apiData.exclusionCriteria?.length ? `제외대상: ${apiData.exclusionCriteria.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  // 섹션 콘텐츠가 메타데이터에 포함되어 있으면 분리
  const sectionContent = crawledMetadata['_sectionContent'] || '';
  const cleanMetadata = { ...crawledMetadata };
  delete cleanMetadata['_sectionContent'];

  const metadataSummary = Object.entries(cleanMetadata)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const attachmentSummary = attachmentTexts.length > 0
    ? attachmentTexts.join('\n\n---\n\n').substring(0, 10000)
    : '';

  // 텍스트 전처리: 구조화된 섹션 추출
  const { structuredSections, fullText } = preprocessCrawledText(crawledText);

  const prompt = `당신은 정부 지원사업 공고 분석 전문가입니다.

## 입력 데이터

### 1. API에서 수집한 구조화 데이터:
${apiSummary || '(없음)'}

### 2. 웹페이지 메타데이터 (테이블에서 추출):
${metadataSummary || '(없음)'}

${sectionContent ? `### 2-1. 웹페이지 섹션별 추출 (헤더 기반):\n${sectionContent}\n` : ''}

${structuredSections ? `### 2-2. 본문 텍스트에서 사전 추출된 섹션:\n${structuredSections}\n` : ''}

### 3. 웹페이지 본문 텍스트:
${fullText || '(없음)'}

${attachmentSummary ? `### 4. 첨부파일 텍스트:\n${attachmentSummary}` : ''}

## 작업
위 데이터를 종합하여 아래 JSON 형식으로 공고 정보를 **최대한 상세하게** 추출하세요.

## 추출 힌트 (중요!)
- **자격요건(eligibilityCriteria)**: '지원 대상', '참여 자격', '신청 자격', '자격요건', '참여대상' 등의 제목 아래에 나열됩니다. 이 필드를 빈 배열로 두지 마세요.
- **필수서류(requiredDocuments)**: '제출 서류', '구비 서류', '필수 서류', '신청 서류', '첨부서류' 등의 제목 아래에 나열됩니다. 이 필드를 빈 배열로 두지 마세요.
- **평가기준(evaluationCriteria)**: '평가 기준', '심사 기준', '선정 기준', '배점' 등의 제목 아래에 나열됩니다.
- 원문에서 리스트 마커(○, ◦, ▪, ①②③, 가나다, 1) 2) 3) 등)로 나열된 항목을 각각 개별 배열 항목으로 추출하세요.

## 규칙
1. 정보가 여러 소스에 있으면 가장 상세한 내용을 선택
2. 추측하지 말고, 원문에 있는 정보만 추출
3. 금액은 원문 그대로 유지 (예: "과제당 최대 2억원")
4. 날짜는 YYYY-MM-DD 형식으로 변환
5. 목록 항목은 각각 완전한 문장으로 작성
6. fullDescription은 원문의 핵심 내용을 3~5문단으로 풍부하게 정리
7. 없는 정보는 빈 문자열 또는 빈 배열로 유지
8. categories와 keywords는 반드시 이 공고 사업의 분류에 해당하는 것만 포함. 사이트 메뉴, 네비게이션 항목(업무계획, 기관소개, 연혁, MI소개, 정보공개 등)은 절대 포함하지 말 것
9. regions는 실제 사업 대상 지역만 포함 (전국, 서울, 인천 등)
10. eligibilityCriteria와 requiredDocuments는 가장 중요한 필드입니다. 원문 어디에든 관련 정보가 있으면 반드시 추출하세요.

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
    if (sectionContent.length > 20) dataSources.push('section');

    // 런타임 배열 검증 헬퍼
    const asArray = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];
    const asStr = (v: unknown): string => typeof v === 'string' ? v : '';

    return {
      department: asStr(parsed.department),
      supportScale: asStr(parsed.supportScale),
      targetAudience: asStr(parsed.targetAudience),
      eligibilityCriteria: asArray(parsed.eligibilityCriteria),
      requiredDocuments: asArray(parsed.requiredDocuments),
      applicationPeriod: {
        start: asStr((parsed.applicationPeriod as Record<string, unknown>)?.start),
        end: asStr((parsed.applicationPeriod as Record<string, unknown>)?.end),
      },
      evaluationCriteria: asArray(parsed.evaluationCriteria),
      contactInfo: asStr(parsed.contactInfo),
      fullDescription: asStr(parsed.fullDescription),
      applicationMethod: asStr(parsed.applicationMethod),
      specialNotes: asArray(parsed.specialNotes),
      regions: asArray(parsed.regions),
      categories: asArray(parsed.categories),
      exclusionCriteria: asArray(parsed.exclusionCriteria),
      objectives: asArray(parsed.objectives),
      supportDetails: asArray(parsed.supportDetails),
      matchingRatio: asStr(parsed.matchingRatio),
      totalBudget: asStr(parsed.totalBudget),
      selectionProcess: asArray(parsed.selectionProcess),
      announcementDate: asStr(parsed.announcementDate),
      selectionDate: asStr(parsed.selectionDate),
      projectPeriod: asStr(parsed.projectPeriod),
      applicationUrl: asStr(parsed.applicationUrl),
      contactPhone: asStr(parsed.contactPhone),
      contactEmail: asStr(parsed.contactEmail),
      keywords: asArray(parsed.keywords),
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
export async function enrichFromApiOnly(
  apiData: Partial<ServerSupportProgram>
): Promise<DeepCrawlResult> {
  // 핵심 구조화 필드가 채워져 있는지 확인
  const hasStructuredData = (
    (apiData.eligibilityCriteria?.length ?? 0) > 0 ||
    (apiData.requiredDocuments?.length ?? 0) > 0 ||
    (apiData.evaluationCriteria?.length ?? 0) > 0
  );

  const descLength = (apiData.fullDescription || apiData.description || '').length;

  // 직접 매핑 함수 (AI 없이 API 필드를 DeepCrawlResult로 변환)
  const directMap = (qualityScore: number): DeepCrawlResult => ({
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
    dataQualityScore: qualityScore,
    dataSources: ['api'],
  });

  // Case 1: 풍부한 설명 + 구조화 필드 → AI 없이 직접 매핑
  if (descLength > 200 && hasStructuredData) {
    return directMap(50);
  }

  // Case 2: 설명이 너무 짧음 (< 50자) → AI 호출해도 효과 없음, 직접 매핑
  if (descLength < 50) {
    return directMap(15);
  }

  // Case 3: 설명이 있음 (50~200자) 또는 구조화 필드 없음 → AI로 텍스트에서 추출
  const textForAI = apiData.fullDescription || apiData.description || '';
  return enrichWithAI(apiData, textForAI, {}, []);
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
 * (API 데이터 + 상세페이지 크롤 + 첨부파일 다운로드/PDF 추출 + AI 재가공)
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

  // 어댑터 1회 선택 (첨부파일 + 콘텐츠 추출에 공유)
  const adapter = html ? getAdapter(detailUrl) : null;

  // 2. 첨부파일 추출 및 다운로드 (크롤링 전에 수행 → PDF 텍스트를 AI에 전달)
  const attachmentTexts: string[] = [];

  if (html && adapter) {
    try {
      const links = adapter.extractAttachments(html, detailUrl);

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
        const ext = link.filename.split('.').pop()?.toLowerCase() || 'pdf';
        const savePath = path.join('attachments', 'pdfs', `${slug}-${i}.${ext}`);

        const buffer = await downloadAttachment(link.url, savePath);
        if (buffer) {
          attachments.push({ path: savePath, name: link.filename, analyzed: false });

          // PDF이면 텍스트 추출
          if (ext === 'pdf') {
            const pdfText = await extractTextFromPdf(buffer);
            if (pdfText.length > 50) {
              attachmentTexts.push(pdfText.substring(0, 8000));
              console.log(`[deepCrawler] PDF 텍스트 추출 성공: ${link.filename} (${pdfText.length}자)`);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[deepCrawler] 첨부파일 처리 에러:`, e);
    }
  }

  // API 첨부파일 URL이 있고 HTML에서 못 찾은 경우 직접 다운로드
  if (attachments.length === 0 && apiData?.attachmentUrls?.length) {
    for (let i = 0; i < apiData.attachmentUrls.length && i < 5; i++) {
      const url = apiData.attachmentUrls[i];
      try {
        const filename = decodeURIComponent(url.split('/').pop() || 'attachment');
        const ext = filename.split('.').pop()?.toLowerCase() || 'pdf';
        const savePath = path.join('attachments', 'pdfs', `${slug}-${i}.${ext}`);
        const buffer = await downloadAttachment(url, savePath);
        if (buffer) {
          attachments.push({ path: savePath, name: filename, analyzed: false });

          // PDF이면 텍스트 추출
          if (ext === 'pdf') {
            const pdfText = await extractTextFromPdf(buffer);
            if (pdfText.length > 50) {
              attachmentTexts.push(pdfText.substring(0, 8000));
            }
          }
        }
      } catch (e) {
        console.warn(`[deepCrawler] API 첨부파일 다운로드 실패: ${url}`, e);
      }
    }
  }

  // 3. 크롤링 + AI 재가공 (PDF 텍스트도 함께 전달)
  let crawlResult: DeepCrawlResult | null = null;

  if (html && html.length > 100 && adapter) {
    try {
      console.log(`[deepCrawler] 딥크롤 시작: ${programName}`);
      const metadata = adapter.extractMetadata(html);
      const content = adapter.extractContent(html);

      if (content.length >= 50 || apiData?.fullDescription) {
        crawlResult = await enrichWithAI(apiData || {}, content, metadata, attachmentTexts);
        console.log(`[deepCrawler] 딥크롤 완료: ${programName} (품질: ${crawlResult.dataQualityScore})`);
      } else {
        console.warn(`[deepCrawler] 내용 부족 (${content.length}자), API 폴백`);
        if (apiData) {
          // PDF 텍스트가 있으면 AI에 함께 전달
          crawlResult = attachmentTexts.length > 0
            ? await enrichWithAI(apiData, '', {}, attachmentTexts)
            : await enrichFromApiOnly(apiData);
        }
      }
    } catch (e) {
      console.error(`[deepCrawler] 파싱/AI 실패 (${programName}):`, e);
      if (apiData) crawlResult = await enrichFromApiOnly(apiData);
    }
  } else {
    // HTML 가져오기 실패 → API 데이터 폴백
    if (apiData) crawlResult = await enrichFromApiOnly(apiData);
  }

  return { crawlResult, attachments };
}

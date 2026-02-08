/**
 * 딥크롤링 서비스
 * 공고 상세페이지 HTML → 구조화 데이터 추출 + 첨부파일 다운로드
 */

import { callGeminiDirect, cleanAndParseJSON } from './geminiService.js';
import { writeBinaryFile } from './vaultFileService.js';
import path from 'path';

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
}

export interface AttachmentLink {
  url: string;
  filename: string;
}

/**
 * HTML에서 스크립트/스타일 제거 후 텍스트만 추출
 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 15000); // Gemini 토큰 한도 고려
}

/**
 * HTML에서 첨부파일 링크 추출
 */
export function extractAttachmentLinks(html: string, baseUrl: string): AttachmentLink[] {
  const links: AttachmentLink[] = [];
  const extensions = ['pdf', 'hwp', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'zip'];
  const extPattern = extensions.join('|');

  // <a href="..."> 패턴
  const anchorRegex = new RegExp(
    `<a[^>]+href=["']([^"']+\\.(?:${extPattern}))["'][^>]*>([^<]*)<\\/a>`,
    'gi'
  );

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].trim();
    try {
      const absoluteUrl = new URL(href, baseUrl).toString();
      const filename = text || href.split('/').pop() || 'attachment';
      links.push({ url: absoluteUrl, filename });
    } catch {
      // 잘못된 URL 무시
    }
  }

  // href에 download 파라미터 포함 패턴
  const downloadRegex = /href=["']([^"']*(?:download|filedown|attach)[^"']*)["']/gi;
  while ((match = downloadRegex.exec(html)) !== null) {
    const href = match[1];
    // 이미 추가된 링크 제외
    if (links.some(l => l.url.includes(href))) continue;
    try {
      const absoluteUrl = new URL(href, baseUrl).toString();
      links.push({ url: absoluteUrl, filename: href.split('/').pop() || 'attachment' });
    } catch {
      // 무시
    }
  }

  return links;
}

/**
 * 첨부파일 다운로드 후 vault에 저장
 */
export async function downloadAttachment(
  url: string,
  savePath: string
): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.warn(`[deepCrawler] 다운로드 실패 (${response.status}): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeBinaryFile(savePath, buffer);
    console.log(`[deepCrawler] 첨부파일 저장: ${savePath} (${buffer.length} bytes)`);
    return buffer;
  } catch (e) {
    console.error(`[deepCrawler] 첨부파일 다운로드 에러:`, e);
    return null;
  }
}

/**
 * 공고 상세페이지 딥크롤 → 구조화 데이터 추출
 */
export async function deepCrawlProgram(
  detailUrl: string,
  programName: string
): Promise<DeepCrawlResult | null> {
  try {
    console.log(`[deepCrawler] 딥크롤 시작: ${programName}`);

    const response = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) {
      console.warn(`[deepCrawler] 페이지 로드 실패 (${response.status}): ${detailUrl}`);
      return null;
    }

    const html = await response.text();
    const textContent = extractTextFromHtml(html);

    if (textContent.length < 100) {
      console.warn(`[deepCrawler] 내용이 너무 짧음 (${textContent.length}자): ${programName}`);
      return null;
    }

    // Gemini로 구조화 데이터 추출
    const prompt = `다음은 "${programName}" 정부 지원사업 공고 상세페이지의 텍스트 내용입니다.
이 내용에서 아래 JSON 형식으로 정보를 추출해주세요.
존재하지 않는 정보는 빈 문자열 또는 빈 배열로 남겨주세요.

텍스트 내용:
${textContent}

반드시 아래 JSON 형식만 반환하세요:
{
  "department": "담당 부서명",
  "supportScale": "지원 규모 (예: 과제당 최대 2억원)",
  "targetAudience": "지원 대상 설명",
  "eligibilityCriteria": ["자격요건1", "자격요건2"],
  "requiredDocuments": ["필수서류1", "필수서류2"],
  "applicationPeriod": { "start": "2026-01-01", "end": "2026-12-31" },
  "evaluationCriteria": ["평가기준1 (배점)", "평가기준2 (배점)"],
  "contactInfo": "담당자 연락처",
  "fullDescription": "사업 상세 설명 (2~3문단)",
  "applicationMethod": "신청 방법 (온라인/오프라인/우편 등)",
  "specialNotes": ["특이사항1", "특이사항2"],
  "regions": ["해당 지역1"],
  "categories": ["분류 카테고리1", "분류 카테고리2"]
}`;

    const result = await callGeminiDirect(prompt);
    const parsed = cleanAndParseJSON(result.text) as Record<string, unknown>;

    const crawlResult: DeepCrawlResult = {
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
    };

    console.log(`[deepCrawler] 딥크롤 완료: ${programName}`);
    return crawlResult;
  } catch (e) {
    console.error(`[deepCrawler] 딥크롤 실패 (${programName}):`, e);
    return null;
  }
}

/**
 * 단일 프로그램 전체 딥크롤 파이프라인
 * (상세페이지 크롤 + 첨부파일 다운로드)
 */
export async function deepCrawlProgramFull(
  detailUrl: string,
  programName: string,
  slug: string
): Promise<{
  crawlResult: DeepCrawlResult | null;
  attachments: { path: string; name: string; analyzed: boolean }[];
}> {
  // 1. 상세페이지 크롤
  const crawlResult = await deepCrawlProgram(detailUrl, programName);

  // 2. 첨부파일 추출 및 다운로드
  const attachments: { path: string; name: string; analyzed: boolean }[] = [];

  try {
    const response = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (response.ok) {
      const html = await response.text();
      const links = extractAttachmentLinks(html, detailUrl);

      for (let i = 0; i < links.length && i < 5; i++) {
        const link = links[i];
        const ext = link.filename.split('.').pop() || 'pdf';
        const savePath = path.join('attachments', 'pdfs', `${slug}-${i}.${ext}`);

        const buffer = await downloadAttachment(link.url, savePath);
        if (buffer) {
          attachments.push({
            path: savePath,
            name: link.filename,
            analyzed: false,
          });
        }
      }
    }
  } catch (e) {
    console.warn(`[deepCrawler] 첨부파일 처리 에러:`, e);
  }

  return { crawlResult, attachments };
}

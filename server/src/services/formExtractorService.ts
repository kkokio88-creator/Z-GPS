/**
 * 양식 추출 서비스
 * 첨부파일(PDF/HWPX/DOCX/HWP5)에서 실제 신청서 양식 구조를 추출
 */

import { callGeminiMultimodal, callGeminiDirect, cleanAndParseJSON } from './geminiService.js';
import { detectFileType } from './deepCrawler.js';
import type { DetectedFileType } from './deepCrawler.js';

// ─── 타입 정의 ─────────────────────────────────────────────

export interface ExtractedFormField {
  fieldTitle: string;
  questionText?: string;
  charLimit?: number;
  fieldType: 'text' | 'textarea' | 'table' | 'checklist' | 'number' | 'date';
  order: number;
  required: boolean;
  notes?: string;
}

export interface FormExtractionResult {
  fields: ExtractedFormField[];
  formTitle: string;
  sourceFile: string;
  extractionMethod: 'gemini_vision' | 'text_extraction';
  confidence: 'high' | 'medium' | 'low';
}

// ─── Gemini 프롬프트 ────────────────────────────────────────

function buildVisionPrompt(programName: string): string {
  return `당신은 한국 정부 지원사업 신청서 양식 구조 분석 전문가입니다.
첨부된 PDF는 "${programName}" 사업의 신청서 양식입니다.

작업: 신청자가 실제로 작성해야 하는 항목을 모두 식별하세요.
- 빈 밑줄(___), 작성란, 표의 빈 셀, □ 체크박스 → 작성 항목
- 안내문, 심사 기준 설명, 목차 → 제외
- "(XXX자 이내)" 패턴에서 글자수 제한 추출
- 표 형태 입력란 → fieldType: "table"

반드시 아래 JSON 형식만 반환하세요:
{
  "formTitle": "양식 제목",
  "fields": [
    {
      "fieldTitle": "항목 제목",
      "questionText": "실제 질문/안내 텍스트 (있으면)",
      "charLimit": null,
      "fieldType": "text|textarea|table|checklist|number|date",
      "order": 1,
      "required": true,
      "notes": "참고사항 (있으면)"
    }
  ]
}`;
}

function buildTextPrompt(programName: string, formText: string): string {
  return `당신은 한국 정부 지원사업 신청서 양식 구조 분석 전문가입니다.
아래 텍스트는 "${programName}" 사업의 신청서 양식에서 추출된 내용입니다.

${formText.substring(0, 12000)}

작업: 신청자가 실제로 작성해야 하는 항목을 모두 식별하세요.
- 빈 밑줄(___), 작성란, 표의 빈 셀, □ 체크박스 → 작성 항목
- 안내문, 심사 기준 설명, 목차 → 제외
- "(XXX자 이내)" 패턴에서 글자수 제한 추출
- 표 형태 입력란 → fieldType: "table"

반드시 아래 JSON 형식만 반환하세요:
{
  "formTitle": "양식 제목",
  "fields": [
    {
      "fieldTitle": "항목 제목",
      "questionText": "실제 질문/안내 텍스트 (있으면)",
      "charLimit": null,
      "fieldType": "text|textarea|table|checklist|number|date",
      "order": 1,
      "required": true,
      "notes": "참고사항 (있으면)"
    }
  ]
}`;
}

// ─── 파일 유형별 텍스트 추출 ─────────────────────────────────

/** HWPX 텍스트 추출 (adm-zip) */
async function extractTextFromHwpx(buffer: Buffer): Promise<string> {
  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const textParts: string[] = [];
    const sectionEntries = entries
      .filter(e => /Contents\/section\d+\.xml/i.test(e.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName));

    for (const entry of sectionEntries) {
      const xml = entry.getData().toString('utf-8');
      const texts = xml.match(/<hp:t[^>]*>([^<]*)<\/hp:t>/g);
      if (texts) {
        for (const t of texts) {
          const content = t.replace(/<[^>]+>/g, '').trim();
          if (content) textParts.push(content);
        }
      }
    }

    return textParts.join('\n');
  } catch (e) {
    console.warn('[formExtractor] HWPX 텍스트 추출 실패:', e);
    return '';
  }
}

/** DOCX 텍스트 추출 (adm-zip) */
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return '';

    const xml = entry.getData().toString('utf-8');
    const textParts: string[] = [];
    const texts = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (texts) {
      for (const t of texts) {
        const content = t.replace(/<[^>]+>/g, '').trim();
        if (content) textParts.push(content);
      }
    }

    return textParts.join('\n');
  } catch (e) {
    console.warn('[formExtractor] DOCX 텍스트 추출 실패:', e);
    return '';
  }
}

/** HWP5 바이너리에서 한글 문자열 스캔 (UTF-16LE) */
function extractTextFromHwp5(buffer: Buffer): string {
  const textParts: string[] = [];
  // UTF-16LE 한글 문자 범위 스캔: 가(0xAC00) ~ 힣(0xD7A3)
  let currentWord = '';

  for (let i = 0; i < buffer.length - 1; i += 2) {
    const code = buffer.readUInt16LE(i);
    // 한글 음절 범위 또는 기본 ASCII 문자 범위
    if (
      (code >= 0xAC00 && code <= 0xD7A3) || // 한글 음절
      (code >= 0x0020 && code <= 0x007E) || // ASCII
      (code >= 0x3131 && code <= 0x318E) || // 한글 자모
      code === 0x000A || code === 0x000D    // 줄바꿈
    ) {
      if (code === 0x000A || code === 0x000D) {
        if (currentWord.trim().length >= 2) {
          textParts.push(currentWord.trim());
        }
        currentWord = '';
      } else {
        currentWord += String.fromCharCode(code);
      }
    } else {
      if (currentWord.trim().length >= 2) {
        textParts.push(currentWord.trim());
      }
      currentWord = '';
    }
  }

  if (currentWord.trim().length >= 2) {
    textParts.push(currentWord.trim());
  }

  return textParts.join('\n');
}

// ─── 응답 파싱 ──────────────────────────────────────────────

function parseFormResponse(text: string): { formTitle: string; fields: ExtractedFormField[] } | null {
  try {
    const parsed = cleanAndParseJSON(text) as Record<string, unknown>;
    const formTitle = (parsed.formTitle as string) || '';
    const rawFields = parsed.fields as Record<string, unknown>[];
    if (!Array.isArray(rawFields) || rawFields.length === 0) return null;

    const fields: ExtractedFormField[] = rawFields.map((f, i) => ({
      fieldTitle: (f.fieldTitle as string) || `항목 ${i + 1}`,
      questionText: (f.questionText as string) || undefined,
      charLimit: typeof f.charLimit === 'number' ? f.charLimit : undefined,
      fieldType: (['text', 'textarea', 'table', 'checklist', 'number', 'date'].includes(f.fieldType as string)
        ? f.fieldType as ExtractedFormField['fieldType']
        : 'textarea'),
      order: (f.order as number) || i + 1,
      required: f.required !== false,
      notes: (f.notes as string) || undefined,
    }));

    return { formTitle, fields };
  } catch {
    return null;
  }
}

// ─── 메인 함수 ──────────────────────────────────────────────

/**
 * 첨부파일에서 양식 구조 추출
 * @param buffer 파일 바이너리
 * @param fileName 파일명 (확장자 포함)
 * @param programName 프로그램명 (프롬프트용)
 */
export async function extractFormSchema(
  buffer: Buffer,
  fileName: string,
  programName: string
): Promise<FormExtractionResult | null> {
  const fileType: DetectedFileType = await detectFileType(buffer);

  console.log(`[formExtractor] 양식 추출 시작: ${fileName} (type=${fileType})`);

  try {
    switch (fileType) {
      case 'pdf': {
        // PDF → Gemini Vision (inlineData)
        const base64 = buffer.toString('base64');
        const response = await callGeminiMultimodal(
          base64,
          'application/pdf',
          buildVisionPrompt(programName),
          { responseMimeType: 'application/json' }
        );
        const parsed = parseFormResponse(response.text);
        if (!parsed || parsed.fields.length === 0) return null;

        return {
          fields: parsed.fields,
          formTitle: parsed.formTitle,
          sourceFile: fileName,
          extractionMethod: 'gemini_vision',
          confidence: 'high',
        };
      }

      case 'hwpx': {
        // HWPX → 텍스트 추출 + Gemini 텍스트 분석
        const text = await extractTextFromHwpx(buffer);
        if (text.length < 50) return null;

        const response = await callGeminiDirect(
          buildTextPrompt(programName, text),
          { responseMimeType: 'application/json' }
        );
        const parsed = parseFormResponse(response.text);
        if (!parsed || parsed.fields.length === 0) return null;

        return {
          fields: parsed.fields,
          formTitle: parsed.formTitle,
          sourceFile: fileName,
          extractionMethod: 'text_extraction',
          confidence: 'high',
        };
      }

      case 'docx': {
        // DOCX → 텍스트 추출 + Gemini 텍스트 분석
        const text = await extractTextFromDocx(buffer);
        if (text.length < 50) return null;

        const response = await callGeminiDirect(
          buildTextPrompt(programName, text),
          { responseMimeType: 'application/json' }
        );
        const parsed = parseFormResponse(response.text);
        if (!parsed || parsed.fields.length === 0) return null;

        return {
          fields: parsed.fields,
          formTitle: parsed.formTitle,
          sourceFile: fileName,
          extractionMethod: 'text_extraction',
          confidence: 'high',
        };
      }

      case 'hwp5': {
        // HWP5 → UTF-16LE 스캔 + Gemini 텍스트 분석
        const text = extractTextFromHwp5(buffer);
        if (text.length < 100) {
          console.log(`[formExtractor] HWP5 텍스트 부족 (${text.length}자): ${fileName}`);
          return null;
        }

        const response = await callGeminiDirect(
          buildTextPrompt(programName, text),
          { responseMimeType: 'application/json' }
        );
        const parsed = parseFormResponse(response.text);
        if (!parsed || parsed.fields.length === 0) return null;

        return {
          fields: parsed.fields,
          formTitle: parsed.formTitle,
          sourceFile: fileName,
          extractionMethod: 'text_extraction',
          confidence: 'medium',
        };
      }

      default:
        console.log(`[formExtractor] 지원하지 않는 파일 타입: ${fileType}`);
        return null;
    }
  } catch (e) {
    console.error(`[formExtractor] 양식 추출 실패 (${fileName}):`, e);
    return null;
  }
}

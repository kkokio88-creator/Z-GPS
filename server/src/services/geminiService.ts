/**
 * 서버 측 Gemini 직접 호출 서비스
 * @google/genai SDK 직접 사용
 */

import { GoogleGenAI } from '@google/genai';

interface GeminiDirectResponse {
  text: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gemini API 직접 호출 (exponential backoff 포함)
 */
export async function callGeminiDirect(
  prompt: string,
  config?: Record<string, unknown>,
  overrideApiKey?: string
): Promise<GeminiDirectResponse> {
  const apiKey = overrideApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = (config?.model as string) || 'gemini-2.0-flash';

  const processedConfig: Record<string, unknown> = { ...(config || {}) };
  delete processedConfig.model;

  const timeoutMs = 60_000; // 60초 타임아웃
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiCall = ai.models.generateContent({
        model,
        contents: prompt,
        config: processedConfig,
      });

      // 타임아웃 래핑: Gemini API가 무한 대기하는 것을 방지
      const response = await Promise.race([
        apiCall,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini API 타임아웃 (${timeoutMs / 1000}초)`)), timeoutMs)
        ),
      ]);

      // response.text getter는 safety block / 빈 응답 시 throw할 수 있음
      let text = '';
      try {
        text = response.text || '';
      } catch {
        // candidates에서 직접 텍스트 추출 시도
        const candidates = (response as unknown as Record<string, unknown>).candidates as
          Array<Record<string, unknown>> | undefined;
        const parts = (candidates?.[0]?.content as Record<string, unknown> | undefined)?.parts as
          Array<Record<string, unknown>> | undefined;
        if (parts) {
          text = parts.filter(p => typeof p.text === 'string').map(p => p.text as string).join('');
        }
      }
      return { text };
    } catch (error: unknown) {
      lastError = error;
      const errStr = String(error);

      // 429 에러 또는 타임아웃 시 exponential backoff
      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('타임아웃')) {
        const waitMs = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s (더 넉넉하게)
        console.warn(`[geminiService] ${errStr.includes('타임아웃') ? '타임아웃' : '429 에러'}, ${waitMs}ms 후 재시도 (attempt ${attempt + 1}/${maxRetries})`);
        await delay(waitMs);
        continue;
      }

      // 다른 에러는 즉시 throw
      throw error;
    }
  }

  throw lastError;
}

/**
 * Gemini API multimodal 호출 (PDF/이미지 + 텍스트 프롬프트)
 * inlineData part를 사용하여 바이너리 파일을 직접 전달
 */
export async function callGeminiMultimodal(
  base64Data: string,
  mimeType: 'application/pdf' | 'image/png',
  textPrompt: string,
  config?: Record<string, unknown>,
  overrideApiKey?: string
): Promise<GeminiDirectResponse> {
  const apiKey = overrideApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // PDF 15MB 제한 (base64는 원본 대비 ~33% 커짐)
  const estimatedSize = (base64Data.length * 3) / 4;
  if (estimatedSize > 15 * 1024 * 1024) {
    throw new Error(`파일 크기 초과: ${(estimatedSize / 1024 / 1024).toFixed(1)}MB (최대 15MB)`);
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = (config?.model as string) || 'gemini-2.0-flash';

  const processedConfig: Record<string, unknown> = { ...(config || {}) };
  delete processedConfig.model;

  const timeoutMs = 60_000;
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiCall = ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64Data, mimeType } },
              { text: textPrompt },
            ],
          },
        ],
        config: processedConfig,
      });

      const response = await Promise.race([
        apiCall,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini API 타임아웃 (${timeoutMs / 1000}초)`)), timeoutMs)
        ),
      ]);

      let text = '';
      try {
        text = response.text || '';
      } catch {
        const candidates = (response as unknown as Record<string, unknown>).candidates as
          Array<Record<string, unknown>> | undefined;
        const parts = (candidates?.[0]?.content as Record<string, unknown> | undefined)?.parts as
          Array<Record<string, unknown>> | undefined;
        if (parts) {
          text = parts.filter(p => typeof p.text === 'string').map(p => p.text as string).join('');
        }
      }
      return { text };
    } catch (error: unknown) {
      lastError = error;
      const errStr = String(error);

      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('타임아웃')) {
        const waitMs = Math.pow(2, attempt + 2) * 1000;
        console.warn(`[geminiService] multimodal ${errStr.includes('타임아웃') ? '타임아웃' : '429 에러'}, ${waitMs}ms 후 재시도 (attempt ${attempt + 1}/${maxRetries})`);
        await delay(waitMs);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * JSON 응답 파싱 헬퍼
 */
export function cleanAndParseJSON(text: string): Record<string, unknown> | unknown[] {
  if (!text) return {};

  // 1. 직접 파싱
  try { return JSON.parse(text); } catch { /* continue */ }

  // 2. 코드 블록에서 추출 (greedy: 마지막 ``` 까지 매칭)
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]+)\s*```/);
    if (match?.[1]) {
      const cleaned = match[1].replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    }
  } catch { /* continue */ }

  // 3. 첫 번째 { 부터 마지막 } 까지
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(text.substring(start, end + 1));
    }
  } catch { /* continue */ }

  // 4. 배열 시도
  try {
    const arrStart = text.indexOf('[');
    const arrEnd = text.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd > arrStart) {
      return JSON.parse(text.substring(arrStart, arrEnd + 1));
    }
  } catch { /* continue */ }

  console.error('[geminiService] JSON parse failed:', text.substring(0, 200));
  return {};
}

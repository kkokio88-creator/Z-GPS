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
  config?: Record<string, unknown>
): Promise<GeminiDirectResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = (config?.model as string) || 'gemini-2.0-flash';

  const processedConfig: Record<string, unknown> = { ...(config || {}) };
  delete processedConfig.model;

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: processedConfig,
      });

      return { text: response.text || '' };
    } catch (error: unknown) {
      lastError = error;
      const errStr = String(error);

      // 429 에러 시 exponential backoff
      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
        const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn(`[geminiService] 429 에러, ${waitMs}ms 후 재시도 (attempt ${attempt + 1}/${maxRetries})`);
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
 * JSON 응답 파싱 헬퍼
 */
export function cleanAndParseJSON(text: string): Record<string, unknown> | unknown[] {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    try {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match?.[1]) {
        return JSON.parse(match[1]);
      }
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        return JSON.parse(text.substring(start, end + 1));
      }
      // 배열 시도
      const arrStart = text.indexOf('[');
      const arrEnd = text.lastIndexOf(']');
      if (arrStart !== -1 && arrEnd !== -1) {
        return JSON.parse(text.substring(arrStart, arrEnd + 1));
      }
    } catch {
      console.error('[geminiService] JSON parse failed:', text.substring(0, 100));
      return {};
    }
  }
  return {};
}

import { Router, Request, Response } from 'express';
import { GoogleGenAI, Modality } from '@google/genai';

const router = Router();

interface GenerateRequestBody {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
}

/**
 * POST /api/gemini/generate
 * Gemini API 프록시 - generateContent 호출
 */
router.post('/generate', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return;
  }

  const { model, contents, config } = req.body as GenerateRequestBody;

  if (!model || !contents) {
    res.status(400).json({ error: 'model and contents are required' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // responseModalities 처리 (TTS 등)
    const processedConfig: Record<string, unknown> = { ...(config || {}) };
    if (
      Array.isArray(processedConfig.responseModalities) &&
      processedConfig.responseModalities.includes('audio')
    ) {
      processedConfig.responseModalities = [Modality.AUDIO];
    }

    const response = await ai.models.generateContent({
      model,
      contents: contents as string,
      config: processedConfig,
    });

    res.json({
      text: response.text || '',
      candidates: response.candidates || [],
    });
  } catch (error: unknown) {
    const errStr = String(error);
    console.error('[gemini/generate] Error:', errStr);

    if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
      res.status(429).json({ error: 'API quota exceeded. 잠시 후 다시 시도하세요.' });
      return;
    }
    if (errStr.includes('403') || errStr.includes('API key not valid')) {
      res.status(403).json({ error: 'Invalid API key. 설정에서 Gemini API Key를 확인하세요.' });
      return;
    }
    if (errStr.includes('404') || errStr.includes('not found') || errStr.includes('is not found')) {
      res.status(400).json({ error: `모델을 찾을 수 없습니다 (${model}). 설정에서 AI 모델을 변경해주세요.` });
      return;
    }
    if (errStr.includes('SAFETY') || errStr.includes('blocked')) {
      res.status(400).json({ error: 'AI 안전 필터에 의해 차단되었습니다. 입력 내용을 수정해주세요.' });
      return;
    }

    // 상세 에러 메시지 포함
    const shortErr = errStr.length > 200 ? errStr.substring(0, 200) + '...' : errStr;
    res.status(500).json({ error: `Gemini API 호출 실패: ${shortErr}` });
  }
});

/**
 * POST /api/gemini/verify
 * Gemini API 연결 검증
 */
router.post('/verify', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  // 클라이언트가 사용자 입력 키를 테스트할 수 있도록 body에서 키를 받을 수도 있음
  const testKey = (req.body as { apiKey?: string }).apiKey || apiKey;

  if (!testKey || testKey.trim().length < 10) {
    res.json({ success: false, message: 'API Key 형식이 올바르지 않습니다.' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: testKey.trim() });
    await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'ping',
    });
    res.json({ success: true, message: '연동 성공', modelUsed: 'gemini-2.0-flash' });
  } catch (error: unknown) {
    const errStr = String(error);
    if (errStr.includes('403') || errStr.includes('API key not valid')) {
      res.json({ success: false, message: 'API Key가 유효하지 않습니다 (403 Forbidden).' });
      return;
    }
    if (errStr.includes('429')) {
      res.json({ success: false, message: 'API 사용량 한도를 초과했습니다 (429 Quota Exceeded).' });
      return;
    }
    res.json({ success: false, message: '모든 모델 연결에 실패했습니다. 네트워크 상태를 확인하세요.' });
  }
});

export default router;

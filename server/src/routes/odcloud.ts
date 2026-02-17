import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/odcloud/programs
 * 인천 bizok API 프록시
 * Query params: page, perPage, endpointPath
 */
router.get('/programs', async (req: Request, res: Response) => {
  const apiKey = process.env.ODCLOUD_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ODCLOUD_API_KEY not configured' });
    return;
  }

  const page = req.query.page || '1';
  const perPage = req.query.perPage || '500';
  const rawEndpointPath = req.query.endpointPath as string | undefined;
  const endpointPath = rawEndpointPath ?? '/15049270/v1/uddi:6b5d729e-28f8-4404-afae-c3f46842ff11';

  // SSRF 차단: endpointPath 화이트리스트 검증
  const ALLOWED_ENDPOINT_PATTERN = /^\/15049270\/v1\/uddi:[a-f0-9\-]+$/;
  if (!ALLOWED_ENDPOINT_PATTERN.test(endpointPath)) {
    res.status(400).json({ error: 'Invalid endpointPath' });
    return;
  }

  // path traversal 및 외부 도메인 주입 추가 방어
  if (endpointPath.includes('..') || endpointPath.includes('//')) {
    res.status(400).json({ error: 'Invalid endpointPath' });
    return;
  }

  const url = `https://api.odcloud.kr/api${endpointPath}?page=${page}&perPage=${perPage}&serviceKey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[odcloud] Proxy error:', error);
    res.status(502).json({ error: 'Failed to fetch from ODCloud API' });
  }
});

export default router;

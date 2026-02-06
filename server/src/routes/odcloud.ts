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
  const endpointPath = req.query.endpointPath || '/15049270/v1/uddi:6b5d729e-28f8-4404-afae-c3f46842ff11';

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

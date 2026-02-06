import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/dart/company
 * DART 기업정보 API 프록시
 * Query params: corp_code
 */
router.get('/company', async (req: Request, res: Response) => {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DART_API_KEY not configured' });
    return;
  }

  const corpCode = req.query.corp_code;
  if (!corpCode || typeof corpCode !== 'string') {
    res.status(400).json({ error: 'corp_code query parameter required' });
    return;
  }

  const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[dart] Proxy error:', error);
    res.status(502).json({ error: 'Failed to fetch from DART API' });
  }
});

export default router;

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/data-go/mss-biz
 * 중소벤처기업부 사업공고 API 프록시
 */
router.get('/mss-biz', async (req: Request, res: Response) => {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DATA_GO_KR_API_KEY not configured' });
    return;
  }

  const numOfRows = req.query.numOfRows || '200';
  const pageNo = req.query.pageNo || '1';

  const url = `https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=${numOfRows}&pageNo=${pageNo}`;

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/xml' },
    });
    const text = await response.text();
    res.set('Content-Type', 'application/xml');
    res.send(text);
  } catch (error) {
    console.error('[data-go/mss-biz] Proxy error:', error);
    res.status(502).json({ error: 'Failed to fetch from MSS Biz API' });
  }
});

/**
 * GET /api/data-go/kstartup
 * 창업진흥원 K-Startup API 프록시
 */
router.get('/kstartup', async (req: Request, res: Response) => {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DATA_GO_KR_API_KEY not configured' });
    return;
  }

  const page = req.query.page || '1';
  const perPage = req.query.perPage || '200';

  const url = `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?serviceKey=${encodeURIComponent(apiKey)}&page=${page}&perPage=${perPage}&returnType=json`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[data-go/kstartup] Proxy error:', error);
    res.status(502).json({ error: 'Failed to fetch from K-Startup API' });
  }
});

export default router;

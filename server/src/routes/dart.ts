import { Router, Request, Response } from 'express';
import { findCorpCode, fetchFinancialStatements } from '../services/dartFinancialService.js';

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

/**
 * GET /api/dart/search
 * 회사명으로 DART corp_code 검색
 * Query params: name (회사명)
 */
router.get('/search', async (req: Request, res: Response) => {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'DART_API_KEY not configured' });
    return;
  }

  const name = req.query.name;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name query parameter required' });
    return;
  }

  try {
    const corpCode = await findCorpCode(name);
    if (!corpCode) {
      res.json({ found: false, corpCode: null });
      return;
    }
    res.json({ found: true, corpCode });
  } catch (error) {
    console.error('[dart/search] Error:', error);
    res.status(500).json({ error: 'DART corp_code 검색 실패' });
  }
});

/**
 * GET /api/dart/financials
 * DART 5년 재무제표 조회
 * Query params: corp_code, years (optional, default 5)
 */
router.get('/financials', async (req: Request, res: Response) => {
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

  const years = Math.min(Math.max(parseInt(String(req.query.years || '5'), 10) || 5, 1), 10);

  try {
    const financials = await fetchFinancialStatements(corpCode, years);
    res.json({ success: true, corpCode, years, financials });
  } catch (error) {
    console.error('[dart/financials] Error:', error);
    res.status(500).json({ error: 'DART 재무제표 조회 실패' });
  }
});

export default router;

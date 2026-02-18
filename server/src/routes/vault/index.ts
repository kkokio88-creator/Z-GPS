import { Router, Request, Response } from 'express';
import path from 'path';
import programsRouter from './programs.js';
import analysisRouter from './analysis.js';
import applicationsRouter from './applications.js';
import companyRouter from './company.js';
import benefitsRouter from './benefits.js';
import configRouter from './config.js';
import {
  listNotes,
  getVaultRoot,
  noteExists,
} from '../../services/vaultFileService.js';

const router = Router();

router.use('/', programsRouter);
router.use('/', analysisRouter);
router.use('/', applicationsRouter);
router.use('/', companyRouter);
router.use('/', benefitsRouter);
router.use('/', configRouter);

/**
 * POST /api/vault/sync-status
 * 볼트 동기화 상태 반환
 * Returns: { lastSyncedAt, programCount, applicationCount, companyExists }
 */
router.post('/sync-status', async (_req: Request, res: Response) => {
  try {
    const vaultRoot = getVaultRoot();

    const programsDir = path.join(vaultRoot, 'programs');
    const appsDir = path.join(vaultRoot, 'applications');
    const companyNotePath = path.join('company', 'profile.md');

    const [programFiles, appFiles, companyExists] = await Promise.all([
      listNotes(programsDir).catch(() => [] as string[]),
      listNotes(appsDir).catch(() => [] as string[]),
      noteExists(companyNotePath),
    ]);

    const programCount = programFiles.filter(f => f.endsWith('.md')).length;
    // application count: only count draft.md files (one per application)
    const applicationCount = appFiles.filter(f => path.basename(f) === 'draft.md').length;

    res.json({
      lastSyncedAt: new Date().toISOString(),
      programCount,
      applicationCount,
      companyExists,
    });
  } catch (error) {
    console.error('[vault/sync-status] Error:', error);
    res.status(500).json({ error: '동기화 상태 조회 실패' });
  }
});

export default router;

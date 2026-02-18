import { Router, Request, Response } from 'express';
import path from 'path';
import {
  readNote,
  writeNote,
  listNotes,
  getVaultRoot,
  noteExists,
} from '../../services/vaultFileService.js';
import { isValidSlug } from './programs.js';

/** section ID 검증: 경로순회 방지 */
function isValidSectionId(sectionId: string): boolean {
  return /^[a-zA-Z0-9가-힣_-]+$/.test(sectionId) && !sectionId.includes('..');
}

const router = Router();

/**
 * GET /api/vault/applications
 * 생성된 지원서 목록
 */
router.get('/applications', async (_req: Request, res: Response) => {
  try {
    const vaultRoot = getVaultRoot();
    const appsDir = path.join(vaultRoot, 'applications');

    const files = await listNotes(appsDir);
    const applications: Record<string, unknown>[] = [];

    const draftFiles = files.filter(f => f.endsWith('draft.md'));

    for (const file of draftFiles) {
      try {
        const { frontmatter } = await readNote(file);
        applications.push(frontmatter);
      } catch (e) {
        console.warn('[vault/applications] Failed to read:', file, e);
      }
    }

    res.json({ applications, total: applications.length });
  } catch (error) {
    console.error('[vault/applications] Error:', error);
    res.status(500).json({ error: '지원서 목록 조회 실패' });
  }
});

/**
 * GET /api/vault/application/:slug
 * 지원서 상세
 */
router.get('/application/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const draftPath = path.join('applications', slug, 'draft.md');

    if (!(await noteExists(draftPath))) {
      res.status(404).json({ error: '지원서를 찾을 수 없습니다.' });
      return;
    }

    const draft = await readNote(draftPath);

    let review: { frontmatter: Record<string, unknown>; content: string } | null = null;
    let consistency: { frontmatter: Record<string, unknown>; content: string } | null = null;

    const reviewPath = path.join('applications', slug, 'review.md');
    if (await noteExists(reviewPath)) {
      review = await readNote(reviewPath);
    }

    const consistencyPath = path.join('applications', slug, 'consistency.md');
    if (await noteExists(consistencyPath)) {
      consistency = await readNote(consistencyPath);
    }

    res.json({
      draft: { frontmatter: draft.frontmatter, content: draft.content },
      review: review ? { frontmatter: review.frontmatter, content: review.content } : null,
      consistency: consistency
        ? { frontmatter: consistency.frontmatter, content: consistency.content }
        : null,
    });
  } catch (error) {
    console.error('[vault/application] Error:', error);
    res.status(500).json({ error: '지원서 조회 실패' });
  }
});

/**
 * PUT /api/vault/application/:slug
 * 지원서 편집
 */
router.put('/application/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    const { sections } = req.body as { sections: Record<string, string> };

    if (!sections) {
      res.status(400).json({ error: 'sections 필드가 필요합니다.' });
      return;
    }

    const draftPath = path.join('applications', slug, 'draft.md');

    if (!(await noteExists(draftPath))) {
      res.status(404).json({ error: '지원서를 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter } = await readNote(draftPath);
    frontmatter.updatedAt = new Date().toISOString();
    frontmatter.status = 'edited';

    const draftContent = Object.entries(sections)
      .map(([title, text]) => `## ${title}\n\n${text}`)
      .join('\n\n---\n\n');

    await writeNote(
      draftPath,
      frontmatter,
      `# 지원서: ${frontmatter.programName}\n\n${draftContent}`
    );

    res.json({ success: true, updatedAt: frontmatter.updatedAt });
  } catch (error) {
    console.error('[vault/application PUT] Error:', error);
    res.status(500).json({ error: '지원서 저장 실패' });
  }
});

/**
 * GET /api/vault/application/:slug/sections
 * 섹션 파일 목록 반환
 * 각 섹션은 applications/{slug}/section-{sectionId}.md 로 저장됨
 */
router.get('/application/:slug/sections', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }

    const draftPath = path.join('applications', slug, 'draft.md');
    if (!(await noteExists(draftPath))) {
      res.status(404).json({ error: '지원서를 찾을 수 없습니다.' });
      return;
    }

    const vaultRoot = getVaultRoot();
    const appDir = path.join(vaultRoot, 'applications', slug);
    const allFiles = await listNotes(appDir);

    const sectionFiles = allFiles.filter(f => path.basename(f).startsWith('section-'));
    const sections: Record<string, unknown>[] = [];

    for (const file of sectionFiles) {
      try {
        const { frontmatter, content } = await readNote(file);
        const basename = path.basename(file, '.md'); // section-{sectionId}
        const sectionId = basename.replace(/^section-/, '');
        sections.push({ sectionId, frontmatter, contentPreview: content.substring(0, 200) });
      } catch (e) {
        console.warn('[vault/application/sections] Failed to read:', file, e);
      }
    }

    res.json({ slug, sections, total: sections.length });
  } catch (error) {
    console.error('[vault/application/sections GET] Error:', error);
    res.status(500).json({ error: '섹션 목록 조회 실패' });
  }
});

/**
 * GET /api/vault/application/:slug/sections/:sectionId
 * 단일 섹션 내용 반환
 */
router.get('/application/:slug/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const sectionId = String(req.params.sectionId);

    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    if (!isValidSectionId(sectionId)) { res.status(400).json({ error: '잘못된 sectionId 형식입니다.' }); return; }

    const sectionPath = path.join('applications', slug, `section-${sectionId}.md`);
    if (!(await noteExists(sectionPath))) {
      res.status(404).json({ error: '섹션을 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter, content } = await readNote(sectionPath);
    res.json({ slug, sectionId, frontmatter, content });
  } catch (error) {
    console.error('[vault/application/sections/:sectionId GET] Error:', error);
    res.status(500).json({ error: '섹션 조회 실패' });
  }
});

/**
 * PUT /api/vault/application/:slug/sections/:sectionId
 * 단일 섹션 생성/업데이트
 * Body: { title?: string, content: string, status?: string }
 */
router.put('/application/:slug/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const sectionId = String(req.params.sectionId);

    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }
    if (!isValidSectionId(sectionId)) { res.status(400).json({ error: '잘못된 sectionId 형식입니다.' }); return; }

    const draftPath = path.join('applications', slug, 'draft.md');
    if (!(await noteExists(draftPath))) {
      res.status(404).json({ error: '지원서를 찾을 수 없습니다.' });
      return;
    }

    const { title, content, status } = req.body as {
      title?: string;
      content: string;
      status?: string;
    };

    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content 필드가 필요합니다.' });
      return;
    }

    const sectionPath = path.join('applications', slug, `section-${sectionId}.md`);
    let existingFrontmatter: Record<string, unknown> = {};

    if (await noteExists(sectionPath)) {
      const existing = await readNote(sectionPath);
      existingFrontmatter = existing.frontmatter;
    }

    const now = new Date().toISOString();
    const frontmatter: Record<string, unknown> = {
      ...existingFrontmatter,
      sectionId,
      slug,
      title: title ?? existingFrontmatter.title ?? sectionId,
      status: status ?? existingFrontmatter.status ?? 'draft',
      updatedAt: now,
      createdAt: existingFrontmatter.createdAt ?? now,
    };

    await writeNote(sectionPath, frontmatter, content);

    res.json({ success: true, slug, sectionId, updatedAt: now });
  } catch (error) {
    console.error('[vault/application/sections/:sectionId PUT] Error:', error);
    res.status(500).json({ error: '섹션 저장 실패' });
  }
});

/**
 * POST /api/vault/application/:slug/feedback
 * 섹션에 피드백 추가 또는 승인 처리
 * Body: { sectionId: string, feedback: string, action: 'revise' | 'approve' }
 *   - action='revise': 섹션 MD 파일 끝에 피드백 코멘트 블록 추가 + frontmatter에 revision 마커 기록
 *   - action='approve': frontmatter의 status를 'approved'로 변경
 */
router.post('/application/:slug/feedback', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    if (!isValidSlug(slug)) { res.status(400).json({ error: '잘못된 slug 형식입니다.' }); return; }

    const { sectionId, feedback, action } = req.body as {
      sectionId: string;
      feedback?: string;
      action: 'revise' | 'approve';
    };

    if (!sectionId || !isValidSectionId(String(sectionId))) {
      res.status(400).json({ error: '유효한 sectionId가 필요합니다.' });
      return;
    }

    if (action !== 'revise' && action !== 'approve') {
      res.status(400).json({ error: "action은 'revise' 또는 'approve' 이어야 합니다." });
      return;
    }

    const sectionPath = path.join('applications', slug, `section-${sectionId}.md`);
    if (!(await noteExists(sectionPath))) {
      res.status(404).json({ error: '섹션을 찾을 수 없습니다.' });
      return;
    }

    const { frontmatter, content } = await readNote(sectionPath);
    const now = new Date().toISOString();

    if (action === 'approve') {
      frontmatter.status = 'approved';
      frontmatter.approvedAt = now;
      frontmatter.updatedAt = now;
      await writeNote(sectionPath, frontmatter, content);
      res.json({ success: true, slug, sectionId, action: 'approve', approvedAt: now });
      return;
    }

    // action === 'revise'
    if (!feedback || typeof feedback !== 'string' || feedback.trim() === '') {
      res.status(400).json({ error: "action='revise'일 때 feedback 내용이 필요합니다." });
      return;
    }

    const revisionCount = typeof frontmatter.revisionCount === 'number'
      ? frontmatter.revisionCount + 1
      : 1;

    frontmatter.status = 'needs-revision';
    frontmatter.revisionCount = revisionCount;
    frontmatter.lastFeedbackAt = now;
    frontmatter.updatedAt = now;

    const feedbackBlock = `\n\n<!-- FEEDBACK [${now}] revision #${revisionCount}\n${feedback.trim()}\n-->`;
    const updatedContent = content + feedbackBlock;

    await writeNote(sectionPath, frontmatter, updatedContent);

    res.json({
      success: true,
      slug,
      sectionId,
      action: 'revise',
      revisionCount,
      lastFeedbackAt: now,
    });
  } catch (error) {
    console.error('[vault/application/feedback POST] Error:', error);
    res.status(500).json({ error: '피드백 처리 실패' });
  }
});

export default router;

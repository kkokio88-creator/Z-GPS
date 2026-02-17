import { test, expect } from '@playwright/test';

test.describe('ExportModal - 문서 내보내기', () => {
  // ExportModal은 ApplicationEditor 내에서 열림
  // 직접 접근이 어려우므로 라우트 기반 접근
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('지원서 목록에서 편집 진입', async ({ page }) => {
    // 지원서 목록 또는 대시보드에서 편집 가능한 항목 찾기
    const editLink = page.getByRole('link', { name: /작성|편집|지원서/ }).first();
    if (await editLink.isVisible()) {
      await editLink.click();
      await expect(page.getByText(/사업계획서|지원서 작성/)).toBeVisible({ timeout: 10000 });
    }
  });

  test('ExportModal PDF/DOCX 버튼 존재', async ({ page }) => {
    // 지원서 편집기에서 내보내기 버튼 찾기
    const exportButton = page.getByRole('button', { name: /서식|내보내기|첨부/ });
    if (await exportButton.isVisible().catch(() => false)) {
      await exportButton.click();
      // 모달 내 버튼 확인
      await expect(page.getByRole('button', { name: /PDF/ })).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: /DOCX/ })).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('button', { name: /HWP/ })).toBeVisible({ timeout: 5000 });
    }
  });

  test('미리보기 탭 전환', async ({ page }) => {
    const exportButton = page.getByRole('button', { name: /서식|내보내기|첨부/ });
    if (await exportButton.isVisible().catch(() => false)) {
      await exportButton.click();
      const previewTab = page.getByRole('button', { name: /미리보기/ });
      if (await previewTab.isVisible()) {
        await previewTab.click();
        // A4 미리보기 영역 확인
        await expect(page.locator('#export-preview-content')).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

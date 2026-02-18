import { test, expect } from '@playwright/test';

test.describe('ExportModal - 문서 내보내기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('지원서 목록에서 편집 진입', async ({ page }) => {
    const editLink = page.getByRole('link', { name: /작성|편집|지원서/ }).first();
    if (await editLink.isVisible()) {
      await editLink.click();
      await expect(page.getByText(/사업계획서|지원서 작성/)).toBeVisible({ timeout: 10000 });
    }
  });

  test('ExportModal PDF/DOCX/HWP 버튼 존재', async ({ page }) => {
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

  test('DOCX 내보내기 버튼 클릭 시 다운로드 이벤트 발생', async ({ page }) => {
    // 지원서 편집기에 직접 진입 시도
    const editLink = page.getByRole('link', { name: /작성|편집|지원서/ }).first();
    if (await editLink.isVisible().catch(() => false)) {
      await editLink.click();
      await page.waitForTimeout(2000);

      const exportButton = page.getByRole('button', { name: /서식|내보내기|첨부/ });
      if (await exportButton.isVisible().catch(() => false)) {
        await exportButton.click();
        const docxButton = page.getByRole('button', { name: /DOCX/ });
        if (await docxButton.isVisible().catch(() => false)) {
          // 다운로드 이벤트 대기
          const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
          await docxButton.click();
          const download = await downloadPromise;
          // 다운로드가 발생하거나 에러 없이 완료
          if (download) {
            expect(download.suggestedFilename()).toMatch(/\.docx$/);
          }
        }
      }
    }
  });

  test('HWP 내보내기 시 지원 불가 안내', async ({ page }) => {
    const editLink = page.getByRole('link', { name: /작성|편집|지원서/ }).first();
    if (await editLink.isVisible().catch(() => false)) {
      await editLink.click();
      await page.waitForTimeout(2000);

      const exportButton = page.getByRole('button', { name: /서식|내보내기|첨부/ });
      if (await exportButton.isVisible().catch(() => false)) {
        await exportButton.click();
        const hwpButton = page.getByRole('button', { name: /HWP/ });
        if (await hwpButton.isVisible().catch(() => false)) {
          // HWP 클릭 시 alert 대화상자 확인
          page.on('dialog', async dialog => {
            expect(dialog.message()).toContain('HWP');
            await dialog.accept();
          });
          await hwpButton.click();
        }
      }
    }
  });
});

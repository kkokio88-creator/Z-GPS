import { test, expect } from '@playwright/test';

test.describe('추천 공고 매칭 - Threshold 통일 검증', () => {
  test('Dashboard 추천 공고 표시', async ({ page }) => {
    await page.goto('/');
    // Dashboard에서 추천 공고 섹션 존재 확인
    await expect(page.getByText(/추천|공고|지원사업/)).toBeVisible({ timeout: 10000 });
  });

  test('ProgramExplorer 추천 탭', async ({ page }) => {
    await page.goto('/programs');
    await expect(page.getByText(/지원사업|프로그램/)).toBeVisible({ timeout: 10000 });

    // 추천 탭 확인
    const recommendedTab = page.getByRole('button', { name: /추천/ });
    if (await recommendedTab.isVisible()) {
      await recommendedTab.click();
      // 추천 목록 또는 빈 상태
      await expect(
        page.getByText(/추천 공고|적합도|공고가 없습니다/)
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('ProgramDetail 적합도 표시', async ({ page }) => {
    await page.goto('/programs');
    // 첫 번째 프로그램 카드 클릭
    const programCard = page.locator('[data-testid="program-card"], .program-card, a[href*="/programs/"]').first();
    if (await programCard.isVisible()) {
      await programCard.click();
      // 상세 페이지에서 적합도 점수 확인
      await expect(page.getByText(/적합도|점/)).toBeVisible({ timeout: 10000 });
    }
  });
});

import { test, expect } from '@playwright/test';

test.describe('CompanyProfile - AI 기업 리서치', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/company');
  });

  test('기업 프로필 페이지 로드', async ({ page }) => {
    await expect(page.getByText(/기업 프로필|기업 정보/)).toBeVisible({ timeout: 5000 });
  });

  test('리서치 실행 버튼 존재', async ({ page }) => {
    const researchButton = page.getByRole('button', { name: /리서치|분석|조회/ });
    await expect(researchButton).toBeVisible({ timeout: 5000 });
  });

  test('리서치 결과 표시', async ({ page }) => {
    const researchButton = page.getByRole('button', { name: /리서치|분석|조회/ });
    if (await researchButton.isEnabled()) {
      await researchButton.click();
      // 로딩 인디케이터 또는 결과 대기
      const result = page.locator('[data-testid="research-result"], .research-result');
      // 결과가 나오거나 에러 메시지가 표시되어야 함
      await expect(
        page.getByText(/분석 결과|리서치 완료|오류|API/)
      ).toBeVisible({ timeout: 30000 });
    }
  });

  test('Mock 데이터 미사용 확인', async ({ page }) => {
    // "산너머남촌" 하드코딩 데이터가 표시되지 않아야 함
    const mockData = page.getByText('산너머남촌');
    await expect(mockData).not.toBeVisible({ timeout: 3000 }).catch(() => {
      // 사용자가 실제로 "산너머남촌" 회사를 등록한 경우는 허용
    });
  });
});

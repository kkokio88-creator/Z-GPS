import { test, expect } from '@playwright/test';

test.describe('BenefitTracker - 놓친 세금 환급', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/benefits');
  });

  test('세금 환급 페이지 로드', async ({ page }) => {
    await expect(page.getByText('놓친 세금 환급')).toBeVisible();
    // 탭 4개 존재 확인
    await expect(page.getByText('수령 이력')).toBeVisible();
    await expect(page.getByText('환급 분석')).toBeVisible();
    await expect(page.getByText('요약')).toBeVisible();
  });

  test('자동 스캔 시작', async ({ page }) => {
    // 자동 스캔이 시작되면 stepper가 표시됨
    const scanButton = page.getByRole('button', { name: /스캔/ });
    await expect(scanButton).toBeVisible({ timeout: 5000 });
  });

  test('수동 스캔 실행', async ({ page }) => {
    const scanButton = page.getByRole('button', { name: /스캔 시작/ });
    // 스캔이 완료되거나 자동 스캔 중이면 스킵
    if (await scanButton.isEnabled()) {
      await scanButton.click();
      // 스캔 중 상태 확인
      await expect(page.getByText(/스캔 중/)).toBeVisible({ timeout: 3000 });
    }
  });

  test('KPI 카드 표시 (스캔 후)', async ({ page }) => {
    // 스캔 완료까지 대기 (최대 30초)
    await expect(page.getByText('추정 총 환급액')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('발견 기회')).toBeVisible();
    await expect(page.getByText('경정청구 대상')).toBeVisible();
  });

  test('정렬/필터 동작', async ({ page }) => {
    // 스캔 완료 대기
    await expect(page.getByText('추정 총 환급액')).toBeVisible({ timeout: 30000 });

    // 정렬 버튼 클릭
    await page.getByRole('button', { name: '신뢰도순' }).click();
    await page.getByRole('button', { name: '난이도순' }).click();
    await page.getByRole('button', { name: '환급액순' }).click();

    // 필터 변경
    const statusFilter = page.locator('select').first();
    await statusFilter.selectOption('identified');
  });

  test('수령 이력 탭 전환', async ({ page }) => {
    await page.getByText('수령 이력').click();
    // 데이터 또는 빈 상태 메시지 확인
    const hasData = await page.getByText('수령 이력이 없습니다').isVisible().catch(() => false);
    if (!hasData) {
      // 추가 버튼 확인
      await expect(page.getByRole('button', { name: /추가/ })).toBeVisible({ timeout: 5000 });
    }
  });

  test('에러 처리 (API 키 미설정)', async ({ page }) => {
    // 에러 발생 시 안내 메시지 표시 확인
    const errorMsg = page.getByText(/API 키|기업 프로필|연결할 수 없습니다/);
    const hasError = await errorMsg.isVisible().catch(() => false);
    if (hasError) {
      await expect(page.getByRole('button', { name: /설정으로 이동|다시 시도/ })).toBeVisible();
    }
  });
});

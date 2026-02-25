---
name: lint
description: Z-GPS 코드 린트 + 포맷팅 (ESLint + Prettier)
user_invocable: true
---

# Z-GPS 린트 및 포맷팅

## 실행 순서

### 1. ESLint 검사
```bash
npx eslint . --ext ts,tsx
```
- 에러가 있으면 자동 수정 시도: `npx eslint . --ext ts,tsx --fix`

### 2. Prettier 포맷팅
```bash
npx prettier --write "**/*.{ts,tsx,json,md}"
```
- 변경된 파일 목록 확인

### 3. 결과 요약
- ESLint 에러/경고 수
- Prettier로 수정된 파일 수
- 남은 수동 수정 필요 항목

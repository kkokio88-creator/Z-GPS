---
name: check
description: Z-GPS 코드 품질 종합 검사 (타입체크 + 린트 + 빌드)
user_invocable: true
---

# Z-GPS 코드 품질 종합 검사

## 검사 항목 (순서대로 실행)

### 1. TypeScript 타입 체크
```bash
npx tsc --noEmit
```
- 타입 에러 0개 목표

### 2. ESLint 검사
```bash
npx eslint . --ext ts,tsx --max-warnings 0
```
- 린트 경고/에러 확인

### 3. 프로덕션 빌드 테스트
```bash
npm run build
```
- 빌드 성공 여부 확인

### 4. 코드 패턴 검사
- `any` 타입 사용 여부 검색 (Grep으로 `: any` 패턴)
- `process.env` 사용 여부 검색 (Vite에서는 `import.meta.env` 사용해야 함)
- `console.log` 조건부 사용 여부 (`import.meta.env.DEV` 가드 없이 사용된 것)
- 하드코딩된 API 키 패턴 검색

### 5. 결과 요약
- 통과/실패 항목 리스트
- 발견된 문제점과 수정 제안

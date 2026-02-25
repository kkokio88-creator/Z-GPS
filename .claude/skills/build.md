---
name: build
description: Z-GPS 프로덕션 빌드 실행 및 검증
user_invocable: true
---

# Z-GPS 프로덕션 빌드

## 실행 순서
1. TypeScript 타입 체크: `npx tsc --noEmit`
   - 에러가 있으면 수정 후 재실행
2. 프론트엔드 빌드: `npm run build`
3. 백엔드 빌드: `cd server && npm run build`
4. 빌드 결과 확인:
   - `dist/` 폴더 존재 여부
   - `dist/index.html` 파일 존재 여부
   - `server/dist/` 폴더 존재 여부
5. 빌드 결과 요약 리포트 제공

## 에러 처리
- TypeScript 에러: 에러 내용 분석 후 수정 제안
- 빌드 에러: vite.config.ts 확인, 의존성 문제 확인
- 번들 크기가 비정상적으로 크면 경고

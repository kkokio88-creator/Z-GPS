---
name: deploy
description: Z-GPS 배포 워크플로우 (Vercel 프론트엔드 + Railway 백엔드)
user_invocable: true
---

# Z-GPS 배포 워크플로우

## 배포 전 검사
1. TypeScript 타입 체크: `npx tsc --noEmit`
2. 프론트엔드 빌드 테스트: `npm run build`
3. 백엔드 빌드 테스트: `cd server && npm run build`
4. Git 상태 확인: 커밋되지 않은 변경사항 확인

## 프론트엔드 배포 (Vercel)
1. `vercel` CLI 확인 (없으면 설치 안내)
2. 환경 변수 확인:
   - `VITE_API_BASE_URL` - 백엔드 API 서버 URL
   - `VITE_ODCLOUD_ENDPOINT_PATH` - 공공데이터 API 경로
3. 배포: `vercel --prod`
4. 배포 URL 확인 및 사용자에게 안내

## 백엔드 배포 (Railway)
1. `railway` CLI 확인 (없으면 설치 안내)
2. 환경 변수 확인:
   - `GEMINI_API_KEY` - Gemini API 키 (Railway 환경 변수)
   - `PORT` - Railway가 자동 할당
3. 배포: `railway up`
4. 배포 URL 확인

## 배포 후 확인
- 프론트엔드 접속 테스트
- API 헬스체크 (백엔드)
- CORS 설정 확인

---
name: fullstack
description: Z-GPS 프론트엔드 + 백엔드 동시 시작
user_invocable: true
---

# Z-GPS 풀스택 개발 서버 시작

## 실행 순서
1. 의존성 확인:
   - `node_modules` 없으면: `npm install`
   - `server/node_modules` 없으면: `cd server && npm install`
2. `server/.env` 파일 확인 (GEMINI_API_KEY 필요)
3. 백엔드 서버를 백그라운드로 시작: `cd server && npm run dev` (백그라운드 Bash)
4. 프론트엔드 서버 시작: `npm run dev`
5. 사용자에게 안내:
   - 프론트엔드: http://localhost:5000
   - 백엔드: http://localhost:3001
   - API 프록시: 프론트엔드의 `/api/*` -> 백엔드 자동 프록시

## 종료
- 두 서버 모두 종료 필요 (각각의 프로세스)

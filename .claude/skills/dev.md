---
name: dev
description: Z-GPS 프론트엔드 개발 서버 시작 (Vite, port 5000)
user_invocable: true
---

# Z-GPS 프론트엔드 개발 서버 시작

## 실행 순서
1. `node_modules` 폴더가 있는지 확인. 없으면 `npm install` 실행
2. 프론트엔드 개발 서버 시작: `npm run dev`
3. 사용자에게 안내:
   - 프론트엔드: http://localhost:5000
   - 백엔드 프록시: `/api` -> http://localhost:3001
   - 백엔드가 별도로 필요하면 `/server` 스킬 사용 안내

## 주의사항
- Vite 서버는 port 5000에서 실행됨
- `/api` 요청은 자동으로 localhost:3001로 프록시됨
- 백엔드 서버가 실행 중이 아니면 API 호출 실패함

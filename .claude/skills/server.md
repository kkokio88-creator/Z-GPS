---
name: server
description: Z-GPS 백엔드 Express 서버 시작 (port 3001)
user_invocable: true
---

# Z-GPS 백엔드 서버 시작

## 실행 순서
1. `server/node_modules` 폴더 확인. 없으면 `cd server && npm install`
2. `server/.env` 파일 존재 여부 확인
   - 없으면 사용자에게 필요한 환경 변수 안내:
     - `GEMINI_API_KEY` - Google Gemini API 키
     - `PORT` - 서버 포트 (기본값: 3001)
3. 백엔드 서버 시작: `cd server && npm run dev`
4. 사용자에게 안내:
   - 서버: http://localhost:3001
   - API 엔드포인트: POST /api/gemini/generate, POST /api/gemini/verify
   - 프론트엔드와 함께 사용하려면 `/fullstack` 스킬 안내

## 주의사항
- tsx watch 모드로 실행되어 파일 변경 시 자동 재시작
- GEMINI_API_KEY가 없으면 AI 기능이 작동하지 않음

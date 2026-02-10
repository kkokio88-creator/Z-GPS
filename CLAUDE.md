# Z-GPS Project - Claude Code Guide

## 프로젝트 개요
중소기업을 위한 AI 기반 정부 지원금 신청 관리 시스템

## 기술 스택
- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS (inline)
- **Backend**: Express.js (ESM) in `server/`
- **AI**: Google Gemini API (서버 프록시, `callGemini()` HTTP 방식)
- **Routing**: React Router DOM 7
- **Deploy**: Frontend → Vercel, Backend → Railway

## 파일 구조
```
Z-GPS/
├── components/             # React 컴포넌트 (PascalCase.tsx)
│   ├── editor/             # ApplicationEditor 하위 (SectionCard, ExportModal 등)
│   ├── programs/           # ProgramExplorer 하위
│   └── applications/       # ApplicationList 하위
├── services/               # 비즈니스 로직 (camelCase.ts)
│   └── repositories/       # 데이터 저장소
├── server/src/             # Express 백엔드
│   ├── routes/             # vault.ts, gemini.ts
│   └── services/           # vaultFileService, programFetcher, analysisService 등
├── types.ts                # 전역 타입 정의
└── constants.ts            # 상수 정의
```

## 네이밍 컨벤션
- **컴포넌트**: PascalCase (`AgentControl.tsx`)
- **서비스/유틸**: camelCase (`agentOrchestrator.ts`)
- **타입/인터페이스**: PascalCase (`AgentMessage`)
- **상수**: UPPER_SNAKE_CASE (`API_BASE_URL`)

## 환경 변수
- Frontend: `import.meta.env.VITE_*` (절대 `process.env` 사용 금지)
- Backend: `process.env.*` (dotenv)
- API 키는 서버사이드 only — 프론트엔드에 노출 금지

## Gemini Agent 시스템

### Agent 이름 (오타 주의)
- `structuringAgent` (NOT `structureAgent`)
- `suitabilityAgent` (NOT `intelligenceAgent`)
- `draftAgent`, `reviewAgent`, `consistencyAgent`

### 메서드 시그니처
```typescript
structuringAgent.structure(text, company)
suitabilityAgent.evaluate(company, program)
draftAgent.writeSection(company, program, sectionTitle, useSearch, context)
reviewAgent.reviewApplication(company, program, draftSections, persona)
consistencyAgent.checkConsistency(draftSections)
```

### Multi-Agent 초기화
- 순서: `agentTeam.initialize()` → `orchestrator.start()`
- Unmount 시 `orchestrator.off()` 호출 필수
- `geminiAgents.ts`의 `callGemini()`는 HTTP proxy 방식 (SDK 직접 접근 없음)

## 개발 모드 로깅
```typescript
if (import.meta.env.DEV) {
  console.log('Debug info');  // 프로덕션에 노출 안 됨
}
```

## Git Commit 규칙
```
<type>: <subject>

<body>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
Types: `feat` | `fix` | `refactor` | `docs` | `style` | `test` | `chore`

## 프로젝트 고유 주의사항
- `EligibilityStatus` enum 사용 필수 (문자열 리터럴 X)
- `vaultFileService.ts`는 lazy getter `getVaultRoot()` 사용 (ESM import hoisting 문제)
- `GEMINI_API_KEY` 미설정 시 503 응답 (vault.ts에서 체크)
- Frontend env: `VITE_API_BASE_URL`, `VITE_ODCLOUD_ENDPOINT_PATH` only

---
**Last Updated**: 2026-02-11

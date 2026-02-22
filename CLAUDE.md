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
│   ├── applications/       # ApplicationList 하위
│   ├── benefits/           # BenefitTracker 하위 (분해됨)
│   ├── company/            # CompanyProfile 하위 (분해됨)
│   ├── editor/             # ApplicationEditor 하위 (SectionCard, ExportModal 등)
│   ├── programs/           # ProgramExplorer 하위 (분해됨)
│   ├── qa/                 # QAController (App.tsx에서 분리)
│   └── settings/           # Settings 하위 (탭별 분해됨)
├── services/               # 비즈니스 로직 (camelCase.ts)
│   ├── repositories/       # 데이터 저장소
│   ├── stores/             # Zustand 상태 관리 (companyStore, qaStore)
│   └── utils/              # 공유 유틸리티 (formatters)
├── server/src/             # Express 백엔드
│   ├── routes/             # vault/, gemini.ts, odcloud.ts, dart.ts, health.ts
│   │   └── vault/          # 도메인별 분리 (programs, analysis, benefits 등 7파일)
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

## 빌드 검증 (필수)
> **절대 규칙**: `git push` 전에 반드시 `npx vite build`가 성공하는지 확인할 것.
> pre-push hook이 설치되어 있으나, 코드 변경/패키지 추가 시 수동으로도 확인 권장.

- 새 패키지 import 추가 시 → 반드시 `npm install <pkg>` 후 `package.json`에 반영 확인
- 프론트엔드(`components/`, `services/`, `hooks/`)에서 외부 패키지 import 시 → `package.json` dependencies에 존재하는지 확인
- 서버(`server/src/`)에서 외부 패키지 import 시 → `server/package.json` dependencies에 존재하는지 확인
- **빌드 실패 상태로 push 금지** — Vercel 배포가 실패하면 모든 변경사항이 반영되지 않음

## Git Commit 규칙
```
<type>: <subject>

<body>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
Types: `feat` | `fix` | `refactor` | `docs` | `style` | `test` | `chore`

## 상태 관리
- **Zustand**: `companyStore` (기업정보), `qaStore` (QA 시스템) — `getStoredCompany()` 직접 호출 대신 `useCompanyStore()` 사용
- **localStorage**: 세션, API키, 캘린더 등 (storageService.ts 경유)

## 프로젝트 고유 주의사항
- `EligibilityStatus` enum 사용 필수 (문자열 리터럴 X)
- `vaultFileService.ts`는 lazy getter `getVaultRoot()` 사용 (ESM import hoisting 문제)
- `GEMINI_API_KEY` 미설정 시 503 응답 (vault routes에서 체크)
- Frontend env: `VITE_API_BASE_URL`, `VITE_ODCLOUD_ENDPOINT_PATH` only
- `VoiceConsultant.tsx`는 Gemini Live API (WebSocket) 특성상 `@google/genai` SDK 직접 사용 — `callGemini()` HTTP 프록시 예외
- 거대 컴포넌트는 하위 디렉토리로 분해, barrel export(`index.tsx`)로 기존 import 경로 호환 유지

## Multi-Agent Collaboration System (tmux-based)

이 프로젝트는 tmux 분할 환경 기반 '2인 에이전트 팀' 체제로 운영된다.

### Agent Architecture
| Pane | ID | Model | Role |
|------|-----|-------|------|
| Left | Strategic Leader | Opus 4.6 | 로드맵 설계, 팀 지휘, 품질 검수 |
| Right | Implementation Specialist | Sonnet 4.6 | 코드 구현, 터미널 작업 수행 |

### Operational Workflow
1. **Plan**: Opus가 작업 범위 분석 → Sonnet에게 Task 할당
2. **Execute**: Sonnet이 코딩 작업 수행 (과정 투명 노출)
3. **Review**: Opus가 코드 검토 → 보완 지시
4. **Report**: Opus가 사용자에게 최종 보고

### Leader (Opus) Responsibilities
- Sonnet의 작업 계획을 사전 검토/승인
- 구현 코드의 보안, 성능, 디자인 일관성(shadcn/ui 준수) 피드백
- 작업 완료 후 최종 결과 요약 및 인사이트 보고

### Execution Agent (Sonnet) Responsibilities
- 리더 가이드에 따라 shadcn/ui 설치, 컴포넌트 마이그레이션, 버그 수정 실무 진행
- 작업 과정을 투명하게 노출하여 실시간 모니터링 가능하게 함

## UI Design System
- **Component Library**: shadcn/ui (Tailwind CSS v4 기반)
- **Icons**: Lucide-react (Material Icons 교체)
- **Theme**: CSS 변수 기반 (light/dark), primary=#0D5611
- **Utilities**: `cn()` from `lib/utils.ts` (clsx + tailwind-merge)
- shadcn/ui 컴포넌트는 `components/ui/` 디렉토리에 위치

---
**Last Updated**: 2026-02-22

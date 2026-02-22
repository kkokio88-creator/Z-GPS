# Z-GPS 프로젝트 개선 계획서 (Progress)

**작성일**: 2026-02-17
**근거**: 통합 코드 리뷰 리포트 (`docs/code-review-report-2026-02-17.md`)
**현재 종합 점수**: 52/100 (D) → **목표**: 90/100 (A)

---

## 현재 상태 요약

| 평가 영역 | 현재 | 목표 |
|-----------|:----:|:----:|
| 코드 품질 | 58/100 | 85/100 |
| 프론트엔드 아키텍처 | 2.2/5 | 4.0/5 |
| 보안 | F (Critical 8건) | A (Critical 0건) |
| 설계-구현 일치도 | 82% | 95%+ |

---

## Phase 1: 보안 패치 (Critical — 즉시)

> **목표**: Critical 보안 취약점 전수 해결, 프로덕션 배포 가능 상태 확보
> **예상 효과**: 52점 → 65점

### 1.1 API 인증 미들웨어 추가
- [x] `server/src/middleware/auth.ts` 신규 생성
- [x] `x-api-token` 기반 최소 인증 (환경변수 `API_ACCESS_TOKEN`)
- [x] `/api/health` 엔드포인트만 인증 제외
- [x] `server/src/index.ts`에 미들웨어 등록
- **대상 파일**: `server/src/index.ts`, `server/src/middleware/auth.ts` (신규)

### 1.2 Rate Limiting + 보안 헤더
- [x] `helmet`, `express-rate-limit` 패키지 설치
- [x] 전역 rate limit: 15분 / IP당 100회
- [x] Gemini 전용 rate limit: 1분 / IP당 20회
- [x] helmet 기본 설정 적용
- **대상 파일**: `server/src/index.ts`, `server/package.json`

### 1.3 SSRF 차단 — ODCloud 프록시
- [x] `endpointPath` 화이트리스트 검증 (허용 패턴: `/15049270/v1/uddi:`)
- [x] path traversal, 외부 도메인 주입 차단
- **대상 파일**: `server/src/routes/odcloud.ts:19-21`

### 1.4 Vault Config 엔드포인트 보호
- [x] `PUT /api/vault/config`에 인증 필수 적용
- [x] `Object.assign(config, updates)` → 허용 필드만 개별 할당 (프로토타입 오염 차단)
- [x] `__proto__`, `constructor`, `prototype` 키 차단
- **대상 파일**: `server/src/routes/vault.ts:2323-2354`

### 1.5 입력 검증 체계 도입
- [x] `zod` 패키지 설치
- [x] `gemini.ts` GenerateRequestBody 스키마 검증
- [x] `express.json({ limit: '50mb' })` → `limit: '5mb'`로 축소
- [x] 에러 응답에서 `details: String(error)` 제거 → 일반화된 메시지만 반환
- **대상 파일**: `server/src/routes/gemini.ts:23,74`, `server/src/index.ts:27`

### 1.6 환경 변수 정리
- [x] `.env.example`에서 미사용 `VITE_GEMINI_API_KEY`, `VITE_ODCLOUD_API_KEY`, `VITE_DART_API_KEY` 제거
- [x] `server/.env.example`에 `VAULT_PATH`, `ODCLOUD_ENDPOINT_PATH`, `API_ACCESS_TOKEN` 추가
- **대상 파일**: `.env.example`, `server/.env.example`

---

## Phase 2: 안정성 강화 (1주)

> **목표**: 런타임 에러 대응력 확보, 초기 로딩 성능 개선
> **예상 효과**: 65점 → 72점

### 2.1 ErrorBoundary 활성화
- [x] `index.tsx`에 최상위 `<ErrorBoundary>` 래핑
- [x] 주요 라우트별 개별 ErrorBoundary 배치 (Dashboard, Editor, BenefitTracker)
- [x] ApplicationEditor에 AI 연동 전용 ErrorBoundary 추가
- **대상 파일**: `index.tsx`, `App.tsx`, `components/ErrorBoundary.tsx`

### 2.2 Route-based Lazy Loading
- [x] 모든 페이지 컴포넌트를 `React.lazy()` + `Suspense`로 전환
- [x] `PageSkeleton` 로딩 폴백 컴포넌트 생성
- [x] Vite `manualChunks` 설정 (vendor-react, vendor-gemini 분리)
- **대상 파일**: `App.tsx`, `vite.config.ts`

### 2.3 VoiceConsultant CLAUDE.md 규칙 준수
- [x] `process.env.API_KEY` 참조 완전 제거
- [ ] Gemini Live API는 WebSocket 특성상 SDK 직접 사용이 불가피 → CLAUDE.md에 예외 명시 (보류)
- [ ] 또는 서버측 WebSocket relay 구현 검토 (보류)
- [x] `console.log/error`에 `import.meta.env.DEV` 가드 추가
- **대상 파일**: `components/VoiceConsultant.tsx:29,39,52,60`

### 2.4 storageService 방어적 파싱
- [x] `getStoredApplications()`, `getStoredCalendarEvents()`, `getStoredNotifications()` 등에 try-catch 적용
- [x] `getStoredCompany()`의 기존 try-catch 패턴을 전체 함수에 통일
- **대상 파일**: `services/storageService.ts:108-109,132,172`

### 2.5 API 응답 코드 일관성
- [x] `gemini.ts` GEMINI_API_KEY 미설정 시 500 → 503 변경 (Phase 1에서 완료)
- **대상 파일**: `server/src/routes/gemini.ts:18-19`

### 2.6 Sidebar 하드코딩 제거
- [x] `"산너머남촌"` → `getStoredCompany()?.name || '기업 미설정'`
- **대상 파일**: `components/Sidebar.tsx:117`

---

## Phase 3: 아키텍처 개선 (2주)

> **목표**: 코드 유지보수성 대폭 향상, 데이터 흐름 정규화
> **예상 효과**: 72점 → 82점

### 3.1 vault.ts 분할 (God Object 해소)
- [x] 도메인별 라우트 파일 분리 (7파일: index, programs, analysis, applications, company, benefits, config)
- [x] 원본 vault.ts 삭제, server/src/index.ts import 경로 업데이트
- [x] 컴파일 오류 0건 확인
- **결과**: 4,722줄 → 7파일 (programs 1,998 / benefits 981 / company 697 / analysis 690 / applications 130 / config 103)

### 3.2 공유 유틸리티 추출
- [x] `services/utils/formatters.ts` 생성: `formatKRW()`, `getDday()` 통합
- [x] `utils/jsonParser.ts` — 중복 없어 생략 (geminiService에만 존재)
- [x] Dashboard, BenefitTracker, ApplicationList, ProgramExplorer 로컬 정의 → import 전환
- **대상 파일**: 4개 컴포넌트 + 신규 formatters.ts

### 3.3 전역 상태 관리 도입 (Zustand) — Phase 4로 이관
- [ ] `zustand` 패키지 설치
- [ ] `services/stores/companyStore.ts` 생성
- [ ] 각 컴포넌트의 `getStoredCompany()` 직접 호출 → `useCompanyStore()` 훅으로 전환
- 사유: 3.2와 컴포넌트 파일 충돌 방지, Phase 4 상태 관리 개선과 통합

### 3.4 apiClient 리팩토링
- [x] `ApiError` 클래스 추가 (status, data 구조화)
- [x] `request()` 헬퍼 추출, 146줄 → 83줄 (43% 축소)
- **대상 파일**: `services/apiClient.ts`

### 3.5 허위 데이터 제거
- [x] `apiService.ts`의 `Math.random()` 7곳 완전 제거 (grep 0건 확인)
- [x] expectedGrant: 0, fitScore: 0 (금액 미확정 / 분석 전)
- **대상 파일**: `services/apiService.ts`

### 3.6 데드코드 정리
- [x] `geminiAgents.ts` 스텁 에이전트 14개 제거 (실사용 에이전트 유지)
- [x] `agentOrchestrator.ts` waitForTasks 30초 타임아웃 추가
- [ ] `applicationService.ts` — 참조 확인 후 제거 보류
- **대상 파일**: `services/geminiAgents.ts`, `services/agentOrchestrator.ts`

---

## Phase 4: 품질 향상 (1개월)

> **목표**: 컴포넌트 품질, 접근성, 문서 동기화 완료
> **예상 효과**: 82점 → 90점

### 4.1 거대 컴포넌트 분해
- [x] `BenefitTracker.tsx` (1,744줄) → `components/benefits/` 11파일 (최대 367줄)
- [x] `Settings.tsx` (1,637줄) → `components/settings/` 9파일 (최대 348줄)
- [x] `ProgramExplorer.tsx` (1,327줄) → `components/programs/` 8파일 (최대 393줄)
- [x] `CompanyProfile.tsx` (1,304줄) → `components/company/` 5파일 (최대 398줄)
- [x] `App.tsx`의 QAController (200줄) → `components/qa/QAController.tsx` (172줄)

### 4.2 접근성 (a11y) 개선
- [x] 전체 Material Icons `<span>`에 `aria-hidden="true"` 추가 (310+ 스팬)
- [ ] Sidebar 네비게이션: `<button onClick={navigate}>` → `<NavLink>` 전환 (보류 — HashRouter 전환 시 함께 진행)
- [x] 모달 11개에 `role="dialog"`, `aria-modal="true"`, `aria-labelledby` 적용
- [x] `SectionCard` textarea에 `aria-label` 추가
- [x] 아이콘 전용 버튼에 `aria-label` 추가

### 4.3 상태 관리 개선
- [x] Zustand `companyStore` 도입 → 14곳 `getStoredCompany()` 직접 호출 제거
- [x] Zustand `qaStore` 도입 → `zmis-qa-update` 커스텀 이벤트 제거
- [x] `Application.status` 한글 리터럴 → `ApplicationStatus` enum 도입

### 4.4 라우팅 정리
- [x] 에디터 라우트 중복 제거: `editor/:slug` 삭제 (참조 0건 확인)
- [x] 미등록 컴포넌트 라우트 등록: CompanyProfile(`/company`), ResearchHub(`/research`), AgentControl(`/agents`)
- [x] 주석 처리 라우트 정리 (사용하지 않는 주석 제거)
- [ ] HashRouter → BrowserRouter 전환 (보류 — vercel.json rewrites 필요, 별도 작업)

### 4.5 문서 동기화
- [x] `FUNCTIONAL_SPEC.md`: BenefitTracker/세금환급 기능 섹션 추가 (§12.5)
- [x] `FUNCTIONAL_SPEC.md`: SSE "미구현" → "구현됨" 수정
- [x] `FUNCTIONAL_SPEC.md`: Gemini 모델 기본값 업데이트 (사용자 설정 가능 명시)
- [x] `.env.example`: ODCLOUD 엔드포인트 기본값 코드와 통일
- [x] `CLAUDE.md`: VoiceConsultant Gemini Live SDK 예외 명시, 파일 구조 업데이트, Zustand 추가
- [x] `FUNCTIONAL_SPEC.md`: Phase 1~3 보안/안정성 개선 사항 반영 (한계점 요약 업데이트)

### 4.6 타입/상수 정리
- [x] `constants.ts`: deprecated `DRAFT_SECTIONS` 제거
- [x] `constants.ts`: 빈 배열 `MOCK_PROGRAMS` 제거
- [x] `as any` 9곳 → 적절한 타입 명시화 (`Partial<T>`, 타입 가드 등)
- [x] `types.ts`: `DraftAgentContext`, `IndustryTrend` — 이미 삭제 확인됨 (skip)

---

## 진행 추적

### Phase 1 진행률: 100% (완료)
- 시작일: 2026-02-17
- 완료일: 2026-02-17
- 담당: Leader(Opus 4.6) + Member-A/B/C(Sonnet)

### Phase 2 진행률: 100% (완료)
- 시작일: 2026-02-17
- 완료일: 2026-02-17
- 담당: Leader(Opus 4.6) + Member-A/B/C(Sonnet)
- 비고: 2.3 WebSocket relay 및 CLAUDE.md 예외 명시는 Phase 4로 이관

### Phase 3 진행률: 90% (3.3 Zustand → Phase 4 이관)
- 시작일: 2026-02-17
- 완료일: 2026-02-17
- 담당: Leader(Opus 4.6) + Member-A/B/C(Sonnet)
- 비고: 3.3 Zustand는 Phase 4 상태 관리 개선과 통합 진행 예정

### Phase 4 진행률: 95% (NavLink/BrowserRouter 전환 보류)
- 시작일: 2026-02-18
- 완료일: 2026-02-18
- 담당: Leader(Opus 4.6) + Member-A~F(Sonnet)
- 비고: Sidebar NavLink + HashRouter→BrowserRouter 전환은 vercel.json rewrites 설정과 함께 별도 작업

### Phase 5: shadcn/ui 마이그레이션 진행률: 100%
- 시작일: 2026-02-22
- 완료일: 2026-02-22
- 담당: Opus 4.6
- 내용:
  - shadcn/ui 컴포넌트 라이브러리 설치 및 설정 (Tailwind CSS v3 + Radix UI)
  - `components/ui/` 디렉토리에 22개 shadcn 컴포넌트 생성
  - `lib/utils.ts` (cn 유틸리티), `lib/icons.ts` (Material → Lucide 매핑)
  - `components/ui/Icon.tsx` 브릿지 컴포넌트 (점진적 마이그레이션용)
  - 전체 컴포넌트 Material Icons → Icon 브릿지/Lucide React 전환 완료
  - Sidebar, Header, LoginPage, Settings 탭들 shadcn/ui 컴포넌트 적용
  - root-level 컴포넌트 17개 import 경로 오류 수정 (`../ui/` → `./ui/`)
  - 빌드 검증 통과

---

## 변경 이력

| 날짜 | 내용 | 작성자 |
|------|------|--------|
| 2026-02-17 | 초기 계획서 작성 (코드 리뷰 기반) | Leader (Opus 4.6) |
| 2026-02-17 | Phase 1 보안 패치 완료 (6개 서브태스크) | Team (Opus Leader + Sonnet Members A/B/C) |
| 2026-02-17 | Phase 2 안정성 강화 완료 (6개 서브태스크) | Team (Opus Leader + Sonnet Members A/B/C) |
| 2026-02-17 | Phase 3 아키텍처 개선 완료 (5/6 서브태스크, 3.3 이관) | Team (Opus Leader + Sonnet Members A/B/C) |
| 2026-02-18 | Phase 4 품질 향상 완료 (6개 서브태스크, NavLink/BrowserRouter 보류) | Team (Opus Leader + Sonnet Members A~F) |
| 2026-02-22 | Phase 5 shadcn/ui 마이그레이션 완료 (22컴포넌트 + 아이콘 전환 + import 수정) | Opus 4.6 |

---

**참조 문서**:
- `docs/code-review-report-2026-02-17.md` — 통합 코드 리뷰 리포트
- `docs/security-spec.md` — 보안 취약점 상세 분석
- `CLAUDE.md` — 프로젝트 가이드
- `docs/FUNCTIONAL_SPEC.md` — 기능 명세서

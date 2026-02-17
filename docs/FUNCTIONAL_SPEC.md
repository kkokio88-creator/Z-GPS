# Z-GPS 기능 명세서

> **AI 기반 정부 지원금 신청 관리 시스템 (Z-GPS)**
> 분석 시점: 2026-02-08 | 작성: Claude Code

---

## 목차

1. [시스템 아키텍처 개요](#1-시스템-아키텍처-개요)
2. [인증 및 세션 관리](#2-인증-및-세션-관리)
3. [Obsidian Vault 파이프라인 (핵심)](#3-obsidian-vault-파이프라인)
4. [공고 데이터 수집](#4-공고-데이터-수집)
5. [AI 분석 엔진](#5-ai-분석-엔진)
6. [지원서 자동 생성](#6-지원서-자동-생성)
7. [대시보드](#7-대시보드)
8. [신청서 관리 (Kanban)](#8-신청서-관리-kanban)
9. [지원서 에디터](#9-지원서-에디터)
10. [설정 관리](#10-설정-관리)
11. [기업 프로필 및 리서치](#11-기업-프로필-및-리서치)
12. [AI 전문가 보드 (ExpertMatch)](#12-ai-전문가-보드)
13. [캘린더](#13-캘린더)
14. [사내 지식 자산](#14-사내-지식-자산)
15. [피치 트레이너](#15-피치-트레이너)
16. [글로벌 검색](#16-글로벌-검색)
17. [QA 자동 진단](#17-qa-자동-진단)
18. [Multi-Agent 시스템](#18-multi-agent-시스템)
19. [API 프록시 계층](#19-api-프록시-계층)
20. [공통 인프라](#20-공통-인프라)

---

## 1. 시스템 아키텍처 개요

```
[사용자 브라우저]
     │
     ▼
[React/Vite SPA]  ──vite proxy──▶  [Express.js API Server (port 5001)]
     │                                        │
     ├─ localStorage (세션, 기업, 캐시)        ├─ Gemini AI (@google/genai)
     ├─ apiClient.ts (GET/POST/PUT/DELETE)     ├─ ODCloud API (인천 bizok)
     └─ vaultService.ts (Vault API 클라이언트)  ├─ data.go.kr API (MSS, K-Startup)
                                               ├─ DART API (기업공시)
                                               └─ ./vault/ (Obsidian 볼트 파일시스템)
```

- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS + HashRouter
- **Backend**: Express.js (Node.js) + `@google/genai` SDK
- **데이터 저장**: Obsidian Vault (마크다운 + frontmatter) + localStorage
- **배포**: Frontend → Vercel, Backend → Railway

---

## 2. 인증 및 세션 관리

### 2.1 로그인 (`LoginPage.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 사업자등록번호 기반 로그인 |
| **입력** | 사업자등록번호 (10자리, 자동 하이픈 포맷팅 `XXX-XX-XXXXX`) |
| **출력** | 인증 세션 생성 → 대시보드 리다이렉트 |
| **처리 로직** | 1. 사업자번호 10자리 검증 → 2. 기존 localStorage 기업 데이터 존재 확인 → 3. DART API로 기업정보 조회 시도 → 4. `loginUser()` 세션 저장 → 5. `saveStoredCompany()` 기업정보 저장 → 6. `/` 로 이동 |
| **한계점** | - 실제 인증 없이 사업자번호만으로 로그인 (보안 취약) - 비밀번호/OTP 등 2차 인증 미구현 - 서버 측 세션 관리 없음 (클라이언트 localStorage만 사용) - DART API 실패 시 기본 mock 데이터 사용 |

### 2.2 세션 관리 (`storageService.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 클라이언트 세션 관리 |
| **입력** | `userId` (로그인 시) |
| **출력** | `zmis_auth_session` localStorage 키에 JSON 저장 |
| **처리 로직** | `loginUser()`: userId + loginTime + isLoggedIn 저장, `logoutUser()`: 세션 삭제 (API키는 유지), `isAuthenticated()`: 세션 존재 + isLoggedIn 확인 |
| **한계점** | - 세션 만료 시간 없음 (영구 로그인) - 브라우저 간 세션 공유 불가 - CSRF/XSS 방어 없음 |

### 2.3 인증 라우트 가드 (`App.tsx: ProtectedRoute`)

| 항목 | 내용 |
|------|------|
| **기능명** | 미인증 사용자 접근 차단 |
| **입력** | 라우트 접근 시 `isAuthenticated()` 호출 |
| **출력** | 인증 시 `<Outlet />` 렌더링, 미인증 시 `/login` 리다이렉트 |
| **처리 로직** | HashRouter 기반 라우트 구조에서 `<ProtectedRoute />`가 인증 상태 확인 후 Sidebar + Outlet 또는 Navigate 반환 |
| **한계점** | - 클라이언트 측 가드만 존재, 서버 API에는 인증 미들웨어 없음 - API 엔드포인트는 누구나 호출 가능 |

---

## 3. Obsidian Vault 파이프라인

### 3.1 볼트 파일 시스템 (`vaultFileService.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | Obsidian 호환 마크다운 파일 관리 |
| **입력** | 파일 경로, frontmatter (YAML), content (Markdown) |
| **출력** | `./vault/` 디렉토리 내 `.md` 파일 읽기/쓰기 |
| **처리 로직** | `gray-matter` 라이브러리로 frontmatter+content 파싱/생성, `fast-glob`으로 파일 목록 조회. 디렉토리 구조: `vault/{programs, analysis, applications, attachments, company, templates}` |
| **한계점** | - 동시 쓰기 시 race condition 가능 (파일 락 없음) - 대용량 볼트 성능 미검증 - VAULT_PATH 환경변수 미설정 시 `process.cwd()` 기준 (의도치 않은 경로 가능) |

### 3.2 볼트 통계 (`GET /api/vault/stats`)

| 항목 | 내용 |
|------|------|
| **기능명** | 볼트 전체 통계 조회 |
| **입력** | 없음 |
| **출력** | `{ vaultPath, connected, totalPrograms, analyzedPrograms, applications, attachments, folders[], latestSyncedAt, latestAnalyzedAt }` |
| **처리 로직** | programs/ 디렉토리 순회 → frontmatter의 fitScore로 분석 여부 판단 → applications/draft.md 카운트 → attachments/pdfs/ glob → 폴더별 통계 집계 |
| **한계점** | - 매 요청마다 전체 파일 순회 (캐싱 없음) - 수백 개 이상 파일 시 응답 지연 예상 |

---

## 4. 공고 데이터 수집

### 4.1 통합 프로그램 수집 (`programFetcher.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 3개 공공 API 통합 수집 |
| **입력** | 환경변수: `ODCLOUD_API_KEY`, `DATA_GO_KR_API_KEY` |
| **출력** | `ServerSupportProgram[]` (통합 정규화된 프로그램 목록) |
| **처리 로직** | 1. `Promise.allSettled()`로 3개 API 병렬 호출 → 2. 각 소스별 응답을 `ServerSupportProgram` 형태로 정규화 → 3. `programName` 기준 중복 제거 → 4. 오늘 이후 ~ 2027-12-31 내 마감 프로그램만 필터 → 5. 모든 API 실패 시 시뮬레이션 데이터 반환 |
| **한계점** | - `expectedGrant`가 랜덤 생성 (`Math.random()`) → 실제 지원금과 무관 - MSS XML 파싱이 정규식 기반 (DOMParser 미사용) → 복잡한 XML 구조 실패 가능 - K-Startup API 응답 구조가 `data.data` vs `data[]`로 불일치 가능 - 페이지네이션 미구현 (1페이지만 조회) |

### 4.2 인천 bizok API (`odcloud.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 인천광역시 지원사업 프록시 |
| **입력** | Query: `page`, `perPage`, `endpointPath` |
| **출력** | ODCloud API 원본 JSON 응답 |
| **처리 로직** | Express 라우터가 `api.odcloud.kr` 로 프록시, 서버 측 API키 주입 |
| **한계점** | - 에러 응답 구조 불명확 - 응답 캐싱 없음 |

### 4.3 중소벤처기업부 API (`dataGoKr.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | MSS 사업공고 + K-Startup 공고 프록시 |
| **입력** | MSS: `numOfRows`, `pageNo` / K-Startup: `page`, `perPage` |
| **출력** | MSS: XML 원본 / K-Startup: JSON 원본 |
| **처리 로직** | 2개 엔드포인트 (`/mss-biz`, `/kstartup`) 각각 data.go.kr로 프록시 |
| **한계점** | - MSS API가 XML 반환 → 프론트엔드에서 파싱 필요 - 두 API 공통키 사용 (`DATA_GO_KR_API_KEY`) |

### 4.4 딥크롤링 (`deepCrawler.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 공고 상세페이지 HTML → 구조화 데이터 추출 |
| **입력** | `detailUrl` (공고 상세페이지 URL), `programName`, `slug` |
| **출력** | `DeepCrawlResult` (부서, 지원규모, 대상, 자격요건, 필수서류, 신청기간, 평가기준, 연락처 등 12개 필드) + 첨부파일 목록 |
| **처리 로직** | 1. HTML fetch → script/style/nav/header/footer 태그 제거 → 텍스트 추출 (15,000자 제한) → 2. Gemini AI에 텍스트 전달하여 JSON 구조화 → 3. HTML에서 첨부파일 링크 추출 (pdf/hwp/docx 등) → 4. 첨부파일 다운로드 (최대 5개) → vault에 저장 |
| **한계점** | - JavaScript 렌더링 페이지 크롤 불가 (fetch 기반, Puppeteer 미사용) - 15,000자 텍스트 제한으로 긴 공고 내용 손실 가능 - 첨부파일 다운로드 시 인증 필요 사이트 실패 - Gemini AI 구조화 결과의 정확성 보장 없음 - rate limit으로 3초 딜레이 적용 (대량 크롤 시 매우 느림) |

### 4.5 프로그램 동기화 (`POST /api/vault/sync`)

| 항목 | 내용 |
|------|------|
| **기능명** | 3개 API 수집 → Obsidian 볼트 저장 |
| **입력** | Query: `deepCrawl=true` (선택적 딥크롤 모드) |
| **출력** | `{ totalFetched, created, updated, deepCrawled, attachmentsDownloaded }` |
| **처리 로직** | 1. `fetchAllProgramsServerSide()` 호출 → 2. 각 프로그램에 대해 slug 생성 → 3. 이미 존재하면 `syncedAt`만 갱신 → 4. 신규면 마크다운 노트 생성 (deepCrawl 옵션 시 상세 크롤 포함) → 5. frontmatter (YAML) + content (Markdown) 형태로 저장 |
| **한계점** | - 순차 처리 (딥크롤 시 프로그램당 3초 대기 → 100개 = 5분+) - 기존 노트의 내용 업데이트 없이 syncedAt만 갱신 - 삭제된/만료된 프로그램 정리 로직 없음 - 동기화 중 서버 재시작 시 중간 상태 복구 불가 |

---

## 5. AI 분석 엔진

### 5.1 적합도 분석 (`POST /api/vault/analyze/:slug`)

| 항목 | 내용 |
|------|------|
| **기능명** | 기업-프로그램 적합도 AI 분석 |
| **입력** | URL param: `slug` (프로그램 식별자) |
| **출력** | `FitAnalysisResult { fitScore: 0-100, eligibility, strengths[], weaknesses[], advice, recommendedStrategy }` |
| **처리 로직** | 1. vault에서 프로그램 노트 + 기업 프로필 읽기 → 2. 기업정보(이름, 업종, 매출, 직원수, 역량, 인증) + 프로그램정보(사업명, 주관, 유형, 지원금, 마감일)를 프롬프트 구성 → 3. Gemini AI에 JSON 형식 응답 요청 → 4. 분석 결과를 `analysis/{slug}-fit.md`로 저장 → 5. 프로그램 노트의 `fitScore`, `eligibility`, `analyzedAt` 업데이트 |
| **한계점** | - 기업 프로필이 비어있으면 "미등록 기업"으로 분석 (의미 없는 결과) - AI 응답 정확성 보장 없음 (hallucination 가능) - fitScore 기준이 AI 주관적 판단 - 분석 결과 버전 관리 없음 (덮어쓰기) |

### 5.2 일괄 분석 (`POST /api/vault/analyze-all`)

| 항목 | 내용 |
|------|------|
| **기능명** | 전체 프로그램 순차 적합도 분석 |
| **입력** | 없음 |
| **출력** | `{ analyzed, errors, results[] }` |
| **처리 로직** | 전체 프로그램 파일 순회 → 각각 `analyzeFit()` 호출 → 2초 간격 순차 실행 |
| **한계점** | - 100개 프로그램 = 200초+ (3분 이상) - HTTP 타임아웃 위험 (long-running request) - SSE 진행률 피드백 구현됨 (`server/src/utils/sse.ts`) - 중간 실패 시 이미 분석된 것은 저장되나 전체 성공 여부만 반환 |

### 5.3 PDF 분석 (`POST /api/vault/download-pdf/:slug`)

| 항목 | 내용 |
|------|------|
| **기능명** | 공고 PDF 다운로드 + AI 내용 분석 |
| **입력** | URL param: `slug` |
| **출력** | `PdfAnalysisResult { requirements[], qualifications[], budget, schedule, keyPoints[], summary }` |
| **처리 로직** | 1. 프로그램 노트에서 `detailUrl` 추출 → 2. URL fetch → Content-Type이 PDF면 바이너리 저장, 아니면 HTML을 base64 변환 → 3. base64 텍스트(30,000자 제한)를 Gemini에 전달 → 4. 분석 결과를 `attachments/pdf-analysis/{slug}.md`에 저장 |
| **한계점** | - base64 인코딩된 PDF를 텍스트로 전달 → Gemini가 실제 PDF 내용 파싱 불가능 (바이너리 데이터) - HTML 페이지를 PDF 대신 받는 경우 처리가 어정쩡 - 실제 PDF 파서 (pdf-parse 등) 미사용 |

### 5.4 Gemini 직접 호출 서비스 (`geminiService.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | Gemini API 호출 래퍼 (재시도 로직 포함) |
| **입력** | `prompt: string`, `config?: Record<string, unknown>` |
| **출력** | `{ text: string }` |
| **처리 로직** | `@google/genai` SDK로 `generateContent` 호출, 429 에러 시 exponential backoff (2s → 4s → 8s, 최대 3회), `cleanAndParseJSON()`으로 JSON 추출 (markdown code block, 중괄호 범위 등 다중 전략) |
| **한계점** | - 모델은 사용자 설정으로 변경 가능 (기본값: `gemini-2.5-flash-preview`, localStorage `zmis_user_ai_model` 키) - 토큰 사용량 추적 없음 - 동시 호출 제한 관리 없음 |

---

## 6. 지원서 자동 생성

### 6.1 지원서 생성 파이프라인 (`POST /api/vault/generate-app/:slug`)

| 항목 | 내용 |
|------|------|
| **기능명** | AI 기반 6섹션 지원서 자동 작성 + 리뷰 + 일관성 검사 |
| **입력** | URL param: `slug` |
| **출력** | `{ sections: {}, review: ReviewResult, consistency: ConsistencyResult }` |
| **처리 로직** | 1. 프로그램 노트 + 기업 프로필 + 적합도 분석 + PDF 분석 컨텍스트 수집 → 2. 6개 섹션 순차 생성 (2초 간격): 사업 개요, 기술 개발 내용, 시장 분석 및 사업화 계획, 추진 일정 및 추진 체계, 예산 계획, 기대 효과 → 3. 전체 초안에 대한 평가 리뷰 (기술성/사업성/독창성/수행역량/사회적가치 5축 점수) → 4. 섹션 간 일관성 검사 (예산 vs 규모, 일정 vs 난이도, 목표 vs 성과) → 5. 결과를 `applications/{slug}/draft.md`, `review.md`, `consistency.md`로 저장 |
| **한계점** | - 6섹션 × 2초 + 리뷰 2초 + 일관성 2초 = 최소 16초+ (HTTP 타임아웃 가능) - 컨텍스트 부족 시 AI가 일반적/추상적 내용 생성 - 섹션별 500-800자 제한으로 실제 지원서 분량 부족 - 사업별 특수 양식/항목에 대응 불가 (고정 6섹션) - 생성 중단/재시작 불가 |

### 6.2 지원서 편집 (`PUT /api/vault/application/:slug`)

| 항목 | 내용 |
|------|------|
| **기능명** | 생성된 지원서 수동 편집 저장 |
| **입력** | `{ sections: { "섹션명": "내용" } }` |
| **출력** | `{ success: boolean, updatedAt: string }` |
| **처리 로직** | 기존 draft.md 의 frontmatter 유지하면서 sections 내용을 마크다운으로 재생성 → `status: 'edited'`로 업데이트 |
| **한계점** | - 편집 히스토리/버전 관리 없음 - 동시 편집 충돌 방지 없음 |

---

## 7. 대시보드

### 7.1 메인 대시보드 (`Dashboard.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 공고 현황 + 관심 분야별 맞춤 뷰 |
| **입력** | Vault API (프로그램 목록, 지원서 목록), localStorage (기업 정보) |
| **출력** | 통계 카드, 관심 분야 탭(고령자 고용/청년 채용/제조 중소기업), 프로그램 리스트, D-day 표시 |
| **처리 로직** | 1. `vaultService.getPrograms()` + `vaultService.getApplications()` 호출 → 2. `FOCUS_AREAS` 키워드 매칭으로 프로그램 분류 (고령자/청년/제조) → 3. D-day 계산 (officialEndDate 기준) → 4. fitScore 기준 정렬 → 5. 지원금 포맷팅 (억원/천만원/만원) |
| **한계점** | - 키워드 매칭 기반 분류 (AI 분류 아님) → 정확도 낮음 - 관심 분야가 3개로 하드코딩 - Vault 서버 미연결 시 빈 화면 - 실시간 갱신 없음 (수동 새로고침 필요) |

---

## 8. 신청서 관리 (Kanban)

### 8.1 Kanban 보드 (`ApplicationList.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 지원서 상태별 칸반 보드 + 드래그앤드롭 |
| **입력** | localStorage의 Application[], API의 SupportProgram[] |
| **출력** | 8단계 칸반 보드 (작성 전 → 작성 중 → 제출 완료 → 서류 심사 → 발표 평가 → 최종 선정 / 탈락 / 포기) |
| **처리 로직** | `@dnd-kit/core` 라이브러리로 드래그앤드롭 구현 → 카드를 다른 컬럼으로 이동 시 `application.status` 업데이트 → `saveStoredApplication()` 저장 |
| **한계점** | - 데이터 소스가 이중: localStorage (구 방식) + Vault API (신 방식) 혼재 - 회의록/비용 관리 기능이 컴포넌트 내에 있지만 실제 영속화 미구현 (로컬 state만) - `any` 타입 일부 사용 - 프로그램 매핑 실패 시 "사업명 미확인" 표시 |

---

## 9. 지원서 에디터

### 9.1 ApplicationEditor (`ApplicationEditor.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | AI 에이전트 기반 지원서 작성/편집 |
| **입력** | URL params: `programId`, `companyId` 또는 `slug` |
| **출력** | 섹션별 텍스트 편집기, 레이더 차트 리뷰, AI 도구 패널 |
| **처리 로직** | 15+ AI 에이전트 연동: `draftAgent` (초안 생성), `reviewAgent` (평가), `refinementAgent` (개선), `consistencyAgent` (일관성), `voiceDictationAgent` (음성 입력), `presentationAgent` (발표자료), `budgetAgent` (예산), `interviewAgent` (면접), `competitorAgent` (경쟁사), `translationAgent` (번역), `speechAgent` (TTS), `summaryAgent` (요약), `fileParserAgent` (파일 파싱), `imageGenAgent` (이미지), `scheduleAgent` (일정), `dueDiligenceAgent` (실사) |
| **한계점** | - 617줄 + 60+ state 변수 → 리팩토링 필요 - `any` 타입 다수 사용 (`ganttData`, `sourcesMap` 등) - 모든 에이전트가 독립적으로 Gemini API 호출 → 비용/속도 이슈 - 스냅샷/댓글 기능이 localStorage 기반 (서버 영속화 미연결) - `slug` 기반 라우트 추가되었으나 구 `programId/companyId` 방식과 혼재 |

---

## 10. 설정 관리

### 10.1 설정 페이지 (`components/settings/`)

| 항목 | 내용 |
|------|------|
| **기능명** | 5탭 설정 관리 (공고 데이터, 우리 기업, API 연동, 공고 수집, 시스템) |
| **입력** | 사용자 입력 (기업정보, API키, 크롤링 설정) |
| **출력** | localStorage + Vault API 저장 |

#### 탭별 상세:

**공고 데이터 탭**:
- Vault 연결 상태 표시 (StatusDot)
- 경로 복사 + Obsidian 열기 안내
- 폴더 구조 시각화 (programs, analysis, applications, attachments, company)
- 통계 카드 (총 프로그램, 분석 완료, 지원서, 첨부파일)
- 동기화/분석 버튼

**우리 기업 탭**:
- 기업 기본정보 편집 (이름, 사업자번호, 업종, 주소, 매출, 직원수)
- 핵심역량/인증 태그 관리
- **기업 서류함**: base64 파일 업로드 → Vault 저장, 목록 조회/삭제

**API 연동 탭**:
- Gemini API Key 입력 + 연결 테스트
- DART API Key 입력
- AI 모델 선택

**공고 수집 탭**:
- 수집 모드 (기본/딥크롤)
- 소스 선택 (인천bizok, 중소벤처기업부, K-Startup)
- 자동 첨부파일 다운로드 옵션

**시스템 탭**:
- QA 자동 진단 실행
- 데이터 내보내기/가져오기 (JSON 백업)

| **한계점** | - API키가 localStorage에 평문 저장 (서버에서 관리하지만 UI에서도 저장) - 기업 서류 업로드가 base64 인코딩 → 대용량 파일 시 브라우저 메모리 이슈 - 크롤링 설정이 localStorage에만 저장 (서버와 동기화 안 됨) |

---

## 11. 기업 프로필 및 리서치

### 11.1 기업 프로필 (`components/company/`)

| 항목 | 내용 |
|------|------|
| **기능명** | AI 기반 기업 심층 리서치 + 프로필 관리 |
| **입력** | 검색어 (기업명), 기업 정보 |
| **출력** | `DeepResearchResult` (기본정보, 재무, 사업, 인증, IP, 시장, SWOT, 정부지원 적합성 등 15+ 섹션) |
| **처리 로직** | 1. 기업명 검색 → `companyResearchAgent` AI 검색 → 2. 검색 결과 선택 → 3. 심층 리서치 실행 (기본정보, 재무, 사업, 인증, IP, 시장분석, SWOT, 정부지원적합성) → 4. 결과를 Company 프로필에 반영 → localStorage 저장 |
| **한계점** | - AI 검색 결과의 정확성 보장 없음 (특히 비상장 중소기업) - mock 데이터가 하드코딩 (산너머남촌 기업) - 리서치 결과를 Vault에 저장하지 않음 (localStorage만) |

### 11.2 기업 정보 Vault 저장 (`PUT /api/vault/company`)

| 항목 | 내용 |
|------|------|
| **기능명** | 기업 정보를 Obsidian 노트로 저장 |
| **입력** | `Record<string, unknown>` (기업 데이터 전체) |
| **출력** | `vault/company/profile.md` |
| **처리 로직** | frontmatter에 전체 데이터, content에 기업명/기본정보/설명/역량/인증을 마크다운 형식으로 저장 |
| **한계점** | - 스키마 검증 없음 (어떤 데이터든 저장 가능) - 기업 프로필이 단일 파일 (복수 기업 미지원) |

### 11.3 기업 서류 관리 (`POST/GET/DELETE /api/vault/company/documents`)

| 항목 | 내용 |
|------|------|
| **기능명** | 기업 서류 업로드/조회/삭제 |
| **입력** | 업로드: `{ name, fileName, fileData(base64) }`, 삭제: `docId` |
| **출력** | `VaultDocumentMeta { id, name, fileName, fileType, uploadDate, status }` |
| **처리 로직** | 업로드: base64 → Buffer → `vault/company/documents/` 저장 + `_index.md` frontmatter에 메타 추가. 조회: `_index.md` 읽기 + 실제 파일 존재 확인. 삭제: 파일 삭제 + 인덱스에서 제거 |
| **한계점** | - base64 전송으로 파일 크기 ~33% 증가 - 파일 크기 제한 없음 (서버 메모리 이슈 가능, express.json limit: 50mb) - 파일 미리보기/내용 분석 미구현 - 중복 파일 체크 없음 |

---

## 12. AI 전문가 보드

### 12.1 ExpertMatch (`ExpertMatch.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | AI 페르소나 기반 지원서 평가 |
| **입력** | 저장된 Application[], Company 정보 |
| **출력** | ReviewResult (5축 점수 + 피드백) by 3개 AI 페르소나 |
| **처리 로직** | 3개 AI 평가위원 페르소나: 1) 박박사 (기술평가위원) - R&D 전문, 2) 이이사 (벤처캐피탈) - 사업성 전문, 3) 김팀장 (규정감사관) - 규정/예산 전문 → 선택한 지원서에 대해 해당 페르소나로 `reviewAgent.reviewApplication()` 호출 |
| **한계점** | - 페르소나 차이가 프롬프트 변경만으로 구현 (실제 전문성 차이 미비) - 지원서가 없으면 빈 화면 - 평가 결과 저장/비교 기능 미구현 |

---

## 12.5. 수혜관리 / 세금환급

### 12.5.1 BenefitTracker (`components/benefits/`)

| 항목 | 내용 |
|------|------|
| **기능명** | 정부 지원금 수혜 관리 + AI 세금환급 스캔 |
| **하위 컴포넌트** | `BenefitTracker.tsx` (컨테이너, 208줄), `BenefitSummary.tsx` (요약 대시보드), `BenefitList.tsx` (수혜 기록), `BenefitAnalysis.tsx` (분석 탭), `BenefitForm.tsx` (등록 모달), `TaxRefund.tsx` (세금환급 탭), `TaxOpportunityCard.tsx` (환급 기회 카드), `TaxDataBadges.tsx` (NPS/DART 데이터 배지) |
| **입력** | localStorage 수혜 기록, Gemini AI 세금 분석, NPS/DART 공공 데이터 |
| **출력** | 3탭 뷰: 수혜 요약/기록 + 수혜 분석 + AI 세금환급 스캔 |
| **처리 로직** | 1. 수혜 기록 CRUD (localStorage) → 2. 월별/유형별 통계 집계 → 3. AI 세금환급 스캔: 기업정보 + 수혜현황을 Gemini에 전달 → 환급 기회 목록 반환 → 4. NPS 4대보험 데이터 + DART 재무제표 배지 표시 |
| **한계점** | - 수혜 기록이 localStorage 기반 (Vault 미연동) - 세금 환급 기회는 AI 추정이므로 실제 세무사 확인 필요 - NPS/DART 데이터는 외부 API 의존 |

---

## 13. 캘린더

### 13.1 CalendarView (`CalendarView.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 월별 캘린더 + 마감일 표시 |
| **입력** | `calendarService.getCalendarEvents()` → `CalendarEvent[]` |
| **출력** | 월별 그리드 캘린더, 이벤트 마커 (INTERNAL: 파란색, OFFICIAL: 빨간색) |
| **처리 로직** | 현재 월의 일수/시작요일 계산 → 각 날짜에 해당하는 이벤트 매핑 → 월 이동 (이전/다음) |
| **한계점** | - localStorage 기반 이벤트만 표시 (Vault의 프로그램 마감일 미연동) - 이벤트 추가/편집/삭제 UI 없음 - 주간/일간 뷰 없음 - Google Calendar 연동은 URL 생성만 (양방향 동기화 아님) |

---

## 14. 사내 지식 자산

### 14.1 Community / InternalKnowledge (`Community.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 기업 키워드 및 텍스트 스니펫 관리 |
| **입력** | Company.preferredKeywords[], 사용자 입력 스니펫 |
| **출력** | 키워드 태그 목록, 스니펫 카드 목록 |
| **처리 로직** | 키워드 삭제 → Company 업데이트 → `saveStoredCompany()`. 스니펫 추가 → 로컬 state에만 저장 |
| **한계점** | - 스니펫이 컴포넌트 state에만 저장 (새로고침 시 소실, mock 2개만) - 키워드 추가 UI 없음 (삭제만 가능) - 검색/필터 없음 |

---

## 15. 피치 트레이너

### 15.1 PitchTrainer (`PitchTrainer.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 음성 인식 기반 발표 연습 + AI 피드백 |
| **입력** | 음성 입력 (Web Speech API) 또는 텍스트 입력 |
| **출력** | `{ score: number, feedback: string, tone: string }` |
| **처리 로직** | 1. 브라우저 SpeechRecognition API로 음성 → 텍스트 변환 (한국어) → 2. `pitchCoachAgent`에 전달 → 3. 점수 + 피드백 + 톤 분석 결과 표시 |
| **한계점** | - 브라우저 호환성 (Chrome 위주, Firefox/Safari 미지원 가능) - 음성 인식 정확도 의존 (소음 환경 취약) - 발표 시간 측정/관리 없음 - 이전 연습 기록 저장 없음 |

---

## 16. 글로벌 검색

### 16.1 GlobalSearch (`GlobalSearch.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | `Ctrl+K` 커맨드 팔레트 스타일 전역 검색 |
| **입력** | 키보드 `Ctrl+K` 또는 `Cmd+K`, 검색 쿼리 |
| **출력** | 메뉴 항목 + 지원서 목록 (필터링) |
| **처리 로직** | 1. 키보드 이벤트 감지 → 오버레이 토글 → 2. 메뉴 항목 (대시보드, 설정 등) + Application 목록을 합쳐서 → 3. `query.toLowerCase()` 포함 여부로 필터링 → 4. 선택 시 `navigate(path)` |
| **한계점** | - 검색 대상이 메뉴 + 지원서만 (프로그램/문서 미포함) - 퍼지 검색 미지원 (exact match만) - Vault 데이터 검색 미연동 - 키보드 네비게이션 일부만 구현 |

---

## 17. QA 자동 진단

### 17.1 QAController (`components/qa/QAController.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 자동 UI 테스트 + 진단 리포트 |
| **입력** | QA 시작 트리거 (Settings에서 실행) |
| **출력** | 테스트 결과 오버레이 + 최종 리포트 모달 (PASS/FAIL + 수정 프롬프트) |
| **처리 로직** | 1. `qaService.startQA()` → 체크리스트 생성 → 2. 각 테스트마다: 해당 페이지로 navigate → 800ms 대기 → `executeTestLogic()` 실행 → 결과 업데이트 → 3. 전체 완료 시 리포트 모달 표시 → 4. FAIL 항목에 대해 `generateFixPrompt()` 자동 수정 프롬프트 생성 |
| **한계점** | - setTimeout 기반 대기 (DOM 렌더링 보장 안 됨) - 실제 E2E 테스트 프레임워크 아님 - 네트워크 의존 테스트 불안정 - 수정 프롬프트가 실제 코드 수정 아님 (복사/붙여넣기 용) |

---

## 18. Multi-Agent 시스템

### 18.1 Agent Orchestrator (`agentOrchestrator.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 6개 AI 에이전트 협업 조율 |
| **입력** | `AgentTask` (분석/작성/리뷰/리서치/전략/최적화) |
| **출력** | `OrchestratorState` (활성 에이전트, 태스크 큐, 메시지 로그, 공유 메모리, 메트릭스) |
| **처리 로직** | 6개 역할: ANALYZER (데이터 분석), WRITER (문서 작성), REVIEWER (검토), RESEARCHER (정보수집), STRATEGIST (전략), OPTIMIZER (최적화) → 태스크 큐 관리 + 의존성 추적 + 이벤트 리스너 패턴 |
| **한계점** | - 상당 부분이 프레임워크만 구현 (실제 워크플로우 실행 로직 미완성) - `applicationService.ts`가 stub 상태 (`startGeneration` 빈 메서드) - 공유 메모리가 인메모리 (서버 재시작 시 소실) - 에이전트 간 실제 협업 로직보다는 독립적 Gemini 호출 |

### 18.2 Gemini Agents (`geminiAgents.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 15+ 특화 AI 에이전트 |
| **입력** | 각 에이전트별 도메인 데이터 |
| **출력** | 에이전트별 AI 분석/생성 결과 |
| **주요 에이전트** | `analysisAgent` (기업분석), `draftAgent` (초안생성), `reviewAgent` (평가), `refinementAgent` (개선), `consistencyAgent` (일관성), `voiceDictationAgent` (음성), `presentationAgent` (발표), `budgetAgent` (예산), `interviewAgent` (면접), `competitorAgent` (경쟁), `translationAgent` (번역), `speechAgent` (TTS), `summaryAgent` (요약), `pitchCoachAgent` (피치), `companyResearchAgent` (기업조사), `SystemDiagnosisAgent` (시스템진단) |
| **처리 로직** | `BaseAgent` 클래스 상속 → `callGemini()` 메서드로 `/api/gemini/generate` 호출 → 프론트엔드에서 서버 프록시 경유 Gemini API 사용 |
| **한계점** | - 모든 에이전트가 동일한 callGemini 메커니즘 (에이전트 간 차이는 프롬프트만) - `any` 타입 일부 사용 - 에이전트 응답 캐싱 없음 - 토큰 비용 관리 없음 |

---

## 19. API 프록시 계층

### 19.1 Gemini 프록시 (`gemini.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | Gemini API 서버측 프록시 |
| **입력** | `POST /api/gemini/generate`: `{ model, contents, config }`, `POST /api/gemini/verify`: `{ apiKey }` |
| **출력** | `{ text, candidates }` 또는 에러 |
| **처리 로직** | `@google/genai` SDK로 generateContent 호출. Audio modality 처리. 429/403 에러 분류 반환 |
| **한계점** | - 요청별 새 GoogleGenAI 인스턴스 생성 (비효율) - 스트리밍 응답 미지원 - 요청 크기 제한 없음 |

### 19.2 DART 프록시 (`dart.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | DART 전자공시 기업정보 프록시 |
| **입력** | `GET /api/dart/company?corp_code=XXX` |
| **출력** | DART API 원본 JSON |
| **처리 로직** | 서버 측 `DART_API_KEY` 주입 후 opendart.fss.or.kr로 프록시 |
| **한계점** | - corp_code를 알아야 사용 가능 (사업자번호→corp_code 변환 없음) - 기업 기본 정보만 조회 (재무제표 등 미구현) |

### 19.3 Health Check (`health.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 서버 상태 확인 |
| **입력** | `GET /api/health` |
| **출력** | `{ status: 'ok', timestamp, version }` |

---

## 20. 공통 인프라

### 20.1 API 클라이언트 (`apiClient.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 중앙 HTTP 클라이언트 |
| **입력** | path, body, options |
| **출력** | `ApiResponse<T> { data, ok, status }` |
| **처리 로직** | `VITE_API_BASE_URL` 기반 URL 구성 → fetch API 래핑 → GET/POST/PUT/DELETE 지원 → Content-Type 자동 감지 (JSON/XML) → 에러 시 throw |
| **한계점** | - 인터셉터/미들웨어 패턴 없음 - 요청 취소 (AbortController) 미구현 - 재시도 로직 없음 (서버 측 geminiService에만 있음) - 인증 토큰 자동 첨부 없음 |

### 20.2 localStorage 저장소 (`storageService.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 클라이언트 측 데이터 영속화 |
| **관리 데이터** | 기업정보 (`zmis_company_v2`), 지원서 (`zmis_applications`), 캘린더 (`zmis_calendar_events`), 알림 (`zmis_notifications`), API키 (`zmis_user_api_key`), AI모델 (`zmis_user_ai_model`), DART키 (`zmis_user_dart_key`), 세션 (`zmis_auth_session`), 프로그램 캐시 (`zmis_program_cache`), 온보딩 (`zmis_onboarding_complete`), 프로그램 카테고리 (`zmis_program_categories`), 딥리서치 (`zmis_deep_research`), 크롤링설정 (`zmis_crawling_config`) |
| **한계점** | - localStorage 용량 제한 (브라우저별 5-10MB) - 민감 정보(API키) 평문 저장 - 데이터 무결성 검증 없음 - 멀티 디바이스 동기화 불가 - Vault 데이터와 이중 관리 발생 (구/신 방식 혼재) |

### 20.3 Vault 서비스 클라이언트 (`vaultService.ts`)

| 항목 | 내용 |
|------|------|
| **기능명** | 프론트엔드 → Vault API 통신 클라이언트 |
| **제공 메서드** | `getVaultStats()`, `syncPrograms()`, `deepCrawlProgram()`, `getPrograms()`, `getProgram()`, `analyzeProgram()`, `analyzeAll()`, `downloadPdf()`, `generateApp()`, `getApplications()`, `getApplication()`, `updateApplication()`, `saveCompany()`, `getCompany()`, `uploadCompanyDocument()`, `getCompanyDocuments()`, `deleteCompanyDocument()` - 총 17개 메서드 |
| **한계점** | - 에러 핸들링이 apiClient에 위임 (상위에서 try-catch 필요) - 타입 변환/검증 없이 서버 응답 그대로 반환 - 요청 중복 방지 없음 |

### 20.4 에러 바운더리 (`ErrorBoundary.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | React 컴포넌트 에러 캐치 |
| **처리 로직** | 클래스 컴포넌트로 `componentDidCatch` 구현 → 에러 발생 시 폴백 UI 표시 |
| **한계점** | - 에러 리포팅 서비스 연동 없음 (콘솔 로그만) - 복구 메커니즘 미비 |

### 20.5 Toast 알림 (`Toast.tsx`)

| 항목 | 내용 |
|------|------|
| **기능명** | 전역 토스트 알림 시스템 |
| **처리 로직** | `ToastProvider` Context + `useToast()` Hook + `zmis-toast` 커스텀 이벤트로 어디서든 토스트 트리거 가능 |
| **한계점** | - 토스트 스택 관리 미구현 (동시 다수 표시 시 겹침 가능) |

---

## 전체 시스템 한계점 요약

### 아키텍처
1. **데이터 이중 관리**: localStorage (구 방식) + Vault API (신 방식) 혼재 → 데이터 불일치 가능
2. ~~**인증 부재**~~: `x-api-token` 기반 인증 미들웨어 추가됨 (`server/src/middleware/auth.ts`), rate limiting + helmet 적용
3. **멀티테넌시 미지원**: 단일 기업만 지원 (복수 기업 프로필 불가)

### 성능
4. **동기 처리**: 대량 분석/생성이 순차 실행 → 장시간 HTTP 요청
5. **캐싱 부재**: Vault 통계, 프로그램 목록 등 매번 파일시스템 순회
6. **SSE 부분 구현**: `server/src/utils/sse.ts`로 진행률 피드백 가능하나 전 API 적용은 미완

### 데이터 품질
7. ~~**랜덤 지원금**~~: `Math.random()` 제거됨, `expectedGrant: 0` (금액 미확정 시)
8. **AI 정확성**: 적합도 점수, 지원서 내용의 정확성 보장 없음
9. **PDF 분석**: base64 텍스트 전달 방식 → 실제 PDF 파싱 불가

### 보안
10. **API키 노출**: localStorage에 평문 저장
11. ~~**입력 검증 부족**~~: `zod` 스키마 검증 추가됨 (gemini.ts), SSRF 차단 (odcloud.ts), 프로토타입 오염 방지 (vault config)
12. ~~**CORS/Rate Limiting**~~: `helmet` + `express-rate-limit` 적용됨 (전역 100회/15분, Gemini 20회/1분)

### UX
13. **오프라인 미지원**: 서버 미연결 시 대부분 기능 불가
14. **에러 복구**: 장시간 작업 중 실패 시 복구/재시작 메커니즘 없음
15. ~~**컴포넌트 복잡도**~~: BenefitTracker, Settings, ProgramExplorer, CompanyProfile 400줄 이하로 분해 완료

---

> **작성 시점**: 2026-02-08 (Phase 4 동기화: 2026-02-18)
> **분석 범위**: 프론트엔드 (23개 컴포넌트 → 하위 분해 포함 50+개, 14개 서비스), 백엔드 (7개 vault 라우트 + 4개 프록시 라우트, 8개 서비스)

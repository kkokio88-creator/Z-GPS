# Plan: Phase 5 - Obsidian-First Workflow & Core Bug Fixes

**Feature**: phase5-obsidian-workflow
**Created**: 2026-02-18
**Level**: Dynamic
**Status**: Draft
**Reference**: `docs/progress.md` Phase 5, Phase 4 analysis results

---

## 1. 목표

현재 웹 중심의 데이터 흐름을 **Obsidian Vault 중심 워크플로우**로 전환하고, AI 기업 리서치/추천 공고 매칭/문서 포맷 지원의 핵심 버그를 수정한다.

### 핵심 성과 지표
| 지표 | 현재 | 목표 |
|------|:----:|:----:|
| AI 기업 리서치 정상 동작 | 실패 (mock 오버라이드 + 저장 무응답) | 100% 정상 |
| 추천 공고 매칭 | 불일치 (Dashboard >= 60 vs Explorer >= 80) | 통일된 threshold |
| 문서 내보내기 (PDF/HWP/Word) | 버튼만 존재 (onClick 없음) | 읽기/쓰기 완전 동작 |
| Obsidian Vault 동기화 | 백엔드 only (프론트 연동 없음) | 양방향 sync 완성 |
| 세금 환급 기능 | 미검증 | Playwright E2E 검증 완료 |

---

## 2. 범위 (Scope)

### In Scope
- 5.1 AI 기업 리서치 버그 수정
- 5.2 추천 공고 매칭 threshold 통일
- 5.3 Obsidian-First 워크플로우 구축
- 5.4 문서 포맷 지원 (PDF/HWP/Word 읽기+쓰기)
- 5.5 세금 환급 기능 검증 + Playwright E2E

### Out of Scope
- 새로운 AI 에이전트 추가
- 모바일 반응형 UI (별도 Phase)
- 인증/권한 시스템 변경
- CI/CD 파이프라인 구축

---

## 3. 서브태스크 상세

### 5.1 AI 기업 리서치 버그 수정

**현황 분석**:
| 문제 | 파일 | 위치 | 설명 |
|------|------|------|------|
| Mock 데이터 오버라이드 | CompanyProfile.tsx | L83-94 | "산너머남촌" 하드코딩 → 실제 리서치 차단 |
| Vault 저장 실패 무시 | CompanyProfile.tsx | L196 | `.catch(() => {})` → 사용자 피드백 없음 |
| 3-Tier 데이터 불일치 | 전체 | - | localStorage / Zustand / Vault 동기화 없음 |
| Storage 이벤트 레이스 | CompanyProfile.tsx | L101-104 | 저장 직후 storage listener가 이전 데이터 덮어쓰기 |

**수정 내역**:
1. Mock 데이터 제거 — "산너머남촌" 하드코딩 조건문 삭제, 실제 API 호출만 수행
2. Vault 저장 에러 핸들링 — `.catch(() => {})` → Toast 알림 + retry 로직
3. 데이터 동기화 단방향 확립: **Zustand → localStorage → Vault** (단일 진실 소스: Zustand)
4. Storage 이벤트 리스너 debounce 추가 (저장 직후 200ms 무시)
5. `saveStoredDeepResearch()` 호출 후 성공 확인 Toast 표시

**영향 파일**: `CompanyProfile.tsx`, `components/company/CompanyResearch.tsx`, `services/storageService.ts`

### 5.2 추천 공고 매칭 Threshold 통일

**현황 분석**:
| 컴포넌트 | 파일 | 위치 | Threshold | 용도 |
|----------|------|------|-----------|------|
| Dashboard (Hero Stats) | Dashboard.tsx | L152 | `>= 60` | 추천 공고 수 표시 |
| ProgramExplorer (추천 탭) | ProgramExplorer.tsx | L122, 241 | `>= 80` | 실제 추천 필터 |
| ProgramDetail (전략 생성) | ProgramDetail.tsx | L217 | `>= 60` | 전략 자동 생성 조건 |

**수정 내역**:
1. 전체 threshold를 **70**으로 통일 (constants.ts에 상수 추가)
   ```typescript
   export const FIT_SCORE_THRESHOLD = 70;
   ```
2. Dashboard.tsx L152: `>= 60` → `>= FIT_SCORE_THRESHOLD`
3. ProgramExplorer.tsx L122, L241: `>= 80` → `>= FIT_SCORE_THRESHOLD`
4. ProgramDetail.tsx L217: `>= 60` → `>= FIT_SCORE_THRESHOLD`
5. 추천 탭에서 threshold 미달 프로그램도 "관심" 등급으로 표시 (UX 개선)

**영향 파일**: `constants.ts`, `Dashboard.tsx`, `ProgramExplorer.tsx`, `ProgramDetail.tsx`

### 5.3 Obsidian-First 워크플로우 구축

**아키텍처 전환**:
```
[현재] 웹 UI → localStorage → (선택적) Vault 저장
[목표] 크롤링 → Vault(Obsidian MD) → 웹 요약 뷰 → 피드백 → Vault 수정
```

**핵심 구조**:
```
vault_root/
├── company/
│   ├── {회사명}.md              ← 기업정보 (frontmatter + 본문)
│   └── documents/
├── programs/
│   └── {공고명}.md              ← 공고 정보 (크롤링 결과)
├── applications/
│   └── {공고명}-{회사명}/
│       ├── _index.md            ← 진행 상태 MOC
│       ├── section-1.md         ← 각 섹션별 작성 내용
│       ├── section-2.md
│       └── attachments/
├── analysis/
│   └── {회사명}-적합도.md       ← AI 분석 결과
├── strategies/
│   └── {공고명}-전략.md
└── _대시보드.md                 ← Obsidian Dataview MOC
```

**백엔드 API 추가** (server/src/routes/vault/):
| Endpoint | Method | 기능 |
|----------|--------|------|
| `/api/vault/company/:name` | GET | 기업 MD 읽기 (요약 반환) |
| `/api/vault/company/:name` | PUT | 기업 MD 수정 (피드백 반영) |
| `/api/vault/programs` | GET | 전체 공고 목록 (frontmatter) |
| `/api/vault/programs/:slug` | GET | 공고 상세 MD |
| `/api/vault/applications/:id` | GET | 신청서 섹션 목록 |
| `/api/vault/applications/:id/sections/:num` | PUT | 섹션 수정 |
| `/api/vault/sync` | POST | 전체 동기화 트리거 |

**프론트엔드 변경**:
1. `services/vaultService.ts` — HTTP 클라이언트 확장 (read/write/sync 메서드)
2. `components/company/CompanyResearch.tsx` — Vault에서 리서치 데이터 로드, 웹은 요약 뷰
3. `components/editor/` — 섹션 편집 시 Vault MD 직접 수정, 웹은 미리보기
4. Dashboard — Vault 기반 통계 (Dataview 쿼리 미러링)

**피드백 루프**:
```
사용자가 웹에서 피드백 입력
  → PUT /api/vault/applications/:id/sections/:num (수정 반영)
  → Vault MD 파일 업데이트
  → 웹 UI 자동 갱신 (SSE 또는 polling)
```

**영향 파일**: `server/src/routes/vault/`, `services/vaultService.ts`, `components/editor/`, `components/company/`, `components/Dashboard.tsx`

### 5.4 문서 포맷 지원 (PDF/HWP/Word)

**현황**: `ExportModal.tsx` L241-247에 PDF/HWP 버튼이 있으나 `onClick` 핸들러 없음 (완전 스텁)

**구현 계획**:

| 포맷 | 라이브러리 | 방식 | 제한사항 |
|------|-----------|------|---------|
| **PDF** 읽기 | `pdfjs-dist` (프론트) | 브라우저에서 직접 파싱 | 이미 attachment 미리보기에 일부 사용 |
| **PDF** 쓰기 | 브라우저 `window.print()` | 클라이언트 사이드 인쇄 | Tailwind CSS 복사로 스타일 유지 |
| ~~**HWP** 읽기~~ | ~~`hwp.js` (서버)~~ | ~~Descoped (D-2)~~ | ~~Phase 6+ 재검토~~ |
| **HWP** 쓰기 | 미지원 (에러 메시지 표시) | 클라이언트에서 안내 | hwp.js 쓰기 미지원 확인됨 |
| ~~**DOCX** 읽기~~ | ~~`mammoth` (서버)~~ | ~~Descoped (D-3)~~ | ~~Phase 6+ 필요 시 추가~~ |
| **DOCX** 쓰기 | `docx` npm 패키지 (클라이언트) | `file-saver`로 다운로드 | 완전 지원 |

**백엔드 API 추가** (server/src/routes/documents.ts):
| Endpoint | Method | 기능 |
|----------|--------|------|
| `/api/documents/parse` | POST (multipart) | 파일 업로드 → 텍스트+구조 추출 |
| `/api/documents/export/pdf` | POST | 신청서 데이터 → PDF 생성+다운로드 |
| `/api/documents/export/docx` | POST | 신청서 데이터 → DOCX 생성+다운로드 |
| `/api/documents/export/hwp` | POST | 신청서 데이터 → HWP 생성+다운로드 |
| `/api/documents/templates` | GET | 등록된 공고 양식 템플릿 목록 |

**프론트엔드 변경**:
1. `ExportModal.tsx` — PDF/HWP/DOCX 버튼에 실제 onClick 핸들러 연결
2. `components/editor/LeftPanel.tsx` — 파일 드래그앤드롭 업로드 영역 추가
3. 파일 업로드 시 서버 파싱 → 구조화된 데이터로 섹션 자동 채움

**영향 파일**: `server/src/routes/documents.ts` (신규), `components/editor/ExportModal.tsx`, `components/editor/LeftPanel.tsx`, `server/package.json`

### 5.5 세금 환급 기능 검증 + Playwright E2E

**현황**: BenefitTracker의 19개 혜택 스캔 + 7개 데이터 소스 — 구현 완료이나 실제 검증 미수행

**Playwright 테스트 범위**:
| 테스트 | 대상 | 검증 사항 |
|--------|------|----------|
| 기업 리서치 E2E | CompanyProfile | 리서치 실행 → 결과 표시 → Vault 저장 확인 |
| 추천 공고 매칭 | Dashboard + ProgramExplorer | threshold 통일 후 일치 확인 |
| 세금 환급 스캔 | BenefitTracker | 스캔 실행 → 19개 혜택 항목 표시 |
| 문서 내보내기 | ExportModal | PDF/DOCX 다운로드 실행 |
| Vault 동기화 | Dashboard | Vault 데이터 → 웹 요약 반영 확인 |

**구현**:
1. `playwright.config.ts` 설정 (dev 서버 자동 시작)
2. `tests/e2e/` 디렉토리 구조:
   ```
   tests/e2e/
   ├── research.spec.ts
   ├── matching.spec.ts
   ├── benefits.spec.ts
   ├── export.spec.ts
   └── vault-sync.spec.ts
   ```
3. CI 연동은 Out of Scope (로컬 실행만)

**영향 파일**: `playwright.config.ts` (신규), `tests/e2e/` (신규), `package.json`

---

## 4. 구현 순서 (의존성 기반)

```
5.1 AI 리서치 버그 수정 ──────────┐
5.2 추천 공고 매칭 수정 ──────────┤
                                  ↓
5.3 Obsidian-First 워크플로우 ────┤ (5.1/5.2 수정 후 vault 연동)
                                  ↓
5.4 문서 포맷 지원 ──────────────┤ (vault 구조 확정 후)
                                  ↓
5.5 Playwright E2E ──────────── 완료 (전체 기능 검증)
```

**실행 순서 (Wave)**:

| Wave | 태스크 | 병렬 가능 | 예상 복잡도 |
|------|--------|:--------:|:----------:|
| **Wave 1** | 5.1 리서치 버그 + 5.2 매칭 수정 | 병렬 | 중 |
| **Wave 2** | 5.3 Obsidian-First 워크플로우 | 단독 | 높음 |
| **Wave 3** | 5.4 문서 포맷 지원 | 단독 | 높음 |
| **Wave 4** | 5.5 Playwright E2E | 단독 | 중 |

---

## 5. 팀 할당 계획 (Leader/Member 구조)

| 역할 | 담당 | 배정 |
|------|------|------|
| **Leader** (Opus) | 전체 프로세스 관리, 요구사항 정의, 검수 | 전 Wave |
| **Member-A** (Sonnet) | 5.1 AI 리서치 버그 수정 | Wave 1 |
| **Member-B** (Sonnet) | 5.2 추천 공고 매칭 수정 | Wave 1 |
| **Member-C** (Sonnet) | 5.3 Vault API 백엔드 구현 | Wave 2 |
| **Member-D** (Sonnet) | 5.3 프론트엔드 Vault 연동 + 피드백 루프 | Wave 2 |
| **Member-E** (Sonnet) | 5.4 문서 파싱/생성 서버 로직 | Wave 3 |
| **Member-F** (Sonnet) | 5.4 ExportModal UI + 5.5 Playwright | Wave 3-4 |

---

## 6. Descoped Items (Iteration #1에서 범위 조정)

> **조정 사유**: Gap Analysis (72%) 후 실현 가능성과 ROI를 평가하여, 현재 Phase에서 제외하고 향후 Phase로 이관합니다.

| # | 원래 계획 | Descope 사유 | 대안 / 이관 |
|---|-----------|-------------|-------------|
| D-1 | 서버 문서 라우트 (`/api/documents/*`) | 클라이언트 사이드 PDF/DOCX 생성이 충분. 서버 라우트는 과도한 복잡성 추가 | 현재 `documentExport.ts` 클라이언트 방식 유지 |
| D-2 | HWP 읽기 (`hwp.js` 서버) | hwp.js 라이브러리 성숙도 부족 (Plan 리스크 항목에서 예측됨) | Phase 6+ 에서 재검토 |
| D-3 | DOCX 읽기 (`mammoth` 서버) | DOCX 쓰기는 완료됨. 읽기는 현재 워크플로우에서 미사용 | Phase 6+ 에서 필요 시 추가 |
| D-4 | 서버사이드 PDF 생성 (`puppeteer`) | 브라우저 `window.print()` + Tailwind CSS 복사 방식이 실용적 | 품질 요구사항 증가 시 재검토 |
| D-5 | LeftPanel 파일 드래그앤드롭 업로드 | 서버 문서 파싱 라우트가 없으면 업로드해도 처리 불가 | D-1과 함께 Phase 6+ 이관 |
| D-6 | SSE/폴링 기반 피드백 자동 갱신 | SSE 인프라 복잡도 대비 현재 사용 빈도 낮음 | 피드백 후 수동 refetch로 대체 |

---

## 7. 리스크 및 완화 전략

| 리스크 | 영향도 | 완화 전략 |
|--------|:------:|----------|
| HWP 쓰기 라이브러리 미성숙 | 높음 | hwp.js 쓰기 불가 시 DOCX → HWP 변환 서비스 대안, 또는 HWP 읽기만 지원 |
| Vault 파일 동시 수정 충돌 | 중간 | 낙관적 잠금 (파일 수정 시간 비교) + 마지막 쓰기 승리 정책 |
| Playwright 테스트 불안정 | 중간 | retry 설정 + waitFor 안정화, 핵심 플로우만 커버 |
| PDF 생성 품질 (공고 양식 매칭) | 중간 | puppeteer 서버사이드 렌더링으로 정확도 확보 |
| 기존 localStorage 데이터 마이그레이션 | 낮음 | 초기 로드 시 localStorage → Vault 자동 마이그레이션 함수 |

---

## 7. 성공 기준

- [ ] AI 기업 리서치: 검색 → 결과 표시 → Vault 저장 → 새로고침 후 데이터 유지
- [ ] 추천 공고: Dashboard 추천 수 == ProgramExplorer 추천 탭 수
- [ ] Obsidian Vault: 크롤링 데이터 → MD 파일 자동 생성, 웹에서 요약 표시
- [ ] 피드백 루프: 웹 피드백 입력 → Vault MD 수정 → 웹 자동 갱신
- [ ] PDF 내보내기: 신청서 → PDF 다운로드 정상 동작
- [ ] DOCX 내보내기: 신청서 → DOCX 다운로드 정상 동작
- [x] ~~HWP 읽기: .hwp 파일 업로드 → 텍스트 추출 성공~~ **(Descoped D-2: hwp.js 미성숙)**
- [ ] 세금 환급: BenefitTracker 스캔 → 혜택 항목 정상 표시 (Playwright 통과)
- [ ] Playwright: 핵심 5개 E2E 테스트 전체 통과

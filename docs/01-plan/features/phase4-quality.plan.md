# Plan: Phase 4 - 품질 향상

**Feature**: phase4-quality
**Created**: 2026-02-18
**Level**: Dynamic
**Status**: Draft
**Reference**: `docs/progress.md` Phase 4, `docs/code-review-report-2026-02-17.md`

---

## 1. 목표

Phase 1~3에서 보안/안정성/아키텍처를 개선한 프로젝트의 **코드 품질 점수를 82점 → 90점(A)**으로 끌어올린다.

### 핵심 성과 지표
| 지표 | 현재 | 목표 |
|------|:----:|:----:|
| 코드 품질 | ~75/100 | 90/100 |
| 최대 컴포넌트 줄 수 | 1,741줄 | 400줄 이하 |
| `as any` 사용 | 9곳 | 0곳 |
| a11y 모달 role="dialog" | 0/5 | 5/5 |
| aria-hidden 아이콘 | 0% | 100% |
| 문서-코드 일치도 | ~85% | 95%+ |

---

## 2. 범위 (Scope)

### In Scope
- 4.1 거대 컴포넌트 분해 (4개 파일)
- 4.2 접근성(a11y) 개선
- 4.3 상태 관리 개선 (Zustand 도입 포함)
- 4.4 라우팅 정리
- 4.5 문서 동기화
- 4.6 타입/상수 정리

### Out of Scope
- 새 기능 추가
- UI/UX 디자인 변경
- 백엔드 API 변경
- 테스트 코드 작성 (별도 Phase)

---

## 3. 서브태스크 상세

### 4.1 거대 컴포넌트 분해

**현황 분석**:
| 컴포넌트 | 줄 수 | Hook 수 | 분해 대상 |
|----------|:-----:|:-------:|----------|
| BenefitTracker.tsx | 1,741 | 32 | `components/benefits/` 5~6파일 |
| Settings.tsx | 1,637 | 39 | `components/settings/` 탭별 분리 |
| ProgramExplorer.tsx | 1,315 | 32 | `components/programs/` 하위 분리 |
| CompanyProfile.tsx | 1,304 | 12 | `components/company/` 하위 분리 |
| App.tsx (QAController) | ~200 | - | `components/qa/QAController.tsx` |

**분해 원칙**:
- 각 하위 파일 400줄 이하
- Props drilling 대신 Context 또는 Zustand store 활용
- 기존 import 경로 호환성 유지 (barrel export)

**우선순위**: BenefitTracker > Settings > ProgramExplorer > CompanyProfile > QAController

### 4.2 접근성(a11y) 개선

**현황**:
- `aria-hidden` 사용: 전체 컴포넌트에서 **0건**
- `role="dialog"`: 모달 5개 전체 **미적용**
- Sidebar 로고 영역: `<div onClick>` (키보드 접근 불가)
- `<NavLink>` 미사용 (전부 `<button onClick={navigate}>`)

**작업 내역**:
1. 모든 `<span className="material-icons*">` 에 `aria-hidden="true"` 추가
2. 모달 5개에 `role="dialog"`, `aria-modal="true"`, `aria-labelledby` 추가
3. Sidebar L56 `<div onClick>` → `<button>` 또는 `<Link>` 전환
4. SectionCard textarea에 `aria-label` 추가

### 4.3 상태 관리 개선

**현황**:
- `useModalState.ts`: **12개** show 변수 + **8개** loading 변수 = 33개 useState
- `getStoredCompany()` 직접 호출: **14개** 컴포넌트 (렌더마다 localStorage 파싱)
- `zmis-qa-update` 커스텀 이벤트: dispatch 2곳 / subscribe 3곳

**작업 내역**:
1. `zustand` 패키지 설치
2. `services/stores/companyStore.ts` 생성 → 14곳 `getStoredCompany()` 대체
3. `useModalState` 리팩토링: `activeModal` 단일 상태 패턴 전환
4. QA 시스템 `zmis-qa-update` → Zustand store 전환
5. `Application.status` 한글 리터럴 → `ApplicationStatus` enum

### 4.4 라우팅 정리

**현황**:
- `HashRouter` 사용 중 (App.tsx L246)
- 에디터 라우트 중복: `editor/:programId/:companyId` + `editor/:slug`
- 주석 처리 라우트: execution (L264), VoiceConsultant (L237)
- 미등록 컴포넌트: CompanyProfile, ResearchHub, AgentControl, Onboarding 등

**작업 내역**:
1. 에디터 라우트 통합: `editor/:id` 단일 패턴
2. 주석 처리 라우트 및 미등록 컴포넌트 정리
3. HashRouter → BrowserRouter 전환 검토 (vercel.json rewrites 필요)

### 4.5 문서 동기화

**불일치 항목**:
| 문서 위치 | 현재 | 실제 |
|-----------|------|------|
| FUNCTIONAL_SPEC.md | BenefitTracker 섹션 **없음** | 1,741줄 독립 컴포넌트 존재 |
| FUNCTIONAL_SPEC.md L187 | "SSE 미구현" | `server/src/utils/sse.ts` 구현됨 |
| FUNCTIONAL_SPEC.md L207 | `gemini-2.0-flash` | 사용자 설정으로 변경 가능 |
| CLAUDE.md | VoiceConsultant 예외 미명시 | SDK 직접 사용 중 |

### 4.6 타입/상수 정리

**대상**:
- `constants.ts`: `MOCK_PROGRAMS` (빈 배열), `DRAFT_SECTIONS` (@deprecated) 제거
- `as any` 9곳 → 타입 명시화:
  - `components/ExecutionManager.tsx:101`
  - `components/ExpertMatch.tsx:68`
  - `components/ResearchHub.tsx:82`
  - `components/Settings.tsx:534`
  - `services/qaService.ts:154`
  - `server/src/routes/vault/benefits.ts:777,874,935`
- `types.ts`: `DraftAgentContext`, `IndustryTrend` — 이미 삭제 확인됨 (skip)

---

## 4. 구현 순서 (의존성 기반)

```
Phase 4.6 타입/상수 정리 ─────────────────────────┐
Phase 4.3 상태 관리 (Zustand) ──┐                  │
                                ↓                  ↓
Phase 4.1 컴포넌트 분해 ────────────────────────────┤
                                ↓                  │
Phase 4.2 접근성(a11y) ─────────────────────────────┤
Phase 4.4 라우팅 정리 ─────────────────────────────┤
                                ↓                  ↓
Phase 4.5 문서 동기화 ──────────────────────────── 완료
```

**실행 순서**:
1. **4.6** 타입/상수 정리 (의존성 없음, 기반 정리)
2. **4.3** Zustand 상태 관리 도입 (컴포넌트 분해 전 필요)
3. **4.1** 거대 컴포넌트 분해 (Zustand store 활용)
4. **4.2** 접근성 개선 (분해된 컴포넌트에 적용)
5. **4.4** 라우팅 정리 (분해 후 라우트 경로 확정)
6. **4.5** 문서 동기화 (모든 변경 반영 후 최종)

---

## 5. 리스크 및 완화 전략

| 리스크 | 영향도 | 완화 전략 |
|--------|:------:|----------|
| 컴포넌트 분해 시 상태 전달 복잡도 증가 | 높음 | Zustand store 선행 도입 |
| HashRouter → BrowserRouter 전환 시 기존 URL 깨짐 | 중간 | vercel.json rewrites 설정, 점진적 전환 검토 |
| useModalState 리팩토링 시 기존 동작 회귀 | 중간 | 모달별 개별 테스트 후 전환 |
| `as any` 제거 시 타입 오류 연쇄 | 낮음 | Partial<T> 및 타입 가드 활용 |

---

## 6. 성공 기준

- [ ] 모든 컴포넌트 파일 400줄 이하
- [ ] `as any` 사용 0건
- [ ] 모달 전체 `role="dialog"` + `aria-modal` 적용
- [ ] Material Icons 전체 `aria-hidden="true"` 적용
- [ ] Zustand companyStore 도입, `getStoredCompany()` 직접 호출 제거
- [ ] FUNCTIONAL_SPEC.md 코드 현실 반영 완료
- [ ] `npm run build` 오류 0건

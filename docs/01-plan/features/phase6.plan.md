# Plan: Phase 6 - UX Polish, Document I/O & Testing Infrastructure

**Feature**: phase6
**Created**: 2026-02-25
**Level**: Dynamic
**Status**: Draft
**Reference**: Phase 5 descoped items (D-1~D-6), `docs/progress.md`, Phase 5 analysis (92%)

---

## 1. Goals

Phase 5 deferred items (D-1~D-6), UX/UI polish (routing, mobile responsive, shadcn/ui adoption), and testing infrastructure (Vitest, Playwright verification) into a single cohesive release.

### Key Performance Indicators
| KPI | Current | Target |
|-----|:-------:|:------:|
| Mobile usability | Broken (fixed 256px sidebar) | Responsive drawer + hamburger |
| BrowserRouter migration | HashRouter (hash URLs) | Clean URLs via BrowserRouter |
| shadcn/ui adoption | ~20% of components | 80%+ key components |
| Document I/O | Export only (PDF/DOCX write) | Read + Write (DOCX read, file upload) |
| Feedback loop | sendFeedbackAndRefetch unused | Wired to SectionCard UI |
| Unit test coverage | 0% (no framework) | Vitest setup + critical path tests |
| E2E test verification | 5 specs unverified | All 5 specs passing |

---

## 2. Scope

### In Scope
- 6.1 BrowserRouter Migration + Sidebar NavLink
- 6.2 Mobile Responsive Layout (Sidebar drawer)
- 6.3 shadcn/ui Deep Adoption (Dashboard, ExportModal, ProgramDetail, BenefitTracker)
- 6.4 Document I/O Enhancement (DOCX read, file upload, server parse endpoint)
- 6.5 Feedback Loop Completion (sendFeedbackAndRefetch wiring, manual refetch UX)
- 6.6 Testing Infrastructure (Vitest, Playwright verification, npm test scripts)

### Out of Scope
- HWP read/write (hwp.js library still immature — re-evaluate Phase 7+)
- Server-side PDF generation (puppeteer — browser print() is sufficient)
- CI/CD pipeline (separate infrastructure task)
- VoiceConsultant WebSocket relay (complex, separate Phase)
- Authentication/authorization system changes
- New AI agent additions

---

## 3. Sub-task Details

### 6.1 BrowserRouter Migration + Sidebar NavLink

**Current State**:
- `App.tsx` uses `HashRouter` → URLs like `/#/programs`
- `vercel.json` already has catch-all rewrite: `/(.*) → /index.html` (migration-ready)
- Sidebar uses `useNavigate()` + `onClick` → no `aria-current` accessibility

**Changes**:
1. Replace `HashRouter` with `BrowserRouter` in `App.tsx`
2. Replace Sidebar `<button onClick={navigate(path)}>` with `<NavLink to={path}>` for all nav items
3. Apply `aria-current="page"` via NavLink's active class callback
4. Verify all `navigate()` calls work with BrowserRouter (no hash prefixes)
5. Test deep-link reload works on Vercel (already supported by rewrites)

**Impact Files**: `App.tsx`, `components/Sidebar.tsx`

---

### 6.2 Mobile Responsive Layout

**Current State**:
- Sidebar: `fixed left-0 w-64` with no responsive classes
- Main content: hard-coded `ml-64` — completely broken on mobile
- No hamburger menu, no drawer, no collapsible sidebar

**Changes**:
1. Install shadcn/ui `Sheet` component (`npx shadcn@latest add sheet`)
2. Create `components/MobileNav.tsx`:
   - Hamburger button visible on `md:hidden`
   - Sheet drawer (left side) containing Sidebar navigation
   - Closes on route change
3. Update `App.tsx` layout:
   - Desktop: existing sidebar `hidden md:block w-64`
   - Mobile: `MobileNav` hamburger + Sheet drawer
   - Main content: `md:ml-64 ml-0`
4. Add responsive breakpoints to key grids:
   - Dashboard hero stats: `grid-cols-2 md:grid-cols-5`
   - Dashboard card grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

**Impact Files**: `App.tsx`, `components/Sidebar.tsx`, `components/MobileNav.tsx` (new), `components/Dashboard.tsx`

---

### 6.3 shadcn/ui Deep Adoption

**Current State**:
- 21 shadcn components exist in `components/ui/`
- Sidebar, App (Skeleton), Settings are migrated
- Dashboard, ExportModal, ProgramDetail, BenefitTracker still use raw Tailwind buttons/cards

**Changes**:

#### 6.3.1 Dashboard
- Replace stat cards with `<Card>` + `<CardHeader>` + `<CardContent>`
- Replace action buttons with shadcn `<Button>`
- Replace tab-like sections with `<Tabs>` component

#### 6.3.2 ExportModal
- Replace all `<button>` with shadcn `<Button>`
- Replace tab switches with `<Tabs>` + `<TabsList>` + `<TabsContent>`
- Replace file list with `<Table>` component

#### 6.3.3 ProgramDetail / ProgramExplorer
- Replace filter dropdowns with shadcn `<Select>`
- Replace badges with shadcn `<Badge>`
- Replace detail cards with `<Card>` component

#### 6.3.4 BenefitTracker
- Replace KPI stat cards with `<Card>`
- Replace tab navigation with `<Tabs>`
- Replace data tables with `<Table>`

**Impact Files**: `components/Dashboard.tsx`, `components/editor/ExportModal.tsx`, `components/ProgramDetail.tsx`, `components/ProgramExplorer.tsx`, `components/benefits/` (multiple files)

---

### 6.4 Document I/O Enhancement

**Current State**:
- Write: PDF (window.print), DOCX (docx lib), HWP (error stub) — all working
- Read: No file reading capability
- No file upload UI in LeftPanel
- Server document parse endpoint not implemented (D-1)
- D-2 (HWP read) and D-3 (DOCX read) descoped

**Changes**:
1. **Server parse endpoint** — `server/src/routes/documents.ts` (new):
   - `POST /api/documents/parse` (multipart/form-data)
   - Accept `.docx` files via `multer`
   - Parse DOCX with `mammoth` library → extract text + structure
   - Return structured JSON: `{ sections: [{ title, content }] }`
   - HWP/PDF parsing: return 415 Unsupported Media Type with guidance message

2. **LeftPanel file upload UI**:
   - Add drag-and-drop zone in `components/editor/LeftPanel.tsx`
   - Accept `.docx` files only (with clear label)
   - Upload → server parse → auto-populate section fields
   - Show upload progress and parse results

3. **Install dependencies**:
   - `server/package.json`: `multer`, `mammoth`
   - Type definitions: `@types/multer`

**Impact Files**: `server/src/routes/documents.ts` (new), `server/src/index.ts`, `components/editor/LeftPanel.tsx`, `server/package.json`

---

### 6.5 Feedback Loop Completion

**Current State**:
- `vaultService.sendFeedbackAndRefetch()` exists (L421) but no component calls it
- SectionCard has Magic Edit (AI rewrite) but no Vault feedback mechanism
- No auto-refresh after feedback — manual reload required

**Changes**:
1. **Wire sendFeedbackAndRefetch to SectionCard**:
   - Add optional `onFeedback?: (sectionId: string, feedback: string) => void` prop to SectionCard
   - Add "Vault 피드백" button next to "AI 초안" button
   - When clicked, opens small input for feedback text
   - Submits via `vaultService.sendFeedbackAndRefetch(slug, sectionId, feedback)`
   - Auto-updates section content after refetch

2. **ApplicationEditor integration**:
   - Pass `onFeedback` callback from ApplicationEditor to SectionCard
   - Callback calls `sendFeedbackAndRefetch()` and updates local state with refetched content

3. **Manual refetch indicator**:
   - After feedback submission, show Toast: "피드백이 반영되었습니다"
   - Section content updates without page reload

**Impact Files**: `components/editor/SectionCard.tsx`, `components/ApplicationEditor.tsx`

---

### 6.6 Testing Infrastructure

**Current State**:
- No unit test framework (no Jest/Vitest)
- Playwright installed but no `npm test` script
- 5 E2E specs exist but never verified to pass
- No CI/CD integration

**Changes**:

#### 6.6.1 Vitest Setup
- Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- Create `vitest.config.ts` with jsdom environment
- Add `npm run test:unit` script to package.json
- Write critical path unit tests:
  - `services/documentExport.test.ts` — exportToDocx params, exportToHwp error
  - `services/utils/formatters.test.ts` — formatKRW, getDday
  - `constants.test.ts` — FIT_SCORE_THRESHOLD value
  - `services/storageService.test.ts` — defensive parsing (corrupt JSON)

#### 6.6.2 Playwright Verification
- Add `npm run test:e2e` script: `npx playwright test`
- Add `npm run test:e2e:ui` script: `npx playwright test --ui`
- Run all 5 existing specs and fix failures
- Verify: research, matching, benefits, export, vault-sync all pass

#### 6.6.3 Package.json Scripts
```json
{
  "test": "vitest run",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "test:e2e": "npx playwright test",
  "test:e2e:ui": "npx playwright test --ui"
}
```

**Impact Files**: `vitest.config.ts` (new), `package.json`, `tests/unit/` (new directory), existing `tests/e2e/` specs

---

## 4. Implementation Order (Dependency-based)

```
6.1 BrowserRouter + NavLink ────────┐
                                    ↓
6.2 Mobile Responsive ──────────────┤ (routing must be stable first)
                                    ↓
6.3 shadcn/ui Deep Adoption ────────┤ (includes MobileNav Sheet)
                                    │
6.4 Document I/O ───────────────────┤ (independent, can parallel with 6.3)
                                    │
6.5 Feedback Loop ──────────────────┤ (independent, can parallel)
                                    ↓
6.6 Testing Infrastructure ──────── 최종 (verifies everything)
```

**Execution Waves**:

| Wave | Tasks | Parallel | Complexity |
|------|-------|:--------:|:----------:|
| **Wave 1** | 6.1 BrowserRouter + 6.5 Feedback Loop | Yes | Low + Low |
| **Wave 2** | 6.2 Mobile Responsive + 6.4 Document I/O | Yes | Medium + Medium |
| **Wave 3** | 6.3 shadcn/ui Deep Adoption | Solo | High (many files) |
| **Wave 4** | 6.6 Testing Infrastructure | Solo | Medium |

---

## 5. Team Assignment

| Role | Agent | Assignment |
|------|-------|------------|
| **Leader** (Opus) | Architecture review, quality gate | All Waves |
| **Member-A** (Sonnet) | 6.1 BrowserRouter + NavLink | Wave 1 |
| **Member-B** (Sonnet) | 6.5 Feedback Loop | Wave 1 |
| **Member-C** (Sonnet) | 6.2 Mobile Responsive | Wave 2 |
| **Member-D** (Sonnet) | 6.4 Document I/O (server + frontend) | Wave 2 |
| **Member-E** (Sonnet) | 6.3 shadcn/ui (Dashboard, ExportModal) | Wave 3 |
| **Member-F** (Sonnet) | 6.3 shadcn/ui (ProgramDetail, BenefitTracker) | Wave 3 |
| **Member-G** (Sonnet) | 6.6 Vitest + Playwright | Wave 4 |

---

## 6. Dependencies & New Packages

### Frontend (package.json)
| Package | Purpose | Sub-task |
|---------|---------|----------|
| `vitest` | Unit test runner | 6.6 |
| `@testing-library/react` | React component testing | 6.6 |
| `@testing-library/jest-dom` | DOM assertions | 6.6 |
| `jsdom` | Browser environment for tests | 6.6 |

### Backend (server/package.json)
| Package | Purpose | Sub-task |
|---------|---------|----------|
| `multer` | File upload middleware | 6.4 |
| `@types/multer` | TypeScript types | 6.4 |
| `mammoth` | DOCX → HTML/text parser | 6.4 |

### shadcn/ui Components (install via CLI)
| Component | Purpose | Sub-task |
|-----------|---------|----------|
| `sheet` | Mobile sidebar drawer | 6.2 |
| `accordion` | Collapsible sections (optional) | 6.3 |

---

## 7. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|:------:|------------|
| BrowserRouter breaks existing bookmarks with hash | Medium | Redirect `/#/path` → `/path` in App.tsx for backwards compatibility |
| Mobile sidebar drawer Z-index conflicts | Low | Use shadcn Sheet (Radix Portal) — isolates overlay layer |
| Mammoth DOCX parsing quality varies | Medium | Show parsed preview before auto-populating; allow user to cancel |
| Vitest + Vite config conflicts | Low | Separate `vitest.config.ts` extending `vite.config.ts` |
| shadcn/ui migration breaks existing styles | Medium | Migrate one component at a time; build-verify after each |
| Playwright tests fail on WSL2 | Medium | Use `--headed` flag on WSL2 or run in Docker |

---

## 8. Success Criteria

- [ ] URLs are clean (no `#/`) — BrowserRouter working with Vercel deployment
- [ ] Sidebar uses `<NavLink>` with `aria-current="page"` on active item
- [ ] Mobile: Sidebar collapses to hamburger menu at `md` breakpoint
- [ ] Mobile: Sheet drawer opens/closes properly, closes on navigation
- [ ] Dashboard, ExportModal, ProgramDetail, BenefitTracker use shadcn/ui components
- [ ] `POST /api/documents/parse` accepts DOCX and returns structured JSON
- [ ] LeftPanel has drag-and-drop file upload for DOCX
- [ ] SectionCard "Vault 피드백" button works end-to-end
- [ ] `npm run test:unit` — Vitest runs with >0 passing tests
- [ ] `npm run test:e2e` — All 5 Playwright specs pass
- [ ] `npx vite build` passes with zero errors

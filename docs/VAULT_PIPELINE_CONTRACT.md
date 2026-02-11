# Vault 파이프라인 작업 계약서

> **목표**: Obsidian Vault에 정부 지원사업 정보를 정확하고 풍부하게 저장하는 파이프라인 완성
> **시작일**: 2026-02-09
> **브랜치**: company_pc

---

## 작업 진행 상태

| # | 작업 | 상태 | 비고 |
|---|------|------|------|
| 1 | 서버 빌드 검증 및 오류 수정 | `완료` | 에러 0, 빌드 성공 |
| 2 | 환경변수 및 API 키 설정 확인 | `완료` | ODCLOUD_ENDPOINT_PATH, VAULT_PATH 추가 |
| 3 | API 데이터 수집 테스트 (programFetcher) | `완료` | K-Startup 147건, MSS 72건 수집. ODCLOUD 2024년 데이터→필터제외 |
| 4 | Vault 동기화 기본 흐름 테스트 | `완료` | 183건 fetch, 36 created, 147 updated, 총 291건 |
| 5 | Deep Crawl 테스트 및 데이터 품질 검증 | `완료` | K-Startup JS렌더링 제한, MSS score=13, 첨부파일 OK |
| 6 | 마크다운 노트 품질 검증 및 보정 | `완료` | frontmatter 버그 수정, AI 프롬프트 개선 |
| 7 | 프론트엔드 연동 확인 | `완료` | slug 인코딩 수정, API 전엔드포인트 OK |
| 8 | 최종 통합 테스트 | `완료` | 서버빌드→동기화→분석→프론트빌드 전체 OK |

---

## 현재 진행 중인 작업

**모든 작업 완료** ✅ (2026-02-09)

---

## 작업 상세 로그

### 작업 1: 서버 빌드 검증 및 오류 수정
- **목표**: `npm run build`가 에러 없이 완료되는지 확인
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**: TypeScript 컴파일 에러 0개, dist/ 정상 생성 확인

### 작업 2: 환경변수 및 API 키 설정 확인
- **목표**: GEMINI_API_KEY, ODCLOUD API 키 등 필수 환경변수 확인
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**:
  - 서버 .env.local: PORT, ALLOWED_ORIGINS, ODCLOUD_API_KEY, DATA_GO_KR_API_KEY, GEMINI_API_KEY, DART_API_KEY 확인
  - **추가됨**: ODCLOUD_ENDPOINT_PATH (programFetcher에서 필요), VAULT_PATH=.. (프로젝트 루트 기준)
  - K-Startup/MSS API는 URL이 코드 내 하드코딩 → 환경변수 불필요

### 작업 3: API 데이터 수집 테스트 (programFetcher)
- **목표**: 3개 API(인천bizok, MSS, K-Startup)에서 실제 데이터 수집
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**:
  - K-Startup: 147건 수집 (상세 텍스트, 연락처, 카테고리 포함)
  - MSS: 72건 수집 (XML CDATA 파싱 정상)
  - ODCLOUD(인천bizok): API 정상 작동(434건) but 2024년 데이터 → filterActivePrograms에서 전부 제외
  - 총 219건 vault에 저장, 노트 frontmatter/마크다운 구조 양호
  - dataQualityScore 0 (deep crawl 전이라 정상)
  - **이슈**: ODCLOUD 엔드포인트의 데이터가 2024년으로 구식 → 별도 엔드포인트 필요하거나 날짜 필터 완화 검토

### 작업 4: Vault 동기화 기본 흐름 테스트
- **목표**: /api/vault/sync로 노트 파일 생성 확인
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**:
  - POST /api/vault/sync → 200 OK
  - totalFetched: 183, created: 36, updated: 147
  - vault/programs/에 총 291개 .md 파일
  - 재동기화 시 기존 노트 업데이트 정상 작동
  - vaultPath: server/vault (VAULT_PATH=.. 설정, server 내부 기준)

### 작업 5: Deep Crawl 테스트 및 데이터 품질 검증
- **목표**: 딥크롤+AI 재가공으로 풍부한 데이터 확보
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**:
  - K-Startup (147건): JS 렌더링 페이지 → 서버사이드 fetch로 본문 추출 불가. API 데이터로 폴백
  - MSS (72건): mss.go.kr 페이지에서 메타데이터 일부 추출. dataQualityScore=13, dataSources=['api','metadata']
  - 첨부파일: MSS 프로그램에서 1건 다운로드 성공 (attachments/ 폴더)
  - Gemini AI: 연동 정상이나 입력 데이터 부족 시 빈 결과 반환
  - URL 인코딩: 한글 slug → Express URIError 발생, URL encode 필요 (프론트엔드에서 encodeURIComponent 처리)
  - **이슈**: K-Startup/MSS 모두 서버사이드 렌더링 한계. Puppeteer/Playwright 도입 검토 필요
  - **현실적 방안**: API 데이터를 최대한 활용 + AI로 보강하는 전략이 더 효과적

### 작업 6: 마크다운 노트 품질 검증 및 보정
- **목표**: frontmatter 필드 정확성, 마크다운 렌더링 확인
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**:
  - **버그 수정**: deep-crawl 라우트에서 frontmatter에 고도화 필드 누락 → 13개 필드 추가 (dataQualityScore, dataSources, keywords, contactPhone 등)
  - **AI 프롬프트 개선**: categories/keywords에서 사이트 네비게이션 항목 제외 규칙 추가
  - **노트 구조**: frontmatter 양호, 마크다운 callout/표 렌더링 정상, Obsidian 호환
  - **남은 이슈**: K-Startup JS 렌더링으로 데이터 제한, 첨부파일명이 다운로드 URL로 표시

### 작업 7: 프론트엔드 연동 확인
- **목표**: Settings.tsx에서 동기화/분석 버튼이 실제 작동하는지 확인
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**:
  - **버그 수정**: vaultService.ts의 slug 기반 메서드 7곳에 `encodeURIComponent()` 추가
  - **API 검증**: stats, company, documents, programs 전 엔드포인트 200 OK
  - **프론트엔드 빌드**: vite build 성공 (67 modules, 466KB)
  - Settings.tsx: syncPrograms(deepCrawl), analyzeAll() 정상 호출 경로 확인
  - 기업 서류: uploadCompanyDocument, getCompanyDocuments, deleteCompanyDocument 경로 확인

### 작업 8: 최종 통합 테스트
- **목표**: 전체 파이프라인 (수집→크롤링→AI→저장→프론트) 정상 작동
- **상태**: `완료`
- **시작**: 2026-02-09
- **완료**: 2026-02-09
- **결과**:
  - **서버 빌드**: TypeScript 에러 0개
  - **프론트엔드 빌드**: Vite 67 modules, 466KB, 에러 0개
  - **API 수집**: K-Startup 147건 + MSS 72건 = 219건 (ODCLOUD 2024년 데이터 제외)
  - **Vault 동기화**: 291 프로그램 노트 정상 생성/업데이트
  - **Deep Crawl**: MSS 페이지 크롤링 + 첨부파일 다운로드 성공, K-Startup JS렌더링 한계
  - **AI 분석**: 기업 프로필 저장 → 적합도 분석 성공 (fitScore: 65)
  - **Vault 통계**: 291 programs, 1 analyzed, 3 attachments, 2 company files

---

## 발견된 이슈

| # | 이슈 | 심각도 | 상태 |
|---|------|--------|------|
| I1 | ODCLOUD API 데이터가 2024년 → filterActivePrograms에서 제외 | 낮음 | 인지 |
| I2 | K-Startup 상세페이지 JS 렌더링 → deep crawl 불가 | 중간 | 인지 |
| I3 | MSS 상세페이지도 콘텐츠 제한적 | 중간 | 인지 |
| I4 | 한글 slug URL 인코딩 필요 (Express URIError) | 높음 | **수정완료** |
| I5 | deep crawl 후 dataQualityScore 여전히 낮음 (0~13) | 중간 | 인지 |

---

## 이어받기 가이드

이 문서를 읽고 작업을 이어받는 경우:
1. **작업 진행 상태** 테이블에서 현재 상태 확인
2. **현재 진행 중인 작업** 섹션에서 마지막 작업 내용 확인
3. **발견된 이슈** 섹션에서 미해결 이슈 확인
4. 해당 작업의 **상세 로그**에서 어디까지 진행되었는지 확인
5. 중단된 지점부터 이어서 진행

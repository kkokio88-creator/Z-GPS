# 공고 상세정보 추출 기법 (Detail Page Extraction)

## 한국 정부 공고문 구조 패턴

### 일반적인 섹션 헤더
- **자격요건**: `지원 대상`, `참여 자격`, `신청 자격`, `자격 요건`, `참여대상`, `지원자격`
- **필수서류**: `제출 서류`, `구비 서류`, `필수 서류`, `신청 서류`, `첨부서류`, `제출서류 목록`
- **평가기준**: `평가 기준`, `심사 기준`, `선정 기준`, `배점`, `심사항목`, `선정기준`
- **지원내용**: `지원 내용`, `사업 내용`, `지원사항`, `사업내용`, `지원 규모`
- **신청방법**: `신청 방법`, `접수 방법`, `신청절차`, `접수 방법`
- **제외대상**: `참여 제한`, `지원 제외`, `신청 제외`, `제한 대상`, `참여제한대상`
- **일정**: `주요 일정`, `사업 일정`, `추진 일정`, `세부일정`
- **선정절차**: `선정 절차`, `심사 절차`, `선정 방법`, `선정과정`

### 리스트 마커 패턴
한국 공고문에서 사용되는 다양한 리스트 마커:
- 원문자: ○, ◦, ●, ◎
- 기호: ▪, ▸, ►, ◈, ※, -, ·, •
- 숫자: ①②③④⑤, 1) 2) 3), 1. 2. 3., (1) (2) (3)
- 한글: 가. 나. 다., 가) 나) 다)

## 계층별 추출 전략

### Level 1: API 텍스트 파싱
- K-Startup `pbanc_ctnt` HTML에서 섹션 헤더 기반 파싱
- MSS `dataContents` CDATA에서 구조 추출
- ODCLOUD 필드 직접 매핑
- 정규표현식 + HTML 태그 기반 분할

### Level 2: cheerio DOM 파싱
- `<table>` → `<th>`/`<td>` 쌍으로 key-value 추출
- `<dl>` → `<dt>`/`<dd>` 쌍으로 key-value 추출
- `<h3>`, `<h4>`, `<strong>` 헤더 → 다음 형제 콘텐츠 추출
- `.label` / `.value` 클래스 패턴 추출
- `<ul>`, `<ol>` 리스트 직접 추출

### Level 3: PDF 텍스트 추출
- `pdf-parse`로 첨부 PDF에서 텍스트 추출
- 페이지별 텍스트 병합 후 섹션 분할
- 표(table)는 탭/공백 기반 열 구분

### Level 4: AI 강화 (Gemini)
- 위 3계층의 데이터를 통합하여 AI에 전달
- 구조화 JSON으로 변환
- 누락 필드 최소화 힌트 제공

## 사이트별 CSS 셀렉터

### bizinfo.go.kr (기업마당)
```
콘텐츠: .detail-content, .board-content, .view-content, .board-view
테이블: .info-table th/td, .view-table th/td
첨부파일: .file-list a, .attach-list a
```

### k-startup.go.kr (K-Startup)
```
콘텐츠: .content-detail, .view-content, .board-detail
테이블: .tbl-view th/td, .info-tbl th/td
다운로드: .file-area a, .attach a
```

### mss.go.kr (중소벤처기업부)
```
콘텐츠: .bbs_view, .view-area, .board-view
테이블: .bbs_table th/td
첨부파일: .file_list a
```

## 품질 검증 기준
- `eligibilityCriteria` ≥ 1개 항목 → 양호
- `requiredDocuments` ≥ 1개 항목 → 양호
- `fullDescription` ≥ 200자 → 양호
- `dataQualityScore` 계산: 8개 핵심 필드 중 채워진 비율 × 100

## 텍스트 전처리
1. HTML 노이즈 제거 (nav, header, footer, aside, script, style)
2. 섹션 헤더 기반 영역 분할
3. 리스트 마커 정규화 (모든 마커 → 줄바꿈 + `-` 로 통일)
4. 공백/줄바꿈 정리
5. 구조화된 섹션 + 전체 텍스트를 함께 AI에 전달 → 신호 대 잡음비 개선

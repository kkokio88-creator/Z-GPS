# 정부 지원사업 웹 크롤링 스킬

## 개요
정부 지원사업 공고 상세페이지를 크롤링하여 구조화된 데이터를 추출하는 지식 기반.

## 대상 사이트 및 페이지 구조

### 1. 기업마당 (bizinfo.go.kr)
- **가장 중요한 소스**: 대부분의 정부 지원사업 공고가 여기에 게시됨
- **상세 URL 패턴**:
  - `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?seq=숫자`
  - `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?cond=...&seq=숫자`
- **페이지 구조** (서버사이드 렌더링, JS 불필요):
  - `.board_view` 또는 `.detail-view`: 공고 상세 컨테이너
  - `table.tbl_basic` 또는 `table.board-table`: 공고 메타데이터 테이블
    - 사업명, 공고기관, 접수기간, 사업개요, 지원대상, 지원내용 등 포함
  - `.detail-content` 또는 `.board-content`: 본문 HTML (사업 상세 내용)
  - 첨부파일: `a[href*="download"]`, `a[href*="filedown"]`, `a[href*=".pdf"]`
- **크롤링 방법**: `fetch()` + HTML 파싱 (SSR이므로 headless browser 불필요)

### 2. K-Startup (k-startup.go.kr)
- **URL 패턴**: `https://www.k-startup.go.kr/web/contents/bizpbanc-detail.do?...`
- **주의**: 일부 페이지 JavaScript 렌더링 필요
- **대안**: API 응답의 `pbanc_ctnt` 필드에 이미 상세 내용 포함

### 3. 식약처 (foodsafetykorea.go.kr)
- 공고 게시판: `/portal/board/board.do`
- 일부 공고는 별도 PDF 첨부

### 4. 중소벤처기업부 (mss.go.kr)
- 공고 게시판에서 직접 크롤링 가능
- bizinfo.go.kr로 리다이렉트되는 경우 많음

## HTML 파싱 전략

### 범용 텍스트 추출
```typescript
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
```

### bizinfo.go.kr 전용 파서
```typescript
// 메타데이터 테이블에서 key-value 추출
function parseBizinfoTable(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  // <th>키</th><td>값</td> 패턴
  const thTdRegex = /<th[^>]*>(.*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = thTdRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').trim();
    const value = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key && value) result[key] = value;
  }
  return result;
}
```

### 본문 영역 추출
```typescript
// 공고 본문만 추출 (네비게이션/헤더/푸터 제외)
function extractMainContent(html: string): string {
  // 우선순위: .detail-content > .board-content > .content-area > article > main
  const selectors = [
    /<div[^>]*class="[^"]*detail-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*board-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content[^"]*area[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  for (const regex of selectors) {
    const match = html.match(regex);
    if (match?.[1] && match[1].length > 200) return match[1];
  }

  // 폴백: body 전체
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch?.[1] || html;
}
```

## 첨부파일 처리

### 지원 형식
| 확장자 | 용도 | 처리 방법 |
|--------|------|-----------|
| PDF | 공고문 전문 | 텍스트 추출 (pdf-parse 또는 Gemini Vision) |
| HWP | 한글 문서 | 바이너리 저장, AI 분석 시 base64 전달 |
| DOCX | 워드 문서 | 텍스트 추출 가능 |
| XLSX/XLS | 예산/일정표 | 데이터 추출 |
| ZIP | 서류 묶음 | 압축 해제 후 개별 처리 |

### 첨부파일 URL 추출 패턴
```typescript
// 1. 직접 파일 링크
/href=["']([^"']+\.(?:pdf|hwp|docx?|xlsx?|zip))["']/gi

// 2. 다운로드 API 링크
/href=["']([^"']*(?:download|fileDown|attach|getFile)[^"']*)["']/gi

// 3. onclick 이벤트에 숨겨진 다운로드
/onclick=["'][^"']*(?:download|fileDown)\([^)]*['"]([^'"]+)['"][^)]*\)/gi

// 4. data 속성에 숨겨진 URL
/data-(?:file|download|url)=["']([^"']+)["']/gi
```

### 다운로드 시 주의사항
- **User-Agent 헤더 필수**: 일부 사이트 봇 차단
- **Referer 헤더**: 일부 다운로드 서버에서 요구
- **쿠키/세션**: 일부 사이트 로그인 후 다운로드만 허용
- **Rate Limiting**: 사이트별 1~3초 간격 유지
- **파일 크기 제한**: 최대 50MB

## 크롤링 모범 사례

### HTTP 요청 헤더
```typescript
const CRAWL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
};
```

### 에러 처리
- **403 Forbidden**: User-Agent 변경, 쿠키 설정
- **404 Not Found**: URL 패턴 변경 감지, 대체 URL 시도
- **5xx Server Error**: 3초 후 재시도 (최대 3회)
- **Timeout (10초)**: 느린 서버 대응
- **인코딩**: `EUC-KR` → `UTF-8` 변환 (일부 정부 사이트)

### 사이트별 크롤링 어댑터 패턴
```typescript
interface CrawlAdapter {
  canHandle(url: string): boolean;
  extractMetadata(html: string): Record<string, string>;
  extractContent(html: string): string;
  extractAttachments(html: string, baseUrl: string): AttachmentLink[];
}

// bizinfo.go.kr 전용
class BizinfoAdapter implements CrawlAdapter { ... }
// k-startup.go.kr 전용
class KStartupAdapter implements CrawlAdapter { ... }
// 범용 (기타 사이트)
class GenericAdapter implements CrawlAdapter { ... }
```

## 법적/윤리적 고려사항
- robots.txt 준수
- 과도한 요청 방지 (1~3초 간격)
- 수집 데이터는 사내 업무용으로만 사용
- 개인정보 수집 금지

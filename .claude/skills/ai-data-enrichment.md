# AI 데이터 재가공 및 정보 강화 스킬

## 개요
API + 크롤링으로 수집한 원시 공고 데이터를 Gemini AI로 재가공하여 구조화된 고품질 정보로 변환하는 지식 기반.

## 공고 정보 표준 스키마

### 필수 필드 (반드시 추출)
```typescript
interface EnrichedProgramData {
  // 기본 정보
  programName: string;          // 사업명
  organizer: string;            // 주관기관
  department: string;           // 담당 부서/과
  supportType: string;          // 지원 유형 (R&D, 마케팅, 시설 등)

  // 일정
  applicationPeriod: {
    start: string;              // 신청 시작일 (YYYY-MM-DD)
    end: string;                // 신청 마감일 (YYYY-MM-DD)
  };
  announcementDate: string;     // 공고일
  selectionDate: string;        // 선정 발표일
  projectPeriod: string;        // 사업 수행 기간

  // 자금
  supportScale: string;         // 지원 규모 설명
  maxGrantPerProject: number;   // 과제당 최대 지원금
  matchingRatio: string;        // 매칭(자부담) 비율
  totalBudget: string;          // 총 사업 예산

  // 대상 및 자격
  targetAudience: string;       // 지원 대상 설명
  eligibilityCriteria: string[];// 세부 자격요건 목록
  exclusionCriteria: string[];  // 제외 대상 (참여 제한)

  // 신청 절차
  applicationMethod: string;    // 신청 방법 (온라인/오프라인)
  applicationUrl: string;       // 온라인 신청 URL
  requiredDocuments: string[];  // 필수 제출 서류 목록

  // 평가
  evaluationCriteria: string[]; // 평가기준 (배점 포함)
  selectionProcess: string[];   // 선정 절차 (서류→발표→현장 등)

  // 연락처
  contactInfo: string;          // 담당자/문의처
  contactPhone: string;         // 전화번호
  contactEmail: string;         // 이메일

  // 상세 내용
  fullDescription: string;      // 사업 상세 설명 (3~5문단)
  objectives: string[];         // 사업 목적/목표
  supportDetails: string[];     // 지원 내용 상세
  specialNotes: string[];       // 유의사항/특이사항

  // 분류
  regions: string[];            // 대상 지역
  categories: string[];         // 분류 카테고리
  keywords: string[];           // 검색 키워드
}
```

## AI 재가공 파이프라인

### 단계 1: 원시 데이터 통합
```
API 데이터 (구조화) + 크롤링 텍스트 (비구조화) → 통합 입력
```

### 단계 2: Gemini 구조화 추출
```typescript
const EXTRACTION_PROMPT = `당신은 정부 지원사업 공고 분석 전문가입니다.

## 입력 데이터
### API에서 수집한 구조화 데이터:
{apiData}

### 웹페이지에서 크롤링한 텍스트:
{crawledText}

### 첨부파일에서 추출한 텍스트:
{attachmentText}

## 작업
위 데이터를 종합하여 아래 JSON 형식으로 공고 정보를 **최대한 상세하게** 추출하세요.

## 규칙
1. 정보가 여러 소스에 있으면 가장 상세한 내용을 선택
2. 추측하지 말고, 원문에 있는 정보만 추출
3. 금액은 숫자로 변환 (단위: 원)
4. 날짜는 YYYY-MM-DD 형식
5. 목록 항목은 각각 완전한 문장으로
6. fullDescription은 원문의 핵심 내용을 3~5문단으로 정리
7. 빈 필드는 빈 문자열 또는 빈 배열로 유지

## 출력 JSON:
{schema}`;
```

### 단계 3: 품질 검증
```typescript
const VALIDATION_PROMPT = `다음 공고 정보 JSON의 품질을 검증하세요.

{enrichedData}

검증 항목:
1. 필수 필드가 채워져 있는가? (programName, targetAudience, applicationPeriod)
2. 날짜 형식이 올바른가? (YYYY-MM-DD)
3. 금액이 합리적인가?
4. 자격요건이 구체적인가?
5. fullDescription이 200자 이상인가?

JSON 출력:
{
  "qualityScore": 0-100,
  "missingFields": ["비어있는 중요 필드"],
  "suggestions": ["개선 제안"],
  "correctedData": { /* 수정된 필드만 */ }
}`;
```

## 프롬프트 최적화 전략

### 토큰 효율화
- 크롤링 텍스트: 최대 20,000자로 제한 (핵심 영역 우선)
- API 데이터: 관련 필드만 포함
- 첨부파일: 텍스트 추출 후 최대 10,000자

### 정확도 향상
- `responseMimeType: 'application/json'` 사용
- 구체적 예시 포함 (few-shot)
- 필드별 설명과 기대값 명시
- "추측하지 말 것" 명시적 지시

### 대용량 공고 처리
1. 전체 텍스트 → 요약 추출 (1차)
2. 요약 + 특정 필드 추출 요청 (2차)
3. 필요시 섹션별 분할 처리

## Obsidian 노트 생성 템플릿

### 풍부한 마크다운 출력
```markdown
# {programName}

> [!info] 기본 정보
> - **주관**: {organizer} / {department}
> - **지원금**: {supportScale} | **마감**: {applicationPeriod.end}
> - **신청기간**: {applicationPeriod.start} ~ {applicationPeriod.end}
> - **신청방법**: {applicationMethod}
> - **매칭비율**: {matchingRatio}

## 사업 목적
{objectives를 bullet point로}

## 지원 대상
{targetAudience}

### 세부 자격요건
{eligibilityCriteria를 bullet point로}

### 참여 제한 대상
{exclusionCriteria를 bullet point로}

## 지원 내용
{supportDetails를 bullet point로}

## 사업 상세
{fullDescription - 3~5문단}

## 신청 절차
{selectionProcess를 numbered list로}

## 필수 서류
{requiredDocuments를 checkbox list로}

## 평가 기준
{evaluationCriteria를 table로}

## 주요 일정
| 일정 | 날짜 |
|------|------|
| 공고일 | {announcementDate} |
| 접수기간 | {applicationPeriod.start} ~ {applicationPeriod.end} |
| 선정발표 | {selectionDate} |
| 사업기간 | {projectPeriod} |

## 유의사항
{specialNotes를 callout box로}

## 연락처
- **담당**: {contactInfo}
- **전화**: {contactPhone}
- **이메일**: {contactEmail}

## 첨부파일
{attachments를 wiki link로}
```

## 데이터 품질 등급

| 등급 | 점수 | 기준 |
|------|------|------|
| A (완전) | 80-100 | 모든 핵심 필드 채워짐, 상세 내용 500자 이상 |
| B (양호) | 60-79 | 핵심 필드 80% 이상, 상세 내용 200자 이상 |
| C (부족) | 40-59 | 기본 정보만 있음, 상세 내용 부족 |
| D (최소) | 0-39 | 제목/주관기관만 있음 |

## 에러 처리
- Gemini 429 에러: exponential backoff (2초, 4초, 8초)
- JSON 파싱 실패: markdown 코드블록에서 재추출
- 토큰 초과: 입력 텍스트 분할 후 2회 호출

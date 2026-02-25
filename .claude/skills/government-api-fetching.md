# 한국 정부 지원사업 API 수집 스킬

## 개요
한국 공공데이터포털(data.go.kr) 및 기타 정부 API에서 지원사업 공고 데이터를 수집하는 지식 기반.

## 사용 가능한 API 소스

### 1. 중소벤처기업부 사업공고 API (MSS)
- **엔드포인트**: `https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2`
- **인증**: `serviceKey` 쿼리 파라미터 (data.go.kr 발급)
- **응답 형식**: XML
- **공식 필드 (data.go.kr 문서 확인):**
  - `itemId`: 게시물 고유 키
  - `title`: 사업명
  - `dataContents`: 사업 내용 전체 텍스트 (HTML 포함 가능)
  - `viewUrl`: 상세페이지 URL (bizinfo.go.kr)
  - `applicationStartDate`: 신청 시작일
  - `applicationEndDate`: 신청 마감일
  - `writerName`: 담당자명
  - `writerPosition`: 담당 부서
  - `writerPhone`: 담당자 연락처
  - `writerEmail`: 담당자 이메일
  - `fileName`: 첨부파일 원본 파일명
  - `fileUrl`: 첨부파일 다운로드 URL
- **비공식/추가 필드 (일부 응답에서 확인):**
  - `sprvInstNm`: 주관기관명
  - `operInstNm`: 운영기관명
  - `bizPbancSeNm`: 사업공고구분 (신규/재공고 등)
  - `totCnt`: 지원금 총액
  - `applyTarget`: 신청 대상
  - `hashtag`: 해시태그 (카테고리)
  - `areaNm`: 지역명
- **한계**: 신청자격, 평가기준 등 구조화 필드 없음 → `viewUrl`로 딥크롤 필수
- **XML 파싱 팁**:
  - `<item>` 태그로 각 공고 분리
  - CDATA 섹션 주의: `<![CDATA[내용]]>`
  - `&amp;`, `&lt;` 등 HTML 엔티티 디코딩 필요
  - `dataContents`에 HTML 태그 포함 가능 → 텍스트 추출 필요

### 2. K-Startup 창업진흥원 API
- **엔드포인트**: `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01`
- **인증**: `serviceKey` 쿼리 파라미터
- **응답 형식**: JSON (`returnType=json`)
- **주요 필드 (3개 API 중 가장 풍부)**:
  - `pbanc_sn`: 공고 일련번호 (고유 ID)
  - `biz_pbanc_nm` / `intg_pbanc_biz_nm`: 사업 공고명
  - `sprv_inst` / `pbanc_ntrp_nm`: 주관기관
  - `supt_biz_clsfc`: 지원사업 분류
  - `pbanc_ctnt`: 공고 내용 (상세 텍스트)
  - `aply_trgt` / `aply_trgt_ctnt`: 신청 대상 (요약/상세)
  - `aply_excl_trgt_ctnt`: **신청 제외 대상** (고유 필드)
  - `biz_enyy`: 업력 조건
  - `biz_trgt_age`: 대상 연령 조건
  - `prfn_matr`: 우대 사항
  - `detl_pg_url` / `biz_gdnc_url` / `biz_aply_url`: URL (3종)
  - `pbanc_rcpt_bgng_dt` / `pbanc_rcpt_end_dt`: 접수 기간 (YYYYMMDD)
  - `supt_scl`: 지원 규모
  - `biz_supt_ctnt`: 사업 지원 내용
  - `aply_mthd_onli_rcpt_istc`: 온라인 신청 방법
  - `aply_mthd_vst_rcpt_istc`: 방문 접수 방법
  - `aply_mthd_pssr_rcpt_istc`: 우편 접수 방법
  - `aply_mthd_fax_rcpt_istc`: 팩스 접수 방법
  - `aply_mthd_etc_istc`: 기타 신청 방법
  - `biz_prch_dprt_nm`: 사업 담당 부서명
  - `prch_cnpl_no`: 담당자 연락처
  - `biz_pbanc_stts`: 공고 상태 (접수중/마감 등)
  - `rcrt_prgs_yn`: 모집 진행 여부 (Y/N)
  - `supt_regin` / `rgn_nm`: 지역명
  - `tag_nm` / `hashtag`: 태그/카테고리
- **날짜 형식**: YYYYMMDD → YYYY-MM-DD 변환 필요

### 3. 인천 bizok ODCLOUD API
- **엔드포인트**: `https://api.odcloud.kr/api/{endpoint_path}`
- **인증**: `serviceKey` 쿼리 파라미터
- **응답 형식**: JSON
- **주요 필드** (데이터셋마다 상이):
  - `지원사업명` / `사업명`: 사업명
  - `주관기관`: 주관기관
  - `지원분야`: 지원 분야
  - `신청일자`: 신청일
  - `접수기간`: 접수 기간
  - `지원대상`: 지원 대상
  - `지원내용`: 지원 내용
  - `신청방법`: 신청 방법
  - `문의처`: 문의 연락처
  - `상세URL` / `링크`: 상세 URL
  - `번호`: 레코드 번호

## API 호출 모범 사례

### 에러 처리
```typescript
// 429 Rate Limit → exponential backoff
// 401/403 → API 키 확인
// 5xx → 재시도 (최대 3회)
// XML 파싱 실패 → 정규식 폴백
```

### 데이터 정규화
```typescript
// 날짜 통일: YYYYMMDD → YYYY-MM-DD
function normalizeDate(raw: string): string {
  if (raw.length === 8) return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
  if (raw.includes('-')) return raw;
  return '';
}

// 금액 파싱: "5,000만원" → 50000000
function parseAmount(raw: string): number {
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (raw.includes('억')) return num * 100000000;
  if (raw.includes('만')) return num * 10000;
  return num || 0;
}
```

### 상세 URL 구성
- **bizinfo.go.kr** (기업마당): 대부분의 MSS 공고 상세 URL
  - 패턴: `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?seq=공고번호`
  - viewUrl 필드에서 직접 제공
- **K-Startup**: `detl_pg_url` 필드에서 직접 제공
- URL이 없거나 잘못된 경우: bizinfo.go.kr 검색 URL 생성

## 데이터 품질 체크리스트
- [ ] detailUrl이 실제 공고 상세페이지인지 (메인 페이지 아닌지)
- [ ] 날짜가 유효한 형식인지
- [ ] 사업명이 비어있지 않은지
- [ ] 중복 공고 제거 (사업명 + 주관기관 기준)
- [ ] 만료된 공고 필터링

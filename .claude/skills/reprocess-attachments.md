---
name: reprocess-attachments
description: Vault 첨부파일 일괄 재분석 (타입 감지 + 텍스트 추출 + 확장자 수정)
user_invocable: true
---

# Vault 첨부파일 재처리

## 개요
vault/attachments/pdfs/ 내 모든 첨부파일을 magic bytes로 실제 타입을 감지하고,
PDF/HWPX에서 텍스트를 추출하여 pdf-analysis/에 저장합니다.

## 사전 조건
- 서버가 localhost:3001에서 실행 중이어야 합니다
- 서버가 실행 중이 아니면 먼저 `cd server && npm run dev`로 시작

## 실행 순서

### 1. 서버 상태 확인
```bash
curl -s http://localhost:3001/api/health
```
- 응답이 없으면 서버 시작 필요

### 2. 재처리 API 호출
```bash
curl -s -N -X POST http://localhost:3001/api/vault/reprocess-attachments
```
- SSE 스트림으로 진행률이 실시간 전달됨
- 최종 `event: complete` 이벤트에서 통계 확인

### 3. 결과 확인
최종 stats 객체에서 확인할 항목:
- `pdf`: PDF로 감지된 파일 수
- `hwpx`: HWPX로 감지된 파일 수 (텍스트 추출됨)
- `hwp5`: HWP5(OLE) 파일 수 (텍스트 추출 미지원)
- `png`: PNG로 감지/삭제된 파일 수
- `textExtracted`: 텍스트 추출 성공 수
- `renamed`: 확장자 수정된 파일 수
- `errors`: 에러 수

### 4. 추출된 텍스트 확인
```bash
ls vault/attachments/pdf-analysis/ | head -20
```

## 동작 상세

### 파일 타입 감지 (magic bytes)
| Bytes | 타입 |
|-------|------|
| `%PDF` (25 50 44 46) | PDF |
| `PK` (50 4B) + Contents/ 폴더 | HWPX |
| `PK` (50 4B) + word/document.xml | DOCX |
| `PK` (50 4B) 기타 | ZIP |
| D0 CF 11 E0 | HWP5 (OLE) |
| 89 50 4E 47 | PNG |

### 처리 규칙
- **PNG** → 삭제 (썸네일/로고 이미지)
- **PDF** → pdf-parse로 텍스트 추출
- **HWPX** → adm-zip + XML 파싱으로 `<hp:t>` 태그 텍스트 추출
- **HWP5** → OLE 포맷, 텍스트 추출 미지원 (로그만)
- 잘못된 확장자(`.내려받기`, `.다운로드` 등) → 실제 타입에 맞는 확장자로 리네임
- 프로그램 frontmatter의 attachments[].path, analyzed 값 자동 업데이트

## 관련 코드
- `server/src/services/deepCrawler.ts` — detectFileType(), extractTextFromFile(), extractTextFromHwpx()
- `server/src/routes/vault.ts` — POST /api/vault/reprocess-attachments
- 의존성: `adm-zip` (HWPX ZIP 해제), `pdf-parse` (PDF 텍스트 추출)

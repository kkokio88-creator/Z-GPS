---
name: security
description: Z-GPS 보안 취약점 검사 (API 키 노출, XSS, 환경 변수)
user_invocable: true
---

# Z-GPS 보안 검사

## 검사 항목

### 1. API 키 노출 검사
- 소스 코드에서 하드코딩된 API 키 패턴 검색:
  - `AIza` (Google API 키 패턴)
  - `sk-` (OpenAI 키 패턴)
  - `Bearer ` 뒤에 하드코딩된 토큰
- `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- `.env.local`, `.env.production` 등이 git에 커밋되지 않았는지 확인

### 2. 환경 변수 사용 패턴
- 프론트엔드에서 `process.env` 대신 `import.meta.env` 사용하는지 확인
- 민감한 키가 `VITE_` 접두사로 프론트엔드에 노출되지 않는지 확인
- 서버 환경 변수가 `server/.env`에만 있는지 확인

### 3. XSS 취약점
- `dangerouslySetInnerHTML` 사용 여부 검사
- 사용자 입력이 직접 DOM에 삽입되는 패턴 검사

### 4. 의존성 보안
- `npm audit` 실행하여 알려진 취약점 확인
- `server/` 디렉토리에서도 `npm audit` 실행

### 5. Git 히스토리
- 최근 커밋에서 민감 정보 노출 여부 확인: `git log --diff-filter=A --name-only`

## 결과 리포트
- 위험도별 분류 (Critical / Warning / Info)
- 각 문제에 대한 수정 방법 제안

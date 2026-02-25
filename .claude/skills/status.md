---
name: status
description: Z-GPS 프로젝트 현황 대시보드 (Git, TODO, 의존성, 구조)
user_invocable: true
---

# Z-GPS 프로젝트 현황 대시보드

## 수집 항목 (모두 병렬 실행)

### 1. Git 상태
- `git status` - 현재 브랜치, 변경사항
- `git log --oneline -10` - 최근 10개 커밋
- `git branch -a` - 모든 브랜치 목록

### 2. TODO/FIXME 추적
- 전체 소스에서 `TODO`, `FIXME`, `HACK`, `XXX` 주석 검색 (Grep)
- 파일별/유형별 분류

### 3. 의존성 상태
- `npm outdated` - 업데이트 가능한 패키지
- `cd server && npm outdated` - 백엔드 패키지
- `npm audit` - 보안 취약점

### 4. 프로젝트 구조 요약
- 컴포넌트 수 (components/*.tsx)
- 서비스 수 (services/*.ts)
- 총 파일 수, 코드 라인 수 추정

### 5. 환경 설정 확인
- `.env.local` 존재 여부
- `server/.env` 존재 여부
- 필수 환경 변수 설정 상태

## 출력 형식
위 정보를 깔끔한 대시보드 형태로 요약하여 제공

---
name: review
description: Z-GPS 코드 변경사항 리뷰 (CLAUDE.md 규칙 기반)
user_invocable: true
---

# Z-GPS 코드 리뷰

## 리뷰 대상
`git diff` 및 `git diff --cached`로 현재 변경사항 확인

## 검사 기준 (CLAUDE.md 기반)

### TypeScript 규칙
- `any` 타입 사용 금지 - `unknown` + 타입 가드 사용
- 모든 함수 매개변수/반환값에 타입 명시
- Interface 우선 (type보다 interface)
- 타입 import 시 `types.ts`에서만

### React 규칙
- 함수형 컴포넌트 + `React.FC<Props>`
- useEffect 의존성 배열 정확성
- Props destructuring 사용

### 네이밍 컨벤션
- 컴포넌트: PascalCase
- 서비스/유틸: camelCase
- 타입/인터페이스: PascalCase
- 상수: UPPER_SNAKE_CASE

### 환경 변수
- `import.meta.env` 사용 (NOT `process.env`)
- `VITE_` 접두사 확인

### 로깅
- `console.log`는 `import.meta.env.DEV` 가드 내에서만

### Agent 사용
- 올바른 에이전트 이름 사용 (structuringAgent, suitabilityAgent 등)
- 메서드 시그니처 확인

## 리뷰 출력 형식
각 파일별로:
- 문제점 (필수 수정)
- 개선사항 (권장)
- 잘된 점 (칭찬)

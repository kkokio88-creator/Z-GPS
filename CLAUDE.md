# Z-GPS Project - Claude Code Guide

## 프로젝트 개요
중소기업을 위한 AI 기반 정부 지원금 신청 관리 시스템

## 기술 스택
- **Frontend**: React 19 + TypeScript
- **Build**: Vite 6.4.1
- **Routing**: React Router DOM 7
- **AI**: Google Gemini API
- **Styling**: Tailwind CSS (inline)
- **Multi-Agent System**: 6개 특화 AI 에이전트 협업 시스템

## 코딩 규칙 및 스타일

### TypeScript
- ✅ **항상 명시적 타입 사용** - `any` 타입 절대 사용 금지
- ✅ **Interface 우선** - type보다 interface를 우선적으로 사용
- ✅ **타입 import 명시** - types.ts에서 필요한 타입만 import
- ❌ **암묵적 any 금지** - 모든 함수 매개변수와 반환값에 타입 명시

### React 컴포넌트
- ✅ **함수형 컴포넌트 사용** - `React.FC<Props>` 타입 명시
- ✅ **Hooks 규칙 준수** - useEffect 의존성 배열 정확히 관리
- ✅ **Props destructuring** - 컴포넌트 내에서 props를 구조분해 할당
- ❌ **클래스 컴포넌트 금지** - 모든 컴포넌트는 함수형으로 작성

### 파일 구조
```
Z-GPS/
├── components/          # React 컴포넌트 (PascalCase.tsx)
├── services/            # 비즈니스 로직 (camelCase.ts)
├── types.ts             # 전역 TypeScript 타입 정의
├── constants.ts         # 상수 정의
└── docs/               # 문서
```

### 네이밍 컨벤션
- **컴포넌트**: PascalCase (예: `AgentControl.tsx`)
- **서비스/유틸**: camelCase (예: `agentOrchestrator.ts`)
- **타입/인터페이스**: PascalCase (예: `AgentMessage`)
- **상수**: UPPER_SNAKE_CASE (예: `API_BASE_URL`)
- **변수/함수**: camelCase (예: `handleStartQA`)

## 환경 변수 규칙

### Vite 환경 변수
- ✅ **반드시 `import.meta.env` 사용** - `process.env` 사용 금지
- ✅ **접두사 `VITE_` 필수** - 모든 환경 변수는 `VITE_`로 시작
- ✅ **타입 정의 필수** - `vite-env.d.ts`에 타입 선언

**예시:**
```typescript
// ✅ 올바른 사용
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// ❌ 잘못된 사용
const apiKey = process.env.VITE_GEMINI_API_KEY; // Vite에서 작동 안 함!
```

## 개발 모드 로깅

### Console.log 규칙
- ✅ **개발 환경에서만 로그 출력** - 프로덕션 빌드에 로그가 남지 않도록
- ✅ **조건부 로깅 사용**

```typescript
// ✅ 올바른 사용
if (import.meta.env.DEV) {
  console.log('🔍 Analyzer: Analyzing company profile...');
}

// ❌ 잘못된 사용
console.log('Debug info'); // 프로덕션에도 출력됨
```

## API 및 Agent 사용 규칙

### Gemini Agents 사용 시 주의사항
- ✅ **올바른 agent 이름 사용**:
  - `structuringAgent` (NOT `structureAgent`)
  - `suitabilityAgent` (NOT `intelligenceAgent`)
  - `draftAgent`, `reviewAgent`, `consistencyAgent`

- ✅ **메서드 시그니처 확인**:
  - `structuringAgent.structure(text, company)`
  - `suitabilityAgent.evaluate(company, program)`
  - `draftAgent.writeSection(company, program, sectionTitle, useSearch, context)`
  - `reviewAgent.reviewApplication(company, program, draftSections, persona)`
  - `consistencyAgent.checkConsistency(draftSections)`

### Multi-Agent System
- ✅ **초기화 순서 준수**: `agentTeam.initialize()` → `orchestrator.start()`
- ✅ **이벤트 리스너 정리**: 컴포넌트 unmount 시 `orchestrator.off()` 호출
- ✅ **타입 안전성**: 모든 agent 메시지와 태스크에 타입 명시

## Git Commit 규칙

### Commit Message Format
```
<Type>: <Subject>

<Body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Type 종류
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링
- `docs`: 문서 수정
- `style`: 코드 포맷팅
- `test`: 테스트 추가/수정
- `chore`: 빌드/설정 변경

### Commit 시 주의사항
- ✅ **의미 있는 단위로 커밋** - 하나의 기능/수정 = 하나의 커밋
- ✅ **변경사항 요약** - 무엇을, 왜 변경했는지 명확히
- ❌ **WIP 커밋 금지** - 작업 중인 코드는 커밋하지 않음

## 자주 발생하는 실수 및 해결법

### 1. Agent Import 에러
**문제:**
```typescript
import { structureAgent } from './geminiAgents'; // ❌
```

**해결:**
```typescript
import { structuringAgent } from './geminiAgents'; // ✅
```

### 2. 환경 변수 접근 에러
**문제:**
```typescript
const key = process.env.VITE_GEMINI_API_KEY; // ❌ undefined
```

**해결:**
```typescript
const key = import.meta.env.VITE_GEMINI_API_KEY; // ✅
```

### 3. EligibilityStatus 타입 에러
**문제:**
```typescript
eligibility: 'POSSIBLE' // ❌ Type error
```

**해결:**
```typescript
import { EligibilityStatus } from '../types';
eligibility: EligibilityStatus.POSSIBLE // ✅
```

### 4. Any 타입 사용
**문제:**
```typescript
const data: any = response; // ❌
```

**해결:**
```typescript
const data: ResponseType = response; // ✅
// 또는 타입을 모를 경우
const data: unknown = response;
if (isResponseType(data)) {
  // 타입 가드 사용
}
```

### 5. 사용하지 않는 Import
**문제:**
```typescript
import { AgentTask } from '../types'; // 사용 안 함
```

**해결:**
- 사용하지 않는 import는 삭제
- IDE의 "Organize Imports" 기능 활용

## 테스트 전략

### 빌드 전 체크리스트
1. ✅ TypeScript 에러 0개: `npm run build`
2. ✅ 콘솔 에러 없음: 브라우저 개발자 도구 확인
3. ✅ HMR 작동 확인: 파일 저장 시 자동 반영
4. ✅ 주요 기능 동작 테스트

### 디버깅 팁
```typescript
// 개발 환경에서 상세 로그 출력
if (import.meta.env.DEV) {
  console.log('🎭 Event:', event);
  console.log('📊 Data:', JSON.stringify(data, null, 2));
}
```

## 성능 최적화

### React 컴포넌트
- ✅ **Lazy Loading**: 큰 컴포넌트는 React.lazy() 사용
- ✅ **Memo 활용**: 불필요한 리렌더링 방지
- ✅ **useCallback/useMemo**: 비용이 큰 계산은 메모이제이션

### API 호출
- ✅ **중복 호출 방지**: 같은 데이터는 캐싱
- ✅ **에러 처리**: try-catch로 모든 API 호출 감싸기
- ✅ **타임아웃 설정**: 응답 대기 시간 제한

## 보안 규칙

### API Key 관리
- ❌ **절대 코드에 하드코딩 금지**
- ✅ **환경 변수 사용**: `.env.local`에 저장
- ✅ **Git에 커밋 금지**: `.gitignore`에 `.env.local` 포함
- ✅ **백엔드 프록시 권장**: 프로덕션에서는 서버 측에서 API 호출

### 민감 정보
```typescript
// ❌ 절대 금지
const API_KEY = "AIza..."; // 하드코딩

// ✅ 올바른 방법
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
if (!API_KEY && import.meta.env.DEV) {
  console.warn('API Key missing');
}
```

## 문서화 규칙

### 함수/메서드 주석
```typescript
/**
 * 지원서 자동 생성
 *
 * @param company - 회사 정보
 * @param program - 지원 사업 정보
 * @param onProgress - 진행 상황 콜백 (선택)
 * @returns Promise<void>
 */
export const generateApplicationWithAgents = async (
  company: Company,
  program: SupportProgram,
  onProgress?: (stage: string, progress: number) => void
): Promise<void> => {
  // 구현...
};
```

### 복잡한 로직 설명
- 복잡한 비즈니스 로직은 주석으로 설명
- 왜(why) 이렇게 구현했는지 중심으로 작성
- 코드 자체로 명확한 경우 주석 불필요

## Quick Reference

### 자주 사용하는 명령어
```bash
# 개발 서버 시작
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview

# 타입 체크
tsc --noEmit
```

### 유용한 VSCode 단축키
- `Ctrl + Shift + O`: 파일 내 심볼 검색
- `Ctrl + P`: 파일 빠른 열기
- `F12`: 정의로 이동
- `Shift + F12`: 참조 찾기
- `Ctrl + .`: Quick Fix

## 추가 리소스
- [Multi-Agent System 가이드](docs/MULTI_AGENT_SYSTEM.md)
- [통합 예제](docs/AGENT_INTEGRATION_EXAMPLES.md)
- [Vite 공식 문서](https://vitejs.dev/)
- [React 공식 문서](https://react.dev/)

---

**Last Updated**: 2025-02-02
**Maintainer**: Claude Code + hoyeon

# Claude Code 최적 활용 가이드 - Z-GPS 프로젝트

## 📋 목차
1. [기본 설정](#기본-설정)
2. [효율적인 작업 방법](#효율적인-작업-방법)
3. [자주 사용하는 명령어](#자주-사용하는-명령어)
4. [고급 기능](#고급-기능)
5. [트러블슈팅](#트러블슈팅)

---

## 기본 설정

### 1. 권한 사전 승인 설정

자주 사용하는 명령어들을 미리 승인해두면 매번 확인 없이 빠르게 작업할 수 있습니다.

**설정 방법:**
```bash
# Claude Code CLI에서
claude permission add "Bash(npm run dev:*)"
claude permission add "Bash(npm run build:*)"
claude permission add "Bash(git add:*)"
claude permission add "Bash(git commit:*)"
claude permission add "Bash(git push:*)"
claude permission add "Bash(npx tsc --noEmit:*)"
```

### 2. CLAUDE.md 파일 활용

프로젝트 루트의 `CLAUDE.md` 파일에는 중요한 규칙과 가이드라인이 담겨있습니다.
Claude는 이 파일을 자동으로 참조하여 같은 실수를 반복하지 않습니다.

**주요 내용:**
- 코딩 규칙 및 스타일
- 자주 발생하는 실수
- TypeScript/React 베스트 프랙티스
- Agent 시스템 사용법

---

## 효율적인 작업 방법

### 1. 플랜(Plan) 모드 활용

복잡한 작업을 시작하기 전에 플랜 모드를 사용하세요.

**사용 방법:**
1. `Shift + Tab` 또는 `/plan` 명령 실행
2. Claude가 작업 계획을 세움
3. 계획이 마음에 들 때까지 수정 요청
4. 승인 후 자동 실행

**예시:**
```
/plan 지원서 자동 생성 기능에 진행 상황 표시 추가
```

### 2. 백그라운드 실행

시간이 오래 걸리는 작업은 백그라운드에서 실행하고 다른 작업을 진행하세요.

**방법 1: Bash 명령어 끝에 & 추가**
```bash
npm run build &
```

**방법 2: Task 도구 사용**
```
Claude, 백그라운드에서 전체 타입 체크 실행해줘
```

### 3. 여러 세션 동시 사용

- **로컬 세션**: 코드 작성, 빌드, 테스트
- **웹 세션**: 문서 작성, 리서치, 디자인 논의
- 최대 15개까지 병렬 운용 가능!

### 4. 자가 검증 지시

Claude에게 작업 후 스스로 검증하도록 요청하세요.

**예시:**
```
컴포넌트 수정 완료 후:
1. TypeScript 타입 체크 실행
2. 빌드 테스트
3. 브라우저에서 동작 확인
4. 결과 보고
```

---

## 자주 사용하는 명령어

### Quick Commands (NPM Scripts)

```bash
# 개발 서버 시작
npm run dev

# 타입 체크만 실행
npm run typecheck

# 타입 체크 + 빌드 (배포 전 필수)
npm run check

# 빠른 프로젝트 상태 체크
npm run quick-check

# 개발 서버 시작 + 브라우저 자동 열기
npm run dev:open
```

### Claude에게 작업 지시하기

#### 1. 코드 작성/수정
```
"AgentControl 컴포넌트에 새로고침 버튼 추가해줘"
"types.ts에 새로운 WorkflowStatus 타입 추가"
```

#### 2. 버그 수정
```
"빌드 에러 해결해줘"
"타입 에러 모두 수정"
"AgentControl에서 발생하는 메모리 누수 해결"
```

#### 3. 리팩토링
```
"agentTeam.ts의 중복 코드 제거"
"WriterAgent를 더 간결하게 리팩토링"
```

#### 4. 테스트 및 검증
```
"변경사항 커밋하기 전에 전체 체크해줘"
"프로덕션 빌드 테스트 후 문제 없으면 커밋"
```

#### 5. 문서화
```
"새로운 워크플로우 사용법 문서에 추가"
"CLAUDE.md에 이번 실수 기록"
```

---

## 고급 기능

### 1. 커스텀 서브 에이전트 생성

특정 작업을 자동화하는 에이전트를 만들 수 있습니다.

**예시: Code Simplifier Agent**
```
새로운 에이전트 만들어줘:
- 이름: CodeSimplifier
- 역할: 복잡한 코드를 간단하게 리팩토링
- 실행 조건: 함수가 50줄 이상일 때
```

**예시: Test Validator Agent**
```
테스트 검증 에이전트 생성:
- 코드 변경 시 자동으로 타입 체크
- 빌드 성공 확인
- 주요 기능 동작 테스트
- 결과 리포트 생성
```

### 2. Post-Tool Hook 활용

코드 작성 후 자동으로 포매팅하도록 설정:

```json
// .claude/hooks.json
{
  "post-edit": "prettier --write ${file}",
  "post-write": "prettier --write ${file}"
}
```

### 3. 워크플로우 자동화

반복되는 작업 패턴을 저장:

```bash
# .claude/workflows/deploy-check.sh
#!/bin/bash
echo "🚀 Deployment Pre-check..."
npm run typecheck
npm run build
npm run quick-check
echo "✅ Ready to deploy!"
```

### 4. 컨텍스트 관리

대화가 길어지면 컨텍스트를 정리:

```
"지금까지의 대화 요약해서 새로운 세션에서 이어서 작업할 수 있게 정리해줘"
```

---

## 트러블슈팅

### 문제 1: Claude가 같은 실수를 반복함

**해결:**
```
"CLAUDE.md에 이번 실수 기록하고 앞으로 주의하도록 규칙 추가해줘"
```

### 문제 2: 빌드는 성공하는데 브라우저에서 에러

**해결:**
```
"브라우저 콘솔 에러 확인해서 런타임 에러 수정해줘"
```

### 문제 3: HMR이 작동하지 않음

**해결:**
```bash
# 개발 서버 재시작
npm run dev
```

### 문제 4: 타입 에러가 계속 발생

**해결:**
```
"CLAUDE.md의 TypeScript 규칙 참고해서 모든 타입 에러 수정해줘"
```

---

## 실전 예제

### 예제 1: 새로운 기능 추가 (처음부터 끝까지)

```
1. 요청: "Settings 페이지에 다크모드 토글 추가해줘"

2. Claude 응답: "플랜 모드로 진행할까요?"

3. 승인 후 Claude가 수행:
   - 컴포넌트 구조 분석
   - 다크모드 state 추가
   - UI 컴포넌트 작성
   - 스타일 적용
   - 타입 체크
   - 빌드 테스트
   - Git 커밋

4. 마무리: "브라우저에서 동작 확인해줘"
```

### 예제 2: 버그 수정 워크플로우

```
1. 문제 발견: "AgentControl에서 메모리 누수 발생"

2. Claude에게 지시:
   "AgentControl 컴포넌트 분석해서:
   1. 메모리 누수 원인 찾기
   2. 수정 방안 제안
   3. 수정 후 검증
   4. 커밋"

3. Claude가 자동으로:
   - 코드 분석
   - useEffect cleanup 함수 추가
   - 타입 체크
   - 빌드 테스트
   - Git 커밋 with 상세한 메시지
```

### 예제 3: 리팩토링 + 문서화

```
"agentTeam.ts를 더 간결하게 리팩토링하고,
변경 사항을 CLAUDE.md에 기록해줘.
그리고 커밋하기 전에 전체 체크해서 문제 없으면 커밋까지 완료해줘."
```

---

## 최적화 팁

### 1. 명확한 지시
❌ "코드 좀 고쳐줘"
✅ "AgentControl의 메모리 누수를 수정하고 타입 체크 후 커밋해줘"

### 2. 단계별 지시
❌ "모든 기능 한 번에 추가해줘"
✅ "1단계: UI 추가, 2단계: 로직 구현, 3단계: 테스트"

### 3. 검증 포함
❌ "수정했어"
✅ "수정 완료. 타입 체크와 빌드 테스트 모두 통과했습니다."

### 4. 컨텍스트 제공
❌ "이거 고쳐줘"
✅ "CLAUDE.md의 TypeScript 규칙에 따라 이 타입 에러 수정해줘"

---

## 치트 시트

### 자주 쓰는 패턴

```bash
# 🔧 개발
"타입 체크 → 수정 → 빌드 테스트 → 커밋"

# 🐛 버그 수정
"에러 분석 → 수정 → 검증 → 커밋"

# ✨ 새 기능
"/plan 기능 구현 → 승인 → 자동 실행"

# 📝 문서화
"코드 변경 → 문서 업데이트 → 커밋"

# 🚀 배포 준비
"npm run check → 성공 시 커밋 → 푸시"
```

### 단축 명령어

```bash
# 빠른 체크
npm run check

# 타입만 체크
npm run typecheck

# 프로젝트 상태 전체 확인
npm run quick-check
```

---

## 추가 리소스

- [CLAUDE.md](../CLAUDE.md) - 프로젝트 규칙
- [Multi-Agent System](MULTI_AGENT_SYSTEM.md) - 에이전트 시스템 가이드
- [Integration Examples](AGENT_INTEGRATION_EXAMPLES.md) - 통합 예제

---

**Made with 🤖 Claude Code**
**Last Updated**: 2025-02-02

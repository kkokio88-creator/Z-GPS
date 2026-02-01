# Z-GPS Claude Code Skills

프로젝트 고도화를 위한 전문 스킬 모음입니다.

## 📦 설치된 스킬 목록

### 1. 🏗️ build-validator
**설명**: 프로덕션 빌드 검증 및 품질 체크
**사용법**:
```bash
claude skill run build-validator
```
**기능**:
- TypeScript 타입 체크
- 프로덕션 빌드 실행
- 번들 크기 확인
- 필수 파일 검증

**언제 사용**:
- 배포 전 최종 검증
- PR 머지 전 품질 체크
- CI/CD 파이프라인에서 자동 실행

---

### 2. 🔍 code-reviewer
**설명**: 코드 변경사항 자동 리뷰 및 품질 검사
**사용법**:
```bash
claude skill run code-reviewer
```
**기능**:
- `any` 타입 사용 검사
- Import 정리 상태 확인
- 네이밍 컨벤션 검증
- 환경 변수 사용 패턴 체크
- Console.log 조건부 사용 확인

**언제 사용**:
- 코드 작성 후 자동 검토
- 커밋 전 품질 체크
- 코드 리뷰 준비

---

### 3. 🤖 agent-tester
**설명**: Multi-Agent 시스템 통합 테스트
**사용법**:
```bash
claude skill run agent-tester
```
**기능**:
- 에이전트 초기화 테스트
- 에이전트 간 통신 검증
- 워크플로우 실행 테스트
- 태스크 관리 기능 검증

**언제 사용**:
- Agent 시스템 변경 후
- 새로운 워크플로우 추가 시
- 배포 전 통합 테스트

---

### 4. 🔐 security-checker
**설명**: 보안 취약점 검사 및 API 키 노출 방지
**사용법**:
```bash
claude skill run security-checker
```
**기능**:
- 하드코딩된 API 키 탐지 (자동 차단)
- 환경 변수 파일 커밋 방지
- SQL Injection 패턴 검사
- XSS 취약점 검사
- eval() 사용 경고

**언제 사용**:
- 모든 커밋 전 (자동 실행)
- 보안 감사 시
- 코드 리뷰 시

---

### 5. ⚡ performance-analyzer
**설명**: React 성능 분석 및 최적화 제안
**사용법**:
```bash
claude skill run performance-analyzer
```
**기능**:
- 번들 크기 분석
- 컴포넌트 복잡도 측정
- 메모리 누수 탐지
- 최적화 기회 제안

**언제 사용**:
- 성능 이슈 발견 시
- 새로운 기능 추가 후
- 정기적인 성능 체크

---

### 6. 📝 doc-generator
**설명**: 자동 문서 생성 및 업데이트
**사용법**:
```bash
claude skill run doc-generator
```
**기능**:
- API 레퍼런스 자동 생성
- 컴포넌트 문서화
- 타입 정의 문서화
- Changelog 자동 업데이트

**언제 사용**:
- 새로운 기능 추가 시
- API 변경 시
- 릴리스 준비 시

---

### 7. 📦 git-helper
**설명**: Git 작업 자동화 및 커밋 메시지 생성
**사용법**:
```bash
# Smart Commit (분석 + 메시지 생성 + 커밋)
claude skill run git-helper --workflow smart-commit

# Feature Branch 생성
claude skill run git-helper --workflow feature-branch --name "new-feature"

# Quick Push
claude skill run git-helper --workflow quick-push

# Release 준비
claude skill run git-helper --workflow release-prep
```
**기능**:
- 변경사항 자동 분석
- Conventional Commits 형식 메시지 생성
- Pre-commit 체크 자동 실행
- Feature branch 관리
- Release 자동화

**언제 사용**:
- 모든 커밋 시 (권장)
- 새로운 기능 개발 시작 시
- 배포 준비 시

---

### 8. 📊 project-manager
**설명**: 프로젝트 관리 및 작업 추적
**사용법**:
```bash
# 프로젝트 상태 리포트
claude skill run project-manager --report status

# TODO 추적
claude skill run project-manager --report tasks

# 의존성 체크
claude skill run project-manager --check dependencies

# 코드 품질 메트릭
claude skill run project-manager --metrics quality
```
**기능**:
- 프로젝트 상태 대시보드
- TODO/FIXME 추적
- 의존성 관리
- 코드 품질 메트릭

**언제 사용**:
- 주간 프로젝트 리뷰
- 의존성 업데이트 전
- 코드 품질 개선 시

---

## 🚀 통합 워크플로우

### 배포 전 체크리스트
```bash
# 1. 보안 검사
claude skill run security-checker

# 2. 타입 체크 + 빌드
claude skill run build-validator

# 3. 성능 분석
claude skill run performance-analyzer

# 4. Agent 시스템 테스트
claude skill run agent-tester

# 5. 문서 업데이트
claude skill run doc-generator

# 6. Git 커밋 및 푸시
claude skill run git-helper --workflow smart-commit
```

### 일일 개발 워크플로우
```bash
# 아침: 프로젝트 상태 확인
claude skill run project-manager --report status

# 코드 작성 중: 자동 리뷰
claude skill run code-reviewer

# 커밋 전: 보안 + 품질 체크
claude skill run security-checker
claude skill run git-helper --workflow smart-commit
```

### 주간 유지보수
```bash
# 의존성 체크
claude skill run project-manager --check dependencies

# 성능 분석
claude skill run performance-analyzer

# TODO 정리
claude skill run project-manager --report tasks
```

---

## 🔧 커스터마이징

각 스킬의 JSON 파일을 수정하여 프로젝트에 맞게 조정할 수 있습니다.

**예시: security-checker 화이트리스트 추가**
```json
{
  "whitelist": [
    "// SECURITY: Reviewed and approved",
    "// @security-approved",
    "// YOUR_CUSTOM_MARKER"
  ]
}
```

---

## 📚 추가 리소스

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 규칙
- [CLAUDE_CODE_GUIDE.md](../../docs/CLAUDE_CODE_GUIDE.md) - Claude Code 사용 가이드
- [Multi-Agent System](../../docs/MULTI_AGENT_SYSTEM.md) - 에이전트 시스템

---

**Made with 🤖 Claude Code Skills**

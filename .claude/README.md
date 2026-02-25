# Z-GPS Claude Code 완전 설정 가이드

## 📋 설정 파일 구조

```
.claude/
├── settings.json          # 기본 설정 및 권한
├── hooks.json            # 자동화 훅 설정
├── workflows.json        # 워크플로우 및 자동 반복
├── mcp-config.json       # MCP 서버 및 도구 권한
├── skills/               # 8개 전문 스킬
│   ├── build-validator.json
│   ├── code-reviewer.json
│   ├── agent-tester.json
│   ├── security-checker.json
│   ├── performance-analyzer.json
│   ├── doc-generator.json
│   ├── git-helper.json
│   ├── project-manager.json
│   └── README.md
├── state/                # Agent 상태 저장
├── reports/              # 실행 리포트
└── logs/                 # 로그 파일
```

---

## 🚀 빠른 시작

### 1. 권한 사전 승인

모든 필요한 명령어가 자동 승인되도록 설정되어 있습니다:
- ✅ npm/npx 명령어
- ✅ git 명령어
- ✅ 빌드/테스트 명령어
- ✅ 파일 시스템 작업

### 2. 자동화 훅 활성화

다음 이벤트에서 자동으로 실행됩니다:

**커밋 전 (Pre-commit):**
- 🔐 보안 검사 (차단)
- 📝 타입 체크
- 🎨 린트 체크

**파일 수정 후 (Post-edit):**
- 📦 Import 자동 정리
- 🎨 코드 포매팅
- ⚛️ React Hooks 검증

**푸시 전 (Pre-push):**
- 🏗️ 전체 빌드 테스트
- 🤖 Agent 시스템 테스트

### 3. 스킬 사용

```bash
# 수동 실행
claude skill run <skill-name>

# 예시
claude skill run security-checker
claude skill run build-validator
claude skill run agent-tester
```

---

## 🔧 고급 기능

### 1. 무한 반복 자동 수정

문제가 해결될 때까지 자동으로 시도합니다:

```
Claude, 이 에러 해결될 때까지 자동으로 수정해줘
```

**동작 방식:**
1. 에러 분석
2. 해결 방안 제안
3. 수정 적용
4. 검증 (빌드 + 타입 체크)
5. 실패 시 다시 1번부터 (최대 10회)

### 2. 백그라운드 장기 작업

```
Claude, 백그라운드에서 전체 빌드 실행해줘
```

**모니터링:**
- 5초마다 진행 상황 체크
- 완료 시 자동 알림
- 상세 리포트 생성

### 3. Agent 학습 루프

Agent 시스템이 자동으로 학습합니다:
- ✅ 성공 패턴 수집 → Shared Memory 저장
- ❌ 실패 패턴 분석 → 전략 개선
- 🔄 1시간마다 자동 최적화

### 4. 스마트 재시도

실패 유형에 따라 지능적으로 재시도:
- **네트워크 에러**: 지수 백오프 (1초 → 2초 → 4초 ...)
- **Rate Limit**: 1분 대기 후 재시도
- **일시적 에러**: 즉시 재시도 (최대 3회)
- **영구적 에러**: 중단 + 알림

---

## 📚 워크플로우 예시

### 예시 1: 새 기능 개발 (완전 자동화)

```
사용자: "Settings에 다크모드 토글 추가해줘"

Claude의 자동 워크플로우:
1. 📋 플랜 모드로 계획 수립
2. 💻 코드 작성
3. 📦 Import 자동 정리 (post-edit hook)
4. 🎨 코드 포매팅 (post-edit hook)
5. ⚛️ React Hooks 검증 (post-edit hook)
6. 🔍 코드 리뷰 (code-reviewer skill)
7. 🔐 보안 검사 (security-checker skill)
8. 📝 타입 체크
9. 🏗️ 빌드 테스트
10. 📚 문서 업데이트
11. 📦 Git 커밋 (conventional commits)
12. 🚀 푸시

실패 시: auto-fix-until-success 워크플로우 자동 실행
```

### 예시 2: 에러 자동 수정

```
사용자: "빌드 에러 해결해줘"

Claude의 자동 워크플로우:
1. 🔍 에러 분석
2. 💡 해결 방안 제안
3. 🔧 수정 적용
4. ✅ 빌드 테스트
5. ❌ 실패 → 다른 방법 시도
6. 🔄 성공할 때까지 반복 (최대 10회)
7. ✅ 성공 → 자동 커밋
```

### 예시 3: 지속적 개선

```
사용자: "코드 품질 개선해줘"

Claude의 자동 워크플로우:
1. 📊 품질 메트릭 분석
2. 🔍 개선 기회 식별:
   - Complexity > 10인 함수 찾기
   - 중복 코드 5% 이상 찾기
   - 테스트 커버리지 < 80% 찾기
3. 🔧 자동 리팩토링
4. ✅ 회귀 테스트
5. 📈 개선되었으면 커밋
6. 🔄 더 이상 개선할 것이 없을 때까지 반복
```

---

## 🛠️ MCP 서버 통합

### 활성화된 서버

**1. Filesystem**
```bash
# 파일 시스템 전체 접근
- 읽기: 허용
- 쓰기: 허용
- 삭제: 확인 필요
- 실행: 확인 필요
```

**2. GitHub**
```bash
# GitHub API 통합
- Issue 생성
- PR 생성
- 코드 검색
- 파일 내용 가져오기
```

**3. Brave Search**
```bash
# 웹 검색 기능
- 기술 문서 검색
- 에러 해결책 찾기
- 라이브러리 문서 조회
```

### 향후 확장 가능 (현재 비활성)

- PostgreSQL 데이터베이스
- Slack 통합
- Google Drive

---

## 🔐 보안 설정

### 자동 차단

다음 항목은 자동으로 차단됩니다:
- ❌ 하드코딩된 API 키
- ❌ .env 파일 커밋
- ❌ 의심스러운 명령어

### 보안 패턴 검사

자동으로 검사되는 패턴:
- `password =`
- `secret =`
- `token =`
- `api_key =`
- SQL Injection 패턴
- XSS 취약점
- `eval()` 사용

---

## 📊 모니터링 & 리포트

### 자동 생성되는 리포트

**위치:** `.claude/reports/`

1. **빌드 리포트** - 빌드 시간, 번들 크기, 에러
2. **Agent 완료 리포트** - 수행 작업, 소요 시간, 결과
3. **품질 메트릭** - 복잡도, 중복, 테스트 커버리지
4. **보안 스캔** - 발견된 취약점, 차단된 커밋

### 로그 파일

**위치:** `.claude/logs/`

- `notifications.log` - 모든 알림
- `workflows.log` - 워크플로우 실행 기록
- `errors.log` - 에러 로그

---

## 🎯 실전 활용 팁

### 1. 플랜 모드 활용

```
/plan 복잡한 작업 설명

✅ 장점:
- 작업 전체를 미리 확인
- 계획 수정 가능
- 자동 실행
```

### 2. 백그라운드 실행

```
Claude, 백그라운드에서 전체 테스트 실행하고,
그동안 나는 문서 작성할게

✅ 장점:
- 시간 절약
- 병렬 작업
- 완료 시 자동 알림
```

### 3. 여러 세션 동시 사용

```
세션 1: 코드 작성
세션 2: 문서 작성
세션 3: 테스트 실행
세션 4: 성능 분석

✅ 최대 15개 세션 병렬 실행 가능
```

### 4. 자가 검증 요청

```
Claude, 작업 완료 후:
1. 타입 체크
2. 빌드 테스트
3. Agent 시스템 테스트
4. 보안 검사
5. 결과 리포트 생성
6. 문제 없으면 커밋

✅ 한 번의 요청으로 전체 검증
```

---

## 🔄 자동화 레벨

### Level 1: 기본 (현재 활성)
- ✅ Pre-commit hooks
- ✅ Post-edit formatting
- ✅ Auto security check

### Level 2: 고급 (선택 활성화)
- 🔄 Continuous improvement loop
- 🔄 Auto-fix until success
- 🔄 Agent training loop

### Level 3: 완전 자동화 (주의 필요)
- ⚠️ Auto commit & push
- ⚠️ Auto dependency updates
- ⚠️ Auto refactoring

**설정 변경:**
```json
// .claude/settings.json
{
  "automation": {
    "level": 1,  // 1, 2, 또는 3
    "requireConfirmation": true
  }
}
```

---

## 📖 추가 리소스

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 규칙
- [CLAUDE_CODE_GUIDE.md](../../docs/CLAUDE_CODE_GUIDE.md) - 사용 가이드
- [Skills README](.claude/skills/README.md) - 스킬 상세
- [Multi-Agent System](../../docs/MULTI_AGENT_SYSTEM.md) - Agent 시스템

---

## 🆘 트러블슈팅

### 문제: Hook이 실행되지 않음
```bash
# 해결: Hook 권한 확인
chmod +x .claude/hooks/*
```

### 문제: MCP 서버 연결 실패
```bash
# 해결: 환경 변수 확인
cat .env.local
# GITHUB_TOKEN, BRAVE_API_KEY 등 확인
```

### 문제: 자동 수정이 무한 반복
```bash
# 해결: workflows.json에서 maxIterations 조정
{
  "maxIterations": 5  // 10에서 5로 줄이기
}
```

---

**Made with 🤖 Claude Code - Fully Automated**
**Last Updated**: 2025-02-02

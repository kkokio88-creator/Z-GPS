---
name: agent-test
description: Z-GPS Multi-Agent AI 시스템 통합 테스트
user_invocable: true
---

# Multi-Agent 시스템 통합 테스트

## 테스트 항목

### 1. 에이전트 Export 확인
`services/geminiAgents.ts`에서 다음 에이전트가 올바르게 export 되는지 확인:
- `structuringAgent` (NOT structureAgent)
- `suitabilityAgent` (NOT intelligenceAgent)
- `draftAgent`
- `reviewAgent`
- `consistencyAgent`

### 2. AgentTeam 초기화 검증
`services/agentTeam.ts`의 초기화 로직 확인:
- `agentTeam.initialize()` 정상 호출 가능 여부
- 모든 에이전트 등록 여부

### 3. Orchestrator 워크플로우 확인
`services/agentOrchestrator.ts`의 워크플로우:
- 오케스트레이터 시작/중지 로직
- 이벤트 리스너 등록/해제
- 태스크 관리 기능

### 4. API Client 연동 확인
`services/apiClient.ts`를 통한 Gemini API 호출:
- POST `/api/gemini/generate` 엔드포인트
- POST `/api/gemini/verify` 엔드포인트
- 에러 핸들링

### 5. 타입 안전성 확인
- `types.ts`에 정의된 Agent 관련 타입 확인
- 모든 agent 메시지에 타입이 명시되어 있는지 검증

## 실행 방법
위 항목들을 코드 읽기 + TypeScript 타입 체크로 검증합니다.
```bash
npx tsc --noEmit
```

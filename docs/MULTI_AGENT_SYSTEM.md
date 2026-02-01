# Multi-Agent AI System 🤖

## 개요

Z-GPS의 Multi-Agent System은 여러 AI 에이전트들이 협업하여 복잡한 작업을 자동으로 수행하는 고급 시스템입니다. 각 에이전트는 특화된 역할을 맡아 서로 소통하며 작업을 처리합니다.

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                   Orchestrator                          │
│  (중앙 조율자 - 태스크 관리, 메시지 라우팅, 공유 메모리)   │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
   │ ANALYZER│      │  WRITER │      │REVIEWER │
   │  분석    │      │  작성    │      │  검토   │
   └─────────┘      └─────────┘      └─────────┘
        │                 │                 │
   ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
   │RESEARCHER│     │STRATEGIST│     │OPTIMIZER│
   │  조사    │      │  전략    │      │  최적화  │
   └─────────┘      └─────────┘      └─────────┘
```

## 에이전트 역할

### 1. ANALYZER (분석 에이전트)
- **역할**: 데이터 분석 및 평가
- **기능**:
  - 회사 프로필 분석
  - 지원 자격 적합성 검토
  - 갭 분석 (강점/약점 파악)
  - 데이터 구조화

### 2. WRITER (작성 에이전트)
- **역할**: 문서 및 콘텐츠 생성
- **기능**:
  - 지원서 초안 작성
  - 섹션별 내용 생성
  - 맞춤형 콘텐츠 제작

### 3. REVIEWER (검토 에이전트)
- **역할**: 품질 검토 및 평가
- **기능**:
  - 일관성 검토
  - 품질 평가 (5개 차원)
  - 개선점 식별
  - 오류 탐지

### 4. RESEARCHER (조사 에이전트)
- **역할**: 정보 수집 및 시장 조사
- **기능**:
  - 산업 동향 조사
  - 경쟁사 분석
  - 트렌드 파악
  - 외부 데이터 수집

### 5. STRATEGIST (전략 에이전트)
- **역할**: 전략 수립 및 포지셔닝
- **기능**:
  - 대응 전략 수립
  - 포지셔닝 최적화
  - 차별화 전략 개발
  - 실행 계획 수립

### 6. OPTIMIZER (최적화 에이전트)
- **역할**: 성능 개선 및 학습
- **기능**:
  - 콘텐츠 최적화
  - 키워드 강화
  - 성공 패턴 학습
  - 지속적 개선

## 핵심 기능

### 1. 태스크 관리 시스템
```typescript
// 태스크 생성
await orchestrator.createTask({
  assignedTo: 'ANALYZER',
  type: 'ANALYZE',
  description: '회사 프로필 분석',
  context: { company, program },
  priority: 'HIGH',
  status: 'PENDING'
});
```

### 2. 에이전트 간 메시지 통신
```typescript
// 메시지 전송
await orchestrator.sendMessage({
  from: 'ANALYZER',
  to: 'WRITER',
  type: 'REQUEST',
  payload: {
    task: 'generate_draft',
    data: { application, sectionKey }
  }
});
```

### 3. 공유 메모리 시스템
```typescript
// 메모리 저장
orchestrator.addToMemory({
  type: 'INSIGHT',
  content: { companyId, strengths, gaps },
  source: 'ANALYZER',
  tags: ['company', 'analysis'],
  relevance: 0.9
});

// 메모리 조회
const insights = orchestrator.queryMemory({
  type: 'INSIGHT',
  tags: ['company']
});
```

### 4. 워크플로우 실행
```typescript
// 워크플로우 실행
await orchestrator.executeWorkflow(WORKFLOW_TEMPLATES.COMPLETE_APPLICATION);
```

## 사전 정의된 워크플로우

### 1. 지원서 완전 작성 (COMPLETE_APPLICATION)
전체 프로세스를 자동화:
1. **분석 단계**: 회사 분석 + 자격 검토 + 산업 조사
2. **전략 단계**: 갭 분석 + 포지셔닝 전략
3. **작성 단계**: 지원서 초안 생성
4. **검토 단계**: 일관성 검토 + 품질 평가 + 최적화

### 2. 빠른 검토 (QUICK_REVIEW)
작성된 지원서를 신속하게 검토:
1. 일관성 검토
2. 품질 평가
3. 개선 제안

### 3. 회사 프로필 강화 (ENHANCE_PROFILE)
회사 정보를 분석하고 강화:
1. 회사 데이터 구조화
2. 산업 트렌드 파악
3. 포지셔닝 최적화
4. 성공 패턴 학습

### 4. 자격 적합성 검토 (ELIGIBILITY_CHECK)
지원 자격을 종합 분석:
1. 자격 요건 분석
2. 갭 분석
3. 유사 사례 조사
4. 대응 전략 수립

### 5. 지속적 학습 (CONTINUOUS_LEARNING)
완료된 지원서로부터 학습:
1. 성공 패턴 추출
2. 전체 에이전트에 공유

## 사용 방법

### UI에서 사용
1. **설정 페이지** 접속
2. **Multi-Agent AI System** 섹션으로 스크롤
3. **Start System** 버튼 클릭으로 시스템 활성화
4. **Execute Workflow** 드롭다운에서 원하는 워크플로우 선택
5. **Execute** 버튼으로 실행

### 코드에서 사용
```typescript
import { orchestrator } from './services/agentOrchestrator';
import { agentTeam } from './services/agentTeam';
import { createApplicationWorkflow } from './services/agentWorkflows';

// 1. 에이전트 팀 초기화
agentTeam.initialize();

// 2. 오케스트레이터 시작
await orchestrator.start();

// 3. 커스텀 태스크 생성
await orchestrator.createTask({
  assignedTo: 'ANALYZER',
  type: 'ANALYZE',
  description: '회사 프로필 분석',
  context: { company },
  priority: 'HIGH',
  status: 'PENDING'
});

// 4. 워크플로우 실행
const workflow = createApplicationWorkflow(company, program);
await orchestrator.executeWorkflow(workflow);

// 5. 상태 조회
const state = orchestrator.getState();
const metrics = orchestrator.getMetrics();
```

## 이벤트 시스템

시스템의 상태 변화를 모니터링:

```typescript
orchestrator.on((event, data) => {
  switch(event) {
    case 'orchestrator:started':
      console.log('시스템 시작됨');
      break;
    case 'task:created':
      console.log('새 태스크 생성:', data);
      break;
    case 'task:completed':
      console.log('태스크 완료:', data);
      break;
    case 'workflow:started':
      console.log('워크플로우 시작:', data);
      break;
    case 'workflow:completed':
      console.log('워크플로우 완료:', data);
      break;
  }
});
```

## 성능 메트릭

시스템은 다음 메트릭을 추적합니다:
- **총 태스크 수**: 생성된 모든 태스크
- **완료된 태스크**: 성공적으로 완료된 태스크
- **실패한 태스크**: 실패한 태스크
- **평균 처리 시간**: 태스크 평균 소요 시간
- **에이전트별 통계**: 각 에이전트의 성공률, 완료 수

## 고급 기능

### 태스크 의존성
태스크 간 의존성을 설정하여 순차 실행:
```typescript
const task1 = await orchestrator.createTask({ ... });
const task2 = await orchestrator.createTask({
  ...
  dependencies: [task1.id]  // task1 완료 후 실행
});
```

### 우선순위 시스템
태스크에 우선순위 부여:
- `CRITICAL`: 최우선 처리
- `HIGH`: 높은 우선순위
- `MEDIUM`: 중간 우선순위
- `LOW`: 낮은 우선순위

### 에이전트 성능 추적
각 에이전트의 성능을 실시간 모니터링:
```typescript
const metrics = orchestrator.getMetrics();
metrics.agentStats.forEach(agent => {
  console.log(`${agent.role}: ${agent.performance.successRate * 100}%`);
});
```

## 장점

1. **자동화**: 복잡한 작업을 자동으로 처리
2. **확장성**: 새로운 에이전트를 쉽게 추가 가능
3. **협업**: 에이전트 간 지식 공유 및 협업
4. **학습**: 성공 사례로부터 지속적 학습
5. **모니터링**: 실시간 상태 추적 및 메트릭
6. **유연성**: 커스텀 워크플로우 생성 가능

## 향후 개선 계획

- [ ] 에이전트별 AI 모델 선택 기능
- [ ] 더 많은 사전 정의 워크플로우
- [ ] 에이전트 간 투표/합의 시스템
- [ ] 실시간 협업 시각화
- [ ] 성능 최적화 및 캐싱
- [ ] 에이전트 학습 히스토리 추적
- [ ] 워크플로우 템플릿 저장/불러오기

## 문제 해결

### 에이전트가 응답하지 않음
- 시스템이 `isActive: true` 상태인지 확인
- Gemini API 키가 올바르게 설정되었는지 확인
- 브라우저 콘솔에서 에러 로그 확인

### 워크플로우가 진행되지 않음
- 태스크 의존성이 올바르게 설정되었는지 확인
- 이전 태스크가 실패하지 않았는지 확인
- `Reset` 버튼으로 시스템 초기화 후 재시도

### 성능 저하
- 공유 메모리가 과도하게 쌓이지 않았는지 확인 (자동으로 100개 제한)
- 브라우저 재시작으로 메모리 정리
- 불필요한 태스크 제거

---

**Made with 🤖 Multi-Agent Collaboration**

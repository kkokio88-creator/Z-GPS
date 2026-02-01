import { orchestrator } from './agentOrchestrator';
import { agentTeam } from './agentTeam';
import { Company, SupportProgram, Application } from '../types';
import {
  createApplicationWorkflow,
  createReviewWorkflow,
  createEnhanceProfileWorkflow,
  createEligibilityWorkflow,
} from './agentWorkflows';

/**
 * Agent Integration Helpers
 *
 * 기존 UI 컴포넌트에서 Multi-Agent System을 쉽게 사용할 수 있도록 하는 헬퍼 함수들입니다.
 */

let isInitialized = false;

// 에이전트 시스템 초기화 (앱 시작 시 한 번만 호출)
export const initializeAgentSystem = async (): Promise<void> => {
  if (isInitialized) return;

  agentTeam.initialize();
  await orchestrator.start();
  isInitialized = true;

  if (import.meta.env.DEV) {
    console.log('🤖 Multi-Agent System initialized and ready');
  }
};

// 시스템 상태 확인
export const isAgentSystemReady = (): boolean => {
  return isInitialized && orchestrator.getState().isActive;
};

/**
 * 지원서 자동 생성
 * ApplicationEditor에서 "AI로 전체 작성" 버튼 클릭 시 사용
 */
export const generateApplicationWithAgents = async (
  company: Company,
  program: SupportProgram,
  onProgress?: (stage: string, progress: number) => void
): Promise<void> => {
  if (!isInitialized) {
    await initializeAgentSystem();
  }

  // 진행 상황 모니터링
  const progressListener = (event: string, data: unknown) => {
    if (event === 'workflow:started' || event === 'workflow:completed') {
      const workflow = data as { name: string; stage: string; progress: number };
      if (onProgress) {
        onProgress(workflow.stage, workflow.progress);
      }
    }
  };

  orchestrator.on(progressListener);

  try {
    const workflow = createApplicationWorkflow(company, program);
    await orchestrator.executeWorkflow(workflow);

    if (import.meta.env.DEV) {
      console.log('✅ Application generation workflow completed');
    }
  } finally {
    orchestrator.off(progressListener);
  }
};

/**
 * 지원서 빠른 검토
 * ApplicationEditor에서 "검토 요청" 버튼 클릭 시 사용
 */
export const reviewApplicationWithAgents = async (
  application: Application,
  onProgress?: (stage: string, progress: number) => void
): Promise<void> => {
  if (!isInitialized) {
    await initializeAgentSystem();
  }

  const progressListener = (event: string, data: unknown) => {
    if (event === 'workflow:started' || event === 'workflow:completed') {
      const workflow = data as { name: string; stage: string; progress: number };
      if (onProgress) {
        onProgress(workflow.stage, workflow.progress);
      }
    }
  };

  orchestrator.on(progressListener);

  try {
    const workflow = createReviewWorkflow(application);
    await orchestrator.executeWorkflow(workflow);

    if (import.meta.env.DEV) {
      console.log('✅ Review workflow completed');
    }
  } finally {
    orchestrator.off(progressListener);
  }
};

/**
 * 회사 프로필 자동 강화
 * CompanyProfile에서 "AI로 강화" 버튼 클릭 시 사용
 */
export const enhanceCompanyProfileWithAgents = async (
  company: Company,
  onProgress?: (stage: string, progress: number) => void
): Promise<void> => {
  if (!isInitialized) {
    await initializeAgentSystem();
  }

  const progressListener = (event: string, data: unknown) => {
    if (event === 'workflow:started' || event === 'workflow:completed') {
      const workflow = data as { name: string; stage: string; progress: number };
      if (onProgress) {
        onProgress(workflow.stage, workflow.progress);
      }
    }
  };

  orchestrator.on(progressListener);

  try {
    const workflow = createEnhanceProfileWorkflow(company);
    await orchestrator.executeWorkflow(workflow);

    if (import.meta.env.DEV) {
      console.log('✅ Profile enhancement workflow completed');
    }
  } finally {
    orchestrator.off(progressListener);
  }
};

/**
 * 자격 적합성 자동 검토
 * ProgramExplorer에서 프로그램 선택 시 자동으로 실행
 */
export const checkEligibilityWithAgents = async (
  company: Company,
  program: SupportProgram,
  onProgress?: (stage: string, progress: number) => void
): Promise<void> => {
  if (!isInitialized) {
    await initializeAgentSystem();
  }

  const progressListener = (event: string, data: unknown) => {
    if (event === 'workflow:started' || event === 'workflow:completed') {
      const workflow = data as { name: string; stage: string; progress: number };
      if (onProgress) {
        onProgress(workflow.stage, workflow.progress);
      }
    }
  };

  orchestrator.on(progressListener);

  try {
    const workflow = createEligibilityWorkflow(company, program);
    await orchestrator.executeWorkflow(workflow);

    if (import.meta.env.DEV) {
      console.log('✅ Eligibility check workflow completed');
    }
  } finally {
    orchestrator.off(progressListener);
  }
};

/**
 * 특정 섹션만 AI로 작성
 * 단일 섹션 작성 시 사용
 */
export const generateSectionWithAgents = async (
  application: Application,
  sectionKey: string,
  requirement: string
): Promise<void> => {
  if (!isInitialized) {
    await initializeAgentSystem();
  }

  await orchestrator.createTask({
    assignedTo: 'WRITER',
    type: 'WRITE',
    description: `섹션 작성: ${sectionKey}`,
    context: {
      application,
      additionalData: { sectionKey, requirement },
    },
    priority: 'HIGH',
    status: 'PENDING',
  });

  if (import.meta.env.DEV) {
    console.log(`📝 Section generation task created: ${sectionKey}`);
  }
};

/**
 * 실시간 에이전트 상태 가져오기
 */
export const getAgentSystemStatus = () => {
  return {
    isReady: isAgentSystemReady(),
    state: orchestrator.getState(),
    metrics: orchestrator.getMetrics(),
  };
};

/**
 * 에이전트 시스템 리셋
 * 문제 발생 시 초기화용
 */
export const resetAgentSystem = (): void => {
  orchestrator.reset();
  if (import.meta.env.DEV) {
    console.log('🔄 Agent system reset');
  }
};

/**
 * 공유 메모리에서 인사이트 가져오기
 */
export const getInsightsFromMemory = (tags: string[]) => {
  return orchestrator.queryMemory({
    type: 'INSIGHT',
    tags,
  });
};

/**
 * 성공 패턴 학습
 * 지원서 제출 완료 시 호출
 */
export const learnFromSuccessfulApplication = async (application: Application): Promise<void> => {
  if (!isInitialized) {
    await initializeAgentSystem();
  }

  await orchestrator.createTask({
    assignedTo: 'OPTIMIZER',
    type: 'OPTIMIZE',
    description: '성공 사례 학습',
    context: { application },
    priority: 'LOW',
    status: 'PENDING',
  });

  if (import.meta.env.DEV) {
    console.log('📚 Learning task created for application:', application.id);
  }
};

// Export all functions
export const AgentIntegration = {
  initialize: initializeAgentSystem,
  isReady: isAgentSystemReady,
  generateApplication: generateApplicationWithAgents,
  reviewApplication: reviewApplicationWithAgents,
  enhanceProfile: enhanceCompanyProfileWithAgents,
  checkEligibility: checkEligibilityWithAgents,
  generateSection: generateSectionWithAgents,
  getStatus: getAgentSystemStatus,
  reset: resetAgentSystem,
  getInsights: getInsightsFromMemory,
  learnFromSuccess: learnFromSuccessfulApplication,
};

import { WorkflowTemplate, Company, SupportProgram, Application } from "../types";

/**
 * Agent Workflow Templates
 *
 * 자주 사용되는 작업 흐름을 미리 정의한 워크플로우 템플릿들입니다.
 */

export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  // ===== 지원서 전체 작성 워크플로우 =====
  COMPLETE_APPLICATION: {
    id: 'wf_complete_application',
    name: '지원서 완전 작성',
    description: '회사 분석부터 지원서 작성, 검토까지 전체 프로세스를 자동으로 수행합니다.',
    stages: [
      {
        id: 'stage_1_analyze',
        name: '1단계: 분석',
        agentRoles: ['ANALYZER', 'RESEARCHER'],
        tasks: [
          {
            assignedTo: 'ANALYZER',
            type: 'ANALYZE',
            description: '회사 프로필 분석',
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            assignedTo: 'ANALYZER',
            type: 'ANALYZE',
            description: '지원 자격 분석',
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            assignedTo: 'RESEARCHER',
            type: 'RESEARCH',
            description: '산업 동향 조사',
            priority: 'MEDIUM',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_2_strategy',
        name: '2단계: 전략 수립',
        agentRoles: ['STRATEGIST', 'ANALYZER'],
        tasks: [
          {
            assignedTo: 'ANALYZER',
            type: 'ANALYZE',
            description: '갭 분석 수행',
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            assignedTo: 'STRATEGIST',
            type: 'STRATEGIZE',
            description: '포지셔닝 전략 수립',
            priority: 'HIGH',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_3_writing',
        name: '3단계: 작성',
        agentRoles: ['WRITER'],
        tasks: [
          {
            assignedTo: 'WRITER',
            type: 'WRITE',
            description: '지원서 초안 작성',
            priority: 'CRITICAL',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_4_review',
        name: '4단계: 검토 및 최적화',
        agentRoles: ['REVIEWER', 'OPTIMIZER'],
        tasks: [
          {
            assignedTo: 'REVIEWER',
            type: 'REVIEW',
            description: '일관성 검토',
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            assignedTo: 'REVIEWER',
            type: 'REVIEW',
            description: '품질 평가',
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            assignedTo: 'OPTIMIZER',
            type: 'OPTIMIZE',
            description: '컨텐츠 최적화',
            priority: 'MEDIUM',
            status: 'PENDING',
          },
        ],
      },
    ],
  },

  // ===== 빠른 지원서 검토 워크플로우 =====
  QUICK_REVIEW: {
    id: 'wf_quick_review',
    name: '빠른 검토',
    description: '작성된 지원서를 빠르게 검토하고 개선점을 제안합니다.',
    stages: [
      {
        id: 'stage_1_review',
        name: '검토',
        agentRoles: ['REVIEWER'],
        tasks: [
          {
            assignedTo: 'REVIEWER',
            type: 'REVIEW',
            description: '일관성 검토',
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            assignedTo: 'REVIEWER',
            type: 'REVIEW',
            description: '품질 평가',
            priority: 'HIGH',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_2_optimize',
        name: '최적화',
        agentRoles: ['OPTIMIZER'],
        tasks: [
          {
            assignedTo: 'OPTIMIZER',
            type: 'OPTIMIZE',
            description: '개선 제안',
            priority: 'MEDIUM',
            status: 'PENDING',
          },
        ],
      },
    ],
  },

  // ===== 회사 프로필 강화 워크플로우 =====
  ENHANCE_PROFILE: {
    id: 'wf_enhance_profile',
    name: '회사 프로필 강화',
    description: '회사 정보를 분석하고 핵심 경쟁력을 도출하여 프로필을 강화합니다.',
    stages: [
      {
        id: 'stage_1_analyze',
        name: '분석',
        agentRoles: ['ANALYZER', 'RESEARCHER'],
        tasks: [
          {
            assignedTo: 'ANALYZER',
            type: 'ANALYZE',
            description: '회사 데이터 구조화',
            priority: 'HIGH',
            status: 'PENDING',
          },
          {
            assignedTo: 'RESEARCHER',
            type: 'RESEARCH',
            description: '산업 트렌드 파악',
            priority: 'MEDIUM',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_2_strategize',
        name: '전략화',
        agentRoles: ['STRATEGIST'],
        tasks: [
          {
            assignedTo: 'STRATEGIST',
            type: 'STRATEGIZE',
            description: '포지셔닝 최적화',
            priority: 'HIGH',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_3_learn',
        name: '학습',
        agentRoles: ['OPTIMIZER'],
        tasks: [
          {
            assignedTo: 'OPTIMIZER',
            type: 'OPTIMIZE',
            description: '성공 패턴 학습',
            priority: 'LOW',
            status: 'PENDING',
          },
        ],
      },
    ],
  },

  // ===== 자격 적합성 검토 워크플로우 =====
  ELIGIBILITY_CHECK: {
    id: 'wf_eligibility_check',
    name: '자격 적합성 검토',
    description: '지원 사업에 대한 회사의 적합성을 종합적으로 분석합니다.',
    stages: [
      {
        id: 'stage_1_analyze',
        name: '분석',
        agentRoles: ['ANALYZER'],
        tasks: [
          {
            assignedTo: 'ANALYZER',
            type: 'ANALYZE',
            description: '자격 요건 분석',
            priority: 'CRITICAL',
            status: 'PENDING',
          },
          {
            assignedTo: 'ANALYZER',
            type: 'ANALYZE',
            description: '갭 분석',
            priority: 'HIGH',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_2_research',
        name: '조사',
        agentRoles: ['RESEARCHER'],
        tasks: [
          {
            assignedTo: 'RESEARCHER',
            type: 'RESEARCH',
            description: '유사 사례 조사',
            priority: 'MEDIUM',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_3_strategy',
        name: '전략',
        agentRoles: ['STRATEGIST'],
        tasks: [
          {
            assignedTo: 'STRATEGIST',
            type: 'STRATEGIZE',
            description: '대응 전략 수립',
            priority: 'HIGH',
            status: 'PENDING',
          },
        ],
      },
    ],
  },

  // ===== 학습 기반 개선 워크플로우 =====
  CONTINUOUS_LEARNING: {
    id: 'wf_continuous_learning',
    name: '지속적 학습 및 개선',
    description: '완료된 지원서로부터 학습하여 시스템을 개선합니다.',
    stages: [
      {
        id: 'stage_1_learn',
        name: '학습',
        agentRoles: ['OPTIMIZER'],
        tasks: [
          {
            assignedTo: 'OPTIMIZER',
            type: 'OPTIMIZE',
            description: '성공 패턴 추출',
            priority: 'MEDIUM',
            status: 'PENDING',
          },
        ],
      },
      {
        id: 'stage_2_share',
        name: '공유',
        agentRoles: ['OPTIMIZER'],
        tasks: [
          {
            assignedTo: 'OPTIMIZER',
            type: 'OPTIMIZE',
            description: '전체 에이전트에 학습 내용 공유',
            priority: 'LOW',
            status: 'PENDING',
          },
        ],
      },
    ],
  },
};

/**
 * Workflow Helper Functions
 */

export const createApplicationWorkflow = (company: Company, program: SupportProgram): WorkflowTemplate => {
  const template = { ...WORKFLOW_TEMPLATES.COMPLETE_APPLICATION };

  // Inject context into tasks
  template.stages = template.stages.map(stage => ({
    ...stage,
    tasks: stage.tasks.map(task => ({
      ...task,
      context: { company, program },
    })),
  }));

  return template;
};

export const createReviewWorkflow = (application: Application): WorkflowTemplate => {
  const template = { ...WORKFLOW_TEMPLATES.QUICK_REVIEW };

  template.stages = template.stages.map(stage => ({
    ...stage,
    tasks: stage.tasks.map(task => ({
      ...task,
      context: { application },
    })),
  }));

  return template;
};

export const createEnhanceProfileWorkflow = (company: Company): WorkflowTemplate => {
  const template = { ...WORKFLOW_TEMPLATES.ENHANCE_PROFILE };

  template.stages = template.stages.map(stage => ({
    ...stage,
    tasks: stage.tasks.map(task => ({
      ...task,
      context: { company },
    })),
  }));

  return template;
};

export const createEligibilityWorkflow = (company: Company, program: SupportProgram): WorkflowTemplate => {
  const template = { ...WORKFLOW_TEMPLATES.ELIGIBILITY_CHECK };

  template.stages = template.stages.map(stage => ({
    ...stage,
    tasks: stage.tasks.map(task => ({
      ...task,
      context: { company, program },
    })),
  }));

  return template;
};

export const createLearningWorkflow = (application: Application): WorkflowTemplate => {
  const template = { ...WORKFLOW_TEMPLATES.CONTINUOUS_LEARNING };

  template.stages = template.stages.map(stage => ({
    ...stage,
    tasks: stage.tasks.map(task => ({
      ...task,
      context: { application },
    })),
  }));

  return template;
};

// Get workflow by ID
export const getWorkflow = (id: string): WorkflowTemplate | undefined => {
  return Object.values(WORKFLOW_TEMPLATES).find(wf => wf.id === id);
};

// List all available workflows
export const listWorkflows = (): WorkflowTemplate[] => {
  return Object.values(WORKFLOW_TEMPLATES);
};

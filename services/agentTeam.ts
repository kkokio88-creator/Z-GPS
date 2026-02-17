import {
  AgentRole,
  AgentMessage,
  Company,
  SupportProgram,
  Application,
  SharedMemory,
  EligibilityStatus,
} from "../types";
import { orchestrator } from "./agentOrchestrator";
import {
  suitabilityAgent,
  structuringAgent,
  draftAgent,
  reviewAgent,
  consistencyAgent,
  ontologyLearningAgent,
} from "./geminiAgents";
import { getStoredCompany } from "./storageService";

/**
 * Multi-Agent Team
 *
 * 각 에이전트는 특화된 역할을 수행하며 orchestrator를 통해 협업합니다.
 */

// ===== Base Agent Class =====
abstract class BaseAgent {
  protected role: AgentRole;

  constructor(role: AgentRole) {
    this.role = role;
    this.registerWithOrchestrator();
  }

  private registerWithOrchestrator(): void {
    orchestrator.registerMessageHandler(this.role, async (msg) => {
      await this.handleMessage(msg);
    });
  }

  protected async handleMessage(message: AgentMessage): Promise<void> {
    if (import.meta.env.DEV) {
      console.log(`${this.role} received message:`, message.type);
    }

    switch (message.type) {
      case 'REQUEST':
        await this.handleRequest(message);
        break;
      case 'QUERY':
        await this.handleQuery(message);
        break;
      case 'NOTIFICATION':
        await this.handleNotification(message);
        break;
    }
  }

  protected abstract handleRequest(message: AgentMessage): Promise<void>;
  protected abstract handleQuery(message: AgentMessage): Promise<void>;
  protected abstract handleNotification(message: AgentMessage): Promise<void>;

  protected async sendMessage(
    to: AgentRole | 'BROADCAST',
    type: AgentMessage['type'],
    payload: AgentMessage['payload']
  ): Promise<void> {
    await orchestrator.sendMessage({
      from: this.role,
      to,
      type,
      payload,
    });
  }

  protected addMemory(type: SharedMemory['type'], content: unknown, tags: string[], relevance: number): void {
    orchestrator.addToMemory({
      type,
      content,
      source: this.role,
      tags,
      relevance,
    });
  }
}

// ===== Analyzer Agent =====
class AnalyzerAgent extends BaseAgent {
  constructor() {
    super('ANALYZER');
  }

  protected async handleRequest(message: AgentMessage): Promise<void> {
    const { task, data } = message.payload;

    if (task === 'analyze_company') {
      const company = data as Company;
      await this.analyzeCompany(company);
    } else if (task === 'analyze_eligibility') {
      const { company, program } = data as { company: Company; program: SupportProgram };
      await this.analyzeEligibility(company, program);
    } else if (task === 'gap_analysis') {
      const { company, program } = data as { company: Company; program: SupportProgram };
      await this.performGapAnalysis(company, program);
    }
  }

  protected async handleQuery(_message: AgentMessage): Promise<void> {
    // Handle queries from other agents
  }

  protected async handleNotification(_message: AgentMessage): Promise<void> {
    // Handle notifications
  }

  private async analyzeCompany(company: Company): Promise<void> {
    if (import.meta.env.DEV) console.log('🔍 Analyzer: Analyzing company profile...');

    try {
      const analysis = await structuringAgent.structure(company.description, company);

      this.addMemory('INSIGHT', {
        companyId: company.id,
        strengths: analysis.inferredStrengths,
        profileComplete: true,
      }, ['company', 'analysis', company.industry], 0.9);

      await this.sendMessage('STRATEGIST', 'NOTIFICATION', {
        data: { company: analysis.company, strengths: analysis.inferredStrengths },
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Analyzer error:', error);
    }
  }

  private async analyzeEligibility(company: Company, program: SupportProgram): Promise<void> {
    if (import.meta.env.DEV) console.log('🔍 Analyzer: Checking eligibility...');

    try {
      const eligibility = await suitabilityAgent.evaluate(company, program);

      this.addMemory('INSIGHT', {
        programId: program.id,
        companyId: company.id,
        eligibility,
      }, ['eligibility', 'program', company.industry], 0.85);

      await this.sendMessage('WRITER', 'NOTIFICATION', {
        data: { eligibility, program, company },
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Analyzer eligibility error:', error);
    }
  }

  private async performGapAnalysis(company: Company, program: SupportProgram): Promise<void> {
    if (import.meta.env.DEV) console.log('🔍 Analyzer: Performing gap analysis...');

    try {
      // Use suitability evaluation as a proxy for gap analysis
      const evaluation = await suitabilityAgent.evaluate(company, program);
      const gaps = {
        strengths: company.coreCompetencies || [],
        gaps: ['추가 분석 필요'],
        advice: evaluation.eligibilityReason || '자격 요건을 충족하는지 확인이 필요합니다.',
      };

      this.addMemory('INSIGHT', {
        programId: program.id,
        companyId: company.id,
        gaps,
      }, ['gaps', 'strategy', company.industry], 0.9);

      await this.sendMessage('STRATEGIST', 'REQUEST', {
        task: 'create_strategy',
        data: { gaps, company, program },
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Analyzer gap analysis error:', error);
    }
  }
}

// ===== Writer Agent =====
class WriterAgent extends BaseAgent {
  constructor() {
    super('WRITER');
  }

  protected async handleRequest(message: AgentMessage): Promise<void> {
    const { task, data } = message.payload;

    if (task === 'generate_draft') {
      const { application, sectionKey, requirement } = data as {
        application: Application;
        sectionKey: string;
        requirement: string;
      };
      await this.generateDraft(application, sectionKey, requirement);
    }
  }

  protected async handleQuery(_message: AgentMessage): Promise<void> {
    // Handle queries
  }

  protected async handleNotification(message: AgentMessage): Promise<void> {
    const { data } = message.payload;
    if (import.meta.env.DEV) {
      console.log('✍️ Writer: Received notification with data:', data);
    }
  }

  private async generateDraft(application: Application, sectionKey: string, requirement: string): Promise<void> {
    if (import.meta.env.DEV) console.log('✍️ Writer: Generating draft section...');

    try {
      const company = getStoredCompany();
      const program = application.programSnapshot;
      const mockProgram: SupportProgram = {
        id: application.programId,
        programName: program.name,
        organizer: program.organizer,
        supportType: program.type,
        officialEndDate: program.endDate,
        internalDeadline: program.endDate,
        expectedGrant: program.grantAmount,
        fitScore: 0,
        eligibility: EligibilityStatus.POSSIBLE,
        priorityRank: 0,
        eligibilityReason: '',
        requiredDocuments: program.requiredDocuments || [],
      };

      const result = await draftAgent.writeSection(company, mockProgram, sectionKey, false, requirement);

      this.addMemory('PATTERN', {
        applicationId: application.id,
        sectionKey,
        draft: result.text,
      }, ['draft', 'writing', company.industry], 0.8);

      await this.sendMessage('REVIEWER', 'REQUEST', {
        task: 'review_draft',
        data: { draft: result.text, sectionKey, application },
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Writer error:', error);
    }
  }
}

// ===== Reviewer Agent =====
class ReviewerAgent extends BaseAgent {
  constructor() {
    super('REVIEWER');
  }

  protected async handleRequest(message: AgentMessage): Promise<void> {
    const { task, data } = message.payload;

    if (task === 'review_draft') {
      const { draft, sectionKey, application } = data as {
        draft: string;
        sectionKey: string;
        application: Application;
      };
      await this.reviewDraft(draft, sectionKey, application);
    } else if (task === 'check_consistency') {
      const { application } = data as { application: Application };
      await this.checkConsistency(application);
    } else if (task === 'evaluate_quality') {
      const { application } = data as { application: Application };
      await this.evaluateQuality(application);
    }
  }

  protected async handleQuery(_message: AgentMessage): Promise<void> {
    // Handle queries
  }

  protected async handleNotification(_message: AgentMessage): Promise<void> {
    // Handle notifications
  }

  private async reviewDraft(_draft: string, _sectionKey: string, _application: Application): Promise<void> {
    if (import.meta.env.DEV) console.log('🔎 Reviewer: Reviewing draft...');

    try {
      // Review logic here
      this.addMemory('FEEDBACK', {
        sectionKey: _sectionKey,
        status: 'reviewed',
      }, ['review', 'quality'], 0.7);

      await this.sendMessage('OPTIMIZER', 'REQUEST', {
        task: 'optimize_content',
        data: { draft: _draft, sectionKey: _sectionKey },
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Reviewer error:', error);
    }
  }

  private async checkConsistency(application: Application): Promise<void> {
    if (import.meta.env.DEV) console.log('🔎 Reviewer: Checking consistency...');

    try {
      const result = await consistencyAgent.checkConsistency(application.draftSections);

      this.addMemory('FEEDBACK', {
        applicationId: application.id,
        consistencyScore: result.score,
        issues: result.issues,
      }, ['consistency', 'quality'], 0.85);

      if (result.score < 70) {
        await this.sendMessage('WRITER', 'REQUEST', {
          task: 'fix_inconsistencies',
          data: { application, issues: result.issues },
          priority: 'HIGH',
        });
      }

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Reviewer consistency error:', error);
    }
  }

  private async evaluateQuality(application: Application): Promise<void> {
    if (import.meta.env.DEV) console.log('🔎 Reviewer: Evaluating quality...');

    try {
      const company = getStoredCompany();
      const program = application.programSnapshot;
      const mockProgram: SupportProgram = {
        id: application.programId,
        programName: program.name,
        organizer: program.organizer,
        supportType: program.type,
        officialEndDate: program.endDate,
        internalDeadline: program.endDate,
        expectedGrant: program.grantAmount,
        fitScore: 0,
        eligibility: EligibilityStatus.POSSIBLE,
        priorityRank: 0,
        eligibilityReason: '',
        requiredDocuments: program.requiredDocuments || [],
      };

      const review = await reviewAgent.reviewApplication(
        company,
        mockProgram,
        application.draftSections,
        'GENERAL'
      );

      this.addMemory('FEEDBACK', {
        applicationId: application.id,
        totalScore: review.totalScore,
        scores: review.scores,
        feedback: review.feedback,
      }, ['evaluation', 'quality', 'scores'], 0.95);

      await this.sendMessage('BROADCAST', 'NOTIFICATION', {
        data: { applicationId: application.id, review },
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Reviewer evaluation error:', error);
    }
  }
}

// ===== Researcher Agent =====
class ResearcherAgent extends BaseAgent {
  constructor() {
    super('RESEARCHER');
  }

  protected async handleRequest(message: AgentMessage): Promise<void> {
    const { task, data } = message.payload;

    if (task === 'research_industry') {
      const { industry, keywords } = data as { industry: string; keywords: string[] };
      await this.researchIndustry(industry, keywords);
    } else if (task === 'find_trends') {
      const { industry } = data as { industry: string };
      await this.findTrends(industry);
    }
  }

  protected async handleQuery(_message: AgentMessage): Promise<void> {
    // Handle queries
  }

  protected async handleNotification(_message: AgentMessage): Promise<void> {
    // Handle notifications
  }

  private async researchIndustry(industry: string, keywords: string[]): Promise<void> {
    if (import.meta.env.DEV) console.log('🔬 Researcher: Researching industry...');

    try {
      // Mock research results
      const insights = {
        industry,
        trends: keywords.map(k => `${k} 관련 시장 성장 추세`),
        opportunities: ['신기술 도입', '정부 지원 확대'],
      };

      this.addMemory('INSIGHT', insights, ['research', 'industry', industry], 0.8);

      await this.sendMessage('STRATEGIST', 'NOTIFICATION', {
        data: insights,
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Researcher error:', error);
    }
  }

  private async findTrends(industry: string): Promise<void> {
    if (import.meta.env.DEV) console.log('🔬 Researcher: Finding trends...');

    try {
      const trends = {
        industry,
        emerging: ['AI/ML 적용', '친환경 전환', '디지털 혁신'],
        declining: ['전통적 방식'],
      };

      this.addMemory('INSIGHT', trends, ['trends', 'industry', industry], 0.75);

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Researcher trends error:', error);
    }
  }
}

// ===== Strategist Agent =====
class StrategistAgent extends BaseAgent {
  constructor() {
    super('STRATEGIST');
  }

  protected async handleRequest(message: AgentMessage): Promise<void> {
    const { task, data } = message.payload;

    if (task === 'create_strategy') {
      const { gaps, company, program } = data as {
        gaps: { strengths: string[]; gaps: string[]; advice: string };
        company: Company;
        program: SupportProgram;
      };
      await this.createStrategy(gaps, company, program);
    } else if (task === 'optimize_positioning') {
      const { company } = data as { company: Company };
      await this.optimizePositioning(company);
    }
  }

  protected async handleQuery(_message: AgentMessage): Promise<void> {
    // Handle queries
  }

  protected async handleNotification(message: AgentMessage): Promise<void> {
    const { data } = message.payload;
    if (import.meta.env.DEV) {
      console.log('🎯 Strategist: Received notification with data:', data);
    }
  }

  private async createStrategy(
    gaps: { strengths: string[]; gaps: string[]; advice: string },
    company: Company,
    _program: SupportProgram
  ): Promise<void> {
    if (import.meta.env.DEV) console.log('🎯 Strategist: Creating strategy...');

    try {
      const strategy = {
        strengths: gaps.strengths,
        gapsToAddress: gaps.gaps,
        actionPlan: gaps.advice,
        positioning: `${company.industry} 분야 혁신 기업으로서의 강점 부각`,
      };

      this.addMemory('STRATEGY', strategy, ['strategy', 'planning', company.industry], 0.9);

      await this.sendMessage('WRITER', 'REQUEST', {
        task: 'apply_strategy',
        data: strategy,
        priority: 'HIGH',
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Strategist error:', error);
    }
  }

  private async optimizePositioning(company: Company): Promise<void> {
    if (import.meta.env.DEV) console.log('🎯 Strategist: Optimizing positioning...');

    try {
      const positioning = {
        companyId: company.id,
        coreMessage: `${company.name}의 핵심 경쟁력`,
        differentiators: company.coreCompetencies || [],
        targetSegment: company.industry,
      };

      this.addMemory('STRATEGY', positioning, ['positioning', company.industry], 0.85);

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Strategist positioning error:', error);
    }
  }
}

// ===== Optimizer Agent =====
class OptimizerAgent extends BaseAgent {
  constructor() {
    super('OPTIMIZER');
  }

  protected async handleRequest(message: AgentMessage): Promise<void> {
    const { task, data } = message.payload;

    if (task === 'optimize_content') {
      const { draft, sectionKey } = data as { draft: string; sectionKey: string };
      await this.optimizeContent(draft, sectionKey);
    } else if (task === 'learn_from_success') {
      const { application } = data as { application: Application };
      await this.learnFromSuccess(application);
    }
  }

  protected async handleQuery(_message: AgentMessage): Promise<void> {
    // Handle queries
  }

  protected async handleNotification(_message: AgentMessage): Promise<void> {
    // Handle notifications
  }

  private async optimizeContent(draft: string, sectionKey: string): Promise<void> {
    if (import.meta.env.DEV) console.log('⚡ Optimizer: Optimizing content...');

    try {
      // Optimize keywords, clarity, impact
      const optimized = {
        original: draft.substring(0, 50) + '...',
        improved: draft, // Placeholder
        improvements: ['키워드 강화', '명확성 개선', '임팩트 증대'],
      };

      this.addMemory('LEARNING', optimized, ['optimization', sectionKey], 0.75);

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Optimizer error:', error);
    }
  }

  private async learnFromSuccess(application: Application): Promise<void> {
    if (import.meta.env.DEV) console.log('⚡ Optimizer: Learning from successful application...');

    try {
      const allText = Object.values(application.draftSections).join('\n\n');
      const patterns = await ontologyLearningAgent.extractSuccessPatterns(allText);

      this.addMemory('LEARNING', {
        applicationId: application.id,
        successPatterns: patterns,
      }, ['learning', 'patterns', 'success'], 0.95);

      await this.sendMessage('BROADCAST', 'NOTIFICATION', {
        data: { patterns, source: application.id },
      });

    } catch (error) {
      if (import.meta.env.DEV) console.error('❌ Optimizer learning error:', error);
    }
  }
}

// ===== Initialize All Agents =====
export const initializeAgentTeam = (): void => {
  new AnalyzerAgent();
  new WriterAgent();
  new ReviewerAgent();
  new ResearcherAgent();
  new StrategistAgent();
  new OptimizerAgent();

  if (import.meta.env.DEV) {
    console.log('🎭 Multi-Agent Team: All agents initialized and ready');
  }
};

// Export individual agents if needed for direct access
export const agentTeam = {
  initialize: initializeAgentTeam,
};

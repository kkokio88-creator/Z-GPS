import {
  AgentRole,
  AgentMessage,
  AgentTask,
  AgentState,
  SharedMemory,
  OrchestratorState,
  WorkflowTemplate,
} from "../types";

/**
 * Multi-Agent Orchestrator
 *
 * 여러 AI 에이전트들이 협업하여 작업을 수행하는 시스템의 중앙 조율자입니다.
 * - 태스크 큐 관리
 * - 에이전트 간 메시지 라우팅
 * - 공유 메모리 관리
 * - 워크플로우 실행
 */

class AgentOrchestrator {
  private state: OrchestratorState;
  private agents: Map<AgentRole, AgentState>;
  private messageHandlers: Map<AgentRole, (msg: AgentMessage) => Promise<void>>;
  private eventListeners: ((event: string, data: unknown) => void)[] = [];

  constructor() {
    this.state = this.initializeState();
    this.agents = new Map();
    this.messageHandlers = new Map();
    this.initializeAgents();
  }

  private initializeState(): OrchestratorState {
    return {
      isActive: false,
      mode: 'AUTO',
      activeAgents: [],
      taskQueue: [],
      messageLog: [],
      sharedMemory: [],
      metrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        avgTaskDuration: 0,
      },
    };
  }

  private initializeAgents(): void {
    const roles: AgentRole[] = [
      'ANALYZER',
      'WRITER',
      'REVIEWER',
      'RESEARCHER',
      'STRATEGIST',
      'OPTIMIZER',
    ];

    roles.forEach((role) => {
      this.agents.set(role, {
        role,
        status: 'IDLE',
        tasksCompleted: 0,
        lastActive: new Date().toISOString(),
        capabilities: this.getAgentCapabilities(role),
        performance: {
          successRate: 1.0,
          avgResponseTime: 0,
        },
      });
    });
  }

  private getAgentCapabilities(role: AgentRole): string[] {
    const capabilities: Record<AgentRole, string[]> = {
      ORCHESTRATOR: ['coordination', 'workflow_management', 'resource_allocation'],
      ANALYZER: ['data_analysis', 'company_profiling', 'gap_analysis', 'eligibility_check'],
      WRITER: ['draft_generation', 'content_creation', 'document_formatting'],
      REVIEWER: ['quality_check', 'consistency_review', 'score_evaluation'],
      RESEARCHER: ['market_research', 'competitor_analysis', 'trend_identification'],
      STRATEGIST: ['strategy_planning', 'positioning', 'gap_filling'],
      OPTIMIZER: ['content_optimization', 'keyword_enhancement', 'learning_integration'],
    };
    return capabilities[role] || [];
  }

  // ===== Core Methods =====

  public async start(): Promise<void> {
    this.state.isActive = true;
    this.state.activeAgents = Array.from(this.agents.keys());
    this.emit('orchestrator:started', { timestamp: new Date().toISOString() });
    if (import.meta.env.DEV) console.log('🎭 Agent Orchestrator: Started');
  }

  public async stop(): Promise<void> {
    this.state.isActive = false;
    this.state.activeAgents = [];
    this.emit('orchestrator:stopped', { timestamp: new Date().toISOString() });
    if (import.meta.env.DEV) console.log('🎭 Agent Orchestrator: Stopped');
  }

  public getState(): OrchestratorState {
    return { ...this.state };
  }

  public getAgentState(role: AgentRole): AgentState | undefined {
    return this.agents.get(role);
  }

  // ===== Task Management =====

  public async createTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentTask> {
    const newTask: AgentTask = {
      ...task,
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.state.taskQueue.push(newTask);
    this.state.metrics.totalTasks++;
    this.emit('task:created', newTask);

    if (import.meta.env.DEV) {
      console.log(`📋 Task Created: ${newTask.id} -> ${newTask.assignedTo}`);
    }

    // Auto-execute if in AUTO mode
    if (this.state.mode === 'AUTO' && this.state.isActive) {
      await this.processNextTask();
    }

    return newTask;
  }

  public async processNextTask(): Promise<void> {
    const task = this.state.taskQueue.find((t) => t.status === 'PENDING' && this.areDependenciesMet(t));

    if (!task) return;

    task.status = 'IN_PROGRESS';
    task.updatedAt = new Date().toISOString();

    const agent = this.agents.get(task.assignedTo);
    if (agent) {
      agent.status = 'BUSY';
      agent.currentTask = task.id;
    }

    this.emit('task:started', task);

    try {
      const result = await this.executeTask(task);
      task.status = 'COMPLETED';
      task.result = result;
      task.completedAt = new Date().toISOString();
      this.state.metrics.completedTasks++;

      if (agent) {
        agent.status = 'IDLE';
        agent.currentTask = undefined;
        agent.tasksCompleted++;
      }

      this.emit('task:completed', task);

      // Process next task
      if (this.state.isActive) {
        setTimeout(() => this.processNextTask(), 100);
      }
    } catch (error) {
      task.status = 'FAILED';
      task.error = error instanceof Error ? error.message : String(error);
      this.state.metrics.failedTasks++;

      if (agent) {
        agent.status = 'ERROR';
        agent.currentTask = undefined;
      }

      this.emit('task:failed', task);
      if (import.meta.env.DEV) console.error('❌ Task Failed:', task.id, error);
    }

    task.updatedAt = new Date().toISOString();
  }

  private areDependenciesMet(task: AgentTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) return true;

    return task.dependencies.every((depId) => {
      const depTask = this.state.taskQueue.find((t) => t.id === depId);
      return depTask && depTask.status === 'COMPLETED';
    });
  }

  private async executeTask(task: AgentTask): Promise<unknown> {
    // This will be delegated to specific agent implementations
    // For now, return a placeholder
    if (import.meta.env.DEV) {
      console.log(`⚙️ Executing task: ${task.id} (${task.type}) by ${task.assignedTo}`);
    }

    // Simulate async work
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      taskId: task.id,
      status: 'success',
      message: `Task ${task.type} completed by ${task.assignedTo}`,
    };
  }

  // ===== Message System =====

  public async sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    this.state.messageLog.push(fullMessage);

    if (message.to === 'BROADCAST') {
      // Broadcast to all agents
      this.agents.forEach((_, role) => {
        const handler = this.messageHandlers.get(role);
        if (handler) handler(fullMessage);
      });
    } else {
      // Send to specific agent
      const handler = this.messageHandlers.get(message.to);
      if (handler) await handler(fullMessage);
    }

    this.emit('message:sent', fullMessage);

    if (import.meta.env.DEV) {
      console.log(`💬 Message: ${message.from} -> ${message.to} (${message.type})`);
    }
  }

  public registerMessageHandler(role: AgentRole, handler: (msg: AgentMessage) => Promise<void>): void {
    this.messageHandlers.set(role, handler);
  }

  // ===== Shared Memory =====

  public addToMemory(memory: Omit<SharedMemory, 'id' | 'timestamp'>): SharedMemory {
    const newMemory: SharedMemory = {
      ...memory,
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    this.state.sharedMemory.push(newMemory);

    // Keep only recent memories (max 100)
    if (this.state.sharedMemory.length > 100) {
      this.state.sharedMemory = this.state.sharedMemory
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 100);
    }

    this.emit('memory:added', newMemory);
    return newMemory;
  }

  public queryMemory(filters: { type?: SharedMemory['type']; tags?: string[]; source?: AgentRole }): SharedMemory[] {
    return this.state.sharedMemory.filter((mem) => {
      if (filters.type && mem.type !== filters.type) return false;
      if (filters.source && mem.source !== filters.source) return false;
      if (filters.tags && !filters.tags.some((tag) => mem.tags.includes(tag))) return false;
      return true;
    });
  }

  // ===== Workflow Management =====

  public async executeWorkflow(template: WorkflowTemplate): Promise<void> {
    this.state.currentWorkflow = {
      id: template.id,
      name: template.name,
      stage: template.stages[0]?.name || 'Unknown',
      progress: 0,
    };

    this.emit('workflow:started', this.state.currentWorkflow);

    for (let i = 0; i < template.stages.length; i++) {
      const stage = template.stages[i];
      this.state.currentWorkflow.stage = stage.name;
      this.state.currentWorkflow.progress = (i / template.stages.length) * 100;

      if (import.meta.env.DEV) {
        console.log(`🎬 Workflow Stage: ${stage.name} (${stage.agentRoles.join(', ')})`);
      }

      // Create tasks for this stage
      const stageTasks: AgentTask[] = [];
      for (const taskTemplate of stage.tasks) {
        const task = await this.createTask(taskTemplate);
        stageTasks.push(task);
      }

      // Wait for all stage tasks to complete
      await this.waitForTasks(stageTasks.map((t) => t.id));
    }

    this.state.currentWorkflow.progress = 100;
    this.emit('workflow:completed', this.state.currentWorkflow);
    this.state.currentWorkflow = undefined;
  }

  private async waitForTasks(taskIds: string[], timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const allCompleted = taskIds.every((id) => {
          const task = this.state.taskQueue.find((t) => t.id === id);
          return task && (task.status === 'COMPLETED' || task.status === 'FAILED');
        });

        if (allCompleted) {
          clearInterval(checkInterval);
          clearTimeout(timeoutHandle);
          resolve();
        }
      }, 100);

      const timeoutHandle = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`waitForTasks timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  // ===== Event System =====

  public on(listener: (event: string, data: unknown) => void): void {
    this.eventListeners.push(listener);
  }

  public off(listener: (event: string, data: unknown) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  private emit(event: string, data: unknown): void {
    this.eventListeners.forEach((listener) => listener(event, data));
  }

  // ===== Utility Methods =====

  public reset(): void {
    this.state = this.initializeState();
    this.initializeAgents();
    this.emit('orchestrator:reset', { timestamp: new Date().toISOString() });
  }

  public getMetrics() {
    return {
      ...this.state.metrics,
      agentStats: Array.from(this.agents.entries()).map(([role, state]) => ({
        role,
        status: state.status,
        tasksCompleted: state.tasksCompleted,
        performance: state.performance,
      })),
    };
  }
}

// Singleton instance
export const orchestrator = new AgentOrchestrator();

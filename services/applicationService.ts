import { ApplicationLifecycleStatus } from "../types";
import type { ApplicationEntity, CreateApplicationInput } from "../types";

export class ApplicationServiceImpl {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_orchestrator: any) {
    // Orchestrator instance stored for future use
  }

  async createApplication(input: CreateApplicationInput): Promise<ApplicationEntity> {
    const now = new Date().toISOString();
    return {
      id: `app_${Date.now()}`,
      companyId: input.companyId,
      programId: input.programId,
      status: ApplicationLifecycleStatus.DRAFT,
      drafts: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async startGeneration(_applicationId: string): Promise<void> {
    // Will be implemented with orchestrator integration
  }
}

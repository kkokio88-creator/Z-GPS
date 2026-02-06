import {
  ApplicationEntity,
  ApplicationLifecycleStatus,
  CreateApplicationInput,
  AgentExecutionMeta,
  ApplicationGenerationResult,
} from '../../types';

const STORAGE_KEY = 'z-gps:applications';

const readAll = (): ApplicationEntity[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: ApplicationEntity[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    if (import.meta.env.DEV) {
      console.warn('[ApplicationRepository] Failed to parse localStorage');
    }
    return [];
  }
};

const writeAll = (applications: ApplicationEntity[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
};

export interface ApplicationRepository {
  getAll(): Promise<ApplicationEntity[]>;
  getById(id: string): Promise<ApplicationEntity | null>;
  getByProgramId(programId: string): Promise<ApplicationEntity[]>;
  create(input: CreateApplicationInput): Promise<ApplicationEntity>;
  update(application: ApplicationEntity): Promise<ApplicationEntity>;
  updateStatus(
    id: string,
    status: ApplicationLifecycleStatus,
    meta?: Partial<AgentExecutionMeta>
  ): Promise<ApplicationEntity>;
  saveGenerationResult(
    id: string,
    result: ApplicationGenerationResult
  ): Promise<ApplicationEntity>;
  delete(id: string): Promise<void>;
}

export const applicationRepository: ApplicationRepository = {
  async getAll() {
    return readAll();
  },

  async getById(id) {
    const apps = readAll();
    return apps.find(a => a.id === id) ?? null;
  },

  async getByProgramId(programId) {
    const apps = readAll();
    return apps.filter(a => a.programId === programId);
  },

  async create(input) {
    const now = new Date().toISOString();
    const application: ApplicationEntity = {
      id: crypto.randomUUID(),
      companyId: input.companyId,
      programId: input.programId,
      status: ApplicationLifecycleStatus.DRAFT,
      drafts: [],
      createdAt: now,
      updatedAt: now,
    };

    const apps = readAll();
    apps.push(application);
    writeAll(apps);
    return application;
  },

  async update(application) {
    const apps = readAll();
    const index = apps.findIndex(a => a.id === application.id);
    if (index === -1) {
      throw new Error('Application not found');
    }
    const updated: ApplicationEntity = {
      ...application,
      updatedAt: new Date().toISOString(),
    };
    apps[index] = updated;
    writeAll(apps);
    return updated;
  },

  async updateStatus(id, status, meta) {
    const apps = readAll();
    const index = apps.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error('Application not found');
    }
    const current = apps[index];
    const updated: ApplicationEntity = {
      ...current,
      status,
      agentExecution: meta
        ? { ...current.agentExecution, ...meta }
        : current.agentExecution,
      updatedAt: new Date().toISOString(),
    };
    apps[index] = updated;
    writeAll(apps);
    return updated;
  },

  async saveGenerationResult(id, result) {
    const apps = readAll();
    const index = apps.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error('Application not found');
    }
    const current = apps[index];
    const updated: ApplicationEntity = {
      ...current,
      drafts: result.drafts,
      review: result.review,
      updatedAt: new Date().toISOString(),
    };
    apps[index] = updated;
    writeAll(apps);
    return updated;
  },

  async delete(id) {
    const apps = readAll();
    const filtered = apps.filter(a => a.id !== id);
    writeAll(filtered);
  },
};

import React, { useEffect, useState } from 'react';
import type { ApplicationEntity, CreateApplicationInput } from '../../types';
import { applicationRepository } from '../../services/repositories/applicationRepository';
import { ApplicationList } from '../applications/ApplicationList';
import { ApplicationContainer } from '../applications/ApplicationContainer';
import { ApplicationServiceImpl } from '../../services/applicationService';
import { orchestrator } from '../../services/agentOrchestrator';

interface Props {
  programId: string;
  companyId: string;
}

export const ProgramDetail: React.FC<Props> = ({ programId, companyId }) => {
  const [applications, setApplications] = useState<ApplicationEntity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const service = new ApplicationServiceImpl(orchestrator);

  const load = async () => {
    const apps = await applicationRepository.getByProgramId(programId);
    setApplications(apps);
  };

  useEffect(() => {
    void load();
  }, [programId]);

  const handleCreateApplication = async () => {
    const input: CreateApplicationInput = { companyId, programId };
    const app = await service.createApplication(input);
    await load();
    setSelectedId(app.id);
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-1">
        <button
          onClick={handleCreateApplication}
          className="mb-3 w-full px-4 py-2 bg-green-600 text-white rounded"
        >
          지원서 생성
        </button>
        <ApplicationList
          applications={applications}
          onSelect={setSelectedId}
        />
      </div>

      <div className="col-span-2">
        {selectedId && <ApplicationContainer applicationId={selectedId} />}
      </div>
    </div>
  );
};

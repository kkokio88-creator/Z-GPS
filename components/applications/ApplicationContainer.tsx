import React, { useEffect, useState } from 'react';
import type { ApplicationEntity } from '../../types';
import { ApplicationDetail } from './ApplicationDetail';
import { ApplicationServiceImpl } from '../../services/applicationService';
import { orchestrator } from '../../services/agentOrchestrator';
import { applicationRepository } from '../../services/repositories/applicationRepository';

interface Props {
  applicationId: string;
}

export const ApplicationContainer: React.FC<Props> = ({ applicationId }) => {
  const [application, setApplication] = useState<ApplicationEntity | null>(null);
  const service = new ApplicationServiceImpl(orchestrator);

  const load = async () => {
    const app = await applicationRepository.getById(applicationId);
    setApplication(app);
  };

  useEffect(() => {
    void load();
  }, [applicationId]);

  const handleStartGeneration = async () => {
    await service.startGeneration(applicationId);
    await load();
  };

  if (!application) return null;

  return (
    <ApplicationDetail
      application={application}
      onStartGeneration={handleStartGeneration}
    />
  );
};

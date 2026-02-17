import React from 'react';
import { ApplicationLifecycleStatus } from '../../types';

interface Props {
  status: ApplicationLifecycleStatus;
}

export const ApplicationStatusBadge: React.FC<Props> = ({ status }) => {
  const colorMap: Record<ApplicationLifecycleStatus, string> = {
    DRAFT: 'bg-gray-200 text-gray-800',
    GENERATING: 'bg-blue-200 text-blue-800',
    READY: 'bg-green-200 text-green-800',
    FAILED: 'bg-red-200 text-red-800',
  } as Record<ApplicationLifecycleStatus, string>;

  return (
    <span className={`px-2 py-1 rounded text-xs ${colorMap[status]}`}>
      {status}
    </span>
  );
};

import React from 'react';
import type { ApplicationEntity } from '../../types';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';

interface Props {
  applications: ApplicationEntity[];
  onSelect: (id: string) => void;
}

export const ApplicationList: React.FC<Props> = ({ applications, onSelect }) => {
  return (
    <ul className="space-y-2">
      {applications.map(app => (
        <li
          key={app.id}
          className="border p-3 rounded flex items-center justify-between cursor-pointer"
          onClick={() => onSelect(app.id)}
        >
          <span className="text-sm">{new Date(app.createdAt).toLocaleString()}</span>
          <ApplicationStatusBadge status={app.status} />
        </li>
      ))}
    </ul>
  );
};

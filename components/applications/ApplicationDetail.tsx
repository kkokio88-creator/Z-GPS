import React from 'react';
import type { ApplicationEntity } from '../../types';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import { DraftSectionView } from './DraftSectionView';

interface Props {
  application: ApplicationEntity;
  onStartGeneration: () => void;
}

export const ApplicationDetail: React.FC<Props> = ({ application, onStartGeneration }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ApplicationStatusBadge status={application.status} />
        {(application.status === 'DRAFT' || application.status === 'FAILED') && (
          <button
            onClick={onStartGeneration}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            지원서 생성
          </button>
        )}
      </div>

      {application.status === 'READY' && (
        <div>
          <h2 className="font-bold mb-2">지원서 초안</h2>
          {application.drafts.map(section => (
            <DraftSectionView key={section.id} section={section} />
          ))}
          {application.review && (
            <div className="mt-4 border-t pt-4">
              <h3 className="font-semibold">리뷰 요약</h3>
              <p className="text-sm mt-2">{application.review.summary}</p>
            </div>
          )}
        </div>
      )}

      {application.status === 'GENERATING' && (
        <div className="flex items-center space-x-2 text-blue-600 text-sm">
          <span className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          <span>지원서 생성 중...</span>
        </div>
      )}

      {application.status === 'FAILED' && application.agentExecution?.errorMessage && (
        <div className="text-red-600 text-sm">
          {application.agentExecution.errorMessage}
        </div>
      )}
    </div>
  );
};

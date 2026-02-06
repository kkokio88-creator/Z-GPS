import React from 'react';
import type { DraftSection } from '../../types';

interface Props {
  section: DraftSection;
}

export const DraftSectionView: React.FC<Props> = ({ section }) => {
  return (
    <div className="border rounded p-4 mb-3">
      <h3 className="font-semibold mb-2">{section.title}</h3>
      <p className="whitespace-pre-wrap text-sm">{section.content}</p>
    </div>
  );
};

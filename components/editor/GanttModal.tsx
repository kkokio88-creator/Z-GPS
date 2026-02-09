import React from 'react';
import { GanttData } from '../../hooks/useModalState';

interface GanttModalProps {
  data: GanttData | null;
  isLoading: boolean;
  onClose: () => void;
}

const GanttModal: React.FC<GanttModalProps> = ({ data, isLoading, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4">
          <span className="material-icons-outlined">close</span>
        </button>
        <h3 className="text-lg font-bold mb-4">추진 일정 차트</h3>
        <div className="bg-gray-50 p-4 rounded min-h-[300px]">
          {isLoading ? (
            '생성 중...'
          ) : (
            <svg width="100%" height="300">
              {data?.tasks?.map((t, i) => (
                <g key={i} transform={`translate(0, ${i * 30 + 20})`}>
                  <text x="100" y="15" textAnchor="end" fontSize="12">{t.name}</text>
                  <rect x={110 + (t.startMonth - 1) * 40} y="0" width={t.durationMonths * 40} height="20" fill="#06b6d4" />
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

export default GanttModal;

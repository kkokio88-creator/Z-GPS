import Icon from '../ui/Icon';
import React from 'react';
import type { BenefitRecord } from '../../types';
import { formatKRW } from '../../services/utils/formatters';
import { CATEGORIES, STATUS_LABELS } from './constants';

interface BenefitListProps {
  benefits: BenefitRecord[];
  isLoading: boolean;
  filterCategory: string;
  analyzing: string | null;
  onFilterChange: (cat: string) => void;
  onAdd: () => void;
  onEdit: (b: BenefitRecord) => void;
  onDelete: (id: string) => void;
  onAnalyze: (id: string) => void;
}

const BenefitList: React.FC<BenefitListProps> = ({
  benefits,
  isLoading,
  filterCategory,
  analyzing,
  onFilterChange,
  onAdd,
  onEdit,
  onDelete,
  onAnalyze,
}) => {
  const filtered = filterCategory === 'all'
    ? benefits
    : benefits.filter(b => b.category === filterCategory);

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onFilterChange('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === 'all'
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            전체
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => onFilterChange(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Icon name="add" className="h-5 w-5" />
          등록
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Icon name="receipt_long" className="h-5 w-5" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">등록된 수령 이력이 없습니다</p>
          <button
            onClick={onAdd}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
          >
            첫 이력 등록하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => (
            <div key={b.id} className="bg-white dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">{b.programName}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_LABELS[b.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[b.status]?.label || b.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{b.organizer}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">{b.category}</span>
                    <span>{b.receivedDate}</span>
                  </div>
                  {b.conditions && (
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium">조건:</span> {b.conditions}
                      {b.conditionsMet === true && <span className="ml-1 text-green-600">(이행)</span>}
                      {b.conditionsMet === false && <span className="ml-1 text-red-600">(미이행)</span>}
                    </p>
                  )}
                  {b.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {b.tags.map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-primary dark:text-green-400">{formatKRW(b.receivedAmount)}</p>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => onEdit(b)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="수정">
                      <Icon name="edit" className="h-5 w-5" />
                    </button>
                    <button onClick={() => onAnalyze(b.id)} disabled={analyzing === b.id} className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-50" title="환급 분석">
                      <span className={`material-icons-outlined text-sm ${analyzing === b.id ? 'animate-spin' : ''}`} aria-hidden="true">
                        {analyzing === b.id ? 'autorenew' : 'psychology'}
                      </span>
                    </button>
                    <button onClick={() => onDelete(b.id)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="삭제">
                      <Icon name="delete" className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BenefitList;

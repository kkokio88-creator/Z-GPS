import Icon from '../ui/Icon';
import React, { useState } from 'react';
import { vaultService } from '../../services/vaultService';
import { Button } from '../ui/button';

interface ProgramFiltersProps {
  searchQuery: string;
  filterType: string;
  sortBy: 'fitScore' | 'deadline' | 'grant';
  supportTypes: string[];
  onSearchChange: (query: string) => void;
  onFilterTypeChange: (type: string) => void;
  onSortByChange: (sort: 'fitScore' | 'deadline' | 'grant') => void;
  onProgramAdded?: () => void;
}

const ProgramFilters: React.FC<ProgramFiltersProps> = ({
  searchQuery,
  filterType,
  sortBy,
  supportTypes,
  onSearchChange,
  onFilterTypeChange,
  onSortByChange,
  onProgramAdded,
}) => {
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');

  const handleAddByUrl = async () => {
    if (!urlInput.trim() || !urlInput.startsWith('http')) {
      setUrlError('유효한 URL을 입력해주세요.');
      return;
    }
    setUrlLoading(true);
    setUrlError('');
    try {
      const result = await vaultService.addProgramByUrl(urlInput.trim());
      if (result.success) {
        window.dispatchEvent(new CustomEvent('zmis-toast', {
          detail: { message: `"${result.programName}" 공고가 추가되었습니다.`, type: 'success' },
        }));
        setShowUrlDialog(false);
        setUrlInput('');
        onProgramAdded?.();
      }
    } catch (e) {
      setUrlError('URL에서 공고를 가져오지 못했습니다. 다시 시도해주세요.');
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4 bg-white dark:bg-gray-800 rounded-xl p-2.5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex-1 min-w-[200px] relative">
          <Icon name="search" className="h-5 w-5" />
          <input
            type="text"
            placeholder="사업명, 기관명으로 검색..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <select
          value={filterType}
          onChange={e => onFilterTypeChange(e.target.value)}
          className="text-xs sm:text-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 sm:px-3 py-2 text-gray-600 dark:text-gray-300"
        >
          <option value="">전체 유형</option>
          {supportTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => onSortByChange(e.target.value as 'fitScore' | 'deadline' | 'grant')}
          className="text-xs sm:text-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg px-2 sm:px-3 py-2 text-gray-600 dark:text-gray-300"
        >
          <option value="fitScore">적합도순</option>
          <option value="deadline">마감일순</option>
          <option value="grant">지원금순</option>
        </select>
        <Button
          onClick={() => setShowUrlDialog(true)}
          size="sm"
          title="URL로 공고 추가"
        >
          <Icon name="add_link" className="w-4 h-4" />
          <span className="hidden sm:inline">URL 추가</span>
        </Button>
      </div>

      {/* URL 추가 다이얼로그 */}
      {showUrlDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowUrlDialog(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
              <Icon name="add_link" className="w-5 h-5 text-primary" />
              URL로 공고 추가
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              공고 상세 페이지 URL을 입력하면 자동으로 크롤링하여 추가합니다.
            </p>
            <input
              type="url"
              placeholder="https://example.com/program/..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddByUrl()}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary mb-2"
              autoFocus
            />
            {urlError && <p className="text-xs text-red-500 mb-2">{urlError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowUrlDialog(false); setUrlInput(''); setUrlError(''); }}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={handleAddByUrl}
                disabled={urlLoading || !urlInput.trim()}
              >
                {urlLoading ? (
                  <>
                    <Icon name="autorenew" className="w-3.5 h-3.5 animate-spin" />
                    크롤링 중...
                  </>
                ) : '추가'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProgramFilters;

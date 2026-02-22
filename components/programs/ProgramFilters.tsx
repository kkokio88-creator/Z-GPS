import Icon from '../ui/Icon';
import React from 'react';

interface ProgramFiltersProps {
  searchQuery: string;
  filterType: string;
  sortBy: 'fitScore' | 'deadline' | 'grant';
  supportTypes: string[];
  onSearchChange: (query: string) => void;
  onFilterTypeChange: (type: string) => void;
  onSortByChange: (sort: 'fitScore' | 'deadline' | 'grant') => void;
}

const ProgramFilters: React.FC<ProgramFiltersProps> = ({
  searchQuery,
  filterType,
  sortBy,
  supportTypes,
  onSearchChange,
  onFilterTypeChange,
  onSortByChange,
}) => {
  return (
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
    </div>
  );
};

export default ProgramFilters;

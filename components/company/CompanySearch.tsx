import React from 'react';
import { CompanySearchResult } from '../../types';

interface CompanySearchInputProps {
  searchQuery: string;
  isSearching: boolean;
  onQueryChange: (q: string) => void;
  onSearch: () => void;
}

export const CompanySearchInput: React.FC<CompanySearchInputProps> = ({
  searchQuery,
  isSearching,
  onQueryChange,
  onSearch,
}) => (
  <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
    <h2 className="text-lg font-bold mb-4 flex items-center">
      <span className="material-icons-outlined text-primary mr-2" aria-hidden="true">search</span>
      기업명으로 검색
    </h2>
    <div className="flex gap-2">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        placeholder="기업명을 입력하세요 (예: 삼성전자, 현대자동차)"
        className="flex-1 border border-gray-300 dark:border-gray-600 p-3 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      <button
        onClick={onSearch}
        disabled={isSearching || !searchQuery.trim()}
        className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSearching ? (
          <>
            <span className="material-icons-outlined animate-spin mr-2" aria-hidden="true">sync</span>
            검색 중...
          </>
        ) : (
          <>
            <span className="material-icons-outlined mr-2" aria-hidden="true">travel_explore</span>
            AI 검색
          </>
        )}
      </button>
    </div>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
      Gemini AI가 웹에서 기업 정보를 검색합니다.
    </p>
  </div>
);

interface CompanySearchResultsProps {
  results: CompanySearchResult[];
  onReset: () => void;
  onSelect: (result: CompanySearchResult) => void;
}

export const CompanySearchResults: React.FC<CompanySearchResultsProps> = ({
  results,
  onReset,
  onSelect,
}) => (
  <div className="bg-white dark:bg-surface-dark p-6 rounded-lg shadow border border-border-light dark:border-border-dark">
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-lg font-bold flex items-center">
        <span className="material-icons-outlined text-green-600 mr-2" aria-hidden="true">checklist</span>
        검색 결과 ({results.length}건)
      </h2>
      <button
        onClick={onReset}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
      >
        <span className="material-icons-outlined text-sm mr-1" aria-hidden="true">arrow_back</span>
        다시 검색
      </button>
    </div>

    {results.length === 0 ? (
      <div className="text-center py-8 text-gray-500">
        <span className="material-icons-outlined text-4xl mb-2" aria-hidden="true">search_off</span>
        <p>검색 결과가 없습니다.</p>
      </div>
    ) : (
      <div className="space-y-3">
        {results.map((result, index) => (
          <div
            key={index}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg">{result.name}</h3>
                  {result.industry && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                      {result.industry}
                    </span>
                  )}
                </div>
                {result.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{result.description}</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                  {result.address && (
                    <span className="flex items-center">
                      <span className="material-icons-outlined text-sm mr-1" aria-hidden="true">location_on</span>
                      {result.address}
                    </span>
                  )}
                  {result.establishedYear && (
                    <span className="flex items-center">
                      <span className="material-icons-outlined text-sm mr-1" aria-hidden="true">calendar_today</span>
                      {result.establishedYear}년 설립
                    </span>
                  )}
                  {result.estimatedRevenue && (
                    <span className="flex items-center">
                      <span className="material-icons-outlined text-sm mr-1" aria-hidden="true">payments</span>
                      {result.estimatedRevenue}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => onSelect(result)}
                className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm flex items-center ml-4 transition-colors"
              >
                <span className="material-icons-outlined text-sm mr-1" aria-hidden="true">science</span>
                이 기업 선택
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

import Icon from '../ui/Icon';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CategorizedProgram, formatGrant } from './programUtils';
import { VaultProgram, FitDimensions } from '../../services/vaultService';
import { getDday } from '../../services/utils/formatters';

interface ProgramListViewProps {
  programs: CategorizedProgram[];
  selectedProgramId: string | null;
  activeTab: 'all' | 'recommended' | 'interested' | 'rejected';
  analyzingSlug: string | null;
  isLoadingStrategy: boolean;
  vaultData: Map<string, VaultProgram>;
  applicationSlugs?: Set<string>;
  onReAnalyze: (e: React.MouseEvent, program: CategorizedProgram) => void;
  onCategorize: (program: CategorizedProgram, direction: 'left' | 'right') => void;
  onViewStrategy: (slug: string) => void;
}

const ProgramListView: React.FC<ProgramListViewProps> = ({
  programs,
  selectedProgramId,
  activeTab,
  analyzingSlug,
  isLoadingStrategy,
  vaultData,
  applicationSlugs,
  onReAnalyze,
  onCategorize,
  onViewStrategy,
}) => {
  const navigate = useNavigate();

  if (programs.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Icon name="search_off" className="h-5 w-5" />
        <p className="font-medium">검색 결과가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-2">
      {programs.map(program => {
        const dDay = getDday(program.officialEndDate);
        const vd = vaultData.get(program.id);
        return (
          <div
            key={program.id}
            className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer ${
              selectedProgramId === program.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => navigate(`/program/${program.id}`)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded font-medium">
                    {program.supportType}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${dDay.bgColor}`}>
                    {dDay.label}
                  </span>
                  {program.fitScore >= 90 && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-bold">
                      ★ 강력추천
                    </span>
                  )}
                  {program.fitScore >= 80 && program.fitScore < 90 && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                      추천
                    </span>
                  )}
                  {applicationSlugs && applicationSlugs.has(program.id) ? (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded font-medium">
                      지원서 작성됨
                    </span>
                  ) : program.fitScore >= 70 ? (
                    <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 rounded font-medium">
                      지원서 미작성
                    </span>
                  ) : null}
                </div>
                <h3 className="font-bold text-sm text-gray-800 dark:text-white truncate">
                  {program.programName}
                </h3>
                <p className="text-xs text-gray-400 truncate">{program.organizer}</p>
              </div>
              <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                <div className="text-right">
                  <p className="text-sm font-bold text-primary dark:text-green-400">
                    {formatGrant(program.expectedGrant, vd?.supportScale, program.supportType)}
                  </p>
                  <p className={`text-xs font-medium ${
                    program.fitScore >= 85 ? 'text-primary' : 'text-gray-500'
                  }`}>
                    적합도 {program.fitScore}%
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => onReAnalyze(e, program)}
                    disabled={analyzingSlug === program.id}
                    className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    title="재분석"
                  >
                    <span className={`material-icons-outlined text-blue-500 text-lg ${
                      analyzingSlug === program.id ? 'animate-spin' : ''
                    }`} aria-hidden="true">
                      {analyzingSlug === program.id ? 'sync' : 'refresh'}
                    </span>
                  </button>
                  {(activeTab === 'all' || activeTab === 'recommended') && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCategorize(program, 'left'); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="부적합"
                      >
                        <Icon name="close" className="h-5 w-5" />
                      </button>
                      {activeTab === 'recommended' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewStrategy(program.id); }}
                          disabled={isLoadingStrategy}
                          className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          title="전략 보기"
                        >
                          <Icon name="auto_awesome" className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onCategorize(program, 'right'); }}
                        className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20"
                        title="관심 등록"
                      >
                        <Icon name="favorite" className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 추천 탭: dimensions 미니 바 차트 */}
            {activeTab === 'recommended' && (() => {
              const dims = vd?.dimensions;
              if (!dims) return null;
              const dimEntries: { label: string; value: number }[] = [
                { label: '자격', value: dims.eligibilityMatch },
                { label: '업종', value: dims.industryRelevance },
                { label: '규모', value: dims.scaleFit },
                { label: '경쟁력', value: dims.competitiveness },
                { label: '전략', value: dims.strategicAlignment },
              ];
              return (
                <div className="flex gap-1 mt-2">
                  {dimEntries.map(d => (
                    <div key={d.label} className="flex-1">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>{d.label}</span>
                        <span>{d.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            d.value >= 80 ? 'bg-green-500' : d.value >= 60 ? 'bg-amber-500' : 'bg-gray-400'
                          }`}
                          style={{ width: `${d.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
};

export default ProgramListView;

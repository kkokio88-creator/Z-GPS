import Icon from '../ui/Icon';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CategorizedProgram } from './programUtils';
import { VaultProgram } from '../../services/vaultService';
import ProgramCard from './ProgramCard';

// ハート パーティクル コンポーネント
const HeartParticles: React.FC<{ show: boolean }> = React.memo(({ show }) => {
  if (!show) return null;
  const hearts = ['❤️', '💕', '💖', '💗', '💓', '🩷'];
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute text-3xl animate-heart-burst"
          style={{
            left: `${45 + Math.random() * 10}%`,
            top: `${35 + Math.random() * 15}%`,
            animationDelay: `${Math.random() * 0.2}s`,
            '--tx': `${(Math.random() - 0.5) * 250}px`,
            '--ty': `${-80 - Math.random() * 150}px`,
            '--rotate': `${Math.random() * 360}deg`,
            fontSize: `${24 + Math.random() * 16}px`,
          } as React.CSSProperties}
        >
          {hearts[Math.floor(Math.random() * hearts.length)]}
        </div>
      ))}
    </div>
  );
});

// 쓰레기통 애니메이션 컴포넌트
const TrashAnimation: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <div className="animate-trash-appear text-center">
        <div className="text-7xl mb-2">🗑️</div>
        <div className="text-gray-500 font-medium animate-pulse">부적합</div>
      </div>
    </div>
  );
};

interface ProgramSwipeViewProps {
  filteredPrograms: CategorizedProgram[];
  currentProgram: CategorizedProgram | null;
  currentIndex: number;
  activeTab: 'all' | 'recommended' | 'interested' | 'rejected';
  isDragging: boolean;
  dragOverlay: 'left' | 'right' | null;
  swipeDirection: 'left' | 'right' | null;
  showHearts: boolean;
  showTrash: boolean;
  isLoadingStrategy: boolean;
  vaultData: Map<string, VaultProgram>;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onSwipe: (direction: 'left' | 'right') => void;
  onRestoreProgram: (programId: string) => void;
  onViewStrategy: (slug: string) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

const ProgramSwipeView: React.FC<ProgramSwipeViewProps> = ({
  filteredPrograms,
  currentProgram,
  currentIndex,
  activeTab,
  isDragging,
  dragOverlay,
  swipeDirection,
  showHearts,
  showTrash,
  isLoadingStrategy,
  vaultData,
  cardRef,
  onSwipe,
  onRestoreProgram,
  onViewStrategy,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative">
      <HeartParticles show={showHearts} />
      <TrashAnimation show={showTrash} />

      {filteredPrograms.length === 0 ? (
        <div className="text-center">
          <Icon name={activeTab === 'all' ? 'check_circle' : activeTab === 'recommended' ? 'star_border' : activeTab === 'interested' ? 'favorite_border' : 'delete_outline'} className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-1">
            {activeTab === 'all' ? '모든 공고를 분류했습니다' :
             activeTab === 'recommended' ? '추천 공고가 없습니다' :
             activeTab === 'interested' ? '아직 관심 공고가 없습니다' : '부적합 공고가 없습니다'}
          </p>
          <p className="text-sm text-gray-400">
            {activeTab === 'all' ? '관심 공고 탭에서 확인하세요' :
             activeTab === 'recommended' ? '적합도 분석을 실행하면 80점 이상 공고가 여기 표시됩니다' :
             '공고를 탐색하고 분류해보세요'}
          </p>
        </div>
      ) : currentProgram && (
        <>
          {/* 스와이프 가이드 */}
          <div className="absolute top-0 left-0 right-0 flex justify-between px-8 text-xs text-gray-400">
            <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <Icon name="arrow_back" className="h-5 w-5" />
              <span>부적합</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span>관심 등록</span>
              <Icon name="arrow_forward" className="h-5 w-5" />
            </div>
          </div>

          {/* 카드 */}
          <ProgramCard
            program={currentProgram}
            currentIndex={currentIndex}
            totalCount={filteredPrograms.length}
            isDragging={isDragging}
            dragOverlay={dragOverlay}
            swipeDirection={swipeDirection}
            vaultData={vaultData}
            cardRef={cardRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />

          {/* 액션 버튼 - 미분류/추천 탭 */}
          {(activeTab === 'all' || activeTab === 'recommended') && (
            <div className="flex gap-4 mt-6 items-center">
              <button
                onClick={() => onSwipe('left')}
                className="group w-14 h-14 rounded-full bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center border border-gray-200 dark:border-gray-700"
              >
                <span className="text-xl">🗑️</span>
              </button>
              {activeTab === 'recommended' && (
                <button
                  onClick={() => currentProgram && onViewStrategy(currentProgram.id)}
                  disabled={isLoadingStrategy}
                  className="group w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-600 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                  title="전략 보기"
                >
                  <Icon name="auto_awesome" className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => currentProgram && navigate(`/program/${currentProgram.id}`)}
                className="group w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                title="상세 분석"
              >
                <Icon name="analytics" className="h-5 w-5" />
              </button>
              <button
                onClick={() => onSwipe('right')}
                className="group w-14 h-14 rounded-full bg-primary hover:bg-green-600 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
              >
                <span className="text-xl">❤️</span>
              </button>
            </div>
          )}

          {/* 액션 버튼 - 관심/부적합 탭 */}
          {activeTab !== 'all' && activeTab !== 'recommended' && (
            <div className="flex gap-3 mt-6 items-center">
              <button
                onClick={() => onRestoreProgram(currentProgram.id)}
                className="px-5 py-3 bg-white dark:bg-gray-800 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-md flex items-center gap-2"
              >
                <span>↩️</span>
                미분류로 복원
              </button>
              <button
                onClick={() => currentProgram && navigate(`/program/${currentProgram.id}`)}
                className="px-5 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md flex items-center gap-2"
              >
                <Icon name="analytics" className="h-5 w-5" />
                상세 분석
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProgramSwipeView;

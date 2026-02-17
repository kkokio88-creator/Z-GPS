import React, { useRef } from 'react';
import { CategorizedProgram, formatGrant } from './programUtils';
import { VaultProgram } from '../../services/vaultService';
import { getDday } from '../../services/utils/formatters';

interface ProgramCardProps {
  program: CategorizedProgram;
  currentIndex: number;
  totalCount: number;
  isDragging: boolean;
  dragOverlay: 'left' | 'right' | null;
  swipeDirection: 'left' | 'right' | null;
  vaultData: Map<string, VaultProgram>;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

const ProgramCard: React.FC<ProgramCardProps> = ({
  program,
  currentIndex,
  totalCount,
  isDragging,
  dragOverlay,
  swipeDirection,
  vaultData,
  cardRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const dDay = getDday(program.officialEndDate);
  const vd = vaultData.get(program.id);

  return (
    <div
      ref={cardRef}
      className={`relative w-full max-w-lg select-none touch-none ${
        swipeDirection === 'left' ? 'animate-swipe-left' :
        swipeDirection === 'right' ? 'animate-swipe-right' : ''
      }`}
      style={{
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 스와이프 오버레이 */}
      {dragOverlay === 'right' && (
        <div className="absolute inset-0 bg-primary/10 rounded-2xl flex items-center justify-center z-10 pointer-events-none border-2 border-primary">
          <div className="text-center">
            <span className="material-icons-outlined text-4xl text-primary mb-1" aria-hidden="true">favorite</span>
            <p className="text-primary font-bold">관심 등록</p>
          </div>
        </div>
      )}
      {dragOverlay === 'left' && (
        <div className="absolute inset-0 bg-gray-500/10 rounded-2xl flex items-center justify-center z-10 pointer-events-none border-2 border-gray-400">
          <div className="text-center">
            <span className="material-icons-outlined text-4xl text-gray-500 mb-1" aria-hidden="true">delete</span>
            <p className="text-gray-500 font-bold">부적합</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5 cursor-grab active:cursor-grabbing border border-gray-100 dark:border-gray-700">
        {/* 상단 배지 */}
        <div className="flex items-center justify-between mb-3">
          <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg font-medium">
            {program.supportType}
          </span>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${dDay.bgColor}`}>
            {dDay.label}
          </span>
        </div>

        {/* 제목 */}
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5 leading-snug line-clamp-2">
          {program.programName}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
          {program.organizer}
        </p>

        {/* 주요 정보 */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-0.5">예상 지원금</p>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-200">
              {formatGrant(program.expectedGrant, vd?.supportScale, program.supportType)}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-0.5">AI 적합도</p>
            <p className={`text-xl font-bold ${
              program.fitScore >= 85 ? 'text-primary dark:text-green-400' :
              program.fitScore >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'
            }`}>
              {program.fitScore}%
            </p>
          </div>
        </div>

        {/* 마감일 */}
        <div className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 mb-3">
          <span className="text-gray-500">마감일</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {new Date(program.officialEndDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>

        {/* 카드 인덱스 */}
        <div className="text-center text-xs text-gray-400">
          {currentIndex + 1} / {totalCount}
        </div>
      </div>
    </div>
  );
};

export default ProgramCard;

import React, { forwardRef } from 'react';

interface MagicToolbarState {
  show: boolean;
  instruction: string;
  onInstructionChange: (value: string) => void;
  onRewrite: () => void;
}

interface SectionCardProps {
  section: {
    id: string;
    title: string;
    description?: string;
    evaluationWeight?: string;
    hints?: string[];
    order?: number;
  };
  content: string;
  isGenerating: boolean;
  isAnyGenerating: boolean;
  onGenerateAI: () => void;
  onTextChange: (text: string) => void;
  onTextSelect: (e: React.SyntheticEvent) => void;
  magicToolbar?: MagicToolbarState;
}

const SectionCard = forwardRef<HTMLDivElement, SectionCardProps>(({
  section, content, isGenerating, isAnyGenerating,
  onGenerateAI, onTextChange, onTextSelect, magicToolbar,
}, ref) => {
  return (
    <div ref={ref} className="bg-white dark:bg-surface-dark rounded-lg shadow-sm border border-border-light dark:border-border-dark overflow-hidden relative transition-all duration-300">
      {/* Magic Toolbar */}
      {magicToolbar?.show && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 top-16 bg-white dark:bg-gray-900 border border-indigo-200 shadow-xl rounded-lg p-2 flex gap-2 items-center animate-fade-in-up">
          <span className="text-xs font-bold text-indigo-600 px-2 border-r">Magic Edit</span>
          <input
            type="text"
            className="text-xs border-none bg-transparent w-48 focus:ring-0"
            placeholder="수정 요청..."
            value={magicToolbar.instruction}
            onChange={e => magicToolbar.onInstructionChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') magicToolbar.onRewrite(); }}
            autoFocus
          />
          <button onClick={magicToolbar.onRewrite} className="bg-indigo-600 text-white rounded p-1">
            <span className="material-icons-outlined text-sm">auto_fix_high</span>
          </button>
        </div>
      )}

      {/* Section Header */}
      <div className="bg-gray-50 dark:bg-gray-800 px-6 py-3 border-b">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold flex items-center">
            <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs mr-2">
              {section.order || section.id.replace(/\D/g, '') || '?'}
            </span>
            {section.title}
          </h3>
          <div className="flex items-center space-x-2">
            {section.evaluationWeight && (
              <span className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-bold">
                {section.evaluationWeight}
              </span>
            )}
            <button
              onClick={onGenerateAI}
              disabled={isAnyGenerating}
              className="text-xs bg-white border px-3 py-1 rounded shadow-sm flex items-center hover:bg-gray-50 disabled:opacity-50"
            >
              {isGenerating ? '생성 중...' : 'AI 초안'}
            </button>
          </div>
        </div>
        {/* Description & Hints */}
        {(section.description || (section.hints && section.hints.length > 0)) && (
          <div className="mt-2 space-y-1">
            {section.description && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{section.description}</p>
            )}
            {section.hints && section.hints.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {section.hints.map((hint, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full">
                    {hint}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text Area */}
      <div className="p-6 relative">
        <textarea
          className="w-full p-4 border rounded-md text-sm resize-none h-48 focus:ring-1 focus:ring-primary focus:border-primary"
          value={content}
          onChange={e => onTextChange(e.target.value)}
          onSelect={onTextSelect}
          placeholder="내용을 입력하거나 AI 초안을 생성하세요."
        />
        {isGenerating && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="animate-spin material-icons-outlined text-3xl text-primary">autorenew</span>
          </div>
        )}
      </div>
    </div>
  );
});

SectionCard.displayName = 'SectionCard';

export default SectionCard;

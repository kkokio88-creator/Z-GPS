import Icon from '../ui/Icon';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CategorizedProgram, formatGrant, summarizeText, stripHtml } from './programUtils';
import { VaultProgram, FitDimensions } from '../../services/vaultService';
import { getDday } from '../../services/utils/formatters';

/** マークダウン レンダラー - 전략 문서 모달용 */
const MarkdownRenderer: React.FC<{ content: string }> = React.memo(({ content }) => {
  const processInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.substring(lastIndex, match.index));
      if (match[2]) parts.push(<strong key={key++} className="font-semibold text-gray-800 dark:text-gray-200">{match[2]}</strong>);
      else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>);
      else if (match[4]) parts.push(<code key={key++} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[11px] font-mono">{match[4]}</code>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) parts.push(text.substring(lastIndex));
    return parts.length === 0 ? text : <>{parts}</>;
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(<pre key={`code-${i}`} className="bg-gray-900 text-gray-100 rounded-lg p-4 my-3 text-xs overflow-x-auto leading-relaxed"><code>{codeLines.join('\n')}</code></pre>);
      i++; continue;
    }

    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) { tableLines.push(lines[i]); i++; }
      if (tableLines.length >= 2) {
        const parseRow = (row: string) => row.split('|').slice(1, -1).map(c => c.trim());
        const isSep = (r: string) => /^[\s|:-]+$/.test(r);
        const headers = parseRow(tableLines[0]);
        const dataRows = tableLines.filter((_, idx) => idx > 0 && !isSep(tableLines[idx]));
        elements.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-3 rounded-lg border border-gray-200 dark:border-gray-600">
            <table className="min-w-full text-xs">
              <thead><tr className="bg-gray-100 dark:bg-gray-700">{headers.map((h, j) => <th key={j} className="px-3 py-2 text-left font-semibold border-b border-gray-200 dark:border-gray-600">{processInline(h)}</th>)}</tr></thead>
              <tbody>{dataRows.map((row, r) => <tr key={r} className="even:bg-gray-50 dark:even:bg-gray-800/50">{parseRow(row).map((cell, c) => <td key={c} className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">{processInline(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    if (line.startsWith('#### ')) { elements.push(<h4 key={i} className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1">{processInline(line.slice(5))}</h4>); i++; continue; }
    if (line.startsWith('### ')) { elements.push(<h3 key={i} className="text-base font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1.5">{processInline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith('## ')) { elements.push(<h2 key={i} className="text-lg font-bold text-gray-800 dark:text-gray-200 mt-6 mb-2 pb-1.5 border-b border-gray-200 dark:border-gray-700">{processInline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('# ')) { elements.push(<h1 key={i} className="text-xl font-bold text-gray-900 dark:text-white mt-6 mb-3">{processInline(line.slice(2))}</h1>); i++; continue; }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) { quoteLines.push(lines[i].slice(2)); i++; }
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-r-lg pl-4 pr-3 py-2.5 my-3">
          {quoteLines.map((ql, qi) => <p key={qi} className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{processInline(ql)}</p>)}
        </blockquote>
      );
      continue;
    }

    if (line.match(/^[\s]*[-*+] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*+] /)) {
        const c = lines[i].replace(/^[\s]*[-*+] /, '');
        items.push(<li key={i} className="flex items-start gap-2 py-0.5"><span className="mt-2 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary" /><span className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{processInline(c)}</span></li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="my-2 space-y-0.5 ml-1">{items}</ul>);
      continue;
    }

    if (line.match(/^\s*\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\. /)) {
        const c = lines[i].replace(/^\s*\d+\.\s*/, '');
        const num = lines[i].match(/^\s*(\d+)\./)?.[1] || '1';
        items.push(<li key={i} className="flex items-start gap-2 py-0.5"><span className="text-primary font-bold text-xs min-w-[20px] mt-0.5 flex-shrink-0">{num}.</span><span className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{processInline(c)}</span></li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="my-2 space-y-0.5 ml-1">{items}</ol>);
      continue;
    }

    if (line.match(/^---+$/)) { elements.push(<hr key={i} className="my-4 border-gray-200 dark:border-gray-700" />); i++; continue; }
    if (line.trim() === '') { elements.push(<div key={i} className="h-2" />); i++; continue; }
    elements.push(<p key={i} className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed my-1.5">{processInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
});

interface ProgramDetailPanelProps {
  selectedProgram: CategorizedProgram | null;
  strategyModal: { slug: string; content: string } | null;
  isLoadingStrategy: boolean;
  vaultData: Map<string, VaultProgram>;
  onViewStrategy: (slug: string) => void;
  onCloseStrategy: () => void;
}

const ProgramDetailPanel: React.FC<ProgramDetailPanelProps> = ({
  selectedProgram,
  strategyModal,
  isLoadingStrategy,
  vaultData,
  onViewStrategy,
  onCloseStrategy,
}) => {
  const navigate = useNavigate();

  return (
    <>
      <div className="w-full lg:w-[380px] bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden flex flex-col border border-gray-100 dark:border-gray-700 max-h-[50vh] lg:max-h-none">
        {selectedProgram ? (() => {
          const vd = vaultData.get(selectedProgram.id);
          return (
            <>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200 mb-1">공고 상세</h3>
                <p className="text-xs text-gray-500 line-clamp-1">{selectedProgram.programName}</p>
              </div>

              {selectedProgram.fitScore >= 80 && (
                <div className="px-4 pt-3">
                  <button
                    onClick={() => onViewStrategy(selectedProgram.id)}
                    disabled={isLoadingStrategy}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    {isLoadingStrategy ? (
                      <Icon name="autorenew" className="h-8 w-8 text-primary animate-spin" />
                    ) : (
                      <Icon name="auto_awesome" className="h-5 w-5" />
                    )}
                    AI 전략 문서 보기
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 기본 정보 */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">기본 정보</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">주관기관</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[180px] truncate">{selectedProgram.organizer}</span>
                    </div>
                    {vd?.department && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">담당부서</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[180px] truncate">{vd.department}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">지원유형</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{selectedProgram.supportType}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">예상 지원금</span>
                      <span className="font-bold text-primary dark:text-green-400">{formatGrant(selectedProgram.expectedGrant, vd?.supportScale, selectedProgram.supportType)}</span>
                    </div>
                    {vd?.supportScale && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">지원규모</span>
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[180px] truncate">{vd.supportScale}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">마감일</span>
                      <span className={`font-medium text-xs px-2 py-0.5 rounded ${getDday(selectedProgram.officialEndDate).bgColor}`}>
                        {new Date(selectedProgram.officialEndDate).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 지원 대상 */}
                {vd?.targetAudience && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">지원 대상</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{vd.targetAudience}</p>
                  </div>
                )}

                {/* AI 적합도 */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">AI 분석</h4>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${
                        selectedProgram.fitScore >= 90 ? 'text-amber-500' :
                        selectedProgram.fitScore >= 80 ? 'text-primary dark:text-green-400' :
                        selectedProgram.fitScore >= 70 ? 'text-amber-500' : 'text-gray-500'
                      }`}>
                        {selectedProgram.fitScore}%
                      </div>
                      {selectedProgram.fitScore >= 90 && (
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">★ 강력추천</span>
                      )}
                      {selectedProgram.fitScore >= 80 && selectedProgram.fitScore < 90 && (
                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">추천</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            selectedProgram.fitScore >= 80 ? 'bg-primary' :
                            selectedProgram.fitScore >= 70 ? 'bg-amber-500' : 'bg-gray-400'
                          }`}
                          style={{ width: `${selectedProgram.fitScore}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 5차원 점수 바 차트 */}
                  {(() => {
                    const dims = vd?.dimensions;
                    if (!dims) return null;
                    const dimEntries: { label: string; key: keyof FitDimensions; weight: string }[] = [
                      { label: '자격요건 부합', key: 'eligibilityMatch', weight: '35%' },
                      { label: '업종/기술 관련', key: 'industryRelevance', weight: '25%' },
                      { label: '규모 적합성', key: 'scaleFit', weight: '15%' },
                      { label: '경쟁력', key: 'competitiveness', weight: '15%' },
                      { label: '전략적 부합', key: 'strategicAlignment', weight: '10%' },
                    ];
                    return (
                      <div className="space-y-1.5 mt-2">
                        {dimEntries.map(d => (
                          <div key={d.key}>
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="text-gray-500">{d.label} <span className="text-gray-400">({d.weight})</span></span>
                              <span className={`font-bold ${dims[d.key] >= 80 ? 'text-green-600' : dims[d.key] >= 60 ? 'text-amber-600' : 'text-gray-500'}`}>
                                {dims[d.key]}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  dims[d.key] >= 80 ? 'bg-green-500' : dims[d.key] >= 60 ? 'bg-amber-500' : 'bg-gray-400'
                                }`}
                                style={{ width: `${dims[d.key]}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* keyActions */}
                  {vd?.keyActions && vd.keyActions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">핵심 액션</p>
                      <ul className="space-y-1">
                        {vd.keyActions.slice(0, 3).map((action, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                            <span className="text-primary mt-0.5 flex-shrink-0">▸</span>
                            <span className="line-clamp-2">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* 사업 설명 */}
                {selectedProgram.description && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">사업 요약</h4>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {summarizeText(selectedProgram.description, 200)}
                      </p>
                    </div>
                  </div>
                )}

                {/* 필요 서류 */}
                {selectedProgram.requiredDocuments && selectedProgram.requiredDocuments.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">필요 서류</h4>
                    <ul className="space-y-1.5">
                      {selectedProgram.requiredDocuments.slice(0, 5).map((doc, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                          <span className="text-gray-400 mt-0.5">•</span>
                          <span className="line-clamp-2">{stripHtml(doc)}</span>
                        </li>
                      ))}
                      {selectedProgram.requiredDocuments.length > 5 && (
                        <li className="text-xs text-gray-400 pl-4">외 {selectedProgram.requiredDocuments.length - 5}개 항목</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="p-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                <button
                  onClick={() => navigate(`/program/${selectedProgram.id}`)}
                  className="w-full py-2.5 rounded-lg bg-primary text-white font-bold text-sm hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Icon name="analytics" className="h-5 w-5" />
                  상세 분석 보기
                </button>
              </div>
            </>
          );
        })() : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Icon name="description" className="h-5 w-5" />
              <p className="text-sm">공고를 선택하세요</p>
            </div>
          </div>
        )}
      </div>

      {/* 전략 문서 모달 */}
      {strategyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCloseStrategy}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="strategy-modal-title"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 id="strategy-modal-title" className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                <Icon name="auto_awesome" className="h-5 w-5" />
                전략 문서
              </h2>
              <button
                onClick={onCloseStrategy}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-none">
                <MarkdownRenderer content={strategyModal.content} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProgramDetailPanel;

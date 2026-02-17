import React, { useState, useEffect } from 'react';
import { DEFAULT_SECTION_SCHEMA } from '../../constants';
import { Company, SupportProgram, SectionSchema } from '../../types';
import { vaultService } from '../../services/vaultService';

interface Attachment {
  name: string;
  path: string;
  analyzed: boolean;
  downloadUrl: string;
}

interface ExportModalProps {
  company: Company;
  program: SupportProgram;
  draftSections: Record<string, string>;
  sections?: SectionSchema[];
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ company, program, draftSections, sections, onClose }) => {
  const sectionList = sections && sections.length > 0 ? sections : DEFAULT_SECTION_SCHEMA;
  const [activeTab, setActiveTab] = useState<'attachments' | 'preview'>('attachments');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);

  // 첨부파일 로드
  useEffect(() => {
    const loadAttachments = async () => {
      setIsLoadingAttachments(true);
      try {
        const result = await vaultService.getAttachments(program.id);
        setAttachments(result);
      } catch {
        // ignore
      } finally {
        setIsLoadingAttachments(false);
      }
    };
    loadAttachments();
  }, [program.id]);

  const getApiBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl) return envUrl;
    return '';
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.pdf')) return 'picture_as_pdf';
    if (name.endsWith('.hwp') || name.endsWith('.hwpx')) return 'article';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'description';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'table_chart';
    if (name.endsWith('.zip')) return 'folder_zip';
    return 'insert_drive_file';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="export-modal-title" className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-fade-in-up h-[95vh] flex flex-col">
        {/* Header with tabs */}
        <div className="px-6 py-3 bg-gray-800 text-white">
          <div className="flex justify-between items-center mb-3">
            <h3 id="export-modal-title" className="text-lg font-bold flex items-center">
              <span className="material-icons-outlined mr-2" aria-hidden="true">description</span>
              서식 및 첨부파일
            </h3>
            <button onClick={onClose} aria-label="닫기" className="text-white hover:text-gray-300">
              <span className="material-icons-outlined" aria-hidden="true">close</span>
            </button>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('attachments')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'attachments'
                  ? 'bg-white text-gray-800'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              <span className="material-icons-outlined text-sm mr-1 align-middle" aria-hidden="true">attach_file</span>
              공고 첨부파일 ({attachments.length})
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'preview'
                  ? 'bg-white text-gray-800'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              <span className="material-icons-outlined text-sm mr-1 align-middle" aria-hidden="true">print</span>
              지원서 미리보기
            </button>
          </div>
        </div>

        {/* Attachments Tab */}
        {activeTab === 'attachments' && (
          <div className="flex-1 overflow-hidden flex">
            {/* 파일 목록 */}
            <div className={`${selectedPdf ? 'w-72' : 'w-full'} border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4`}>
              {isLoadingAttachments ? (
                <div className="flex items-center justify-center py-16">
                  <span className="animate-spin material-icons-outlined text-3xl text-primary" aria-hidden="true">autorenew</span>
                </div>
              ) : attachments.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <span className="material-icons-outlined text-5xl mb-3 block" aria-hidden="true">folder_off</span>
                  <p className="font-medium mb-1">첨부파일이 없습니다</p>
                  <p className="text-xs">공고 동기화 시 첨부파일이 자동으로 다운로드됩니다.</p>
                  {program.detailUrl && (
                    <a
                      href={program.detailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                    >
                      <span className="material-icons-outlined text-sm" aria-hidden="true">open_in_new</span>
                      공고문 원문에서 다운로드
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 mb-3 font-medium">
                    {program.programName} 첨부파일
                  </p>
                  {attachments.map((att, idx) => {
                    const isPdf = att.name.endsWith('.pdf');
                    return (
                      <div
                        key={idx}
                        className={`bg-white dark:bg-gray-800 rounded-lg border p-3 hover:shadow-sm transition-all cursor-pointer ${
                          selectedPdf === att.downloadUrl
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                        onClick={() => isPdf && setSelectedPdf(att.downloadUrl)}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`material-icons-outlined text-2xl ${
                            isPdf ? 'text-red-500' : 'text-blue-500'
                          }`} aria-hidden="true">
                            {getFileIcon(att.name)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {att.name}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {att.analyzed && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded">
                                  AI 분석 완료
                                </span>
                              )}
                              {isPdf && (
                                <span className="text-[10px] text-gray-400">클릭하여 미리보기</span>
                              )}
                            </div>
                          </div>
                          <a
                            href={`${getApiBaseUrl()}${att.downloadUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                            title="새 탭에서 열기"
                          >
                            <span className="material-icons-outlined text-gray-500 text-lg" aria-hidden="true">open_in_new</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PDF 미리보기 */}
            {selectedPdf && (
              <div className="flex-1 bg-gray-200 dark:bg-gray-900">
                <iframe
                  src={`${getApiBaseUrl()}${selectedPdf}`}
                  className="w-full h-full border-0"
                  title="PDF Preview"
                />
              </div>
            )}
          </div>
        )}

        {/* Preview Tab (기존 HWP 미리보기) */}
        {activeTab === 'preview' && (
          <>
            <div className="flex-1 overflow-y-auto p-8 bg-gray-200 dark:bg-gray-900 flex justify-center">
              <div className="bg-white w-[210mm] min-h-[297mm] p-[20mm] shadow-lg text-black text-[11pt] leading-[1.6] font-serif">
                {/* Title */}
                <div className="border-4 border-double border-black p-4 mb-8 text-center">
                  <h1 className="text-3xl font-bold tracking-widest mb-4">[사업계획서]</h1>
                  <h2 className="text-xl font-bold">{program.programName}</h2>
                </div>

                {/* Table Summary */}
                <table className="w-full border-collapse border border-black mb-10 text-sm">
                  <tbody>
                    <tr>
                      <td className="border border-black bg-gray-100 p-2 text-center font-bold w-32">기업명</td>
                      <td className="border border-black p-2">{company.name}</td>
                      <td className="border border-black bg-gray-100 p-2 text-center font-bold w-32">대표자</td>
                      <td className="border border-black p-2">홍길동</td>
                    </tr>
                    <tr>
                      <td className="border border-black bg-gray-100 p-2 text-center font-bold">사업자번호</td>
                      <td className="border border-black p-2">{company.businessNumber}</td>
                      <td className="border border-black bg-gray-100 p-2 text-center font-bold">업종</td>
                      <td className="border border-black p-2">{company.industry}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Content Body */}
                {sectionList.map((section, idx) => (
                  <div key={section.id} className="mb-8">
                    <div className="flex items-center mb-3">
                      <div className="w-6 h-6 rounded-full border-2 border-black flex items-center justify-center font-bold text-sm mr-2">{idx + 1}</div>
                      <h3 className="text-lg font-bold border-b-2 border-gray-400 w-full pb-1">{section.title.split('(')[0]}</h3>
                    </div>
                    <div className="pl-4 text-justify whitespace-pre-wrap">
                      {(draftSections[section.id] || '내용 없음').split('\n').map((line, i) => (
                        <p key={i} className="mb-1">
                          {line.trim().startsWith('-') || line.trim().startsWith('\u2022') ? line : `  ${line}`}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 bg-white dark:bg-surface-dark border-t border-gray-200 flex justify-end gap-3">
              <button className="px-4 py-2 border rounded flex items-center hover:bg-gray-50">
                <span className="material-icons-outlined mr-2" aria-hidden="true">picture_as_pdf</span>PDF 저장
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded flex items-center hover:bg-blue-700">
                <span className="material-icons-outlined mr-2" aria-hidden="true">file_download</span>HWP 다운로드
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ExportModal;

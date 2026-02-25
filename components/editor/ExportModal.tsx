import Icon from '../ui/Icon';
import React, { useState, useEffect } from 'react';
import { DEFAULT_SECTION_SCHEMA } from '../../constants';
import { Company, SupportProgram, SectionSchema } from '../../types';
import { vaultService } from '../../services/vaultService';
import { exportToPdf, exportToDocx, exportToHwp } from '../../services/documentExport';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null); // 'pdf' | 'docx' | 'hwp' | null

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

  const handleExportPdf = async () => {
    setIsExporting('pdf');
    try {
        exportToPdf('export-preview-content');
    } catch {
        // silent - print dialog handles its own errors
    } finally {
        setTimeout(() => setIsExporting(null), 1000);
    }
  };

  const handleExportDocx = async () => {
    setIsExporting('docx');
    try {
        await exportToDocx({
            company: { name: company.name, businessNumber: company.businessNumber || '', industry: company.industry || '' },
            programName: program.programName,
            sections: sectionList.map(s => ({ id: s.id, title: s.title })),
            draftSections,
        });
    } catch (err) {
        if (import.meta.env.DEV) console.error('DOCX export failed:', err);
        alert('DOCX 내보내기에 실패했습니다.');
    } finally {
        setIsExporting(null);
    }
  };

  const handleExportHwp = () => {
    try {
      exportToHwp();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'HWP 내보내기 실패');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="export-modal-title" className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-fade-in-up h-[95vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-3 bg-gray-800 text-white">
          <div className="flex justify-between items-center">
            <h3 id="export-modal-title" className="text-lg font-bold flex items-center">
              <Icon name="description" className="h-5 w-5" />
              서식 및 첨부파일
            </h3>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기" className="text-white hover:text-gray-300 hover:bg-gray-700">
              <Icon name="close" className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue="attachments" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-3 mb-0 w-fit">
            <TabsTrigger value="attachments">
              <Icon name="attach_file" className="h-4 w-4 mr-1.5" />
              공고 첨부파일 ({attachments.length})
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Icon name="print" className="h-4 w-4 mr-1.5" />
              지원서 미리보기
            </TabsTrigger>
          </TabsList>

          {/* Attachments Tab */}
          <TabsContent value="attachments" className="flex-1 overflow-hidden flex mt-0">
            {/* 파일 목록 */}
            <div className={`${selectedPdf ? 'w-72' : 'w-full'} border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4`}>
              {isLoadingAttachments ? (
                <div className="flex items-center justify-center py-16">
                  <Icon name="autorenew" className="h-8 w-8 text-primary animate-spin" />
                </div>
              ) : attachments.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Icon name="folder_off" className="h-5 w-5" />
                  <p className="font-medium mb-1">첨부파일이 없습니다</p>
                  <p className="text-xs">공고 동기화 시 첨부파일이 자동으로 다운로드됩니다.</p>
                  {program.detailUrl && (
                    <a
                      href={program.detailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                    >
                      <Icon name="open_in_new" className="h-5 w-5" />
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
                            <Icon name="open_in_new" className="h-5 w-5" />
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
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="flex-1 flex flex-col overflow-hidden mt-0">
            <div className="flex-1 overflow-y-auto p-8 bg-gray-200 dark:bg-gray-900 flex justify-center">
              <div id="export-preview-content" className="bg-white w-[210mm] min-h-[297mm] p-[20mm] shadow-lg text-black text-[11pt] leading-[1.6] font-serif">
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
              <Button
                variant="outline"
                onClick={handleExportPdf}
                disabled={isExporting !== null}
              >
                <Icon name="picture_as_pdf" className="h-4 w-4" />
                {isExporting === 'pdf' ? '준비 중...' : 'PDF 저장'}
              </Button>
              <Button
                variant="outline"
                onClick={handleExportDocx}
                disabled={isExporting !== null}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Icon name="description" className="h-4 w-4" />
                {isExporting === 'docx' ? '생성 중...' : 'DOCX 다운로드'}
              </Button>
              <Button
                onClick={handleExportHwp}
                disabled={isExporting !== null}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Icon name="file_download" className="h-4 w-4" />
                HWP 다운로드
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ExportModal;

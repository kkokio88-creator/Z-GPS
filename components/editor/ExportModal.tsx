import React from 'react';
import { DEFAULT_SECTION_SCHEMA } from '../../constants';
import { Company, SupportProgram, SectionSchema } from '../../types';

interface ExportModalProps {
  company: Company;
  program: SupportProgram;
  draftSections: Record<string, string>;
  sections?: SectionSchema[];
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ company, program, draftSections, sections, onClose }) => {
  const sectionList = sections && sections.length > 0 ? sections : DEFAULT_SECTION_SCHEMA;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-surface-dark rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-fade-in-up h-[95vh] flex flex-col">
        <div className="px-6 py-4 bg-gray-800 text-white flex justify-between items-center">
          <h3 className="text-lg font-bold flex items-center">
            <span className="material-icons-outlined mr-2">description</span>정부 표준 서식 미리보기 (HWP Style)
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-300">
            <span className="material-icons-outlined">close</span>
          </button>
        </div>
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
            <span className="material-icons-outlined mr-2">picture_as_pdf</span>PDF 저장
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded flex items-center hover:bg-blue-700">
            <span className="material-icons-outlined mr-2">file_download</span>HWP 다운로드
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;

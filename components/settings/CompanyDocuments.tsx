import React, { useState, useRef } from 'react';
import { vaultService, type VaultDocumentMeta } from '../../services/vaultService';
import Icon from '../ui/Icon';

const ACCEPTED_FILE_TYPES = '.pdf,.hwp,.doc,.docx,.jpg,.jpeg,.png,.zip,.xlsx,.xls';

const FILE_TYPE_STYLES: Record<string, { color: string; icon: string }> = {
  PDF: { color: 'text-red-500', icon: 'picture_as_pdf' },
  HWP: { color: 'text-blue-500', icon: 'article' },
  DOC: { color: 'text-blue-600', icon: 'article' },
  DOCX: { color: 'text-blue-600', icon: 'article' },
  IMAGE: { color: 'text-green-500', icon: 'image' },
  EXCEL: { color: 'text-green-600', icon: 'table_chart' },
  ZIP: { color: 'text-yellow-600', icon: 'folder_zip' },
  OTHER: { color: 'text-gray-400', icon: 'insert_drive_file' },
};

const formatDate = (iso: string): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

interface CompanyDocumentsProps {
  documents: VaultDocumentMeta[];
  docsLoading: boolean;
  onRefresh: () => void;
}

const CompanyDocuments: React.FC<CompanyDocumentsProps> = ({ documents, docsLoading, onRefresh }) => {
  const [docName, setDocName] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!docName.trim() || !docFile) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => { resolve((reader.result as string).split(',')[1] || (reader.result as string)); };
        reader.onerror = reject;
        reader.readAsDataURL(docFile);
      });
      await vaultService.uploadCompanyDocument(docName.trim(), docFile.name, base64);
      setDocName('');
      setDocFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onRefresh();
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '서류가 등록되었습니다.', type: 'success' } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: `서류 등록 실패: ${String(e)}`, type: 'error' } }));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, name: string) => {
    if (!window.confirm(`"${name}" 서류를 삭제하시겠습니까?`)) return;
    try {
      await vaultService.deleteCompanyDocument(docId);
      onRefresh();
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '서류가 삭제되었습니다.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('zmis-toast', { detail: { message: '서류 삭제에 실패했습니다.', type: 'error' } }));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
        <Icon name="folder_shared" className="h-5 w-5" />
        기업 서류함
      </h3>
      <p className="text-xs text-gray-400 mb-4">여기에 등록한 서류는 지원서 작성 시 자동으로 활용됩니다.</p>

      {docsLoading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Icon name="refresh" className="h-5 w-5" />로딩 중...
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Icon name="upload_file" className="h-5 w-5" />
          <p className="text-sm">등록된 서류가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-5">
          {documents.map(doc => {
            const style = FILE_TYPE_STYLES[doc.fileType] || FILE_TYPE_STYLES.OTHER;
            return (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 group">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Icon name={style.icon} className="h-5 w-5" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{doc.name}</div>
                    <div className="text-xs text-gray-400 truncate">{doc.fileName} &middot; {formatDate(doc.uploadDate)}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.id, doc.name)}
                  className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="삭제"
                >
                  <Icon name="delete" className="h-5 w-5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
        <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-3">서류 추가</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">서류명</label>
            <input
              type="text"
              value={docName}
              onChange={e => setDocName(e.target.value)}
              placeholder="예: 사업자등록증, HACCP 인증서"
              className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">파일 선택</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={e => setDocFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-600 dark:file:text-indigo-300 hover:file:bg-indigo-100"
            />
            <p className="text-xs text-gray-400 mt-1">지원 형식: PDF, HWP, DOCX, JPG, PNG, ZIP, XLSX</p>
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading || !docName.trim() || !docFile}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white py-2.5 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {uploading ? (
              <><Icon name="refresh" className="h-5 w-5" />업로드 중...</>
            ) : (
              <><Icon name="upload" className="h-5 w-5" />서류 등록</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyDocuments;

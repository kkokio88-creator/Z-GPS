import React from 'react';
import type { BenefitCategory, BenefitStatus } from '../../types';
import { CATEGORIES, STATUS_LABELS } from './constants';

export interface BenefitFormState {
  programName: string;
  category: BenefitCategory;
  receivedAmount: string;
  receivedDate: string;
  organizer: string;
  conditions: string;
  expiryDate: string;
  tags: string;
  conditionsMet: boolean | null;
  status: BenefitStatus;
}

interface BenefitFormProps {
  form: BenefitFormState;
  editingId: string | null;
  onFormChange: (updater: (f: BenefitFormState) => BenefitFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const BenefitForm: React.FC<BenefitFormProps> = ({ form, editingId, onFormChange, onSubmit, onCancel }) => {
  const isValid = !!(form.programName && form.receivedAmount && form.receivedDate && form.organizer);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="benefit-form-title" className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h3 id="benefit-form-title" className="text-lg font-bold text-gray-900 dark:text-white">
            {editingId ? '수령 이력 수정' : '새 수령 이력 등록'}
          </h3>
          <button onClick={onCancel} aria-label="닫기" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <span className="material-icons-outlined" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">사업명 *</label>
            <input
              type="text"
              value={form.programName}
              onChange={e => onFormChange(f => ({ ...f, programName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="예: 2024 중소기업 고용장려금"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">카테고리</label>
              <select
                value={form.category}
                onChange={e => onFormChange(f => ({ ...f, category: e.target.value as BenefitCategory }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">상태</label>
              <select
                value={form.status}
                onChange={e => onFormChange(f => ({ ...f, status: e.target.value as BenefitStatus }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수령 금액 (원) *</label>
              <input
                type="number"
                value={form.receivedAmount}
                onChange={e => onFormChange(f => ({ ...f, receivedAmount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                placeholder="50000000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수령일 *</label>
              <input
                type="date"
                value={form.receivedDate}
                onChange={e => onFormChange(f => ({ ...f, receivedDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">주관기관 *</label>
            <input
              type="text"
              value={form.organizer}
              onChange={e => onFormChange(f => ({ ...f, organizer: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              placeholder="예: 중소벤처기업부"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">의무 조건</label>
            <input
              type="text"
              value={form.conditions}
              onChange={e => onFormChange(f => ({ ...f, conditions: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              placeholder="예: 채용 인원 6개월 유지"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">의무이행 기한</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={e => onFormChange(f => ({ ...f, expiryDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">의무이행 여부</label>
              <select
                value={form.conditionsMet === null ? 'null' : String(form.conditionsMet)}
                onChange={e => {
                  const v = e.target.value;
                  onFormChange(f => ({ ...f, conditionsMet: v === 'null' ? null : v === 'true' }));
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="null">확인 안 됨</option>
                <option value="true">이행 완료</option>
                <option value="false">미이행</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">태그 (쉼표 구분)</label>
            <input
              type="text"
              value={form.tags}
              onChange={e => onFormChange(f => ({ ...f, tags: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              placeholder="예: 고용, 청년"
            />
          </div>
        </div>
        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            취소
          </button>
          <button
            onClick={onSubmit}
            disabled={!isValid}
            className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingId ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BenefitForm;

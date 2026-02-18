import React, { useState } from 'react';

const InlineSaveMessage: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400 ml-3 animate-pulse">
      <span className="material-icons-outlined text-sm mr-1" aria-hidden="true">check_circle</span>
      저장되었습니다
    </span>
  );
};

interface ApiTabProps {
  apiKey: string;
  dartApiKey: string;
  npsApiKey: string;
  aiModel: string;
  apiSaved: boolean;
  onApiKeyChange: (v: string) => void;
  onDartApiKeyChange: (v: string) => void;
  onNpsApiKeyChange: (v: string) => void;
  onAiModelChange: (v: string) => void;
  onSave: () => void;
}

const ApiTab: React.FC<ApiTabProps> = ({
  apiKey,
  dartApiKey,
  npsApiKey,
  aiModel,
  apiSaved,
  onApiKeyChange,
  onDartApiKeyChange,
  onNpsApiKeyChange,
  onAiModelChange,
  onSave,
}) => {
  const [npsGuideOpen, setNpsGuideOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <span className="material-icons-outlined" aria-hidden="true">vpn_key</span>
            API 설정
          </h3>
          <InlineSaveMessage show={apiSaved} />
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Gemini API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => onApiKeyChange(e.target.value)}
                placeholder="Gemini API 키를 입력하세요"
                className="flex-1 border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-sm"
              >
                <span className="material-icons-outlined text-sm" aria-hidden="true">open_in_new</span>
                발급
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1">Google AI Studio에서 무료로 발급 가능합니다</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Open DART API Key (선택)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dartApiKey}
                onChange={e => onDartApiKeyChange(e.target.value)}
                placeholder="DART API 키를 입력하세요"
                className="flex-1 border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <a
                href="https://opendart.fss.or.kr/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-sm"
              >
                <span className="material-icons-outlined text-sm" aria-hidden="true">open_in_new</span>
                발급
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1">금융감독원 전자공시 데이터 조회용</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">공공데이터포털 API Key (국민연금)</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={npsApiKey}
                onChange={e => onNpsApiKeyChange(e.target.value)}
                placeholder="공공데이터포털 인증키를 입력하세요"
                className="flex-1 border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <a
                href="https://www.data.go.kr/data/15083277/openapi.do"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-sm"
              >
                <span className="material-icons-outlined text-sm" aria-hidden="true">open_in_new</span>
                신청
              </a>
            </div>
            <p className="text-xs text-gray-400 mt-1">국민연금 사업장 정보 API를 연결하면 세금 환급 분석의 정확도가 높아집니다</p>
            <button
              type="button"
              onClick={() => setNpsGuideOpen(v => !v)}
              className="mt-2 text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 flex items-center gap-1"
            >
              <span className="material-icons-outlined text-sm" aria-hidden="true">{npsGuideOpen ? 'expand_less' : 'info'}</span>
              연결 방법 안내
            </button>
            {npsGuideOpen && (
              <ol className="mt-2 ml-4 text-xs text-gray-500 dark:text-gray-400 space-y-1 list-decimal">
                <li>data.go.kr 회원가입 (공공데이터포털)</li>
                <li>'국민연금공단_국민연금 사업장 정보' API 신청</li>
                <li>즉시 승인 — 발급된 인증키를 위 필드에 입력</li>
                <li>저장 후 세금 환급 탭에서 재스캔</li>
              </ol>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">AI 모델</label>
            <select
              value={aiModel}
              onChange={e => onAiModelChange(e.target.value)}
              className="w-full border rounded-lg p-2.5 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (빠름)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (정확)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            </select>
          </div>

          <button
            onClick={onSave}
            className="w-full bg-gray-800 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-icons-outlined text-sm" aria-hidden="true">save</span>
            API 설정 저장
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiTab;

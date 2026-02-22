import React from 'react';
import Icon from '../ui/Icon';

const InlineSaveMessage: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400 ml-3 animate-pulse">
      <Icon name="check_circle" className="h-5 w-5" />
      저장되었습니다
    </span>
  );
};

export interface CrawlingConfig {
  sources: { incheon: boolean; mss: boolean; kstartup: boolean };
  autoDownloadAttachments: boolean;
}

interface CrawlingTabProps {
  crawlingConfig: CrawlingConfig;
  crawlingSaved: boolean;
  onConfigChange: (config: CrawlingConfig) => void;
  onSave: () => void;
}

const CrawlingTab: React.FC<CrawlingTabProps> = ({
  crawlingConfig,
  crawlingSaved,
  onConfigChange,
  onSave,
}) => (
  <div className="space-y-6">
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Icon name="travel_explore" className="h-5 w-5" />
          공고 수집 설정
        </h3>
        <InlineSaveMessage show={crawlingSaved} />
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">4단계 자동 파이프라인</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { step: 1, label: 'API 수집', desc: '공공 API 데이터', icon: 'cloud_download', color: 'blue' },
              { step: 2, label: 'URL 크롤링', desc: '상세페이지 파싱', icon: 'language', color: 'amber' },
              { step: 3, label: 'AI 강화', desc: '첨부파일 + Gemini', icon: 'auto_awesome', color: 'purple' },
              { step: 4, label: '적합도 분석', desc: '5차원 평가', icon: 'psychology', color: 'emerald' },
            ].map(({ step, label, desc, icon, color }) => (
              <div key={step} className={`p-3 rounded-xl border border-${color}-200 dark:border-${color}-800 bg-${color}-50 dark:bg-${color}-900/20 text-center`}>
                <Icon name={icon} className="h-5 w-5" />
                <div className="font-bold text-xs mt-1">{step}. {label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">동기화 버튼 하나로 4단계를 자동 진행합니다. 이미 처리된 단계는 건너뜁니다.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">데이터 소스</label>
          <div className="space-y-3">
            {[
              { key: 'incheon' as const, label: '인천 BizOK', desc: 'ODCLOUD API' },
              { key: 'mss' as const, label: '중소벤처기업부', desc: 'data.go.kr' },
              { key: 'kstartup' as const, label: 'K-Startup', desc: '창업진흥원' },
            ].map(source => (
              <label key={source.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer">
                <div>
                  <div className="font-medium text-sm">{source.label}</div>
                  <div className="text-xs text-gray-400">{source.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={crawlingConfig.sources[source.key]}
                  onChange={e => onConfigChange({
                    ...crawlingConfig,
                    sources: { ...crawlingConfig.sources, [source.key]: e.target.checked },
                  })}
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                />
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer">
          <div>
            <div className="font-medium text-sm">첨부파일 자동 다운로드</div>
            <div className="text-xs text-gray-400">PDF, HWP 등 공고문 첨부파일 자동 저장</div>
          </div>
          <input
            type="checkbox"
            checked={crawlingConfig.autoDownloadAttachments}
            onChange={e => onConfigChange({ ...crawlingConfig, autoDownloadAttachments: e.target.checked })}
            className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
          />
        </label>

        <button
          onClick={onSave}
          className="w-full bg-gray-800 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
        >
          <Icon name="save" className="h-5 w-5" />
          수집 설정 저장
        </button>
      </div>
    </div>
  </div>
);

export default CrawlingTab;

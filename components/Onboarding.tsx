import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeOnboarding } from '../services/storageService';

interface OnboardingProps {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: 'business',
    title: '기업 정보 등록',
    description: 'AI가 기업명으로 검색하여 기본 정보를 자동으로 채워줍니다.\nSWOT 분석, 재무 현황, 핵심 역량까지 한 번에 파악하세요.',
    action: '기업 등록하러 가기',
    path: '/company',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    icon: 'explore',
    title: '지원사업 탐색',
    description: '정부 지원사업 공고를 스와이프로 빠르게 분류하세요.\n관심 공고를 선별하면 AI가 적합도를 분석해줍니다.',
    action: '공고 탐색하기',
    path: '/explore',
    color: 'from-green-500 to-emerald-600',
  },
  {
    icon: 'edit_document',
    title: 'AI 지원서 작성',
    description: '기업 정보와 공고를 바탕으로 AI가 지원서 초안을 작성합니다.\n6개 특화 에이전트가 협업하여 최적의 지원서를 만들어냅니다.',
    action: '시작하기',
    path: '/',
    color: 'from-purple-500 to-pink-600',
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const handleAction = () => {
    const step = STEPS[currentStep];
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
      onComplete();
      navigate(step.path);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    onComplete();
  };

  const step = STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Progress */}
        <div className="flex gap-1.5 p-4 pb-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i <= currentStep ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
            <span className="material-icons-outlined text-white text-4xl">{step.icon}</span>
          </div>

          <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">
            Step {currentStep + 1} / {STEPS.length}
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {step.title}
          </h2>

          <p className="text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-line mb-8">
            {step.description}
          </p>

          <button
            onClick={handleAction}
            className={`w-full py-3.5 rounded-xl bg-gradient-to-r ${step.color} text-white font-bold text-base hover:opacity-90 transition-opacity shadow-md`}
          >
            {step.action}
          </button>
        </div>

        {/* Footer */}
        <div className="px-8 pb-6 flex justify-between items-center">
          {currentStep > 0 ? (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
            >
              <span className="material-icons-outlined text-sm">arrow_back</span>
              이전
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            건너뛰기
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;

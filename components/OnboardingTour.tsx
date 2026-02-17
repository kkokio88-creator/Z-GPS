import React, { useState, useEffect } from 'react';

const TOUR_STEPS = [
    {
        target: 'body', // Center modal
        title: 'Z-GPS에 오신 것을 환영합니다!',
        content: '정부지원사업 매칭부터 서류 작성, 관리까지 AI가 도와주는 올인원 플랫폼입니다. 간단한 투어를 시작하시겠습니까?',
        position: 'center'
    },
    {
        target: 'nav', // Sidebar
        title: '워크스페이스',
        content: '대시보드, 시장 조사, 기업 정보 관리 등 주요 기능에 빠르게 접근할 수 있는 네비게이션 바입니다.',
        position: 'right-top'
    },
    {
        target: 'header button', // Action Button (usually first)
        title: '주요 액션',
        content: '각 페이지의 핵심 기능(지원사업 찾기, 저장 등)은 항상 우측 상단에 위치합니다.',
        position: 'bottom-right'
    },
    {
        target: 'body',
        title: '투어 완료',
        content: '이제 Z-GPS와 함께 성공적인 정부과제 수주를 시작해보세요! 궁금한 점은 언제든 AI 챗봇에게 물어보세요.',
        position: 'center'
    }
];

const OnboardingTour: React.FC = () => {
    const [stepIndex, setStepIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const hasSeenTour = localStorage.getItem('z_gps_tour_seen');
        if (!hasSeenTour) {
            setIsVisible(true);
        }
    }, []);

    const handleNext = () => {
        if (stepIndex < TOUR_STEPS.length - 1) {
            setStepIndex(stepIndex + 1);
        } else {
            handleComplete();
        }
    };

    const handleComplete = () => {
        localStorage.setItem('z_gps_tour_seen', 'true');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    const currentStep = TOUR_STEPS[stepIndex];
    const isCenter = currentStep.position === 'center';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-fade-in">
            <div role="dialog" aria-modal="true" aria-labelledby="tour-step-title" className={`bg-white dark:bg-surface-dark rounded-xl shadow-2xl p-6 max-w-md w-full relative border border-gray-200 dark:border-gray-700 ${isCenter ? '' : 'absolute top-1/4'}`}>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 h-1 rounded-full mb-4">
                    <div 
                        className="bg-primary h-1 rounded-full transition-all duration-300" 
                        style={{ width: `${((stepIndex + 1) / TOUR_STEPS.length) * 100}%` }}
                    ></div>
                </div>

                <div className="flex justify-between items-start mb-2">
                    <h3 id="tour-step-title" className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                        {stepIndex === 0 && <span className="text-2xl mr-2">👋</span>}
                        {currentStep.title}
                    </h3>
                    <button onClick={handleComplete} className="text-gray-400 hover:text-gray-600">
                        <span className="material-icons-outlined text-sm" aria-hidden="true">close</span>
                    </button>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
                    {currentStep.content}
                </p>

                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-mono">
                        {stepIndex + 1} / {TOUR_STEPS.length}
                    </span>
                    <button 
                        onClick={handleNext}
                        className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-all shadow-md flex items-center"
                    >
                        {stepIndex === TOUR_STEPS.length - 1 ? '시작하기' : '다음'}
                        {stepIndex < TOUR_STEPS.length - 1 && <span className="material-icons-outlined text-sm ml-1" aria-hidden="true">arrow_forward</span>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OnboardingTour;
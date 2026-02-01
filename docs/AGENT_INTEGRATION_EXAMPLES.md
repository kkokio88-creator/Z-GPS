# Agent Integration Examples 🔌

이 문서는 Multi-Agent System을 기존 컴포넌트에 통합하는 실제 예제를 제공합니다.

## 목차
1. [App.tsx - 시스템 초기화](#1-apptsx---시스템-초기화)
2. [ApplicationEditor.tsx - 지원서 자동 생성](#2-applicationeditortsx---지원서-자동-생성)
3. [ApplicationEditor.tsx - 검토 요청](#3-applicationeditortsx---검토-요청)
4. [CompanyProfile.tsx - 프로필 강화](#4-companyprofiletsx---프로필-강화)
5. [ProgramExplorer.tsx - 자격 검토](#5-programexplorertsx---자격-검토)

---

## 1. App.tsx - 시스템 초기화

앱 시작 시 Multi-Agent System을 자동으로 초기화합니다.

```typescript
import React, { useEffect } from 'react';
import { AgentIntegration } from './services/agentIntegration';

const App: React.FC = () => {
  useEffect(() => {
    // 앱 시작 시 에이전트 시스템 초기화
    AgentIntegration.initialize().catch(err => {
      console.error('Failed to initialize agent system:', err);
    });
  }, []);

  return (
    <div className="App">
      {/* 기존 앱 컨텐츠 */}
    </div>
  );
};

export default App;
```

---

## 2. ApplicationEditor.tsx - 지원서 자동 생성

"AI로 전체 작성" 버튼을 추가하여 전체 지원서를 자동으로 생성합니다.

### 코드 예제

```typescript
import React, { useState } from 'react';
import { AgentIntegration } from '../services/agentIntegration';
import { Company, SupportProgram } from '../types';

const ApplicationEditor: React.FC = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ stage: '', percent: 0 });

  const company = getStoredCompany();
  const program = getCurrentProgram(); // 현재 선택된 프로그램

  const handleAutoGenerate = async () => {
    setIsGenerating(true);

    try {
      await AgentIntegration.generateApplication(
        company,
        program,
        (stage, percent) => {
          setProgress({ stage, percent });
        }
      );

      alert('지원서가 성공적으로 생성되었습니다!');
      // 생성된 내용을 UI에 반영
      loadGeneratedDraft();
    } catch (error) {
      console.error('생성 실패:', error);
      alert('지원서 생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
      setProgress({ stage: '', percent: 0 });
    }
  };

  return (
    <div>
      {/* 기존 UI */}

      {/* AI 자동 생성 버튼 */}
      <button
        onClick={handleAutoGenerate}
        disabled={isGenerating}
        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold hover:scale-105 transition-transform disabled:opacity-50"
      >
        {isGenerating ? (
          <>
            <span className="material-icons-outlined animate-spin mr-2">autorenew</span>
            생성 중... {progress.percent.toFixed(0)}%
          </>
        ) : (
          <>
            <span className="material-icons-outlined mr-2">psychology</span>
            AI로 전체 작성
          </>
        )}
      </button>

      {/* 진행 상황 표시 */}
      {isGenerating && (
        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-2">{progress.stage}</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
```

---

## 3. ApplicationEditor.tsx - 검토 요청

작성된 지원서를 AI 에이전트들이 검토하도록 요청합니다.

### 코드 예제

```typescript
const ApplicationEditor: React.FC = () => {
  const [isReviewing, setIsReviewing] = useState(false);
  const application = getCurrentApplication(); // 현재 지원서

  const handleReviewRequest = async () => {
    if (!confirm('AI 에이전트들에게 검토를 요청하시겠습니까?')) return;

    setIsReviewing(true);

    try {
      await AgentIntegration.reviewApplication(
        application,
        (stage, percent) => {
          console.log(`검토 진행: ${stage} - ${percent}%`);
        }
      );

      // 검토 결과를 공유 메모리에서 가져오기
      const insights = AgentIntegration.getInsights(['review', 'feedback']);
      console.log('검토 결과:', insights);

      alert('검토가 완료되었습니다. 피드백을 확인하세요.');
    } catch (error) {
      console.error('검토 실패:', error);
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div>
      {/* 검토 요청 버튼 */}
      <button
        onClick={handleReviewRequest}
        disabled={isReviewing}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        {isReviewing ? (
          <>
            <span className="material-icons-outlined animate-spin mr-2">hourglass_empty</span>
            검토 중...
          </>
        ) : (
          <>
            <span className="material-icons-outlined mr-2">rate_review</span>
            AI 검토 요청
          </>
        )}
      </button>
    </div>
  );
};
```

---

## 4. CompanyProfile.tsx - 프로필 강화

회사 프로필을 AI가 분석하고 자동으로 강화합니다.

### 코드 예제

```typescript
const CompanyProfile: React.FC = () => {
  const [company, setCompany] = useState(getStoredCompany());
  const [isEnhancing, setIsEnhancing] = useState(false);

  const handleEnhanceProfile = async () => {
    setIsEnhancing(true);

    try {
      await AgentIntegration.enhanceProfile(
        company,
        (stage, percent) => {
          console.log(`강화 진행: ${stage} - ${percent}%`);
        }
      );

      // 강화된 프로필 데이터 가져오기
      const insights = AgentIntegration.getInsights(['company', 'analysis']);

      if (insights.length > 0) {
        const latestInsight = insights[0].content as {
          companyId: string;
          strengths: string[];
        };

        // 프로필 업데이트
        const updatedCompany = {
          ...company,
          coreCompetencies: latestInsight.strengths,
        };

        setCompany(updatedCompany);
        saveStoredCompany(updatedCompany);

        alert('프로필이 성공적으로 강화되었습니다!');
      }
    } catch (error) {
      console.error('강화 실패:', error);
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div>
      {/* 기존 프로필 UI */}

      {/* AI 강화 버튼 */}
      <button
        onClick={handleEnhanceProfile}
        disabled={isEnhancing}
        className="mt-4 px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-lg font-medium hover:scale-105 transition-transform"
      >
        {isEnhancing ? (
          <>
            <span className="material-icons-outlined animate-spin mr-2">sync</span>
            AI가 분석 중...
          </>
        ) : (
          <>
            <span className="material-icons-outlined mr-2">auto_awesome</span>
            AI로 프로필 강화
          </>
        )}
      </button>

      {/* 강화된 정보 표시 */}
      {company.coreCompetencies && company.coreCompetencies.length > 0 && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <h4 className="font-bold text-green-900 dark:text-green-300 mb-2">
            AI가 분석한 핵심 경쟁력
          </h4>
          <ul className="space-y-1">
            {company.coreCompetencies.map((competency, idx) => (
              <li key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                • {competency}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
```

---

## 5. ProgramExplorer.tsx - 자격 검토

프로그램 선택 시 자동으로 자격 적합성을 검토합니다.

### 코드 예제

```typescript
const ProgramExplorer: React.FC = () => {
  const [selectedProgram, setSelectedProgram] = useState<SupportProgram | null>(null);
  const [eligibilityStatus, setEligibilityStatus] = useState<'checking' | 'ready' | 'error'>('ready');
  const company = getStoredCompany();

  const handleProgramSelect = async (program: SupportProgram) => {
    setSelectedProgram(program);
    setEligibilityStatus('checking');

    try {
      // 백그라운드에서 자격 검토 실행
      AgentIntegration.checkEligibility(
        company,
        program,
        (stage, percent) => {
          console.log(`적합성 검토: ${stage} - ${percent}%`);
        }
      ).then(() => {
        setEligibilityStatus('ready');

        // 검토 결과 가져오기
        const insights = AgentIntegration.getInsights(['eligibility', 'program']);
        console.log('적합성 검토 결과:', insights);
      });
    } catch (error) {
      console.error('검토 실패:', error);
      setEligibilityStatus('error');
    }
  };

  return (
    <div>
      {/* 프로그램 목록 */}
      {programs.map(program => (
        <div
          key={program.id}
          onClick={() => handleProgramSelect(program)}
          className="cursor-pointer p-4 border rounded-lg hover:border-blue-500"
        >
          <h3>{program.programName}</h3>
          <p>{program.organizer}</p>
        </div>
      ))}

      {/* 선택된 프로그램 상세 정보 */}
      {selectedProgram && (
        <div className="mt-6 p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-bold">{selectedProgram.programName}</h2>

          {/* 적합성 검토 상태 */}
          {eligibilityStatus === 'checking' && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center">
              <span className="material-icons-outlined animate-spin mr-2 text-blue-600">
                hourglass_empty
              </span>
              <span className="text-blue-900">AI 에이전트들이 자격 적합성을 검토 중입니다...</span>
            </div>
          )}

          {eligibilityStatus === 'ready' && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg flex items-center">
              <span className="material-icons-outlined mr-2 text-green-600">
                check_circle
              </span>
              <span className="text-green-900">적합성 검토가 완료되었습니다</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

---

## 6. 제출 완료 시 학습

지원서 제출이 완료되면 성공 패턴을 학습합니다.

### 코드 예제

```typescript
const handleSubmitApplication = async () => {
  // 지원서 제출 로직...
  await submitApplication(application);

  // 제출 완료 후 학습
  if (application.status === '제출 완료') {
    AgentIntegration.learnFromSuccess(application).catch(err => {
      console.error('학습 실패:', err);
    });

    console.log('📚 시스템이 이번 지원서로부터 학습을 시작했습니다.');
  }
};
```

---

## 7. 실시간 상태 모니터링

컴포넌트에서 에이전트 시스템 상태를 실시간으로 확인합니다.

### 코드 예제

```typescript
import React, { useState, useEffect } from 'react';
import { AgentIntegration } from '../services/agentIntegration';

const StatusMonitor: React.FC = () => {
  const [status, setStatus] = useState(AgentIntegration.getStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(AgentIntegration.getStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="text-sm font-medium mb-2">Agent System Status</div>
      <div className="space-y-1 text-xs">
        <div>Ready: {status.isReady ? '✅' : '❌'}</div>
        <div>Active Agents: {status.state.activeAgents.length}</div>
        <div>Tasks in Queue: {status.state.taskQueue.length}</div>
        <div>Completed: {status.metrics.completedTasks}</div>
      </div>
    </div>
  );
};
```

---

## 주요 포인트

### 1. 초기화는 한 번만
```typescript
// App.tsx에서 한 번만 초기화
useEffect(() => {
  AgentIntegration.initialize();
}, []);
```

### 2. 비동기 처리
모든 에이전트 함수는 비동기이므로 `async/await` 사용:
```typescript
await AgentIntegration.generateApplication(company, program);
```

### 3. 진행 상황 콜백
진행 상황을 추적하려면 콜백 함수 전달:
```typescript
AgentIntegration.reviewApplication(
  application,
  (stage, percent) => {
    console.log(`${stage}: ${percent}%`);
  }
);
```

### 4. 에러 처리
항상 try-catch로 에러 처리:
```typescript
try {
  await AgentIntegration.generateApplication(company, program);
} catch (error) {
  console.error('Error:', error);
  alert('작업 중 오류가 발생했습니다.');
}
```

### 5. 공유 메모리 활용
에이전트들이 생성한 인사이트를 가져와 활용:
```typescript
const insights = AgentIntegration.getInsights(['company', 'analysis']);
```

---

## 마무리

이 예제들을 참고하여 Multi-Agent System을 프로젝트의 다양한 부분에 통합하세요. 에이전트들은 자동으로 협업하여 복잡한 작업을 처리합니다!

**Made with 🤖 Multi-Agent Examples**

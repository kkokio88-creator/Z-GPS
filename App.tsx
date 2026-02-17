
import React from 'react';
// NOTE: Using HashRouter for Vercel/Railway static hosting compatibility.
// Consider migrating to BrowserRouter with server-side catch-all if SSR is added.
import { HashRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import GlobalSearch from './components/GlobalSearch';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { isAuthenticated } from './services/storageService';
import QAController from './components/qa/QAController';

// --- Lazy-loaded route components ---
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const ApplicationEditor = React.lazy(() => import('./components/ApplicationEditor'));
const ProgramExplorer = React.lazy(() => import('./components/ProgramExplorer'));
const ProgramDetail = React.lazy(() => import('./components/ProgramDetail'));
const CalendarView = React.lazy(() => import('./components/CalendarView'));
const ApplicationList = React.lazy(() => import('./components/ApplicationList'));
const Settings = React.lazy(() => import('./components/Settings'));
const BenefitTracker = React.lazy(() => import('./components/BenefitTracker'));
const ExpertMatch = React.lazy(() => import('./components/ExpertMatch'));
const Community = React.lazy(() => import('./components/Community'));
const PitchTrainer = React.lazy(() => import('./components/PitchTrainer'));
const LoginPage = React.lazy(() => import('./components/LoginPage'));
const CompanyProfile = React.lazy(() => import('./components/CompanyProfile'));
const ResearchHub = React.lazy(() => import('./components/ResearchHub'));
const AgentControl = React.lazy(() => import('./components/AgentControl'));

// --- Page loading skeleton fallback ---
const PageSkeleton = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">로딩 중...</p>
    </div>
  </div>
);

// Wrapper for Authenticated Routes
const ProtectedRoute = () => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        <React.Suspense fallback={<PageSkeleton />}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </React.Suspense>
        {/* System Overlays */}
        <QAController />
        <GlobalSearch />
        {/* VoiceConsultant removed per user request */}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <React.Suspense fallback={<PageSkeleton />}>
                <LoginPage />
              </React.Suspense>
            }
          />

          <Route path="/" element={<ProtectedRoute />}>
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="explore" element={<ProgramExplorer />} />
            <Route path="program/:slug" element={<ProgramDetail />} />
            <Route path="applications" element={<ApplicationList />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="ai-board" element={<ExpertMatch />} />
            <Route path="knowledge" element={<Community />} />
            <Route path="pitch" element={<PitchTrainer />} />
            <Route path="benefits" element={<ErrorBoundary><BenefitTracker /></ErrorBoundary>} />
            <Route path="settings" element={<Settings />} />
            <Route path="company" element={<ErrorBoundary><CompanyProfile /></ErrorBoundary>} />
            <Route path="research" element={<ErrorBoundary><ResearchHub /></ErrorBoundary>} />
            <Route path="agents" element={<ErrorBoundary><AgentControl /></ErrorBoundary>} />
            {/* editor/:programId/:companyId — companyId is carried for context but not consumed by the editor */}
            <Route path="editor/:programId/:companyId" element={<ErrorBoundary><ApplicationEditor /></ErrorBoundary>} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
};

export default App;

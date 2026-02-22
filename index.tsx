import React from 'react';
import ReactDOM from 'react-dom/client';
import './app/globals.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useCompanyStore } from './services/stores/companyStore';

// Initialize company store from localStorage on app startup
useCompanyStore.getState().loadCompany();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import App from './App';
import { queryClient } from './lib/queryClient';
import { initAnalytics } from './lib/analytics';
import { initSentry } from './lib/sentry';
import './styles/globals.css';

// Both no-op unless their env keys are set — the deployed app is unaffected
// until Denis adds VITE_SENTRY_DSN / VITE_POSTHOG_KEY (deferred config, see
// docs/planning/AUTONOMOUS-DECISIONS.md).
initSentry();
initAnalytics();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p className="p-8">Something went wrong. Our team has been notified.</p>}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);

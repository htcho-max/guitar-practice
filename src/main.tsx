import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setupUpdates } from './state/appUpdate';
import { requestPersist } from './data/backup';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsProvider } from './state/settings';
import './styles.css';

const { updatedFrom } = setupUpdates();
requestPersist();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ErrorBoundary><App updatedFrom={updatedFrom} /></ErrorBoundary>
    </SettingsProvider>
  </StrictMode>,
);

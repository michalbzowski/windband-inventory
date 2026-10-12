import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadRuntimeEnv } from './config/env';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing in index.html');

// Load the serving-layer runtime config (/env.js — issuer + client_id driven by
// environment variables, see src/config/env.ts) BEFORE any auth code runs.
void loadRuntimeEnv().then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

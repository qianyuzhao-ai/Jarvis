import './styles.css';
import { lazy, Suspense, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing renderer root element');

const Preview = import.meta.env.DEV ? lazy(() => import('./dev/UiPreview')) : null;
createRoot(root).render(
  <StrictMode>
    {Preview && location.hash === '#/ui-preview' ? (
      <Suspense fallback={null}>
        <Preview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);

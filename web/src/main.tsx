import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import JourneyTracker from './components/JourneyTracker';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <JourneyTracker />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

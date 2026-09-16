import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const racine = document.getElementById('racine');
if (!racine) throw new Error("Element racine introuvable dans la page.");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

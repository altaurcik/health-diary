import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@telegram-apps/telegram-ui/dist/styles.css';
import CloudGate from './CloudGate.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><CloudGate /></React.StrictMode>);

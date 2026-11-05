import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClientProvider} from '@tanstack/react-query';
import {client} from './lib/reactQuery';
import {AppRoutes} from './routes/index';
import './index.css';
import './features/Guest/invitation/invitation.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter><AppRoutes/></BrowserRouter></QueryClientProvider></React.StrictMode>);

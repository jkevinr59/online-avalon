import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayerApp } from './pages/PlayerApp.jsx';
import { HostApp } from './pages/HostApp.jsx';
import './styles.css';

// Two entry points only, so a pathname check is all the routing we need.
const isHost = window.location.pathname.replace(/\/+$/, '') === '/host';

createRoot(document.getElementById('root')).render(<StrictMode>{isHost ? <HostApp /> : <PlayerApp />}</StrictMode>);

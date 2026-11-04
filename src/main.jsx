import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import NexusPanel from './nexus.jsx';
import { createAdapter } from './adapter.mjs';

const root = createRoot(document.getElementById('root'));
try {
  const forge = window.CodexForge, api = createAdapter(forge);
  root.render(<NexusPanel api={api} mode="right" onClose={() => forge.panels.close('main')}/>);
} catch (error) {
  root.render(<main className="ob-app"><div className="ob-empty"><h1>星枢 Nexus</h1><p role="alert">{String(error.message || error)}</p></div></main>);
}

import React from 'react';
import icon from './nexus-icon.json';
export default function NexusIcon() {
  return <svg viewBox={icon.viewBox} width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon.paths.map(d => <path key={d} d={d}/>)}</svg>;
}

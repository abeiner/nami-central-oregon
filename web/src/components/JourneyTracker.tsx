import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordEvent } from '../lib/journey';

export default function JourneyTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname !== '/' && pathname !== '/partner') return;
    recordEvent(pathname === '/partner' ? 'builder' : 'visit');
    const explore = (event: Event) => {
      const cause = (event as CustomEvent<unknown>).detail;
      if (typeof cause === 'string' && /^[a-z0-9-]{1,80}$/.test(cause)) recordEvent('explore',cause);
    };
    window.addEventListener('nami:cause', explore);
    return () => window.removeEventListener('nami:cause', explore);
  }, [pathname]);
  return null;
}


import { Component, createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { SiteContent } from './lib/contract';
import { api } from './lib/api';
import Home from './pages/Home';
import Partner from './pages/Partner';
import Welcome from './pages/Welcome';
import Invoice from './pages/Invoice';

/**
 * The desk's code is fetched when it is first opened. A tab that was open
 * before a new release asks for a file that no longer exists, so reload once
 * to pick up the current version instead of showing an empty page.
 */
const RELOAD_KEY = 'nami.reloaded';
const AdminApp = lazy(async () => {
  try {
    const mod = await import('./admin/AdminApp');
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
    return mod;
  } catch (err) {
    let already = true;
    try {
      already = sessionStorage.getItem(RELOAD_KEY) === '1';
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {
      /* storage blocked: do not risk a reload loop */
    }
    if (already) throw err;
    window.location.reload();
    // Keep the "Opening the desk" message on screen until the reload lands.
    return new Promise<never>(() => {});
  }
});

/** Nothing on this site should ever end as a blank page. */
class Safety extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="center-msg" role="alert">
        <div>
          <p>This page did not load completely.</p>
          <p style={{ marginTop: 14 }}>
            <button className="btn btn-dark" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </p>
        </div>
      </div>
    );
  }
}

/* ---------- program content ---------- */
const ContentCtx = createContext<SiteContent | null>(null);
export function useContent(): SiteContent {
  const c = useContext(ContentCtx);
  if (!c) throw new Error('Content not loaded');
  return c;
}

/* ---------- the visitor's business name, carried across pages ---------- */
interface NameState {
  name: string;
  setName: (n: string) => void;
}
const NameCtx = createContext<NameState>({ name: '', setName: () => {} });
export const useBusinessName = () => useContext(NameCtx);

const NAME_KEY = 'nami.for';
function initialName(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('for');
    if (fromUrl) return fromUrl.slice(0, 60);
    return sessionStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setNameState] = useState(initialName);

  const load = useCallback(() => {
    setFailed(false);
    let live = false;
    // The static copy paints the page at once; the saved program replaces it when the API answers.
    fetch('/content.json')
      .then((r) => (r.ok ? (r.json() as Promise<SiteContent>) : Promise.reject(new Error('no static content'))))
      .then((c) => {
        if (!live) setContent((cur) => cur ?? c);
      })
      .catch(() => {});
    api
      .getContent(true)
      .then((c) => {
        live = true;
        setContent(c);
      })
      .catch(() => setContent((cur) => (cur ? cur : (setFailed(true), cur))));
  }, []);
  useEffect(load, [load]);

  const setName = useCallback((n: string) => {
    const v = n.slice(0, 60);
    setNameState(v);
    try {
      sessionStorage.setItem(NAME_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);
  const nameState = useMemo(() => ({ name, setName }), [name, setName]);

  if (failed) {
    return (
      <div className="center-msg">
        <div>
          <p>We could not load the partnership details.</p>
          <p style={{ marginTop: 14 }}>
            <button className="btn btn-dark" onClick={load}>
              Try again
            </button>
          </p>
        </div>
      </div>
    );
  }
  if (!content) return <div className="boot" aria-label="Loading" />;

  return (
    <Safety>
    <ContentCtx.Provider value={content}>
      <NameCtx.Provider value={nameState}>
        <ScrollManager />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/partner" element={<Partner />} />
          <Route path="/welcome/:id" element={<Welcome />} />
          <Route path="/invoice/:id" element={<Invoice />} />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<div className="center-msg">Opening the desk…</div>}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route path="*" element={<Home />} />
        </Routes>
      </NameCtx.Provider>
    </ContentCtx.Provider>
    </Safety>
  );
}

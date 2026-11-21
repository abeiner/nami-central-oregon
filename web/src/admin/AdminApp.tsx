import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, setAdminKey } from '../lib/api';
import type { ApiMode } from '../lib/api';
import './admin.css';
import Assistant from './Assistant';
import Calendar from './Calendar';
import ContentEditor from './ContentEditor';
import Conversions from './Conversions';
import Emails from './Emails';
import Sponsors from './Sponsors';
import Today from './Today';
import { AdminDataContext, dayDiff, errMsg, useAdminData, useAdminLoader } from './useAdminData';

type Gate = 'checking' | 'locked' | 'open';

export default function AdminApp() {
  const [mode, setMode] = useState<ApiMode | null>(null);
  const [gate, setGate] = useState<Gate>('checking');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = "Director's desk | NAMI Central Oregon";
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const m = await api.mode();
      if (!alive) return;
      setMode(m);
      if (m === 'mock') {
        setGate('open');
        return;
      }
      const ok = await api.admin.check();
      if (alive) setGate(ok ? 'open' : 'locked');
    })();
    return () => {
      alive = false;
    };
  }, []);

  const lock = useCallback((sessionEnded: boolean) => {
    setAdminKey('');
    setExpired(sessionEnded);
    setGate('locked');
  }, []);

  if (gate === 'checking') {
    return (
      <div className="dk-root dk-center">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (gate === 'locked') {
    return (
      <Passcode
        expired={expired}
        onUnlock={() => {
          setExpired(false);
          setGate('open');
        }}
      />
    );
  }

  return <Desk mode={mode} onLock={lock} />;
}

/* ---------- passcode ---------- */

function Passcode({ expired, onUnlock }: { expired: boolean; onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const code = value.trim();
    if (!code) {
      setError('Enter the staff passcode.');
      return;
    }
    setPending(true);
    setError(null);
    setAdminKey(code);
    const ok = await api.admin.check();
    if (ok) {
      onUnlock();
      return;
    }
    setAdminKey('');
    setError('That passcode did not work. Check it and try again.');
    setPending(false);
  }

  return (
    <div className="dk-root dk-center">
      <form className="dk-gate" onSubmit={(e) => void submit(e)} noValidate>
        <p className="eyebrow">Staff only</p>
        <h1 className="dk-h1">Director's desk</h1>
        <p className="muted">Enter the staff passcode to see your sponsors and to-do list.</p>
        {expired && !error ? (
          <p className="notice info dk-notice-flat" role="status">
            <span>Your session ended. Enter the passcode again.</span>
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="dk-passcode">Staff passcode</label>
          <input
            id="dk-passcode"
            type="password"
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="current-password"
            aria-invalid={!!error}
            aria-describedby={error ? 'dk-passcode-err' : undefined}
            autoFocus
          />
          {error ? (
            <span id="dk-passcode-err" className="err" role="alert">
              {error}
            </span>
          ) : null}
        </div>
        <button type="submit" className="btn btn-dark" disabled={pending}>
          {pending ? 'Checking…' : 'Open the desk'}
        </button>
        <a href="/admin?demo=1" className="dk-gate-back">
          Just looking? Explore the desk with sample data
        </a>
        <Link to="/" className="dk-gate-back">
          Back to the public site
        </Link>
      </form>
    </div>
  );
}

/* ---------- shell ---------- */

function Desk({ mode, onLock }: { mode: ApiMode | null; onLock: (sessionEnded: boolean) => void }) {
  const data = useAdminLoader(true, mode, () => onLock(true));
  return (
    <AdminDataContext.Provider value={data}>
      <Shell onSignOut={() => onLock(false)} />
    </AdminDataContext.Provider>
  );
}

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/admin', label: 'This week', end: true },
  { to: '/admin/sponsors', label: 'Sponsors' },
  { to: '/admin/calendar', label: 'Calendar' },
  { to: '/admin/emails', label: 'Emails' },
  { to: '/admin/content', label: 'Program content' },
  { to: '/admin/conversions', label: 'Microsite results' },
  { to: '/admin/assistant', label: 'Assistant' },
];

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { mode, tasks, content, reload, notify, toast } = useAdminData();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const urgent = tasks.filter((t) => dayDiff(t.dueAt) <= 7).length;

  async function resetDemo() {
    setResetting(true);
    try {
      await api.admin.resetDemo();
      await reload();
      notify('Demo data reset.');
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }

  return (
    <div className="dk-root">
      <aside className="dk-side">
        <div className="dk-brand">
          <span className="dk-brand-title">Director's desk</span>
          <small>{content?.org.name ?? 'NAMI Central Oregon'}</small>
        </div>
        <nav className="dk-nav" aria-label="Director's desk">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'dk-nav-link' + (isActive ? ' is-active' : '')}>
              {n.label}
              {n.to === '/admin' && urgent > 0 ? (
                <span className="dk-badge">
                  {urgent}
                  <span className="sr-only"> need you</span>
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="dk-side-foot">
          <a href="/" className="dk-foot-link">
            View public site
          </a>
          {mode === 'live' ? (
            <button type="button" className="dk-foot-link dk-foot-btn" onClick={onSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      <div className="dk-main">
        {mode === 'mock' ? (
          <div className="dk-banner" role="note">
            <span>Demo mode: sample data stored only in this browser.</span>
            {confirmReset ? (
              <span className="dk-banner-btns">
                <span>Erase your changes and start over?</span>
                <button type="button" className="btn btn-dark btn-sm" onClick={() => void resetDemo()} disabled={resetting}>
                  {resetting ? 'Resetting…' : 'Yes, reset'}
                </button>
                <button type="button" className="btn btn-line btn-sm" onClick={() => setConfirmReset(false)} disabled={resetting}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-line btn-sm" onClick={() => setConfirmReset(true)}>
                Reset demo data
              </button>
            )}
          </div>
        ) : null}

        <main className="dk-content" id="dk-main">
          <Routes>
            <Route index element={<DataGate><Today /></DataGate>} />
            <Route path="sponsors/*" element={<DataGate><Sponsors /></DataGate>} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="emails" element={<Emails />} />
            <Route path="content" element={<ContentEditor />} />
            <Route path="conversions" element={<Conversions />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>

      <div role="status" aria-live="polite">
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    </div>
  );
}

/** Shows a skeleton while loading and a retry message if the first load failed. */
function DataGate({ children }: { children: ReactNode }) {
  const { loading, error, content, reload } = useAdminData();
  const [retrying, setRetrying] = useState(false);

  if (loading) {
    return (
      <div className="dk-page" aria-busy="true" aria-label="Loading">
        <div className="dk-skel dk-skel-title" />
        <div className="dk-skel dk-skel-line" />
        <div className="dk-skel dk-skel-block" />
        <div className="dk-skel dk-skel-block" />
      </div>
    );
  }

  async function retry() {
    setRetrying(true);
    await reload();
    setRetrying(false);
  }

  if (!content) {
    return (
      <div className="dk-page">
        <div className="notice err dk-notice-flat" role="alert">
          <div>
            <p>We could not load your sponsors. {error ?? errMsg(null)}</p>
            <p className="dk-retry">
              <button type="button" className="btn btn-dark btn-sm" onClick={() => void retry()} disabled={retrying}>
                {retrying ? 'Trying again…' : 'Retry'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div className="dk-page dk-page-flush">
          <div className="notice err dk-notice-flat" role="alert">
            <div>
              <p>We could not refresh the latest numbers. What you see may be a little out of date. {error}</p>
              <p className="dk-retry">
                <button type="button" className="btn btn-dark btn-sm" onClick={() => void retry()} disabled={retrying}>
                  {retrying ? 'Trying again…' : 'Retry'}
                </button>
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}

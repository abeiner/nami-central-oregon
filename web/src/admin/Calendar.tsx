import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Sponsor, SponsorStatus } from '../lib/contract';
import { fmtDate } from '../lib/format';
import './admin-extra.css';

const LIVE_STATUSES: SponsorStatus[] = ['paid', 'active', 'renewal_due'];
const MONTH_COUNT = 12;
const DAY_MS = 86_400_000;

interface Entry {
  key: string;
  sponsorId: string;
  sponsorName: string;
  isPrivate: boolean;
  kind: 'benefit' | 'renewal';
  benefitId?: string;
  label: string;
  dueAt: string;
  due: Date;
  done: boolean;
  minutes: number;
}

interface Group {
  id: string;
  title: string;
  overdue: boolean;
  entries: Entry[];
  total: number;
  left: number;
  minutes: number;
}

interface MonthCell {
  id: string;
  abbr: string;
  title: string;
  total: number;
  left: number;
  minutes: number;
  isNow: boolean;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (d: Date, today: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / DAY_MS);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong.');

function fmtMinutes(total: number): string {
  if (total <= 0) return '';
  const m = Math.max(5, Math.round(total / 5) * 5);
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `about ${plural(h, 'hour', 'hours')}` : `about ${h} hr ${r} min`;
}

function collect(sponsors: Sponsor[]): Entry[] {
  const out: Entry[] = [];
  for (const s of sponsors) {
    if (!LIVE_STATUSES.includes(s.status)) continue;
    const who = { sponsorId: s.id, sponsorName: s.company.name, isPrivate: !s.recognition.listPublicly };
    for (const b of s.benefits) {
      out.push({
        ...who,
        key: `${s.id}:${b.id}`,
        kind: 'benefit',
        benefitId: b.id,
        label: b.label,
        dueAt: b.dueAt,
        due: new Date(b.dueAt),
        done: Boolean(b.doneAt),
        minutes: b.staffMinutes ?? 0,
      });
    }
    if (s.renewalDate) {
      out.push({
        ...who,
        key: `${s.id}:renewal`,
        kind: 'renewal',
        label: 'Partnership renewal',
        dueAt: s.renewalDate,
        due: new Date(s.renewalDate),
        done: false,
        minutes: 0,
      });
    }
  }
  return out.filter((e) => !Number.isNaN(e.due.getTime()));
}

function summarise(id: string, title: string, overdue: boolean, entries: Entry[]): Group {
  const sorted = [...entries].sort((a, b) => a.due.getTime() - b.due.getTime() || a.sponsorName.localeCompare(b.sponsorName));
  const open = sorted.filter((e) => !e.done);
  return {
    id,
    title,
    overdue,
    entries: sorted,
    total: sorted.length,
    left: open.length,
    minutes: open.reduce((sum, e) => sum + e.minutes, 0),
  };
}

function build(entries: Entry[], touched: Set<string>, today: Date) {
  const late: Entry[] = [];
  const buckets: Entry[][] = Array.from({ length: MONTH_COUNT }, () => []);
  let later = 0;
  for (const e of entries) {
    if (dayDiff(e.due, today) < 0 && (!e.done || touched.has(e.key))) {
      late.push(e);
      continue;
    }
    const idx = (e.due.getFullYear() - today.getFullYear()) * 12 + e.due.getMonth() - today.getMonth();
    if (idx < 0) continue; // delivered in a past month: history, not calendar
    if (idx >= MONTH_COUNT) later += 1;
    else buckets[idx]!.push(e);
  }
  const months = buckets.map((list, i) => {
    const first = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const g = summarise(`ax-month-${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`, title, false, list);
    const cell: MonthCell = {
      id: g.id,
      abbr: first.toLocaleDateString('en-US', { month: 'short' }),
      title,
      total: g.total,
      left: g.left,
      minutes: g.minutes,
      isNow: i === 0,
    };
    return { group: g, cell };
  });
  return { overdue: summarise('ax-month-overdue', 'Overdue', true, late), months, later };
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
}

function metaLine(g: Group): string {
  if (g.total === 0) return '';
  const parts = [plural(g.total, 'item', 'items')];
  if (g.left === 0) parts.push('all delivered');
  else {
    const t = fmtMinutes(g.minutes);
    if (t) parts.push(t);
  }
  return parts.join(' · ');
}

function NoticeIcon({ kind }: { kind: 'ok' | 'err' }) {
  return (
    <svg className="ax-nico" viewBox="0 0 22 22" fill="none" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      {kind === 'ok' ? (
        <path d="M6.9 11.4l3 3 5.3-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M11 6.6v5.2M11 15v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

function RowItem({
  e,
  today,
  overdue,
  busy,
  onToggle,
}: {
  e: Entry;
  today: Date;
  overdue: boolean;
  busy: boolean;
  onToggle: (e: Entry, done: boolean) => void;
}) {
  const diff = dayDiff(e.due, today);
  const showYear = overdue && e.due.getFullYear() !== today.getFullYear();
  const dateText = fmtDate(e.dueAt, showYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
  let sub: string;
  let late = false;
  if (!e.done && diff < 0) {
    sub = `${plural(-diff, 'day', 'days')} late`;
    late = true;
  } else if (diff === 0) sub = 'Today';
  else if (diff === 1) sub = 'Tomorrow';
  else sub = fmtDate(e.dueAt, { weekday: 'long' });

  const rowClass = `ax-row${e.done ? ' is-done' : ''}`;
  return (
    <li className={rowClass}>
      <div className="ax-when">
        {dateText}
        <small className={late ? 'late' : undefined}>{sub}</small>
      </div>
      <div>
        <div className="ax-who">
          <Link to={`/admin/sponsors/${encodeURIComponent(e.sponsorId)}`}>{e.sponsorName}</Link>
          {e.isPrivate && <span className="pill quiet plain">Private</span>}
          {e.kind === 'renewal' && <span className="pill warn">Renewal</span>}
          {e.done && <span className="pill ok">Delivered</span>}
        </div>
        <div className="ax-what">{e.label}</div>
      </div>
      <div className="ax-act">
        {e.kind === 'renewal' ? (
          <Link className="btn btn-line btn-sm" to={`/admin/sponsors/${encodeURIComponent(e.sponsorId)}`}>
            Open sponsor
          </Link>
        ) : e.done ? (
          <button
            type="button"
            className="linkbtn"
            disabled={busy}
            onClick={() => onToggle(e, false)}
            aria-label={`Undo: ${e.label} for ${e.sponsorName} is not delivered`}
          >
            {busy ? 'Saving…' : 'Undo'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-line btn-sm"
            disabled={busy}
            onClick={() => onToggle(e, true)}
            aria-label={`Mark delivered: ${e.label} for ${e.sponsorName}`}
          >
            {busy ? 'Saving…' : 'Mark delivered'}
          </button>
        )}
      </div>
    </li>
  );
}

function GroupSection({
  g,
  today,
  busyKey,
  onToggle,
}: {
  g: Group;
  today: Date;
  busyKey: string | null;
  onToggle: (e: Entry, done: boolean) => void;
}) {
  const meta = metaLine(g);
  return (
    <section id={g.id} className={`ax-month${g.overdue ? ' is-overdue' : ''}`} aria-labelledby={`${g.id}-h`}>
      <div className="ax-month-head">
        <h2 id={`${g.id}-h`}>{g.title}</h2>
        {meta && <span className="ax-month-meta">{meta}</span>}
      </div>
      {g.total === 0 ? (
        <p className="ax-none">Nothing due.</p>
      ) : (
        <ul className="ax-rows">
          {g.entries.map((e) => (
            <RowItem key={e.key} e={e} today={today} overdue={g.overdue} busy={busyKey === e.key} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Calendar() {
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [announce, setAnnounce] = useState('');
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const list = await api.admin.sponsors();
      if (!alive.current) return;
      setSponsors(list);
      setError(null);
    } catch (e) {
      if (alive.current) setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const retry = () => {
    setError(null);
    void load();
  };

  const toggle = async (e: Entry, done: boolean) => {
    if (e.kind !== 'benefit' || !e.benefitId) return;
    setBusyKey(e.key);
    setActionError(null);
    try {
      await api.admin.patch(e.sponsorId, { benefit: { id: e.benefitId, done } });
      if (!alive.current) return;
      setTouched((prev) => new Set(prev).add(e.key));
      await load();
      if (alive.current) setAnnounce(`${done ? 'Marked delivered' : 'Marked not delivered'}: ${e.label} for ${e.sponsorName}`);
    } catch (err) {
      if (alive.current) setActionError(errMsg(err));
    } finally {
      if (alive.current) setBusyKey(null);
    }
  };

  const today = useMemo(() => startOfDay(new Date()), [sponsors]);
  const view = useMemo(() => (sponsors ? build(collect(sponsors), touched, today) : null), [sponsors, touched, today]);

  const peak = view ? Math.max(0, ...view.months.map((m) => m.cell.total)) : 0;
  const totalLeft = view ? view.overdue.left + view.months.reduce((n, m) => n + m.group.left, 0) : 0;
  const totalMinutes = view ? view.overdue.minutes + view.months.reduce((n, m) => n + m.group.minutes, 0) : 0;

  return (
    <div className="ax-page">
      <header className="ax-head">
        <h1>Calendar</h1>
        <p>What we promised each sponsor, and when it is due, over the next 12 months.</p>
      </header>

      {error && (
        <div className="notice err" role="alert">
          <NoticeIcon kind="err" />
          <div className="ax-nbody">
            <p>We could not load the calendar. {error}</p>
            <button type="button" className="btn btn-line btn-sm" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      )}
      {actionError && (
        <div className="notice err" role="alert">
          <NoticeIcon kind="err" />
          <div className="ax-nbody">
            <p>That change was not saved. {actionError}</p>
            <button type="button" className="btn btn-line btn-sm" onClick={() => setActionError(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!sponsors && !error && (
        <p className="ax-loading" role="status">
          Loading the calendar…
        </p>
      )}

      {view && (
        <>
          <p className="ax-summary">
            <span>
              <strong>{plural(totalLeft, 'promise', 'promises')}</strong> still to deliver
              {fmtMinutes(totalMinutes) ? `, ${fmtMinutes(totalMinutes)} of staff time` : ''}
            </span>
            {view.overdue.left > 0 && (
              <button type="button" className="linkbtn" onClick={() => scrollToId(view.overdue.id)}>
                {view.overdue.left} overdue: jump to them
              </button>
            )}
          </p>

          <div className="ax-strip" role="group" aria-label="Items due, month by month. Select a month to jump to it.">
            {view.months.map(({ cell }) => {
              const pct = cell.total === 0 ? 0 : Math.max(14, Math.round((cell.total / peak) * 100));
              const label = `${cell.title}: ${cell.total === 0 ? 'nothing due' : plural(cell.total, 'item', 'items') + ' due'}`;
              return (
                <button
                  key={cell.id}
                  type="button"
                  className="ax-cell"
                  aria-label={label}
                  aria-current={cell.isNow ? 'date' : undefined}
                  title={label}
                  onClick={() => scrollToId(cell.id)}
                >
                  <span className="ax-cell-bar" aria-hidden="true">
                    {cell.total === 0 ? <i className="empty" /> : <i className={cell.total === peak ? 'peak' : undefined} style={{ height: `${pct}%` }} />}
                  </span>
                  <span className="ax-cell-n">{cell.total}</span>
                  <span className="ax-cell-m">{cell.abbr}</span>
                </button>
              );
            })}
          </div>

          <div className="ax-list">
            {view.overdue.total > 0 && <GroupSection g={view.overdue} today={today} busyKey={busyKey} onToggle={toggle} />}
            {view.months.map(({ group }) => (
              <GroupSection key={group.id} g={group} today={today} busyKey={busyKey} onToggle={toggle} />
            ))}
          </div>

          {view.later > 0 && (
            <p className="ax-more">
              {plural(view.later, 'more item is', 'more items are')} due after these 12 months.
            </p>
          )}
        </>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

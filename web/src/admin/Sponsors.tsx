import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Sponsor, SponsorStatus } from '../lib/contract';
import { fmtDate, money } from '../lib/format';
import SponsorDetail, { Logo, StatusPill } from './SponsorDetail';
import { benefitsDone, errMsg, selectionLabels, shortDate, useAdminData, useDialog } from './useAdminData';

type FilterKey = 'all' | 'prospect' | 'awaiting' | 'active' | 'renewal' | 'lapsed';

const FILTERS: { key: FilterKey; label: string; statuses: SponsorStatus[] | null }[] = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'prospect', label: 'Prospects', statuses: ['prospect'] },
  { key: 'awaiting', label: 'Awaiting payment', statuses: ['committed', 'invoiced'] },
  { key: 'active', label: 'Active', statuses: ['paid', 'active'] },
  { key: 'renewal', label: 'Renewal due', statuses: ['renewal_due'] },
  { key: 'lapsed', label: 'Lapsed', statuses: ['lapsed'] },
];

function invoiceNote(s: Sponsor): string {
  if (s.status === 'prospect') return '—';
  if (s.invoice.paidAt) return `paid ${shortDate(s.invoice.paidAt)}`;
  if (s.invoice.issuedAt && s.invoice.dueAt) return `due ${shortDate(s.invoice.dueAt)}`;
  return 'not sent';
}

/* ---------- CSV ---------- */

/** Quote a cell, and defuse anything a spreadsheet would run as a formula. */
function csvCell(value: string | number): string {
  let v = String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function downloadCsv(list: Sponsor[]) {
  const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
  const header = ['business', 'contact', 'email', 'package', 'amount', 'status', 'invoice number', 'invoice due', 'paid on', 'renewal date'];
  const rows = list.map((s) => [
    s.company.name,
    s.contact.name,
    s.contact.email,
    s.selections.map((x) => x.label).join('; '),
    s.total,
    s.status,
    s.status === 'prospect' ? '' : s.invoice.number,
    day(s.invoice.dueAt),
    day(s.invoice.paidAt),
    day(s.renewalDate),
  ]);
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nami-sponsors-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- list ---------- */

function Progress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="muted">—</span>;
  return (
    <span className="dk-progress">
      <span className="dk-num">
        {done} of {total}
      </span>
      <span className="dk-mini" aria-hidden="true">
        <i style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </span>
    </span>
  );
}

export default function Sponsors() {
  const { sponsors, notify } = useAdminData();
  const navigate = useNavigate();
  const params = useParams();
  const rest = params['*'] ?? '';
  const openId = rest ? decodeURIComponent(rest.split('/')[0] ?? '') : '';

  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const out = {} as Record<FilterKey, number>;
    for (const f of FILTERS) out[f.key] = f.statuses ? sponsors.filter((s) => f.statuses!.includes(s.status)).length : sponsors.length;
    return out;
  }, [sponsors]);

  const visible = useMemo(() => {
    const def = FILTERS.find((f) => f.key === filter);
    const q = query.trim().toLowerCase();
    return sponsors.filter((s) => {
      if (def?.statuses && !def.statuses.includes(s.status)) return false;
      if (!q) return true;
      return s.company.name.toLowerCase().includes(q) || s.contact.name.toLowerCase().includes(q);
    });
  }, [sponsors, filter, query]);

  const open = (id: string) => navigate(`/admin/sponsors/${encodeURIComponent(id)}`);
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault();
      open(id);
    }
  };
  const filtered = filter !== 'all' || query.trim() !== '';

  return (
    <div className="dk-page">
      <header className="dk-page-head dk-page-head-row">
        <div>
          <h1 className="dk-h1">Sponsors</h1>
          <p className="dk-lead">
            {sponsors.length === 0 ? 'No sponsors yet.' : `${sponsors.length} ${sponsors.length === 1 ? 'business' : 'businesses'} in the program. Select one to see the next step.`}
          </p>
        </div>
        <div className="dk-head-actions">
          <button type="button" className="btn btn-line btn-sm" onClick={() => downloadCsv(visible)} disabled={visible.length === 0}>
            Download CSV
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            Add prospect
          </button>
        </div>
      </header>

      <div className="dk-toolbar">
        <div className="dk-chips" role="group" aria-label="Filter sponsors by stage">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="dk-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="dk-chip-n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="dk-search">
          <label className="sr-only" htmlFor="dk-search">
            Search by business or contact name
          </label>
          <input
            id="dk-search"
            type="search"
            className="input"
            placeholder="Search business or contact"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="dk-empty">
          {sponsors.length === 0 ? (
            <>
              <p>When a business commits through the partner page, it appears here. You can also add a prospect by hand.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                Add the first prospect
              </button>
            </>
          ) : (
            <>
              <p>No sponsors match{filtered ? ' these filters' : ''}.</p>
              <button
                type="button"
                className="btn btn-line btn-sm"
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                }}
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="dk-table-wrap">
            <table className="dk-table">
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Package</th>
                  <th scope="col" className="dk-th-right">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Invoice</th>
                  <th scope="col">Benefits delivered</th>
                  <th scope="col">Renewal</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    className={'dk-row' + (s.id === openId ? ' is-open' : '')}
                    onClick={() => open(s.id)}
                    onKeyDown={(e) => onRowKey(e, s.id)}
                  >
                    <td>
                      <div className="dk-biz">
                        <Logo sponsor={s} />
                        <div className="dk-biz-text">
                          <b>{s.company.name}</b>
                          <span className="muted">{s.contact.name || 'No contact yet'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="dk-pkg">{selectionLabels(s) || <span className="muted">None chosen yet</span>}</td>
                    <td className="dk-num dk-td-right">{money(s.total)}</td>
                    <td>
                      <StatusPill status={s.status} />
                    </td>
                    <td>
                      {s.status === 'prospect' ? (
                        <span className="muted">—</span>
                      ) : (
                        <>
                          <span className="mono dk-inv-no">{s.invoice.number}</span>
                          <span className="dk-inv-note">{invoiceNote(s)}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <Progress done={benefitsDone(s)} total={s.benefits.length} />
                    </td>
                    <td className="dk-num">{s.renewalDate ? fmtDate(s.renewalDate) : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="dk-cards">
            {visible.map((s) => (
              <li key={s.id}>
                <Link className="dk-card" to={`/admin/sponsors/${encodeURIComponent(s.id)}`}>
                  <span className="dk-card-top">
                    <Logo sponsor={s} />
                    <span className="dk-biz-text">
                      <b>{s.company.name}</b>
                      <span className="muted">{s.contact.name || 'No contact yet'}</span>
                    </span>
                    <StatusPill status={s.status} />
                  </span>
                  <span className="dk-card-pkg">{selectionLabels(s) || 'No package chosen yet'}</span>
                  <span className="dk-card-grid">
                    <span>
                      <small>Amount</small>
                      <b className="dk-num">{money(s.total)}</b>
                    </span>
                    <span>
                      <small>Invoice</small>
                      <b>{invoiceNote(s)}</b>
                    </span>
                    <span>
                      <small>Benefits</small>
                      <Progress done={benefitsDone(s)} total={s.benefits.length} />
                    </span>
                    <span>
                      <small>Renewal</small>
                      <b className="dk-num">{s.renewalDate ? fmtDate(s.renewalDate) : '—'}</b>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {openId ? (
        <SponsorDetail key={openId} sponsor={sponsors.find((s) => s.id === openId)} onClose={() => navigate('/admin/sponsors')} />
      ) : null}

      {adding ? (
        <AddProspect
          onClose={() => setAdding(false)}
          onCreated={(s) => {
            setAdding(false);
            notify(`${s.company.name} added as a prospect.`);
            open(s.id);
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- add prospect ---------- */

function AddProspect({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Sponsor) => void }) {
  const { content, reload } = useAdminData();
  const ref = useDialog<HTMLDivElement>(onClose);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [pick, setPick] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (!content) return [];
    const annual = content.tiers
      .filter((t) => !t.inquiryOnly)
      .map((t) => ({ id: t.id, label: `${t.name} (${money(t.amount, t.plus)})` }));
    const projects = content.projects.map((p) => ({
      title: p.name,
      items: p.levels.map((l) => ({ id: `${p.id}:${l.id}`, label: `${l.name} (${money(l.amount, l.plus)})` })),
    }));
    return [{ title: 'Annual partnership', items: annual }, ...projects].filter((g) => g.items.length > 0);
  }, [content]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const next: { name?: string; email?: string } = {};
    if (!name.trim()) next.name = 'Enter the business name.';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'That email address does not look right.';
    setErrors(next);
    if (next.name || next.email) return;

    setPending(true);
    setError(null);
    try {
      const created = await api.admin.addProspect({
        companyName: name.trim(),
        contactName: contact.trim(),
        contactEmail: email.trim(),
        notes: notes.trim() || undefined,
        suggested: pick ? [pick] : [],
      });
      await reload();
      onCreated(created);
    } catch (err) {
      setError(errMsg(err));
      setPending(false);
    }
  }

  return (
    <div
      className="dk-backdrop dk-backdrop-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="dk-dialog" role="dialog" aria-modal="true" aria-labelledby="dk-add-title" tabIndex={-1}>
        <header className="dk-dialog-head">
          <div>
            <p className="eyebrow">New prospect</p>
            <h2 id="dk-add-title">Add a business</h2>
          </div>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>
            Close
          </button>
        </header>
        <form className="dk-dialog-body" onSubmit={(e) => void submit(e)} noValidate>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="dk-p-name">Business name</label>
              <input
                id="dk-p-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'dk-p-name-err' : undefined}
                autoComplete="off"
                data-autofocus
              />
              {errors.name ? (
                <span id="dk-p-name-err" className="err">
                  {errors.name}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="dk-p-contact">Contact name</label>
              <input id="dk-p-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="dk-p-email">Contact email</label>
              <input
                id="dk-p-email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'dk-p-email-err' : undefined}
                autoComplete="off"
              />
              {errors.email ? (
                <span id="dk-p-email-err" className="err">
                  {errors.email}
                </span>
              ) : null}
            </div>
            <div className="field full">
              <label htmlFor="dk-p-pkg">Suggested package</label>
              <select id="dk-p-pkg" className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Not sure yet</option>
                {groups.map((g) => (
                  <optgroup key={g.title} label={g.title}>
                    {g.items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="hint">Used to fill in their personal invite link. They can change it on the page.</span>
            </div>
            <div className="field full">
              <label htmlFor="dk-p-notes">Notes</label>
              <textarea id="dk-p-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How you met, what they care about." />
            </div>
          </div>

          {error ? (
            <p className="notice err dk-notice-flat" role="alert">
              <span>{error}</span>
            </p>
          ) : null}

          <div className="dk-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Adding…' : 'Add prospect'}
            </button>
            <button type="button" className="btn btn-line" onClick={onClose} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

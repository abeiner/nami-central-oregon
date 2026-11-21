import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { DEFAULT_CAUSES } from '../components/CauseFinder';
import type { Benefit, Cause, Project, ProjectLevel, SiteContent, Tier } from '../lib/contract';
import { money } from '../lib/format';
import './admin-extra.css';

/* ---------- small helpers ---------- */

type Errors = Record<string, string>;

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong.');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clone = <T,>(v: T): T => structuredClone(v);
const isBlank = (v: number | null | undefined): v is null | undefined => v === undefined || v === null || Number.isNaN(v);
const isWhole = (v: unknown, min: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min;

/** Stable text form of the content, so key order never makes a draft look changed. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_key, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
}

function collectIds(d: SiteContent): Set<string> {
  const ids = new Set<string>();
  (d.causes ?? []).forEach((c) => ids.add(c.id));
  for (const t of d.tiers) {
    ids.add(t.id);
    t.benefits.forEach((b) => ids.add(b.id));
  }
  for (const p of d.projects) {
    ids.add(p.id);
    for (const l of p.levels) {
      ids.add(l.id);
      l.benefits.forEach((b) => ids.add(b.id));
    }
  }
  return ids;
}

function makeId(label: string, fallback: string, taken: Set<string>): string {
  const base = slug(label) || fallback;
  for (;;) {
    const id = `${base}-${(Math.random().toString(36) + '0000').slice(2, 6)}`;
    if (!taken.has(id)) return id;
  }
}

function findLevel(d: SiteContent, projectId: string, levelId: string): ProjectLevel | undefined {
  return d.projects.find((p) => p.id === projectId)?.levels.find((l) => l.id === levelId);
}

/** Every selection a cause can point at: an annual level id, or "<projectId>:<levelId>". */
function opportunityIds(d: Pick<SiteContent, 'tiers' | 'projects'>): Set<string> {
  const ids = new Set<string>();
  d.tiers.forEach((t) => ids.add(t.id));
  d.projects.forEach((p) => p.levels.forEach((l) => ids.add(`${p.id}:${l.id}`)));
  return ids;
}

/** When the saved content has no causes, start from the set the public site already shows. */
function seedCauses(c: SiteContent): SiteContent {
  const out = clone(c);
  if (!out.causes || out.causes.length === 0) out.causes = clone(DEFAULT_CAUSES);
  return out;
}

/** The content as it is published: no empty link, no cause pointing at a level that was removed. */
function cleanForSave(d: SiteContent): SiteContent {
  const out = JSON.parse(JSON.stringify(d)) as SiteContent;
  const valid = opportunityIds(out);
  if (out.causes) {
    out.causes = out.causes.map((c) => ({ ...c, opportunities: c.opportunities.filter((id) => valid.has(id)) }));
    if (out.causes.length === 0) delete out.causes;
  }
  if (out.payment.onlineUrl !== undefined && !out.payment.onlineUrl.trim()) delete out.payment.onlineUrl;
  return out;
}

function focusField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  let d: HTMLDetailsElement | null = el.closest('details');
  while (d) {
    d.open = true;
    d = d.parentElement ? d.parentElement.closest('details') : null;
  }
  const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
}

function setNetDays(d: SiteContent, n: number): void {
  d.payment.netDays = n;
  if (!isWhole(n, 1)) return;
  if (/^net\s+\d+$/i.test(d.payment.terms.trim())) d.payment.terms = `Net ${n}`;
  d.agreement = d.agreement.map((line) =>
    line.replace(/within \d+ days? of the invoice date/i, `within ${n} ${n === 1 ? 'day' : 'days'} of the invoice date`),
  );
}

/* ---------- validation ---------- */

function validateBenefits(e: Errors, prefix: string, list: Benefit[]): void {
  for (const b of list) {
    const base = `${prefix}-b-${b.id}`;
    if (!b.label.trim()) e[`${base}-label`] = 'Describe what the sponsor gets.';
    if (!isWhole(b.dueInDays, 0)) e[`${base}-due`] = 'Enter a number of days, 0 or more.';
    if (!isWhole(b.staffMinutes, 0)) e[`${base}-mins`] = 'Enter minutes, 0 or more.';
  }
}

function validate(d: SiteContent): Errors {
  const e: Errors = {};
  const email = d.org.email.trim();
  if (!email) e['ax-org-email'] = 'Enter your contact email.';
  else if (!/^\S+@\S+\.\S+$/.test(email)) e['ax-org-email'] = 'This does not look like an email address.';
  if (!d.org.phone.trim()) e['ax-org-phone'] = 'Enter a phone number.';
  if (!d.org.mailingAddress.trim()) e['ax-org-address'] = 'Enter your mailing address.';
  const onlineUrl = (d.payment.onlineUrl ?? '').trim();
  if (onlineUrl && !/^https:\/\/\S+$/i.test(onlineUrl)) e['ax-pay-online'] = 'Enter a link that starts with https://';
  if (!d.payment.checkPayableTo.trim()) e['ax-pay-payable'] = 'Enter who checks are made out to.';
  if (!d.payment.checkMailTo.trim()) e['ax-pay-mailto'] = 'Enter where checks are mailed.';
  if (!isWhole(d.payment.netDays, 1)) e['ax-pay-netdays'] = 'Enter a whole number of days, like 30.';

  for (const t of d.tiers) {
    const p = `ax-tier-${t.id}`;
    if (!t.name.trim()) e[`${p}-name`] = 'Give this level a name.';
    if (!isWhole(t.amount, 1)) e[`${p}-amount`] = 'Enter a whole number above 0, like 2500.';
    validateBenefits(e, p, t.benefits);
  }
  for (const pr of d.projects) {
    const p = `ax-proj-${pr.id}`;
    if (!pr.name.trim()) e[`${p}-name`] = 'Give this project a name.';
    for (const l of pr.levels) {
      const lp = `${p}-l-${l.id}`;
      if (!l.name.trim()) e[`${lp}-name`] = 'Give this level a name.';
      if (!isWhole(l.amount, 1)) e[`${lp}-amount`] = 'Enter a whole number above 0, like 2500.';
      if (!isBlank(l.limit) && !isWhole(l.limit, 1)) e[`${lp}-limit`] = 'Leave blank, or enter a whole number above 0.';
      validateBenefits(e, lp, l.benefits);
    }
  }
  for (const c of d.causes ?? []) {
    const p = `ax-cause-${c.id}`;
    if (!c.label.trim()) e[`${p}-label`] = 'Give this cause a name.';
    if (!c.impact.trim()) e[`${p}-impact`] = 'Say what support makes possible.';
  }
  d.faq.forEach((f, i) => {
    if (!f.q.trim()) e[`ax-faq-${i}-q`] = 'Write the question.';
    if (!f.a.trim()) e[`ax-faq-${i}-a`] = 'Write the answer.';
  });
  return e;
}

/* ---------- editor context ---------- */

interface EditorApi {
  update: (fn: (d: SiteContent) => void) => void;
  errors: Errors;
  newId: (label: string, fallback: string) => string;
  queueFocus: (id: string) => void;
}

const EditorContext = createContext<EditorApi | null>(null);

function useEditor(): EditorApi {
  const v = useContext(EditorContext);
  if (!v) throw new Error('ContentEditor context is missing');
  return v;
}

/* ---------- form controls ---------- */

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

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  type?: 'text' | 'email' | 'tel' | 'url';
  placeholder?: string;
  className?: string;
}

function TextField(p: TextFieldProps) {
  const { errors } = useEditor();
  const error = errors[p.id];
  const hintId = p.hint ? `${p.id}-hint` : undefined;
  const errId = error ? `${p.id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${p.className ? ' ' + p.className : ''}`}>
      <label htmlFor={p.id}>{p.label}</label>
      {p.multiline ? (
        <textarea
          id={p.id}
          className="textarea ax-ta"
          rows={p.rows ?? 2}
          value={p.value}
          placeholder={p.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => p.onChange(e.target.value)}
        />
      ) : (
        <input
          id={p.id}
          className="input"
          type={p.type ?? 'text'}
          value={p.value}
          placeholder={p.placeholder}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => p.onChange(e.target.value)}
        />
      )}
      {p.hint && (
        <span id={hintId} className="hint">
          {p.hint}
        </span>
      )}
      {error && (
        <span id={errId} className="err">
          {error}
        </span>
      )}
    </div>
  );
}

interface NumFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  hint?: string;
  prefix?: string;
  optional?: boolean;
  placeholder?: string;
}

const numText = (v: number | null | undefined) => (isBlank(v) ? '' : String(v));
const sameNum = (a: number | undefined, b: number | null | undefined) => (isBlank(a) && isBlank(b)) || a === b;

/** Whole numbers only. Keeps what the person typed, and follows the draft when it is reset. */
function NumField(p: NumFieldProps) {
  const { errors } = useEditor();
  const error = errors[p.id];
  const [text, setText] = useState(() => numText(p.value));
  useEffect(() => {
    setText((prev) => (sameNum(prev === '' ? undefined : Number(prev), p.value) ? prev : numText(p.value)));
  }, [p.value]);

  const hintId = p.hint ? `${p.id}-hint` : undefined;
  const errId = error ? `${p.id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const input = (
    <input
      id={p.id}
      className="input ax-nums"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      placeholder={p.placeholder}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
        setText(raw);
        p.onChange(raw === '' ? (p.optional ? undefined : NaN) : Number(raw));
      }}
    />
  );
  return (
    <div className="field">
      <label htmlFor={p.id}>{p.label}</label>
      {p.prefix ? (
        <div className="ax-money">
          <span className="ax-money-sign" aria-hidden="true">
            {p.prefix}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
      {p.hint && (
        <span id={hintId} className="hint">
          {p.hint}
        </span>
      )}
      {error && (
        <span id={errId} className="err">
          {error}
        </span>
      )}
    </div>
  );
}

/* ---------- benefits (used by annual levels and project levels) ---------- */

function BenefitsEditor({ prefix, benefits, onChange }: { prefix: string; benefits: Benefit[]; onChange: (next: Benefit[]) => void }) {
  const { newId, queueFocus } = useEditor();
  const patch = (id: string, change: Partial<Benefit>) => onChange(benefits.map((b) => (b.id === id ? { ...b, ...change } : b)));
  const add = () => {
    const id = newId('', 'benefit');
    onChange([...benefits, { id, label: '', dueInDays: 14, staffMinutes: 10 }]);
    queueFocus(`${prefix}-b-${id}-label`);
  };
  return (
    <div className="ax-benefits">
      <div>
        <h3 className="ax-sub">Benefits</h3>
        <p className="ax-subhint">
          &ldquo;Due within&rdquo; is how many days after a sponsor commits that you promise to deliver it. &ldquo;Staff minutes&rdquo; is your rough
          guess of the time it takes.
        </p>
      </div>
      {benefits.length === 0 ? (
        <p className="muted">No benefits yet.</p>
      ) : (
        <ul className="ax-blist">
          {benefits.map((b, i) => (
            <li key={b.id} className="ax-benefit">
              <TextField
                id={`${prefix}-b-${b.id}-label`}
                label={`Benefit ${i + 1}`}
                multiline
                rows={2}
                value={b.label}
                placeholder="What the sponsor gets"
                onChange={(v) => patch(b.id, { label: v })}
              />
              <div className="ax-bnums">
                <NumField
                  id={`${prefix}-b-${b.id}-due`}
                  label="Due within (days)"
                  value={b.dueInDays}
                  onChange={(v) => patch(b.id, { dueInDays: v ?? NaN })}
                />
                <NumField
                  id={`${prefix}-b-${b.id}-mins`}
                  label="Staff minutes"
                  value={b.staffMinutes}
                  onChange={(v) => patch(b.id, { staffMinutes: v ?? NaN })}
                />
                <button
                  type="button"
                  className="btn btn-line btn-sm ax-rm"
                  aria-label={`Remove benefit ${i + 1}${b.label.trim() ? ': ' + b.label.trim() : ''}`}
                  onClick={() => onChange(benefits.filter((x) => x.id !== b.id))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="ax-addrow">
        <button type="button" className="btn btn-line btn-sm" onClick={add}>
          Add benefit
        </button>
      </div>
    </div>
  );
}

/* ---------- annual levels ---------- */

const hasErrorUnder = (errors: Errors, prefix: string) => Object.keys(errors).some((k) => k.startsWith(prefix));

function TierEditor({ tier, tiers }: { tier: Tier; tiers: Tier[] }) {
  const { update, errors } = useEditor();
  const p = `ax-tier-${tier.id}`;
  const includes = tier.includes ? tiers.find((t) => t.id === tier.includes) : undefined;
  const set = (change: Partial<Tier>) =>
    update((d) => {
      const t = d.tiers.find((x) => x.id === tier.id);
      if (t) Object.assign(t, change);
    });
  const shown = Number.isFinite(tier.amount) ? money(tier.amount, tier.plus) : '';
  return (
    <details className="ax-item">
      <summary>
        <span>
          <span className="ax-sum-name">{tier.name.trim() || 'Unnamed level'}</span>
          <span className="ax-sum-meta">
            <span>{plural(tier.benefits.length, 'benefit', 'benefits')}</span>
            {hasErrorUnder(errors, p + '-') && <span className="pill danger plain">Needs attention</span>}
          </span>
        </span>
        <span className="ax-sum-price">{shown}</span>
      </summary>
      <div className="ax-item-body">
        <div className="form-grid">
          <TextField id={`${p}-name`} label="Level name" value={tier.name} onChange={(v) => set({ name: v })} />
          <NumField id={`${p}-amount`} label="Amount" prefix="$" value={tier.amount} onChange={(v) => set({ amount: v ?? NaN })} />
          <TextField
            id={`${p}-tagline`}
            className="full"
            label="Short description (tagline)"
            multiline
            rows={2}
            value={tier.tagline}
            onChange={(v) => set({ tagline: v })}
          />
          <label className="check full" htmlFor={`${p}-plus`}>
            <input
              id={`${p}-plus`}
              type="checkbox"
              checked={Boolean(tier.plus)}
              onChange={(e) => set({ plus: e.target.checked ? true : undefined })}
            />
            <span>Starts at this amount{shown ? ` (the public site shows ${money(tier.amount, true)})` : ''}</span>
          </label>
        </div>
        {includes && (
          <p className="ax-includes">
            Also includes everything in <strong>{includes.name}</strong>.
          </p>
        )}
        <BenefitsEditor
          prefix={p}
          benefits={tier.benefits}
          onChange={(next) =>
            update((d) => {
              const t = d.tiers.find((x) => x.id === tier.id);
              if (t) t.benefits = next;
            })
          }
        />
      </div>
    </details>
  );
}

/* ---------- projects ---------- */

function LevelEditor({ project, level, canRemove }: { project: Project; level: ProjectLevel; canRemove: boolean }) {
  const { update } = useEditor();
  const lp = `ax-proj-${project.id}-l-${level.id}`;
  const set = (change: Partial<ProjectLevel>) =>
    update((d) => {
      const l = findLevel(d, project.id, level.id);
      if (l) Object.assign(l, change);
    });
  const setName = (name: string) =>
    update((d) => {
      const l = findLevel(d, project.id, level.id);
      if (!l) return;
      const only = l.benefits.length === 1 ? l.benefits[0] : undefined;
      // A level that still has its starter benefit keeps the wording in step with the name.
      if (only && only.label === `Recognition as ${l.name}`) only.label = `Recognition as ${name}`;
      l.name = name;
    });
  const shown = Number.isFinite(level.amount) ? money(level.amount, level.plus) : '';
  return (
    <div className="ax-level">
      <div className="ax-lvl-grid">
        <TextField id={`${lp}-name`} label="Level name" value={level.name} placeholder="For example, Gold Sponsor" onChange={setName} />
        <NumField id={`${lp}-amount`} label="Amount" prefix="$" value={level.amount} onChange={(v) => set({ amount: v ?? NaN })} />
        <NumField
          id={`${lp}-limit`}
          label="Limit (optional)"
          optional
          value={level.limit}
          hint="Blank means unlimited."
          onChange={(v) => set({ limit: v })}
        />
      </div>
      <label className="check" htmlFor={`${lp}-plus`}>
        <input
          id={`${lp}-plus`}
          type="checkbox"
          checked={Boolean(level.plus)}
          onChange={(e) => set({ plus: e.target.checked ? true : undefined })}
        />
        <span>Starts at this amount{shown ? ` (the public site shows ${money(level.amount, true)})` : ''}</span>
      </label>
      <details className="ax-item ax-nested">
        <summary>
          <span>
            <span className="ax-sum-name">What this level includes</span>
            <span className="ax-sum-meta">{plural(level.benefits.length, 'benefit', 'benefits')}</span>
          </span>
        </summary>
        <div className="ax-item-body">
          <BenefitsEditor
            prefix={lp}
            benefits={level.benefits}
            onChange={(next) =>
              update((d) => {
                const l = findLevel(d, project.id, level.id);
                if (l) l.benefits = next;
              })
            }
          />
        </div>
      </details>
      <div className="ax-addrow">
        <button
          type="button"
          className="btn btn-line btn-sm"
          disabled={!canRemove}
          aria-label={`Remove level${level.name.trim() ? ': ' + level.name.trim() : ''}`}
          onClick={() =>
            update((d) => {
              const pr = d.projects.find((x) => x.id === project.id);
              if (pr) pr.levels = pr.levels.filter((l) => l.id !== level.id);
            })
          }
        >
          Remove level
        </button>
        {!canRemove && <span className="ax-subhint">A project needs at least one level.</span>}
      </div>
    </div>
  );
}

function ProjectEditor({ project }: { project: Project }) {
  const { update, errors, newId, queueFocus } = useEditor();
  const p = `ax-proj-${project.id}`;
  const set = (change: Partial<Project>) =>
    update((d) => {
      const pr = d.projects.find((x) => x.id === project.id);
      if (pr) Object.assign(pr, change);
    });
  const amounts = project.levels.map((l) => l.amount).filter((n) => Number.isFinite(n));
  const from = amounts.length ? `from ${money(Math.min(...amounts))}` : '';
  const addLevel = () => {
    const id = newId('', 'level');
    const benefitId = newId('Recognition as', 'benefit');
    update((d) => {
      const pr = d.projects.find((x) => x.id === project.id);
      if (!pr) return;
      pr.levels.push({
        id,
        name: '',
        amount: NaN,
        benefits: [{ id: benefitId, label: 'Recognition as ', dueInDays: 30, staffMinutes: 10 }],
      });
    });
    queueFocus(`${p}-l-${id}-name`);
  };
  return (
    <details className="ax-item">
      <summary>
        <span>
          <span className="ax-sum-name">{project.name.trim() || 'Unnamed project'}</span>
          <span className="ax-sum-meta">
            <span>{plural(project.levels.length, 'level', 'levels')}</span>
            {hasErrorUnder(errors, p + '-') && <span className="pill danger plain">Needs attention</span>}
          </span>
        </span>
        <span className="ax-sum-price">{from}</span>
      </summary>
      <div className="ax-item-body">
        <div className="form-grid">
          <TextField id={`${p}-name`} label="Project name" value={project.name} onChange={(v) => set({ name: v })} />
          <TextField id={`${p}-kicker`} label="Small heading above the name" value={project.kicker} onChange={(v) => set({ kicker: v })} />
          <TextField
            id={`${p}-desc`}
            className="full"
            label="Description"
            multiline
            rows={3}
            value={project.description}
            onChange={(v) => set({ description: v })}
          />
        </div>
        <div>
          <h3 className="ax-sub">Sponsor levels</h3>
          <div className="ax-levels">
            {project.levels.map((l) => (
              <LevelEditor key={l.id} project={project} level={l} canRemove={project.levels.length > 1} />
            ))}
          </div>
          <div className="ax-addrow">
            <button type="button" className="btn btn-line btn-sm" onClick={addLevel}>
              Add level
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

/* ---------- causes on the sponsor page ---------- */

interface WayOption {
  id: string;
  label: string;
  price: string;
}

interface WayGroup {
  key: string;
  title: string;
  options: WayOption[];
}

const priceOf = (amount: number, plus?: boolean) => (Number.isFinite(amount) ? money(amount, plus) : '');

/** Every opportunity a cause can point at, grouped the way the sponsor page groups them. */
function wayGroups(d: Pick<SiteContent, 'tiers' | 'projects'>): WayGroup[] {
  const groups: WayGroup[] = [];
  if (d.tiers.length > 0) {
    groups.push({
      key: 'annual',
      title: 'Annual partnership levels',
      options: d.tiers.map((t) => ({ id: t.id, label: t.name.trim() || 'Unnamed level', price: priceOf(t.amount, t.plus) })),
    });
  }
  for (const p of d.projects) {
    if (p.levels.length === 0) continue;
    groups.push({
      key: `project-${p.id}`,
      title: p.name.trim() || 'Unnamed project',
      options: p.levels.map((l) => ({ id: `${p.id}:${l.id}`, label: l.name.trim() || 'Unnamed level', price: priceOf(l.amount, l.plus) })),
    });
  }
  return groups;
}

function WaysPicker({ cause, groups, selected }: { cause: Cause; groups: WayGroup[]; selected: number }) {
  const { update } = useEditor();
  const [open, setOpen] = useState(false);
  const p = `ax-cause-${cause.id}`;
  const chosen = new Set(cause.opportunities);
  const toggle = (id: string, on: boolean) =>
    update((d) => {
      const c = d.causes?.find((x) => x.id === cause.id);
      if (!c) return;
      if (on) {
        if (!c.opportunities.includes(id)) c.opportunities = [...c.opportunities, id];
      } else {
        c.opportunities = c.opportunities.filter((x) => x !== id);
      }
    });
  return (
    <div className="ax-ways">
      <button
        type="button"
        className="btn btn-line ax-ways-btn"
        id={`${p}-ways-btn`}
        aria-expanded={open}
        aria-controls={`${p}-ways`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Ways to support it ({selected === 0 ? 'none selected' : `${selected} selected`})</span>
        <span className="ax-ways-chev" aria-hidden="true" />
      </button>
      {open && (
        <div id={`${p}-ways`} className="ax-ways-list">
          {groups.length === 0 ? (
            <p className="muted">There are no levels or projects to choose from yet.</p>
          ) : (
            groups.map((g) => (
              <fieldset key={g.key} className="ax-ways-group">
                <legend className="ax-ways-head">{g.title}</legend>
                {g.options.map((o) => {
                  const id = `${p}-w-${o.id}`;
                  return (
                    <label key={o.id} className="check" htmlFor={id}>
                      <input id={id} type="checkbox" checked={chosen.has(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
                      <span className="ax-ways-text">
                        {o.label}
                        {o.price && <span className="ax-ways-price"> {o.price}</span>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CauseEditor({ cause, groups, validIds, fresh }: { cause: Cause; groups: WayGroup[]; validIds: Set<string>; fresh: boolean }) {
  const { update, errors } = useEditor();
  const p = `ax-cause-${cause.id}`;
  const box = useRef<HTMLDetailsElement>(null);
  // A cause that was just added opens straight away so its name field can take focus.
  useEffect(() => {
    if (fresh && box.current) box.current.open = true;
  }, [fresh]);
  const selected = cause.opportunities.filter((id) => validIds.has(id)).length;
  const set = (change: Partial<Cause>) =>
    update((d) => {
      const c = d.causes?.find((x) => x.id === cause.id);
      if (c) Object.assign(c, change);
    });
  return (
    <details ref={box} className="ax-item ax-cause">
      <summary>
        <span>
          <span className="ax-sum-name">{cause.label.trim() || 'Unnamed cause'}</span>
          <span className="ax-sum-meta">
            <span>{plural(selected, 'way to support it', 'ways to support it')}</span>
            {hasErrorUnder(errors, p + '-') && <span className="pill danger plain">Needs attention</span>}
          </span>
        </span>
      </summary>
      <div className="ax-item-body">
        <div className="form-grid">
          <TextField id={`${p}-label`} className="full" label="Name of the cause" value={cause.label} onChange={(v) => set({ label: v })} />
          <TextField id={`${p}-programs`} className="full" label="Programs behind it" value={cause.programs} onChange={(v) => set({ programs: v })} />
          <TextField
            id={`${p}-impact`}
            className="full"
            label="What support makes possible"
            multiline
            rows={3}
            value={cause.impact}
            onChange={(v) => set({ impact: v })}
          />
        </div>
        <WaysPicker cause={cause} groups={groups} selected={selected} />
        <div className="ax-addrow">
          <button
            type="button"
            className="btn btn-line btn-sm ax-rm"
            aria-label={`Remove cause${cause.label.trim() ? ': ' + cause.label.trim() : ''}`}
            onClick={() =>
              update((d) => {
                d.causes = (d.causes ?? []).filter((x) => x.id !== cause.id);
              })
            }
          >
            Remove
          </button>
        </div>
      </div>
    </details>
  );
}

function CausesPanel({ draft }: { draft: SiteContent }) {
  const { update, newId, queueFocus } = useEditor();
  const [freshId, setFreshId] = useState<string | null>(null);
  const causes = draft.causes ?? [];
  const groups = wayGroups(draft);
  const validIds = opportunityIds(draft);
  const add = () => {
    const id = newId('New cause', 'cause');
    update((d) => {
      d.causes = [...(d.causes ?? []), { id, label: 'New cause', programs: '', impact: '', opportunities: [] }];
    });
    setFreshId(id);
    queueFocus(`ax-cause-${id}-label`);
  };
  return (
    <section className="panel" aria-labelledby="ax-h-causes">
      <h2 id="ax-h-causes">Causes on the sponsor page</h2>
      <p className="ax-lead">
        Businesses start by choosing what they care about. Each cause shows its programs, what support makes possible, and the ways to help.
      </p>
      <div className="ax-items">
        {causes.length === 0 ? (
          <p className="muted">No causes yet. If you publish with none, the public site shows its standard set.</p>
        ) : (
          causes.map((c) => <CauseEditor key={c.id} cause={c} groups={groups} validIds={validIds} fresh={c.id === freshId} />)
        )}
      </div>
      <div className="ax-addrow ax-cause-add">
        <button type="button" className="btn btn-line btn-sm" onClick={add}>
          Add a cause
        </button>
      </div>
    </section>
  );
}

/* ---------- before you launch ---------- */

interface Flag {
  id: string;
  label: string;
  value: string;
}

function Checklist({ draft }: { draft: SiteContent }) {
  const flags: Flag[] = [];
  if (draft.org.email.includes('example.org')) flags.push({ id: 'ax-org-email', label: 'Contact email', value: draft.org.email });
  if (draft.org.phone.includes('555-01')) flags.push({ id: 'ax-org-phone', label: 'Phone number', value: draft.org.phone });
  if (draft.org.mailingAddress.includes('PO Box 0000'))
    flags.push({ id: 'ax-org-address', label: 'Mailing address', value: draft.org.mailingAddress });
  if (draft.payment.checkMailTo.includes('PO Box 0000'))
    flags.push({ id: 'ax-pay-mailto', label: 'Address where checks are mailed', value: draft.payment.checkMailTo });

  return (
    <section className="panel" aria-labelledby="ax-h-launch">
      <h2 id="ax-h-launch">Before you launch</h2>
      <p className="ax-lead">The public site and every invoice show your contact details, so make sure none of them are placeholders.</p>
      {flags.length === 0 ? (
        <div className="notice ok ax-panel-notice">
          <NoticeIcon kind="ok" />
          <div>Contact details look ready.</div>
        </div>
      ) : (
        <ul className="ax-flags">
          {flags.map((f) => (
            <li key={f.id} className="ax-flag">
              <div>
                <b>{f.label}</b>
                <span className="ax-flag-val">{f.value}</span>
              </div>
              <span className="pill warn">Needs your real details</span>
              <button type="button" className="btn btn-line btn-sm" onClick={() => focusField(f.id)}>
                Fix this
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- the page ---------- */

export default function ContentEditor() {
  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [baseKey, setBaseKey] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<'live' | 'mock' | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const alive = useRef(true);
  const draftRef = useRef<SiteContent | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const baseRef = useRef<SiteContent | null>(null);
  draftRef.current = draft;

  const load = useCallback(async () => {
    try {
      const content = await api.getContent(true);
      if (!alive.current) return;
      // The editor starts from the causes the site already shows, so what is saved matches what the director sees.
      const start = seedCauses(content);
      baseRef.current = clone(start);
      setDraft(clone(start));
      setBaseKey(canon(start));
      setLoadError(null);
    } catch (e) {
      if (alive.current) setLoadError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    void api.mode().then((m) => {
      if (alive.current) setMode(m);
    });
    return () => {
      alive.current = false;
    };
  }, [load]);

  const dirty = useMemo(() => draft !== null && canon(draft) !== baseKey, [draft, baseKey]);
  const errors = useMemo<Errors>(() => (attempted && draft ? validate(draft) : {}), [attempted, draft]);
  const errorKeys = Object.keys(errors);

  useEffect(() => {
    if (dirty) setPublished(false);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Focus a field that was just added, once it exists.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  const update = useCallback((fn: (d: SiteContent) => void) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = clone(prev);
      fn(next);
      return next;
    });
  }, []);

  const newId = useCallback((label: string, fallback: string) => makeId(label, fallback, draftRef.current ? collectIds(draftRef.current) : new Set()), []);
  const queueFocus = useCallback((id: string) => {
    pendingFocus.current = id;
  }, []);

  const editor = useMemo<EditorApi>(() => ({ update, errors, newId, queueFocus }), [update, errors, newId, queueFocus]);

  const retry = () => {
    setLoadError(null);
    void load();
  };

  const discard = () => {
    if (!window.confirm('Throw away your unsaved changes?')) return;
    if (baseRef.current) setDraft(clone(baseRef.current));
    setAttempted(false);
    setSaveError(null);
  };

  const save = async () => {
    if (!draft || saving) return;
    setAttempted(true);
    const found = Object.keys(validate(draft));
    if (found.length > 0) {
      focusField(found[0]!);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const clean = cleanForSave(draft);
      await api.admin.saveContent(clean);
      if (!alive.current) return;
      baseRef.current = clone(clean);
      setDraft(clean);
      setBaseKey(canon(clean));
      setAttempted(false);
      setPublished(true);
    } catch (e) {
      if (alive.current) setSaveError(errMsg(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  return (
    <div className="ax-page">
      <header className="ax-head">
        <h1>Program content</h1>
        <p>Change prices, benefits, projects and contact details here, then publish them to the public site with one button.</p>
      </header>

      {mode === 'mock' && (
        <p className="ax-demo">
          <strong>Demo mode:</strong> changes are saved in this browser only.
        </p>
      )}

      {loadError && (
        <div className="notice err" role="alert">
          <NoticeIcon kind="err" />
          <div className="ax-nbody">
            <p>We could not load the program content. {loadError}</p>
            <button type="button" className="btn btn-line btn-sm" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      )}

      {!draft && !loadError && (
        <p className="ax-loading" role="status">
          Loading the program content…
        </p>
      )}

      {draft && (
        <EditorContext.Provider value={editor}>
          <Checklist draft={draft} />

          <section className="panel" aria-labelledby="ax-h-org">
            <h2 id="ax-h-org">Organisation contact</h2>
            <p className="ax-lead">Where sponsors can reach you, and how they pay by check.</p>
            <div className="ax-body">
              <div className="form-grid">
                <TextField
                  id="ax-org-email"
                  type="email"
                  label="Contact email"
                  value={draft.org.email}
                  onChange={(v) => update((d) => void (d.org.email = v))}
                />
                <TextField
                  id="ax-org-phone"
                  type="tel"
                  label="Phone number"
                  value={draft.org.phone}
                  onChange={(v) => update((d) => void (d.org.phone = v))}
                />
                <TextField
                  id="ax-org-address"
                  className="full"
                  label="Mailing address"
                  value={draft.org.mailingAddress}
                  onChange={(v) => update((d) => void (d.org.mailingAddress = v))}
                />
              </div>
              <div>
                <h3 className="ax-sub">Payment arrangements</h3>
                <div className="form-grid ax-pay-grid">
                  <TextField
                    id="ax-pay-online"
                    className="full"
                    type="url"
                    label="Approved online payment page (optional)"
                    value={draft.payment.onlineUrl ?? ''}
                    hint="Use the organization's HTTPS payment form. The preview site keeps this link hidden."
                    onChange={(v) =>
                      update((d) => {
                        const u = v.trim();
                        if (u) d.payment.onlineUrl = u;
                        else delete d.payment.onlineUrl;
                      })
                    }
                  />
                  <TextField
                    id="ax-pay-payable"
                    label="Checks are made out to"
                    value={draft.payment.checkPayableTo}
                    onChange={(v) => update((d) => void (d.payment.checkPayableTo = v))}
                  />
                  <TextField
                    id="ax-pay-mailto"
                    label="Checks are mailed to"
                    value={draft.payment.checkMailTo}
                    onChange={(v) => update((d) => void (d.payment.checkMailTo = v))}
                  />
                  <NumField
                    id="ax-pay-netdays"
                    label="Invoices are due within (days)"
                    value={draft.payment.netDays}
                    hint="The payment terms and agreement wording on the public site follow this number."
                    onChange={(v) => update((d) => setNetDays(d, v ?? NaN))}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="ax-h-tiers">
            <h2 id="ax-h-tiers">Annual partnership levels</h2>
            <p className="ax-lead">What each level costs and what sponsors get. Open a level to change it.</p>
            <div className="ax-items">
              {draft.tiers.map((t) => (
                <TierEditor key={t.id} tier={t} tiers={draft.tiers} />
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="ax-h-projects">
            <h2 id="ax-h-projects">Projects</h2>
            <p className="ax-lead">Things a business can sponsor on its own. Open a project to change its levels.</p>
            <div className="ax-items">
              {draft.projects.map((pr) => (
                <ProjectEditor key={pr.id} project={pr} />
              ))}
            </div>
          </section>

          <CausesPanel draft={draft} />

          <section className="panel" aria-labelledby="ax-h-faq">
            <h2 id="ax-h-faq">Questions and answers</h2>
            <p className="ax-lead">Shown on the public site, below the levels.</p>
            <div className="ax-body">
              <div>
                {draft.faq.map((f, i) => (
                  <div key={i} className="ax-faq-item">
                    <TextField
                      id={`ax-faq-${i}-q`}
                      label={`Question ${i + 1}`}
                      value={f.q}
                      onChange={(v) => update((d) => void (d.faq[i]!.q = v))}
                    />
                    <TextField
                      id={`ax-faq-${i}-a`}
                      label="Answer"
                      multiline
                      rows={3}
                      value={f.a}
                      onChange={(v) => update((d) => void (d.faq[i]!.a = v))}
                    />
                    <button
                      type="button"
                      className="btn btn-line btn-sm ax-rm"
                      aria-label={`Remove question ${i + 1}`}
                      onClick={() => update((d) => void d.faq.splice(i, 1))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="ax-addrow">
                <button
                  type="button"
                  className="btn btn-line btn-sm"
                  onClick={() => {
                    queueFocus(`ax-faq-${draft.faq.length}-q`);
                    update((d) => void d.faq.push({ q: '', a: '' }));
                  }}
                >
                  Add a question
                </button>
              </div>
            </div>
          </section>

          <div className="ax-bar-wrap">
            {errorKeys.length > 0 && (
              <div className="notice err" role="alert">
                <NoticeIcon kind="err" />
                <div className="ax-nbody">
                  <p>
                    {errorKeys.length === 1 ? 'One thing needs' : `${errorKeys.length} things need`} fixing before you can publish. The fields are
                    marked in red.
                  </p>
                  <button type="button" className="btn btn-line btn-sm" onClick={() => focusField(errorKeys[0]!)}>
                    Show me the first one
                  </button>
                </div>
              </div>
            )}
            {saveError && (
              <div className="notice err" role="alert">
                <NoticeIcon kind="err" />
                <p>Nothing was published. {saveError} Please try again.</p>
              </div>
            )}
            {published && !dirty && (
              <div className="notice ok" role="status">
                <NoticeIcon kind="ok" />
                <div className="ax-nbody">
                  <p>Published. The public site now shows these details.</p>
                  <Link to="/" target="_blank">
                    View public site
                  </Link>
                </div>
              </div>
            )}
            <div className="ax-bar">
              <div className="ax-bar-state" aria-live="polite">
                {dirty ? <span className="pill warn">Unsaved changes</span> : <span className="muted">No unsaved changes</span>}
              </div>
              <div className="ax-bar-actions">
                <button type="button" className="btn btn-line" disabled={!dirty || saving} onClick={discard}>
                  Discard
                </button>
                <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? 'Publishing…' : 'Save and publish'}
                </button>
              </div>
            </div>
          </div>
        </EditorContext.Provider>
      )}
    </div>
  );
}

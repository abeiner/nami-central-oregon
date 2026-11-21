import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Sponsor, Task, TaskKind } from '../lib/contract';
import { fmtDate, money } from '../lib/format';
import EmailModal from './EmailModal';
import { PaymentConfirm } from './SponsorDetail';
import { REVENUE_STATUSES, dayDiff, errMsg, fmtMinutes, useAdminData } from './useAdminData';

const BUDGET_MINUTES = 240;
const FALLBACK_MINUTES = 10;
/** Sponsors whose promised benefits are actually being delivered. Unpaid commitments are not work yet. */
const DELIVERING = new Set<Sponsor['status']>(['paid', 'active', 'renewal_due']);

interface Action {
  label: string;
  /** Email template to prepare, or null when the action is "mark delivered". */
  template: string | null;
}

const ACTIONS: Record<TaskKind, Action> = {
  send_invoice: { label: 'Prepare invoice email', template: 'invoice' },
  payment_overdue: { label: 'Prepare reminder', template: 'payment_reminder' },
  send_welcome: { label: 'Prepare welcome email', template: 'welcome' },
  fulfil_benefit: { label: 'Mark delivered', template: null },
  renewal: { label: 'Prepare renewal invitation', template: 'renewal' },
  follow_up: { label: 'Prepare follow-up', template: 'follow_up' },
};

interface EmailTarget {
  sponsor: Sponsor;
  templateId: string;
}

export default function Today() {
  const { sponsors, tasks, reload, notify } = useAdminData();
  const [email, setEmail] = useState<EmailTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const byId = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);

  const groups = useMemo(() => {
    const overdue: Task[] = [];
    const week: Task[] = [];
    const later: Task[] = [];
    for (const t of [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
      const d = dayDiff(t.dueAt);
      if (d < 0) overdue.push(t);
      else if (d <= 7) week.push(t);
      else later.push(t);
    }
    return { overdue, week, later };
  }, [tasks]);

  const stats = useMemo(() => {
    const committedList = sponsors.filter((s) => REVENUE_STATUSES.includes(s.status));
    const sum = (list: Sponsor[]) => list.reduce((n, s) => n + s.total, 0);
    const receivedList = sponsors.filter((s) => !!s.invoice.paidAt);
    const owedList = sponsors.filter((s) => s.status === 'committed' || s.status === 'invoiced');
    const renewals = sponsors.filter(
      (s) => !!s.renewalDate && dayDiff(s.renewalDate) <= 60 && (s.status === 'paid' || s.status === 'active' || s.status === 'renewal_due'),
    ).length;

    let minutes = 0;
    for (const s of sponsors) {
      if (!DELIVERING.has(s.status)) continue;
      for (const b of s.benefits) {
        if (!b.doneAt && dayDiff(b.dueAt) <= 30) minutes += b.staffMinutes ?? FALLBACK_MINUTES;
      }
    }
    minutes += tasks.filter((t) => t.kind !== 'fulfil_benefit').length * FALLBACK_MINUTES;

    return {
      committed: sum(committedList),
      committedCount: committedList.length,
      received: sum(receivedList),
      receivedCount: receivedList.length,
      owed: sum(owedList),
      owedCount: owedList.length,
      renewals,
      minutes,
    };
  }, [sponsors, tasks]);

  const urgent = groups.overdue.length + groups.week.length;
  const headline = urgent === 0 ? 'You are caught up.' : urgent === 1 ? '1 thing needs you this week.' : `${urgent} things need you this week.`;
  const sub =
    urgent === 0
      ? 'Nothing is waiting on you. New commitments and due dates will show up here.'
      : groups.overdue.length > 0
        ? `${groups.overdue.length} ${groups.overdue.length === 1 ? 'is' : 'are'} already overdue. Start at the top.`
        : 'Start at the top. Each one takes a few minutes.';

  const over = stats.minutes > BUDGET_MINUTES;
  const fill = Math.min(100, Math.round((stats.minutes / BUDGET_MINUTES) * 100));

  async function run(id: string, work: () => Promise<unknown>, done: string) {
    setBusy(id);
    setRowError(null);
    try {
      await work();
      setConfirming(null);
      await reload();
      notify(done);
    } catch (e) {
      setRowError({ id, message: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  function renderGroup(title: string, list: Task[], id: string) {
    if (list.length === 0) return null;
    return (
      <section className="dk-group" aria-labelledby={id}>
        <h2 id={id} className="dk-group-title">
          {title} <span className="dk-count">{list.length}</span>
        </h2>
        <ul className="dk-tasks">
          {list.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              sponsor={byId.get(t.sponsorId)}
              busy={busy === t.id}
              confirming={confirming === t.id}
              error={rowError?.id === t.id ? rowError.message : null}
              onPrepare={(sponsor, templateId) => setEmail({ sponsor, templateId })}
              onDeliver={(sponsor) => {
                const benefitId = t.benefitId;
                if (benefitId) void run(t.id, () => api.admin.patch(sponsor.id, { benefit: { id: benefitId, done: true } }), 'Marked as delivered.');
              }}
              onAskPay={() => {
                setRowError(null);
                setConfirming(t.id);
              }}
              onCancelPay={() => setConfirming(null)}
              onPay={(sponsor) => void run(t.id, () => api.admin.patch(sponsor.id, { markPaid: true }), `Payment recorded for ${sponsor.company.name}.`)}
            />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="dk-page">
      <header className="dk-page-head">
        <h1 className="dk-h1">{headline}</h1>
        <p className="dk-lead">{sub}</p>
      </header>

      <section className="dk-workload" aria-label="Your time this month">
        <div className="dk-workload-top">
          <p className="dk-workload-text">
            {stats.minutes === 0 ? (
              <>No sponsorship work is scheduled this month</>
            ) : (
              <>
                About <b>{fmtMinutes(stats.minutes)}</b> of sponsorship work this month
              </>
            )}
          </p>
          <p className="dk-workload-budget">
            {over ? <span className="pill warn">Over the 4 h budget</span> : <span className="muted">of a {fmtMinutes(BUDGET_MINUTES)} budget</span>}
          </p>
        </div>
        <div
          className={'meter dk-meter' + (over ? ' over' : '')}
          role="meter"
          aria-label="Estimated staff time this month"
          aria-valuemin={0}
          aria-valuemax={BUDGET_MINUTES}
          aria-valuenow={Math.min(stats.minutes, BUDGET_MINUTES)}
          aria-valuetext={`${fmtMinutes(stats.minutes)} of ${fmtMinutes(BUDGET_MINUTES)}`}
        >
          <i style={{ width: `${fill}%` }} />
        </div>
        <p className="muted dk-small">Estimate based on the time each promised benefit usually takes.</p>
      </section>

      <dl className="dk-figures">
        <div className="dk-figure">
          <dt>Committed</dt>
          <dd>{money(stats.committed)}</dd>
          <dd className="dk-figure-note">
            {stats.committedCount} {stats.committedCount === 1 ? 'sponsor' : 'sponsors'}
          </dd>
        </div>
        <div className="dk-figure">
          <dt>Received</dt>
          <dd>{money(stats.received)}</dd>
          <dd className="dk-figure-note">{stats.receivedCount} paid</dd>
        </div>
        <div className="dk-figure">
          <dt>Outstanding</dt>
          <dd>{money(stats.owed)}</dd>
          <dd className="dk-figure-note">{stats.owedCount} waiting on payment</dd>
        </div>
        <div className="dk-figure">
          <dt>Renewals</dt>
          <dd>{stats.renewals}</dd>
          <dd className="dk-figure-note">in the next 60 days</dd>
        </div>
      </dl>

      {tasks.length === 0 ? (
        <p className="dk-empty">Your list is empty. When a sponsor commits, pays or comes up for renewal, the next step appears here.</p>
      ) : (
        <>
          {renderGroup('Overdue', groups.overdue, 'dk-g-overdue')}
          {renderGroup('Due this week', groups.week, 'dk-g-week')}
          {renderGroup('Coming up', groups.later, 'dk-g-later')}
        </>
      )}

      {email ? (
        <EmailModal
          sponsor={email.sponsor}
          templateId={email.templateId}
          onClose={() => setEmail(null)}
          onLogged={() => {
            void reload();
            notify(`Saved to ${email.sponsor.company.name}'s history.`);
          }}
        />
      ) : null}
    </div>
  );
}

interface RowProps {
  task: Task;
  sponsor: Sponsor | undefined;
  busy: boolean;
  confirming: boolean;
  error: string | null;
  onPrepare: (sponsor: Sponsor, templateId: string) => void;
  onDeliver: (sponsor: Sponsor) => void;
  onAskPay: () => void;
  onCancelPay: () => void;
  onPay: (sponsor: Sponsor) => void;
}

function TaskRow({ task, sponsor, busy, confirming, error, onPrepare, onDeliver, onAskPay, onCancelPay, onPay }: RowProps) {
  const action = ACTIONS[task.kind];
  const late = dayDiff(task.dueAt) < 0;
  const templateId = task.templateId ?? action.template;

  return (
    <li className="dk-task">
      <div className="dk-task-main">
        <p className="dk-task-title">{task.title}</p>
        <p className="dk-task-meta">
          <span className="mono">Due {fmtDate(task.dueAt)}</span>
          {late ? <span className="pill danger">Overdue</span> : null}
          {sponsor ? (
            <Link to={`/admin/sponsors/${encodeURIComponent(sponsor.id)}`}>{sponsor.company.name}</Link>
          ) : (
            <span className="muted">Sponsor not found</span>
          )}
        </p>
      </div>

      {sponsor ? (
        confirming ? (
          <PaymentConfirm sponsor={sponsor} pending={busy} onConfirm={() => onPay(sponsor)} onCancel={onCancelPay} />
        ) : (
          <div className="dk-task-actions">
            {action.template === null ? (
              <button type="button" className="btn btn-dark btn-sm" disabled={busy || !task.benefitId} onClick={() => onDeliver(sponsor)}>
                {busy ? 'Saving…' : action.label}
              </button>
            ) : (
              <button type="button" className="btn btn-dark btn-sm" disabled={busy || !templateId} onClick={() => templateId && onPrepare(sponsor, templateId)}>
                {action.label}
              </button>
            )}
            {task.kind === 'payment_overdue' ? (
              <button type="button" className="btn btn-line btn-sm" disabled={busy} onClick={onAskPay}>
                Record payment
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {error ? (
        <p className="notice err dk-notice-flat dk-task-error" role="alert">
          <span>{error}</span>
        </p>
      ) : null}
    </li>
  );
}

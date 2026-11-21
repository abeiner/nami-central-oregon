import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { STATUS_LABEL } from '../lib/contract';
import type { Sponsor, SponsorPatch, SponsorStatus } from '../lib/contract';
import { fmtDate, money } from '../lib/format';
import { inviteUrl } from '../lib/mock';
import EmailModal from './EmailModal';
import { dayDiff, errMsg, useAdminData, useDialog } from './useAdminData';

/* ---------- small shared pieces (also used by the list and the This week screen) ---------- */

export const STATUS_PILL: Record<SponsorStatus, string> = {
  prospect: 'quiet',
  committed: 'warn',
  invoiced: '',
  paid: 'ok',
  active: 'ok',
  renewal_due: 'warn',
  lapsed: 'danger',
};

export function StatusPill({ status }: { status: SponsorStatus }) {
  return <span className={('pill ' + STATUS_PILL[status]).trim()}>{STATUS_LABEL[status]}</span>;
}

export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return letters || '?';
}

export function Logo({ sponsor, large = false }: { sponsor: Sponsor; large?: boolean }) {
  const url = sponsor.recognition.logoDataUrl;
  const cls = 'dk-logo' + (large ? ' dk-logo-lg' : '');
  return url ? (
    <img className={cls} src={url} alt="" />
  ) : (
    <span className={cls + ' dk-logo-initials'} aria-hidden="true">
      {initialsOf(sponsor.company.name)}
    </span>
  );
}

/** Inline "are you sure" for recording a payment. Never a browser pop-up. */
export function PaymentConfirm({
  sponsor,
  pending,
  onConfirm,
  onCancel,
}: {
  sponsor: Sponsor;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <div className="dk-confirm" role="group" aria-label="Confirm payment">
      <p>
        Record {money(sponsor.total)} received from {sponsor.company.name}?
      </p>
      <div className="dk-confirm-btns">
        <button type="button" className="btn btn-dark btn-sm" onClick={onConfirm} disabled={pending}>
          {pending ? 'Saving…' : 'Confirm'}
        </button>
        <button ref={cancelRef} type="button" className="btn btn-line btn-sm" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function safeHttp(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

function logoFileName(name: string, dataUrl: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo';
  const mime = /^data:image\/([a-z0-9.+-]+)/i.exec(dataUrl)?.[1]?.toLowerCase() ?? 'png';
  const ext = mime === 'svg+xml' ? 'svg' : mime === 'jpeg' ? 'jpg' : mime;
  return `${slug}-logo.${ext}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ---------- drawer ---------- */

interface Props {
  sponsor: Sponsor | undefined;
  onClose: () => void;
}

type EmailTarget = { templateId?: string };

export default function SponsorDetail({ sponsor, onClose }: Props) {
  const ref = useDialog<HTMLElement>(onClose);

  return (
    <div
      className="dk-backdrop dk-backdrop-right"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside ref={ref} className="dk-drawer" role="dialog" aria-modal="true" aria-labelledby="dk-detail-title" tabIndex={-1}>
        {sponsor ? (
          <Body sponsor={sponsor} onClose={onClose} />
        ) : (
          <>
            <header className="dk-drawer-head">
              <div className="dk-drawer-title">
                <h2 id="dk-detail-title">Sponsor not found</h2>
              </div>
              <button type="button" className="btn btn-line btn-sm" onClick={onClose}>
                Close
              </button>
            </header>
            <div className="dk-drawer-body">
              <p className="muted">This sponsor may have been removed. Go back to the list to pick another.</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Body({ sponsor, onClose }: { sponsor: Sponsor; onClose: () => void }) {
  const { reload, notify } = useAdminData();
  const [email, setEmail] = useState<EmailTarget | null>(null);
  const [confirmPay, setConfirmPay] = useState<'next' | 'invoice' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(sponsor.notes);
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  // Keep the note box in step with the saved note, unless the person is mid-edit.
  const savedNote = useRef(sponsor.notes);
  useEffect(() => {
    if (note === savedNote.current) setNote(sponsor.notes);
    savedNote.current = sponsor.notes;
  }, [sponsor.notes]);

  const link = inviteUrl(sponsor);
  const logo = sponsor.recognition.logoDataUrl;
  const site = safeHttp(sponsor.company.website);
  const total = sponsor.benefits.length;
  const done = sponsor.benefits.filter((b) => b.doneAt).length;
  const benefits = useMemo(() => [...sponsor.benefits].sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [sponsor.benefits]);
  const history = useMemo(() => [...sponsor.activity].sort((a, b) => b.at.localeCompare(a.at)), [sponsor.activity]);
  const nextBenefit = benefits.find((b) => !b.doneAt);
  const welcomed = sponsor.activity.some((a) => a.type === 'email' && /welcome/i.test(a.text));
  const lateDays = sponsor.status === 'invoiced' && sponsor.invoice.dueAt ? Math.max(0, -dayDiff(sponsor.invoice.dueAt)) : 0;
  const invoiceLate = lateDays > 0;
  const canMarkInvoiced = sponsor.status === 'committed';
  const canRecordPayment = sponsor.status === 'committed' || sponsor.status === 'invoiced';

  async function mutate(key: string, work: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError(null);
    try {
      await work();
      setConfirmPay(null);
      await reload();
      notify(message);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const patch = (p: SponsorPatch) => api.admin.patch(sponsor.id, p);

  async function copyLink() {
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      setCopyHint(false);
      notify('Link copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      linkRef.current?.select();
      setCopyHint(true);
    }
  }

  function deliver(benefitId: string, label: string) {
    void mutate(`b:${benefitId}`, () => patch({ benefit: { id: benefitId, done: true } }), `Delivered: ${label}`);
  }

  /* ---- the single next step for this stage ---- */
  let next: { title: string; text: string; actions: ReactNode };
  const askPay = (
    <button type="button" className="btn btn-primary" onClick={() => setConfirmPay('next')} disabled={!!busy}>
      Record payment
    </button>
  );
  switch (sponsor.status) {
    case 'prospect':
      next = {
        title: 'Send them their personal link',
        text: 'Copy the invite link and send it with a short note. It opens the partner page with their name and package already filled in.',
        actions: (
          <button type="button" className="btn btn-primary" onClick={() => void copyLink()}>
            {copied ? 'Copied' : 'Copy invite link'}
          </button>
        ),
      };
      break;
    case 'committed':
      next = {
        title: 'Send the invoice',
        text: `They committed ${money(sponsor.total)}. Prepare the invoice email, then send it from your mailbox.`,
        actions: (
          <button type="button" className="btn btn-primary" onClick={() => setEmail({ templateId: 'invoice' })}>
            Prepare invoice email
          </button>
        ),
      };
      break;
    case 'invoiced':
      next = {
        title: 'Record payment when it arrives',
        text: invoiceLate
          ? `Invoice ${sponsor.invoice.number} was due ${fmtDate(sponsor.invoice.dueAt)} and is ${lateDays} ${lateDays === 1 ? 'day' : 'days'} late. A friendly reminder usually does it.`
          : `Invoice ${sponsor.invoice.number} is due ${fmtDate(sponsor.invoice.dueAt)}. Nothing to do until the money arrives.`,
        actions: (
          <>
            {askPay}
            {invoiceLate ? (
              <button type="button" className="btn btn-line" onClick={() => setEmail({ templateId: 'payment_reminder' })}>
                Prepare reminder
              </button>
            ) : null}
          </>
        ),
      };
      break;
    case 'paid':
      next = welcomed
        ? {
            title: 'Deliver the promised benefits',
            text: nextBenefit ? `Welcome email is done. Next up: ${nextBenefit.label}, due ${fmtDate(nextBenefit.dueAt)}.` : 'Welcome email is done and every benefit is delivered.',
            actions: nextBenefit ? (
              <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => deliver(nextBenefit.id, nextBenefit.label)}>
                Mark delivered
              </button>
            ) : null,
          }
        : {
            title: 'Welcome them',
            text: 'Payment is in. Prepare the welcome email so they know what happens next.',
            actions: (
              <button type="button" className="btn btn-primary" onClick={() => setEmail({ templateId: 'welcome' })}>
                Prepare welcome email
              </button>
            ),
          };
      break;
    case 'active':
      next = nextBenefit
        ? {
            title: 'Deliver the remaining benefits',
            text: `${total - done} of ${total} still to deliver. Next up: ${nextBenefit.label}, due ${fmtDate(nextBenefit.dueAt)}.`,
            actions: (
              <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => deliver(nextBenefit.id, nextBenefit.label)}>
                Mark delivered
              </button>
            ),
          }
        : {
            title: 'Everything is delivered',
            text: `All ${total} promised benefits are done. Nothing to do until renewal${sponsor.renewalDate ? ` on ${fmtDate(sponsor.renewalDate)}` : ''}.`,
            actions: null,
          };
      break;
    case 'renewal_due':
      next = {
        title: 'Invite them to renew',
        text: `Their partnership runs through ${fmtDate(sponsor.renewalDate)}. Send the renewal invitation while it is fresh.`,
        actions: (
          <button type="button" className="btn btn-primary" onClick={() => setEmail({ templateId: 'renewal' })}>
            Prepare renewal invitation
          </button>
        ),
      };
      break;
    default:
      next = {
        title: 'Reach out once more',
        text: 'This partnership has ended. A short, warm follow-up can bring them back.',
        actions: (
          <button type="button" className="btn btn-primary" onClick={() => setEmail({ templateId: 'follow_up' })}>
            Prepare follow-up
          </button>
        ),
      };
  }

  const noteChanged = note !== sponsor.notes;
  const linkTitle = sponsor.status === 'prospect' || sponsor.status === 'committed' ? 'Personal invite link' : 'Personal renewal link';

  return (
    <>
      <header className="dk-drawer-head">
        <Logo sponsor={sponsor} large />
        <div className="dk-drawer-title">
          <h2 id="dk-detail-title">{sponsor.company.name}</h2>
          <p className="dk-drawer-sub">
            <StatusPill status={sponsor.status} />
            {site ? (
              <a href={site} target="_blank" rel="noopener noreferrer">
                {site.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
              </a>
            ) : null}
          </p>
        </div>
        <button type="button" className="btn btn-line btn-sm dk-close" onClick={onClose} data-autofocus>
          Close
        </button>
      </header>

      <div className="dk-drawer-body">
        {error ? (
          <p className="notice err dk-notice-flat dk-sticky-error" role="alert">
            <span>{error}</span>
          </p>
        ) : null}

        <section className="dk-contact" aria-label="Contact">
          <p>
            <b>{sponsor.contact.name || 'No contact name yet'}</b>
            {sponsor.contact.title ? <span className="muted"> · {sponsor.contact.title}</span> : null}
          </p>
          <p className="dk-contact-lines">
            {sponsor.contact.email ? <a href={`mailto:${sponsor.contact.email}`}>{sponsor.contact.email}</a> : <span className="muted">No email yet</span>}
            {sponsor.contact.phone ? <a href={`tel:${sponsor.contact.phone.replace(/[^\d+]/g, '')}`}>{sponsor.contact.phone}</a> : null}
          </p>
        </section>

        <section className="dk-next" aria-label="Next step">
          <p className="eyebrow">Next step</p>
          <h3>{next.title}</h3>
          <p>{next.text}</p>
          {confirmPay === 'next' ? (
            <PaymentConfirm
              sponsor={sponsor}
              pending={busy === 'pay'}
              onConfirm={() => void mutate('pay', () => patch({ markPaid: true }), `Payment recorded for ${sponsor.company.name}.`)}
              onCancel={() => setConfirmPay(null)}
            />
          ) : next.actions ? (
            <div className="dk-actions">{next.actions}</div>
          ) : null}
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-package">
          <h3 id="dk-sec-package" className="dk-sec-title">
            Package
          </h3>
          {sponsor.selections.length === 0 ? (
            <p className="muted">No package chosen yet.</p>
          ) : (
            <ul className="dk-lines">
              {sponsor.selections.map((s) => (
                <li key={s.id}>
                  <span>{s.label}</span>
                  <span className="dk-num">{money(s.amount)}</span>
                </li>
              ))}
              <li className="dk-lines-total">
                <span>Total</span>
                <span className="dk-num">{money(sponsor.total)}</span>
              </li>
            </ul>
          )}
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-invoice">
          <h3 id="dk-sec-invoice" className="dk-sec-title">
            Invoice
          </h3>
          {sponsor.status === 'prospect' ? (
            <p className="muted">No invoice yet. It is created when they commit.</p>
          ) : (
            <>
              <dl className="kv dk-kv">
                <dt>Number</dt>
                <dd className="mono">{sponsor.invoice.number}</dd>
                <dt>Issued</dt>
                <dd>{sponsor.invoice.issuedAt ? fmtDate(sponsor.invoice.issuedAt) : 'Not sent yet'}</dd>
                <dt>Due</dt>
                <dd>{fmtDate(sponsor.invoice.dueAt)}</dd>
                <dt>Paid</dt>
                <dd>{sponsor.invoice.paidAt ? fmtDate(sponsor.invoice.paidAt) : 'Not yet'}</dd>
              </dl>
              {confirmPay === 'invoice' ? (
                <PaymentConfirm
                  sponsor={sponsor}
                  pending={busy === 'pay'}
                  onConfirm={() => void mutate('pay', () => patch({ markPaid: true }), `Payment recorded for ${sponsor.company.name}.`)}
                  onCancel={() => setConfirmPay(null)}
                />
              ) : (
                <div className="dk-actions">
                  {sponsor.invoice.url ? (
                    <a className="btn btn-line btn-sm" href={sponsor.invoice.url} target="_blank" rel="noopener noreferrer">
                      Open invoice
                    </a>
                  ) : null}
                  {canMarkInvoiced ? (
                    <button
                      type="button"
                      className="btn btn-line btn-sm"
                      disabled={!!busy}
                      onClick={() => void mutate('invoiced', () => patch({ markInvoiced: true }), 'Invoice marked as sent.')}
                    >
                      {busy === 'invoiced' ? 'Saving…' : 'Mark invoice sent'}
                    </button>
                  ) : null}
                  {canRecordPayment ? (
                    <button type="button" className="btn btn-dark btn-sm" disabled={!!busy} onClick={() => setConfirmPay('invoice')}>
                      Record payment
                    </button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-benefits">
          <h3 id="dk-sec-benefits" className="dk-sec-title">
            Promised benefits
            {total > 0 ? <span className="dk-sec-note">{done} of {total} delivered</span> : null}
          </h3>
          {!sponsor.recognition.listPublicly ? (
            <p className="notice info dk-notice-flat">
              <span>This sponsor asked not to be listed publicly. Skip public recognition.</span>
            </p>
          ) : null}
          {total === 0 ? (
            <p className="muted">The checklist appears once they commit.</p>
          ) : (
            <ul className="dk-benefits">
              {benefits.map((b) => {
                const key = `b:${b.id}`;
                const pending = busy === key;
                const checked = pending ? !b.doneAt : !!b.doneAt;
                const late = !b.doneAt && dayDiff(b.dueAt) < 0;
                return (
                  <li key={b.id}>
                    <label className={'check dk-benefit' + (checked ? ' is-done' : '')}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!!busy}
                        onChange={(e) =>
                          void mutate(
                            key,
                            () => patch({ benefit: { id: b.id, done: e.target.checked } }),
                            e.target.checked ? `Delivered: ${b.label}` : `Reopened: ${b.label}`,
                          )
                        }
                      />
                      <span className="dk-benefit-text">
                        <span className="dk-benefit-label">{b.label}</span>
                        <small className="muted">{b.doneAt ? `Delivered ${fmtDate(b.doneAt)}` : `Due ${fmtDate(b.dueAt)}`}</small>
                      </span>
                    </label>
                    {late ? <span className="pill danger">Late</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-recognition">
          <h3 id="dk-sec-recognition" className="dk-sec-title">
            Recognition details
          </h3>
          <dl className="kv dk-kv">
            <dt>Display name</dt>
            <dd>{sponsor.recognition.displayName || sponsor.company.name}</dd>
            <dt>Listed publicly</dt>
            <dd>{sponsor.recognition.listPublicly ? 'Yes' : 'No'}</dd>
            <dt>Social handle</dt>
            <dd>{sponsor.recognition.socialHandle || 'None given'}</dd>
            <dt>Notes</dt>
            <dd>{sponsor.recognition.notes || 'None'}</dd>
          </dl>
          {logo ? (
            <div className="dk-logo-row">
              <img className="dk-logo-preview" src={logo} alt={`${sponsor.company.name} logo`} />
              <a className="btn btn-line btn-sm" href={logo} download={logoFileName(sponsor.company.name, logo)}>
                Download logo
              </a>
            </div>
          ) : (
            <p className="muted dk-small">No logo uploaded yet.</p>
          )}
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-emails">
          <h3 id="dk-sec-emails" className="dk-sec-title">
            Emails
          </h3>
          <p className="muted dk-small">Pick a ready-made email. It is filled in for this sponsor; you send it from your own mailbox.</p>
          <div className="dk-actions">
            <button type="button" className="btn btn-line btn-sm" onClick={() => setEmail({})}>
              Prepare an email
            </button>
          </div>
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-link">
          <h3 id="dk-sec-link" className="dk-sec-title">
            {linkTitle}
          </h3>
          <div className="dk-link-row">
            <label className="sr-only" htmlFor="dk-invite-link">
              {linkTitle}
            </label>
            <input id="dk-invite-link" ref={linkRef} className="input mono dk-link-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn btn-line btn-sm" onClick={() => void copyLink()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="muted dk-small">
            {copyHint ? 'Your browser blocked copying. The link is selected: press Ctrl+C (or Cmd+C on a Mac). ' : ''}
            Opens the partner page with their name and package already filled in.
          </p>
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-notes">
          <h3 id="dk-sec-notes" className="dk-sec-title">
            Notes
          </h3>
          <div className="field">
            <label className="sr-only" htmlFor="dk-notes">
              Notes about {sponsor.company.name}
            </label>
            <textarea id="dk-notes" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering. Only staff see this." />
          </div>
          <div className="dk-actions">
            <button
              type="button"
              className="btn btn-dark btn-sm"
              disabled={!noteChanged || !!busy}
              onClick={() => void mutate('note', () => patch({ notes: note }), 'Note saved.')}
            >
              {busy === 'note' ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </section>

        <section className="dk-sec" aria-labelledby="dk-sec-history">
          <h3 id="dk-sec-history" className="dk-sec-title">
            History
          </h3>
          {history.length === 0 ? (
            <p className="muted">Nothing has happened yet.</p>
          ) : (
            <ul className="timeline dk-timeline">
              {history.map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  <b>{fmtDate(a.at)}</b>
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {email ? (
        <EmailModal
          sponsor={sponsor}
          templateId={email.templateId}
          onClose={() => setEmail(null)}
          onLogged={() => {
            void reload();
            notify(`Saved to ${sponsor.company.name}'s history.`);
          }}
        />
      ) : null}
    </>
  );
}

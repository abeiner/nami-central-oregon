import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { EmailResult, Sponsor, SponsorStatus } from '../lib/contract';
import { mock } from '../lib/mock';
import { errMsg, useAdminData, useDialog } from './useAdminData';

interface Props {
  sponsor: Sponsor;
  /** When absent, the person picks a template. */
  templateId?: string;
  onClose: () => void;
  onLogged: (result: EmailResult) => void;
}

/** A sensible starting template for each stage, used only when the caller did not choose one. */
const SUGGESTED: Record<SponsorStatus, string> = {
  prospect: 'prospect_intro',
  committed: 'invoice',
  invoiced: 'payment_reminder',
  paid: 'welcome',
  active: 'benefit_delivered',
  renewal_due: 'renewal',
  lapsed: 'follow_up',
};

type CopyKey = 'subject' | 'body';

export default function EmailModal({ sponsor, templateId, onClose, onLogged }: Props) {
  const { templates, content, mode } = useAdminData();
  const ref = useDialog<HTMLDivElement>(onClose);
  const picking = !templateId;
  const [chosen, setChosen] = useState<string>(() => templateId ?? SUGGESTED[sponsor.status]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  // The button that was focused disappears once the email is logged; move focus to the new one.
  useEffect(() => {
    if (result) ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [result, ref]);

  const activeId = templateId ?? chosen;
  const template = templates.find((t) => t.id === activeId) ?? (picking ? templates[0] : undefined);
  const effectiveId = template?.id ?? activeId;

  const preview = useMemo(() => {
    if (!template) return null;
    if (mode === 'mock' && content) return { ...mock.preview(sponsor, template, content), merged: true };
    return { subject: template.subject, body: template.body, merged: false };
  }, [template, mode, content, sponsor]);

  async function log() {
    if (!effectiveId || pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await api.admin.email(sponsor.id, effectiveId);
      setResult(r);
      onLogged(r);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setPending(false);
    }
  }

  async function copy(key: CopyKey, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setCopyFailed(false);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  const mailto = result
    ? `mailto:${sponsor.contact.email}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.body)}`
    : '';

  return (
    <div
      className="dk-backdrop dk-backdrop-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="dk-dialog" role="dialog" aria-modal="true" aria-labelledby="dk-email-title" tabIndex={-1}>
        <header className="dk-dialog-head">
          <div>
            <p className="eyebrow">{result ? 'Email ready' : 'Prepare an email'}</p>
            <h2 id="dk-email-title">{sponsor.company.name}</h2>
            <p className="muted dk-small">
              To {sponsor.contact.name || 'the contact'}
              {sponsor.contact.email ? ` (${sponsor.contact.email})` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="dk-dialog-body">
          {result ? (
            <>
              <div className="notice ok dk-notice-flat" role="status">
                <p>
                  {result.mode === 'sent'
                    ? `Sent to ${sponsor.contact.email || 'the contact'}. A copy is saved in this sponsor's history.`
                    : "Saved to this sponsor's history. Send it from your own mailbox."}
                </p>
              </div>

              <div className="dk-mail">
                <div className="dk-mail-row">
                  <span className="dk-mail-label">Subject</span>
                  <p className="dk-mail-subject">{result.subject}</p>
                </div>
                <pre className="dk-mail-body">{result.body}</pre>
              </div>

              {copyFailed ? (
                <p className="notice err dk-notice-flat" role="alert">
                  <span>Copying did not work in this browser. Select the text above and copy it by hand.</span>
                </p>
              ) : null}

              <div className="dk-actions">
                <button type="button" className="btn btn-line" onClick={() => void copy('subject', result.subject)}>
                  {copied === 'subject' ? 'Copied' : 'Copy subject'}
                </button>
                <button type="button" className="btn btn-line" onClick={() => void copy('body', result.body)}>
                  {copied === 'body' ? 'Copied' : 'Copy message'}
                </button>
                <a className="btn btn-primary" href={mailto}>
                  Open in my mail app
                </a>
              </div>
            </>
          ) : (
            <>
              {picking ? (
                <div className="field">
                  <label htmlFor="dk-email-template">Which email?</label>
                  <select
                    id="dk-email-template"
                    className="select"
                    value={template?.id ?? ''}
                    onChange={(e) => setChosen(e.target.value)}
                    data-autofocus
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {template ? <span className="hint">Use it: {template.when.charAt(0).toLowerCase() + template.when.slice(1)}.</span> : null}
                </div>
              ) : null}

              {!template ? (
                <p className="notice err dk-notice-flat" role="alert">
                  <span>{templates.length === 0 ? 'No email templates are available yet.' : 'That email template could not be found.'}</span>
                </p>
              ) : preview ? (
                <div className="dk-mail">
                  <div className="dk-mail-row">
                    <span className="dk-mail-label">Subject</span>
                    <p className="dk-mail-subject">{preview.subject}</p>
                  </div>
                  <pre className="dk-mail-body">{preview.body}</pre>
                </div>
              ) : null}

              {preview && !preview.merged ? (
                <p className="notice info dk-notice-flat">
                  <span>This is the template. Words in double curly brackets, such as {'{{company}}'}, are filled in with this sponsor's details when you log it.</span>
                </p>
              ) : (
                <p className="muted dk-small">This is a preview. Nothing is saved until you press the button below.</p>
              )}

              {error ? (
                <p className="notice err dk-notice-flat" role="alert">
                  <span>{error}</span>
                </p>
              ) : null}

              <div className="dk-actions">
                <button type="button" className="btn btn-primary" onClick={() => void log()} disabled={pending || !template} data-autofocus={picking ? undefined : true}>
                  {pending ? 'Saving…' : 'Log as prepared'}
                </button>
                <button type="button" className="btn btn-line" onClick={onClose}>
                  Cancel
                </button>
              </div>
              <p className="muted dk-small">
                Logging saves a record in this sponsor's history and shows you the finished email. The next screen says exactly what was done.
              </p>
            </>
          )}

          {result ? (
            <div className="dk-actions">
              <button type="button" className="btn btn-dark" onClick={onClose} data-autofocus>
                Done
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { EmailTemplate } from '../lib/contract';
import './admin-extra.css';

const PLACEHOLDER_SPLIT = /(\{\{\s*[a-z_]+\s*\}\})/gi;
const PLACEHOLDER_NAME = /\{\{\s*([a-z_]+)\s*\}\}/gi;

const PLACEHOLDER_HELP: Record<string, string> = {
  company: 'The sponsor’s business name.',
  contact_first_name: 'The first name of your contact there.',
  director_name: 'Your name, as the sender.',
  selections: 'The list of what they chose to sponsor.',
  total: 'The total amount of their commitment.',
  invoice_number: 'The invoice number.',
  invoice_url: 'A link to their printable invoice.',
  due_date: 'The date their payment is due.',
  renewal_date: 'The date their partnership runs through.',
  renewal_url: 'A link where they can renew in one click.',
  invite_url: 'The personal link to their partnership page.',
};

const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong.');

function Highlight({ text }: { text: string }) {
  const parts = text.split(PLACEHOLDER_SPLIT);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="ax-chip">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall back below (older browsers, or a page that is not secure) */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'ax-offscreen';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function NoticeIcon({ kind }: { kind: 'info' | 'err' }) {
  return (
    <svg className="ax-nico" viewBox="0 0 22 22" fill="none" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      {kind === 'info' ? (
        <path d="M11 10.2v5.2M11 6.9v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M11 6.6v5.2M11 15v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

interface Copied {
  key: string;
  failed: boolean;
}

export default function Emails() {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<Copied | null>(null);
  const alive = useRef(true);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const list = await api.admin.templates();
      if (!alive.current) return;
      setTemplates(list);
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
      window.clearTimeout(timer.current);
    };
  }, [load]);

  const retry = () => {
    setError(null);
    void load();
  };

  const copy = async (key: string, text: string) => {
    const ok = await writeClipboard(text);
    if (!alive.current) return;
    setCopied({ key, failed: !ok });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2000);
  };

  const used = useMemo(() => {
    const names: string[] = [];
    for (const t of templates ?? []) {
      for (const m of `${t.subject}\n${t.body}`.matchAll(PLACEHOLDER_NAME)) {
        const name = (m[1] ?? '').toLowerCase();
        if (name && !names.includes(name)) names.push(name);
      }
    }
    return names;
  }, [templates]);

  const copyLabel = (key: string, idle: string) => {
    if (copied?.key !== key) return idle;
    return copied.failed ? 'Could not copy' : 'Copied';
  };

  return (
    <div className="ax-page">
      <header className="ax-head">
        <h1>Emails</h1>
        <p>Ready-to-use messages, so you never write a sponsor email from scratch.</p>
      </header>

      <div className="notice info">
        <NoticeIcon kind="info" />
        <div>Emails are prepared here and sent from your own mailbox, so replies come straight to you.</div>
      </div>

      {error && (
        <div className="notice err" role="alert">
          <NoticeIcon kind="err" />
          <div className="ax-nbody">
            <p>We could not load the email templates. {error}</p>
            <button type="button" className="btn btn-line btn-sm" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      )}

      {!templates && !error && (
        <p className="ax-loading" role="status">
          Loading the templates…
        </p>
      )}

      {templates && (
        <>
          <section className="ax-legend" aria-labelledby="ax-legend-h">
            <h2 id="ax-legend-h">About the highlighted words</h2>
            <p>
              Words in double curly brackets, like <span className="ax-chip">{'{{company}}'}</span>, are placeholders. You never type them
              in. They are filled in automatically when the email is prepared from a sponsor&rsquo;s page, using that sponsor&rsquo;s details.
            </p>
            {used.length > 0 && (
              <dl>
                {used.map((name) => (
                  <div key={name}>
                    <dt>
                      <span className="ax-chip">{`{{${name}}}`}</span>
                    </dt>
                    <dd>{PLACEHOLDER_HELP[name] ?? 'Filled in automatically.'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {templates.length === 0 ? (
            <p className="ax-none">There are no email templates yet.</p>
          ) : (
            <div className="ax-tpls">
              {templates.map((t) => {
                const subjectKey = `${t.id}:subject`;
                const bodyKey = `${t.id}:message`;
                return (
                  <details key={t.id} className="ax-tpl">
                    <summary>
                      <span>
                        <span className="ax-tpl-name">{t.name}</span>
                        <span className="ax-tpl-when">
                          <b>When to use:</b> {t.when}
                        </span>
                      </span>
                    </summary>
                    <div className="ax-tpl-body">
                      <div>
                        <h3 className="ax-lbl">Subject</h3>
                        <div className="ax-box is-subject">
                          <Highlight text={t.subject} />
                        </div>
                        <div className="ax-copyrow">
                          <button
                            type="button"
                            className="btn btn-line btn-sm"
                            data-copied={copied?.key === subjectKey && !copied.failed ? 'true' : undefined}
                            data-failed={copied?.key === subjectKey && copied.failed ? 'true' : undefined}
                            onClick={() => void copy(subjectKey, t.subject)}
                          >
                            {copyLabel(subjectKey, 'Copy subject')}
                          </button>
                        </div>
                      </div>
                      <div>
                        <h3 className="ax-lbl">Message</h3>
                        <div className="ax-box">
                          <Highlight text={t.body} />
                        </div>
                        <div className="ax-copyrow">
                          <button
                            type="button"
                            className="btn btn-dark btn-sm"
                            data-copied={copied?.key === bodyKey && !copied.failed ? 'true' : undefined}
                            data-failed={copied?.key === bodyKey && copied.failed ? 'true' : undefined}
                            onClick={() => void copy(bodyKey, t.body)}
                          >
                            {copyLabel(bodyKey, 'Copy message')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {copied ? (copied.failed ? 'Could not copy. Select the text and copy it by hand.' : 'Copied to the clipboard.') : ''}
      </div>
    </div>
  );
}

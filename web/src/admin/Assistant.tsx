import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './assistant.css';

const ASKS = [
  { q: 'What needs me this week?', does: 'Lists overdue items first, then what is due in the next 30 days.' },
  { q: 'Who has not paid yet?', does: 'Shows open invoices with amounts and due dates.' },
  { q: 'Draft the renewal note for Demo Valley Credit Union.', does: 'Fills in the template for you to send from your own mailbox.' },
  { q: 'Add Fictional Fly Shop as a prospect for the Resource Guide.', does: 'Creates the prospect and gives you their personal invite link.' },
  { q: 'Find ten Central Oregon employers that care about employee wellbeing and add them as prospects.', does: 'Your assistant researches the businesses, you approve the list, and each one gets a personal invite link.' },
  { q: 'Their check arrived. Record it.', does: 'Marks the invoice paid, after you say yes.' },
  { q: 'Raise the Regional Partner level to $3,000.', does: 'Updates the public site and the sponsor PDF, after you say yes.' },
];

const TOOLS: [string, string, boolean][] = [
  ['whats_due', 'Open work with due dates', false],
  ['list_sponsors', 'Prospects and sponsors by status', false],
  ['get_sponsor', 'One sponsor: package, invoice, benefits, history', false],
  ['renewal_report', 'Renewals coming up and what they gave last year', false],
  ['list_email_templates', 'The ready-made messages', false],
  ['draft_email', 'Fill a template for one sponsor', false],
  ['add_prospect', 'Add a business to the prospect list', true],
  ['log_email', 'Record that you sent a message', true],
  ['mark_paid', 'Record a payment received', true],
  ['complete_benefit', 'Tick off a promised benefit', true],
  ['update_program_content', 'Change prices, benefits, projects or wording', true],
];

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-line btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard blocked: the text stays selectable */
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export default function Assistant() {
  const [client, setClient] = useState<'claude' | 'codex'>('claude');
  const [mode, setMode] = useState<'live' | 'mock' | null>(null);
  useEffect(() => {
    api.mode().then(setMode);
  }, []);

  const url = `${window.location.origin}/api/mcp`;
  const claude = `claude mcp add --transport http --scope local nami ${url} --header 'x-admin-key: \${NAMI_MCP_TOKEN}'`;
  const codex = `[mcp_servers.nami]\nurl = "${url}"\nenv_http_headers = { "x-admin-key" = "NAMI_MCP_TOKEN" }`;

  return (
    <div className="as-page">
      <header>
        <h1>Assistant</h1>
        <p className="as-lead">
          Run the sponsorship program by asking. Connect Claude or Codex to this desk once, then the monthly check-in is a
          conversation.
        </p>
      </header>

      {mode === 'mock' && (
        <div className="notice info">
          <span aria-hidden="true">i</span>
          <span>Demo mode: an assistant connects to the live site, not to the sample data in this browser.</span>
        </div>
      )}

      <section className="panel as-chat" aria-label="Example conversation">
        <div className="as-chat-head">
          <b>What a check-in looks like</b>
          <span className="pill quiet plain">Illustration with sample data</span>
        </div>
        <div className="as-msg as-you">Run my sponsorship check-in.</div>
        <div className="as-msg as-bot">
          <p>
            <b>Three things need you this week.</b>
          </p>
          <ol>
            <li>Example Outfitters&rsquo; $5,000 invoice is 13 days past due. I drafted a reminder.</li>
            <li>High Desert Demo Dental paid on Tuesday. Their welcome note is ready to send.</li>
            <li>Sagebrush Sample Bank&rsquo;s logo is due on the Partners page by Friday.</li>
          </ol>
          <p>Demo Valley Credit Union renews in 41 days. Shall I prepare their renewal note?</p>
        </div>
        <div className="as-msg as-you">Yes. And the dental check cleared, record it.</div>
        <div className="as-msg as-bot">
          <p>
            The renewal note is drafted with their package already selected. Recording a payment changes your records, so
            please confirm: <b>mark High Desert Demo Dental as paid, $5,000?</b>
          </p>
        </div>
      </section>

      <section className="as-grid">
        <div className="panel">
          <h2>Things you can ask</h2>
          <ul className="as-asks">
            {ASKS.map((a) => (
              <li key={a.q}>
                <b>&ldquo;{a.q}&rdquo;</b>
                <span>{a.does}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>You stay in charge</h2>
          <ul className="as-rules">
            <li>
              <b>Reading is free.</b> The assistant can look things up without asking.
            </li>
            <li>
              <b>Changes need your yes.</b> Recording a payment, ticking off a benefit or changing a price is confirmed first
              and written to the sponsor&rsquo;s history.
            </li>
            <li>
              <b>It drafts, you send.</b> Emails are prepared for you and sent from your own mailbox.
            </li>
            <li>
              <b>Business details only.</b> Work lists use business names. Contact details are filled into drafts on the
              server.
            </li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2>Connect once</h2>
        <p className="muted">
          You need the staff passcode for this desk. Save it on your computer as <code>NAMI_MCP_TOKEN</code>, then run one of
          these.
        </p>
        <div className="as-url">
          <code>{url}</code>
          <Copy text={url} label="Copy address" />
        </div>
        <div className="as-tabs" role="tablist" aria-label="Assistant app">
          <button role="tab" type="button" aria-selected={client === 'claude'} onClick={() => setClient('claude')}>
            Claude Code
          </button>
          <button role="tab" type="button" aria-selected={client === 'codex'} onClick={() => setClient('codex')}>
            Codex
          </button>
        </div>
        {client === 'claude' ? (
          <div className="as-code">
            <p className="muted">Run this once in a terminal, then start Claude and say &ldquo;run my sponsorship check-in&rdquo;.</p>
            <pre>{claude}</pre>
            <Copy text={claude} />
          </div>
        ) : (
          <div className="as-code">
            <p className="muted">
              Add this to <code>~/.codex/config.toml</code>, then start Codex and say &ldquo;run my sponsorship check-in&rdquo;.
            </p>
            <pre>{codex}</pre>
            <Copy text={codex} />
          </div>
        )}
        <p className="muted as-small">
          Works today in Claude Code and Codex with a paid Claude or ChatGPT plan. Connecting from the Claude or ChatGPT
          website needs a sign-in step that is not built yet. Full instructions are in the staff playbook.
        </p>
      </section>

      <section className="panel">
        <h2>What the assistant can do</h2>
        <div className="as-tools">
          {TOOLS.map(([name, what, writes]) => (
            <div key={name} className="as-tool">
              <code>{name}</code>
              <span>{what}</span>
              <span className={'pill plain ' + (writes ? 'warn' : 'ok')}>{writes ? 'Asks first' : 'Read only'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

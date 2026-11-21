import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContent } from '../App';
import { Footer, Nav } from '../components/Chrome';
import { ridge } from '../components/ridge';
import { isPrototype, recallSubmission } from '../lib/api';
import { addDays, buildChecklist, fmtDate, money } from '../lib/format';

const PAY_LABEL = { invoice: 'Bank transfer', check: 'Check', card: 'Card' } as const;

/** Draws the shareable partner badge: the business name over the lit skyline. */
function drawBadge(canvas: HTMLCanvasElement, name: string, line: string, year: string, sample: boolean) {
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  if (!c) return;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#020818');
  g.addColorStop(0.45, '#082042');
  g.addColorStop(0.8, '#33407e');
  g.addColorStop(1, '#c9684f');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // skyline of lights
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2600; i++) {
    const xn = rnd();
    const top = H - ridge(xn) * 250;
    const y = top + Math.pow(rnd(), 1.9) * (H - top);
    const rel = (H - y) / 250;
    c.fillStyle = rel > 0.62 ? '#eef4ff' : rel > 0.26 ? '#8fc0f2' : '#ffc66a';
    c.globalAlpha = 0.35 + rnd() * 0.65;
    const s = 1.6 + rnd() * 2;
    c.fillRect(xn * W, y, s, s);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';

  const display = "'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif";
  const mono = "'IBM Plex Mono', Consolas, monospace";
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#ffc247';
  c.font = `500 26px ${mono}`;
  c.fillText(`PROUD PARTNER OF NAMI CENTRAL OREGON · ${year}`.toUpperCase(), 72, 110);

  // business name, fitted on up to two lines
  const words = name.trim().split(/\s+/);
  let size = 112;
  let lines: string[] = [name.trim()];
  const measure = (s: number, ls: string[]) => {
    c.font = `800 ${s}px ${display}`;
    return Math.max(...ls.map((l) => c.measureText(l).width));
  };
  if (measure(size, lines) > W - 144 && words.length > 1) {
    let best = lines;
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const cand = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const w = measure(size, cand);
      if (w < bestW) {
        bestW = w;
        best = cand;
      }
    }
    lines = best;
  }
  if (lines.length > 1) size = Math.min(size, 104);
  while (size > 44 && measure(size, lines) > W - 144) size -= 4;
  c.font = `800 ${size}px ${display}`;
  c.fillStyle = '#ffffff';
  lines.forEach((l, i) => c.fillText(l, 72, 150 + size + i * size * 1.04));

  const after = 150 + size + (lines.length - 1) * size * 1.04;
  c.font = `500 34px ${display}`;
  c.fillStyle = 'rgba(255,255,255,0.88)';
  c.fillText(line, 72, after + 62);

  c.font = `400 26px ${display}`;
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillText('Every support group, class and resource is free.', 72, after + 106);

  if (sample) {
    // The prototype must never produce something that reads as a real, approved sponsorship.
    c.save();
    c.translate(W - 190, H - 96);
    c.rotate(-0.1);
    c.strokeStyle = '#ffc247';
    c.fillStyle = 'rgba(2,8,24,0.82)';
    c.lineWidth = 4;
    c.beginPath();
    c.roundRect(-130, -38, 260, 76, 12);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffc247';
    c.font = `500 40px ${mono}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SAMPLE', 0, 4);
    c.restore();
  }
}

export default function Welcome() {
  const { id = '' } = useParams();
  const content = useContent();
  const sub = useMemo(() => recallSubmission(id), [id]);
  const badge = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [sample, setSample] = useState(true);
  useEffect(() => {
    isPrototype().then(setSample);
  }, []);

  const app = sub?.application;
  const annual = app?.selections.find((s) => s.kind === 'annual');
  const role = annual ? annual.label : 'Project Sponsor';
  const displayName = app?.recognition.displayName || app?.company.name || '';
  const article = /^[aeiou]/i.test(role) ? 'an' : 'a';
  const announce = app
    ? `${displayName} is proud to support NAMI Central Oregon as ${article} ${role} for ${content.org.programYear}. Every support group, class and resource they offer is free for families across Central Oregon.`
    : '';

  useEffect(() => {
    if (!badge.current || !app) return;
    const paint = () => badge.current && drawBadge(badge.current, displayName, `${role} · keeping mental health support free`, content.org.programYear, sample);
    paint();
    document.fonts?.ready.then(paint).catch(() => {});
  }, [app, displayName, role, content.org.programYear, sample]);

  const download = () => {
    const cv = badge.current;
    if (!cv) return;
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${displayName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-nami-partner.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(announce);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is selectable on the page */
    }
  };

  if (!sub || !app) {
    return (
      <>
        <Nav solid />
        <div className="center-msg">
          <div>
            <h1 style={{ fontSize: 30, color: 'var(--ink)' }}>Your commitment was received.</h1>
            <p style={{ marginTop: 10 }}>The details of this confirmation are only shown in the browser where it was submitted.</p>
            <p style={{ marginTop: 18 }}>
              <Link className="btn btn-dark" to="/">
                Back to partnerships
              </Link>
            </p>
          </div>
        </div>
      </>
    );
  }

  const { receipt, submittedAt } = sub;
  if (receipt.status === 'prospect' || !receipt.invoiceNumber) {
    return (
      <>
        <Nav solid cta={false} />
        <section className="welcome-hero">
          <div className="wrap">
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>
              Request received · {fmtDate(submittedAt)}
            </p>
            <h1>Thank you, {app.company.name}. We will be in touch.</h1>
            <p>
              Our Regional Director will contact {app.contact.name} at {app.contact.email} to talk through the details. Nothing
              is committed yet, and no invoice has been created.
            </p>
          </div>
        </section>
        <div className="wrap welcome-grid">
          <section className="panel">
            <h2>What happens next</h2>
            <div className="panel-body">
              <ul className="timeline">
                <li>
                  <b>Within a few days</b>
                  <span>A short call or email from our Regional Director.</span>
                </li>
                <li>
                  <b>Together</b>
                  <span>We settle what you would like to support and how you would like to be recognized.</span>
                </li>
                <li>
                  <b>Then</b>
                  <span>You receive a link to this same form with everything filled in, ready to confirm.</span>
                </li>
              </ul>
            </div>
          </section>
          <section className="panel">
            <h2>What you asked about</h2>
            <div className="panel-body">
              <dl className="kv">
                {app.selections.map((s) => (
                  <div key={s.id} style={{ display: 'contents' }}>
                    <dt>{s.label}</dt>
                    <dd className="mono">{money(s.amount)}</dd>
                  </div>
                ))}
                {app.recognition.championsInterest && (
                  <>
                    <dt>{content.champions.title}</dt>
                    <dd>Send details</dd>
                  </>
                )}
              </dl>
              <p className="muted" style={{ fontSize: 14.5 }}>
                Questions in the meantime? Email <a href={`mailto:${content.org.email}`}>{content.org.email}</a>.
              </p>
            </div>
          </section>
        </div>
        <Footer />
      </>
    );
  }
  const checklist = buildChecklist(content, app.selections, submittedAt);
  const due = addDays(submittedAt, content.payment.netDays);

  return (
    <>
      <Nav solid cta={false} />
      <section className="welcome-hero">
        <div className="wrap">
          <p className="eyebrow" style={{ color: 'var(--gold)' }}>
            Commitment recorded · {fmtDate(submittedAt)}
          </p>
          <h1>Thank you, {app.company.name}.</h1>
          <p>
            {app.total > 0
              ? `Your ${money(app.total)} commitment helps keep every support group, class and resource free for families in Central Oregon.`
              : 'We have your details and will be in touch about next steps.'}
          </p>
        </div>
      </section>

      <div className="wrap welcome-grid">
        <div style={{ display: 'grid', gap: 20 }}>
          {app.recognition.listPublicly && app.total > 0 && (
            <section className="panel">
              <h2>Your partner badge is ready</h2>
              <p className="lead">{sample ? 'Made for you the moment you confirmed. On this preview site it carries a SAMPLE mark.' : 'Post it today. It was made for you the moment you confirmed.'}</p>
              <div className="panel-body" style={{ gap: 14 }}>
                <canvas ref={badge} className="badge-canvas" aria-label={`Partner badge for ${displayName}`} />
                <p className="announce">{announce}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-dark btn-sm" onClick={download}>
                    Download badge (PNG)
                  </button>
                  <button className="btn btn-line btn-sm" onClick={copy}>
                    {copied ? 'Copied' : 'Copy announcement text'}
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="panel">
            <h2>What happens next</h2>
            <div className="panel-body">
              <ul className="timeline">
                {content.timeline.map((t, i) => (
                  <li key={i}>
                    <b>{t.when}</b>
                    <span>{t.what}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {checklist.length > 0 && (
            <section className="panel">
              <h2>What we promised you</h2>
              <p className="lead">
                {app.recognition.listPublicly
                  ? 'Each item is tracked to a date on our side, so nothing depends on memory.'
                  : 'You asked to give quietly, so public recognition is skipped.'}
              </p>
              <div className="panel-body">
                <ul className="timeline">
                  {checklist.map((b) => (
                    <li key={b.id}>
                      <b>By {fmtDate(b.dueAt, { month: 'short', day: 'numeric' })}</b>
                      <span>{b.label}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted" style={{ fontSize: 14 }}>Dates count from today and move to your payment date once payment is received.</p>
              </div>
            </section>
          )}
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <section className="panel">
            <h2>Invoice {receipt.invoiceNumber}</h2>
            <div className="panel-body" style={{ gap: 16 }}>
              <dl className="kv">
                {app.selections.map((s) => (
                  <div key={s.id} style={{ display: 'contents' }}>
                    <dt>{s.label}</dt>
                    <dd className="mono">{money(s.amount)}</dd>
                  </div>
                ))}
                <dt style={{ color: 'var(--ink)', fontWeight: 700 }}>Total</dt>
                <dd className="mono" style={{ fontSize: 20 }}>
                  {money(app.total)}
                </dd>
                <dt>Due</dt>
                <dd>{fmtDate(due)}</dd>
                <dt>Paying by</dt>
                <dd>{PAY_LABEL[app.payment.method]}</dd>
              </dl>
              {receipt.checkoutUrl || (!sample && /^https:\/\//.test(content.payment.onlineUrl ?? '')) ? (
                <a className="btn btn-primary btn-block" href={receipt.checkoutUrl ?? content.payment.onlineUrl} target="_blank" rel="noreferrer">
                  Pay online now
                </a>
              ) : null}
              <a className="btn btn-dark btn-block" href={receipt.invoiceUrl} target="_blank" rel="noreferrer">
                Open your invoice
              </a>
              {sample && (
                <div className="notice">
                  <span aria-hidden="true">!</span>
                  <span>Preview site: this invoice is a sample and is not a request for payment.</span>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>We have what we need</h2>
            <div className="panel-body">
              <dl className="kv">
                <dt>Contact</dt>
                <dd>{app.contact.name}</dd>
                <dt>Email</dt>
                <dd style={{ overflowWrap: 'anywhere' }}>{app.contact.email}</dd>
                <dt>Shown as</dt>
                <dd>{app.recognition.listPublicly ? displayName : 'Not listed publicly'}</dd>
                <dt>Logo</dt>
                <dd>{app.recognition.logoDataUrl ? 'Received' : 'Send it any time'}</dd>
              </dl>
              <p className="muted" style={{ fontSize: 14.5 }}>
                Need to change something? Email <a href={`mailto:${content.org.email}`}>{content.org.email}</a>.
              </p>
            </div>
          </section>
        </div>
      </div>
      <Footer />
    </>
  );
}

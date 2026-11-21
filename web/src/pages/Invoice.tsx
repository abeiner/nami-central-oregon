import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContent } from '../App';
import { BrandMark } from '../components/Chrome';
import { api, recallSubmission } from '../lib/api';
import type { Selection } from '../lib/contract';
import { addDays, fmtDate, money } from '../lib/format';
import { mock } from '../lib/mock';

interface View {
  number: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  company: string;
  contact: string;
  address: string;
  selections: Selection[];
  total: number;
  method: string;
}

/** Printable invoice for the browser demo. In live mode the API serves its own. */
export default function Invoice() {
  const { id = '' } = useParams();
  const content = useContent();
  const [view, setView] = useState<View | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const mode = await api.mode();
      const s = mode === 'mock' ? mock.find(id, content) : undefined;
      if (s) {
        const issued = s.invoice.issuedAt ?? s.createdAt;
        setView({
          number: s.invoice.number,
          issuedAt: issued,
          dueAt: s.invoice.dueAt ?? addDays(issued, content.payment.netDays),
          paidAt: s.invoice.paidAt ?? null,
          company: s.company.name,
          contact: s.contact.name,
          address: s.company.address,
          selections: s.selections,
          total: s.total,
          method: s.payment.method,
        });
        return;
      }
      const sub = recallSubmission(id);
      if (sub) {
        setView({
          number: sub.receipt.invoiceNumber,
          issuedAt: sub.submittedAt,
          dueAt: addDays(sub.submittedAt, content.payment.netDays),
          paidAt: null,
          company: sub.application.company.name,
          contact: sub.application.contact.name,
          address: sub.application.company.address,
          selections: sub.application.selections,
          total: sub.application.total,
          method: sub.application.payment.method,
        });
        return;
      }
      setView(null);
    })();
  }, [id, content]);

  if (view === undefined) return <div className="center-msg">Loading invoice…</div>;
  if (view === null)
    return (
      <div className="center-msg">
        <div>
          <p>We could not find that invoice in this browser.</p>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn-dark" to="/">
              Back to partnerships
            </Link>
          </p>
        </div>
      </div>
    );

  const { org, payment } = content;
  return (
    <div className="invoice-page">
      <div className="wrap">
        <div className="invoice">
          <div className="invoice-top">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <BrandMark size={44} />
              <div>
                <b style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{org.name}</b>
                <div className="muted" style={{ fontSize: 14 }}>
                  {org.mailingAddress} · {org.email}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h1>Invoice</h1>
              <div className="mono">{view.number}</div>
            </div>
          </div>

          <div className="invoice-top" style={{ marginTop: 32 }}>
            <div>
              <div className="eyebrow">Bill to</div>
              <b>{view.company}</b>
              <div className="muted">{view.contact}</div>
              <div className="muted">{view.address}</div>
            </div>
            <dl className="kv" style={{ minWidth: 240 }}>
              <dt>Issued</dt>
              <dd>{fmtDate(view.issuedAt)}</dd>
              <dt>Due</dt>
              <dd>{fmtDate(view.dueAt)}</dd>
              <dt>Terms</dt>
              <dd>{payment.terms}</dd>
              <dt>Status</dt>
              <dd>
                <span className={'stamp ' + (view.paidAt ? 'paid' : 'due')}>{view.paidAt ? `Paid ${fmtDate(view.paidAt)}` : 'Open'}</span>
              </dd>
            </dl>
          </div>

          <table>
            <thead>
              <tr>
                <th>Sponsorship, program year {org.programYear}</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {view.selections.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{money(s.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total due</td>
                <td>{money(view.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="notice" style={{ marginTop: 28 }}>
            <span aria-hidden="true">!</span>
            <span>
              <b>Sample invoice from the preview site.</b> It is not a request for payment. When the program launches, payment
              details for checks made payable to {payment.checkPayableTo}, bank transfer and card will appear here.
            </span>
          </div>
          <p className="muted" style={{ marginTop: 18, fontSize: 14 }}>
            {org.taxNote} Thank you for standing with families in Central Oregon.
          </p>
        </div>
        <p className="no-print" style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="btn btn-dark" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </p>
      </div>
    </div>
  );
}

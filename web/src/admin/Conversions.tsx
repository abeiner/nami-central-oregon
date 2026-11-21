import { useEffect, useState } from 'react';
import { getAdminKey } from '../lib/api';
import { useAdminData } from './useAdminData';
import './conversions.css';

interface ConversionReport {
  days: number;
  from?: string;
  through?: string;
  totals: {
    visits: number;
    explored: number;
    builderStarts: number;
    inquiries: number;
    commitments: number;
    convertedVisits: number;
    conversionRate: number | null;
  };
}

type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: ConversionReport };

const example: ConversionReport = {
  days: 30,
  totals: {
    visits: 128,
    explored: 61,
    builderStarts: 23,
    inquiries: 8,
    commitments: 4,
    convertedVisits: 11,
    conversionRate: 11 / 128,
  },
};

const number = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default function Conversions() {
  const { mode } = useAdminData();
  const [state, setState] = useState<ReportState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (mode !== 'live') return;
    const controller = new AbortController();
    setState({ status: 'loading' });

    async function load() {
      try {
        const response = await fetch('/api/admin/conversions', {
          headers: { 'x-admin-key': getAdminKey() },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setState({ status: 'error', message: 'Sign in again to view microsite results.' });
          return;
        }
        if (!response.ok) throw new Error('Report unavailable');
        const report: ConversionReport = await response.json();
        if (!controller.signal.aborted) setState({ status: 'ready', report });
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: 'We couldn’t load microsite results. Try again in a moment.' });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [mode, attempt]);

  const isExample = mode === 'mock';
  const report = isExample ? example : state.status === 'ready' ? state.report : null;

  return (
    <div className="dk-page">
      <header className="dk-page-head">
        <h1 className="dk-h1">Microsite results</h1>
        <p className="dk-lead">See how visits to the sponsorship site turn into inquiries and commitments.</p>
      </header>
      {isExample && (
        <div className="notice info dk-notice-flat" role="note">
          <p><strong>Example numbers.</strong> This report uses fictional activity for the sample desk.</p>
        </div>
      )}
      {report ? (
        <ConversionSummary report={report} />
      ) : state.status === 'error' ? (
        <div className="notice err dk-notice-flat" role="alert">
          <div>
            <p>{state.message}</p>
            <p className="dk-retry">
              <button type="button" className="btn btn-dark btn-sm" onClick={() => setAttempt(value => value + 1)}>Retry</button>
            </p>
          </div>
        </div>
      ) : (
        <p role="status" className="muted">Loading microsite results…</p>
      )}
    </div>
  );
}

function ConversionSummary({ report }: { report: ConversionReport }) {
  const { days, from, through, totals } = report;
  const { visits, explored, builderStarts, inquiries, commitments, convertedVisits, conversionRate } = totals;
  const rate = visits === 0 || conversionRate === null ? '—' : percent.format(conversionRate);
  const figures = [
    ['Measured visits', number.format(visits)],
    ['Inquiries', number.format(inquiries)],
    ['Commitments', number.format(commitments)],
    ['Conversion rate', rate],
  ];
  const activity = [
    ['Visits that explored partnership options', explored],
    ['Visits that started the partnership builder', builderStarts],
    ['Visits with an inquiry or commitment', convertedVisits],
  ] as const;

  return (
    <section className="conversion-report" aria-labelledby="conversion-window">
      <h2 className="dk-group-title" id="conversion-window">Last {number.format(days)} days</h2>
      {from && through && (
        <p className="muted conversion-dates">
          <time dateTime={from}>{date.format(new Date(from))}</time> through{' '}
          <time dateTime={through}>{date.format(new Date(through))}</time>
        </p>
      )}
      <dl className="dk-figures conversion-figures">
        {figures.map(([label, value]) => (
          <div className="dk-figure" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {visits === 0 && (
        <div className="dk-empty">
          <p><strong>No measured visits in this period.</strong> The conversion rate will appear once a visit is recorded.</p>
        </div>
      )}
      <p className="conversion-denominator">
        The conversion rate is the share of measured visits with at least one sponsorship inquiry or completed commitment. Each visit counts once.
      </p>
      <section className="conversion-activity" aria-labelledby="conversion-activity">
        <h3 className="dk-group-title" id="conversion-activity">Journey activity</h3>
        <dl>
          {activity.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{number.format(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}

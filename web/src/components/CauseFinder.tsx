import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../App';
import type { Cause, Selection, SiteContent } from '../lib/contract';
import { money, resolveSelection, selectionBenefits } from '../lib/format';

/** Used when the program content has no `causes` list of its own. */
export const DEFAULT_CAUSES: Cause[] = [
  {
    id: 'find-help',
    label: 'Helping people find care',
    programs: 'Resource Guide · Find a Therapist Directory · one-on-one resource navigation',
    impact:
      'When someone you love is struggling, the hardest part is knowing who to call. The Resource Guide and the directory put the answer in one place, in print and online.',
    opportunities: ['resource-guide:friend', 'resource-guide:supporting', 'resource-guide:presenting', 'therapist-directory:sponsor'],
  },
  {
    id: 'support',
    label: 'Peer and family support',
    programs: 'NAMI Connection peer groups · Family Support Groups · more than 50 gatherings every month',
    impact:
      'Every group is led by people who have lived it. Nobody pays to attend, and nobody needs insurance or a referral to walk in.',
    opportunities: ['support-groups:sponsor', 'community', 'regional'],
  },
  {
    id: 'education',
    label: 'Education for families and schools',
    programs: 'Family-to-Family · Peer-to-Peer · Basics · Ending the Silence · In Our Own Voice',
    impact:
      'Free classes and presentations taught by trained volunteers give families and young people the words and the tools to cope.',
    opportunities: ['education:series', 'regional'],
  },
  {
    id: 'workplace',
    label: 'Mental health at work',
    programs: 'Presentations for employees · StigmaFree Workplace · Mental Health Champions',
    impact:
      'Bring a NAMI presentation to your own team. It tells every employee that it is safe to ask for help, and where to find it.',
    opportunities: ['sustaining', 'leadership'],
  },
  {
    id: 'rural',
    label: 'Reaching rural communities',
    programs: 'Outreach across Crook and Jefferson counties and the Confederated Tribes of Warm Springs',
    impact:
      'In much of Central Oregon, help is a long drive away. Outreach brings classes, groups and resources to the towns where people live.',
    opportunities: ['rural-outreach:sponsor', 'regional'],
  },
  {
    id: 'awareness',
    label: 'Awareness and community',
    programs: 'NAMIWalks Central Oregon · Be Kind to Your Mind podcast · community events',
    impact:
      'Public events and local stories make it normal to talk about mental health, long before anyone reaches a crisis.',
    opportunities: ['podcast:episode', 'community-events:sponsor', 'namiwalks:supporter', 'namiwalks:bronze', 'podcast:season', 'namiwalks:silver', 'namiwalks:gold'],
  },
  {
    id: 'mission',
    label: 'The whole mission',
    programs: 'Every program above, wherever the need is greatest',
    impact:
      'An annual partnership is the most flexible support there is. It keeps every group, class and resource free, all year.',
    opportunities: ['community', 'regional', 'sustaining', 'leadership', 'custom'],
  },
];

const BUDGETS: { id: string; label: string; min: number; max: number }[] = [
  { id: 'any', label: 'Any budget', min: 0, max: Infinity },
  { id: '1000', label: 'Up to $1,000', min: 0, max: 1000 },
  { id: '2500', label: 'Up to $2,500', min: 0, max: 2500 },
  { id: '5000', label: 'Up to $5,000', min: 0, max: 5000 },
  { id: '10000', label: '$10,000 and up', min: 10000, max: Infinity },
];

interface Opportunity {
  sel: Selection;
  /** Small line above the title: the project, or "Annual partnership". */
  kicker: string;
  title: string;
  receive: string;
  plus: boolean;
  annual: boolean;
  note: string;
}

function describe(content: SiteContent, sel: Selection): Opportunity {
  const benefits = selectionBenefits(content, sel);
  if (sel.kind === 'annual') {
    const tier = content.tiers.find((t) => t.id === sel.id);
    const own = tier?.benefits[0]?.label ?? '';
    return {
      sel,
      kicker: 'Annual partnership',
      title: sel.label,
      annual: true,
      plus: !!tier?.plus,
      receive: own,
      note: `${benefits.length} benefits in all`,
    };
  }
  const [projectId, levelId] = sel.id.split(':');
  const project = content.projects.find((p) => p.id === projectId);
  const level = project?.levels.find((l) => l.id === levelId);
  return {
    sel,
    kicker: project?.name ?? '',
    title: (level?.name ?? sel.label).replace(/^NAMIWalks /, ''),
    annual: false,
    plus: !!level?.plus,
    receive: benefits[0]?.label ?? '',
    note: level?.limit ? (level.limit === 1 ? 'One sponsor only' : `Limited to ${level.limit} sponsors`) : '',
  };
}

/**
 * The cause-first path: pick what matters to your business, see the programs
 * behind it and what support makes possible, then compare the ways to help.
 */
export default function CauseFinder({ withName }: { withName: (path: string) => string }) {
  const content = useContent();
  const causes = content.causes?.length ? content.causes : DEFAULT_CAUSES;
  const [causeId, setCauseId] = useState(causes[0]!.id);
  const [budgetId, setBudgetId] = useState('any');
  const cause = causes.find((c) => c.id === causeId) ?? causes[0]!;
  const budget = BUDGETS.find((b) => b.id === budgetId) ?? BUDGETS[0]!;

  const all = useMemo(
    () =>
      cause.opportunities
        .map((id) => resolveSelection(content, id))
        .filter((s): s is Selection => !!s)
        .map((s) => describe(content, s))
        .sort((a, b) => a.sel.amount - b.sel.amount),
    [cause, content],
  );
  const shown = all.filter((o) => o.sel.amount >= budget.min && o.sel.amount <= budget.max);
  const nearest = all.length
    ? all.reduce((best, o) => {
        const target = budget.max === Infinity ? budget.min : budget.max;
        return Math.abs(o.sel.amount - target) < Math.abs(best.sel.amount - target) ? o : best;
      })
    : undefined;

  return (
    <div className="cf">
      <div className="cf-causes" role="tablist" aria-label="Causes" aria-orientation="vertical">
        {causes.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === cause.id}
            className="cf-cause"
            onClick={() => {
              setCauseId(c.id);
              // Conversion measurement listens for this; nothing is counted here.
              window.dispatchEvent(new CustomEvent('nami:cause', { detail: c.id }));
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="cf-panel" role="tabpanel" aria-live="polite" key={cause.id}>
        <div className="cf-story">
          <p className="eyebrow">The programs behind it</p>
          <p className="cf-programs">{cause.programs}</p>
          <p className="eyebrow" style={{ marginTop: 22 }}>
            What your support makes possible
          </p>
          <p className="cf-impact">{cause.impact}</p>
        </div>

        <div className="cf-ways">
          <div className="cf-bar">
            <h3>Ways to support this</h3>
            <div className="cf-budget" role="radiogroup" aria-label="Budget">
              {BUDGETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={b.id === budget.id}
                  onClick={() => {
                    setBudgetId(b.id);
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 && nearest && (
            <p className="cf-none">
              Nothing for this cause at that budget. The closest option is {nearest.sel.label} at {money(nearest.sel.amount, nearest.plus)}.{' '}
              <button type="button" className="linkbtn" onClick={() => setBudgetId('any')}>
                Show all options
              </button>
            </p>
          )}

          <div className="cf-opps">
            {shown.map((o) => (
              <Link className="cf-opp" key={o.sel.id} to={withName(`/partner?select=${o.sel.id}`)}>
                <span className="cf-opp-top">
                  <span>
                    <span className="cf-kicker">{o.kicker}</span>
                    <b>{o.title}</b>
                  </span>
                  <span className="cf-price">{money(o.sel.amount, o.plus)}</span>
                </span>
                <span className="cf-receive">{o.receive}</span>
                <span className="cf-opp-foot">
                  <span>{o.note}</span>
                  <span className="cf-go">
                    Add to my partnership <span aria-hidden="true">&rarr;</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

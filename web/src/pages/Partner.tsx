import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useBusinessName, useContent } from '../App';
import { Nav } from '../components/Chrome';
import RecognitionPreview from '../components/RecognitionPreview';
import { api, ApiError, isPrototype, rememberSubmission } from '../lib/api';
import type { PaymentMethod, Selection, SponsorshipApplication } from '../lib/contract';
import { money, resolveSelection, selectionBenefits, tierBenefits, uuid } from '../lib/format';

const STEPS = ['Choose', 'Your business', 'Recognition', 'Confirm'] as const;
const DRAFT_KEY = 'nami.partnerDraft.v2';
const MAX_LOGO_BYTES = 900_000;

interface Draft {
  picks: string[];
  company: { name: string; website: string; description: string; address: string };
  contact: { name: string; title: string; email: string; phone: string };
  displayName: string;
  listPublicly: boolean;
  socialHandle: string;
  notes: string;
  champions: boolean;
  method: PaymentMethod;
  signer: string;
  accepted: boolean;
}

const EMPTY: Draft = {
  picks: [],
  company: { name: '', website: '', description: '', address: '' },
  contact: { name: '', title: '', email: '', phone: '' },
  displayName: '',
  listPublicly: true,
  socialHandle: '',
  notes: '',
  champions: false,
  method: 'invoice',
  signer: '',
  accepted: false,
};

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Draft) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export default function Partner() {
  const content = useContent();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { name: carriedName, setName } = useBusinessName();
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [d, setD] = useState<Draft>(() => {
    const draft = loadDraft();
    const fromUrl = (params.get('select') ?? params.get('pick') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const valid = fromUrl.filter((id) => resolveSelection(content, id));
    const company = params.get('for') ?? carriedName ?? '';
    return {
      ...draft,
      picks: valid.length ? valid : draft.picks,
      company: { ...draft.company, name: draft.company.name || company },
      displayName: draft.displayName || company,
    };
  });
  const [logo, setLogo] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState('');
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openProjects, setOpenProjects] = useState<string[]>(['resource-guide']);
  const [askFirst, setAskFirst] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [mode, setMode] = useState<'live' | 'mock' | null>(null);
  const idem = useRef(uuid());
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const [preview, setPreview] = useState(false);
  useEffect(() => {
    api.mode().then(setMode);
    isPrototype().then(setPreview);
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d]);
  useEffect(() => {
    if (d.company.name) setName(d.company.name);
  }, [d.company.name, setName]);

  const selections = useMemo(
    () => d.picks.map((id) => resolveSelection(content, id)).filter((s): s is Selection => !!s),
    [d.picks, content],
  );
  const total = selections.reduce((sum, s) => sum + s.amount, 0);
  const annual = selections.find((s) => s.kind === 'annual');
  const annualTier = annual ? content.tiers.find((t) => t.id === annual.id) : undefined;
  const hasPlus = selections.some((s) => {
    if (s.kind === 'annual') return content.tiers.find((t) => t.id === s.id)?.plus;
    const [p, l] = s.id.split(':');
    return content.projects.find((x) => x.id === p)?.levels.find((x) => x.id === l)?.plus;
  });
  const allBenefits = useMemo(() => {
    const seen = new Set<string>();
    return selections.flatMap((s) => selectionBenefits(content, s)).filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
  }, [selections, content]);
  const hasGuide = d.picks.some((p) => p.startsWith('resource-guide:'));
  // Custom partnerships and Champions-only requests start a conversation instead of a commitment.
  const mustAsk = total === 0 || !!annualTier?.inquiryOnly;
  const inquiry = mustAsk || askFirst;

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setCompany = (patch: Partial<Draft['company']>) => setD((x) => ({ ...x, company: { ...x.company, ...patch } }));
  const setContact = (patch: Partial<Draft['contact']>) => setD((x) => ({ ...x, contact: { ...x.contact, ...patch } }));

  const pickTier = (id: string | null) =>
    setD((x) => ({ ...x, picks: [...(id ? [id] : []), ...x.picks.filter((p) => p.includes(':'))] }));
  const toggleLevel = (projectId: string, levelId: string) =>
    setD((x) => {
      const id = `${projectId}:${levelId}`;
      const rest = x.picks.filter((p) => !p.startsWith(projectId + ':'));
      return { ...x, picks: x.picks.includes(id) ? rest : [...rest, id] };
    });
  const remove = (id: string) => setD((x) => ({ ...x, picks: x.picks.filter((p) => p !== id) }));

  const validate = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0 && selections.length === 0 && !d.champions) e.picks = 'Choose at least one way to take part.';
    if (s === 1) {
      if (!d.company.name.trim()) e.companyName = 'Enter your business name.';
      if (!d.contact.name.trim()) e.contactName = 'Enter a contact person.';
      if (!emailOk(d.contact.email)) e.contactEmail = 'Enter an email like name@business.com.';
    }
    if (s === 3 && !inquiry) {
      if (!d.accepted) e.accepted = 'Tick the box to confirm the commitment.';
      if (d.signer.trim().length < 3) e.signer = 'Type your full name to sign.';
    }
    return e;
  };

  const goTo = (s: number) => {
    setStep(s);
    setReached((r) => Math.max(r, s));
    setErrors({});
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"], .notice.err')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    if (step === 1 && !d.displayName.trim()) set({ displayName: d.company.name });
    if (step === 1 && !d.signer.trim()) set({ signer: d.contact.name });
    goTo(step + 1);
  };

  const readLogo = (file: File | undefined) => {
    setLogoErr('');
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setLogoErr('Use a PNG, JPG or WebP file.');
    if (file.size > MAX_LOGO_BYTES) return setLogoErr('That file is larger than 900 KB. A smaller version works fine.');
    const fr = new FileReader();
    fr.onload = () => setLogo(typeof fr.result === 'string' ? fr.result : null);
    fr.onerror = () => setLogoErr('We could not read that file. Try another one.');
    fr.readAsDataURL(file);
  };

  const submit = async () => {
    const e = validate(3);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setSubmitErr('');
    const application: SponsorshipApplication = {
      intent: inquiry ? 'inquiry' : 'commit',
      company: { ...d.company, name: d.company.name.trim() },
      contact: { ...d.contact, email: d.contact.email.trim() },
      selections,
      total,
      recognition: {
        displayName: d.displayName.trim() || d.company.name.trim(),
        logoDataUrl: logo,
        listPublicly: d.listPublicly,
        socialHandle: d.socialHandle.trim(),
        notes: d.notes.trim(),
        championsInterest: d.champions,
      },
      payment: { method: d.method },
      agreement: { accepted: !inquiry, signerName: inquiry ? '' : d.signer.trim(), signedAt: new Date().toISOString() },
    };
    try {
      const receipt = await api.submitSponsorship(application, idem.current);
      rememberSubmission({ receipt, application, submittedAt: application.agreement.signedAt });
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      nav(`/welcome/${receipt.id}`);
    } catch (err) {
      setSubmitErr(
        err instanceof ApiError
          ? `${err.message} Nothing was lost. Please try again.`
          : `We could not reach the server, so your commitment was not saved. Please try again, or email ${content.org.email}.`,
      );
      setBusy(false);
    }
  };

  const guide = content.projects.find((p) => p.id === 'resource-guide');
  const ordered = [...(guide ? [guide] : []), ...content.projects.filter((p) => p.id !== 'resource-guide')];
  const totalLabel = money(total, !!hasPlus);

  return (
    <div className="builder">
      <Nav solid cta={false} />
      <div className="wrap">
        <div className="builder-head" ref={topRef}>
          <p className="eyebrow">Partner with {content.org.name}</p>
          <h1>{d.company.name.trim() ? `${d.company.name.trim()}, build your partnership.` : 'Build your partnership.'}</h1>
          <p>Choose what fits, tell us about your business once, and confirm. About three minutes.</p>
          <div className="stepper" role="list">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                role="listitem"
                className={i < step ? 'done' : ''}
                aria-current={i === step ? 'step' : undefined}
                disabled={i > reached}
                onClick={() => i <= reached && goTo(i)}
              >
                <i>{i < step ? '✓' : i + 1}</i>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="builder-grid">
          <div>
            {step === 0 && (
              <>
                {errors.picks && (
                  <div className="notice err" style={{ marginBottom: 16 }}>
                    <span aria-hidden="true">!</span>
                    <span>{errors.picks}</span>
                  </div>
                )}
                <section className="panel">
                  <h2>Annual partnership</h2>
                  <p className="lead">Support the whole mission for a year. Each level includes everything in the levels before it.</p>
                  <div className="panel-body" role="radiogroup" aria-label="Annual partnership level">
                    {content.tiers.map((t) => {
                      const on = d.picks.includes(t.id);
                      const prev = t.includes ? content.tiers.find((x) => x.id === t.includes) : undefined;
                      return (
                        <label className={'opt' + (on ? ' on' : '')} key={t.id}>
                          <input type="radio" name="tier" checked={on} onChange={() => pickTier(t.id)} onClick={() => on && pickTier(null)} />
                          <span>
                            <b>{t.name}</b>
                            <span className="desc">{t.tagline}</span>
                            {on && (
                              <ul>
                                {t.benefits.map((b) => (
                                  <li key={b.id}>{b.label}</li>
                                ))}
                                {prev && <li className="inherited">Plus everything in {prev.name} ({tierBenefits(content, prev.id).length} benefits)</li>}
                                {t.inquiryOnly && <li className="inherited">We will call you once to choose the program you support. The final amount is set together.</li>}
                              </ul>
                            )}
                          </span>
                          <span className="price">{money(t.amount, t.plus)}</span>
                        </label>
                      );
                    })}
                    <label className={'opt' + (!annual ? ' on' : '')}>
                      <input type="radio" name="tier" checked={!annual} onChange={() => pickTier(null)} />
                      <span>
                        <b>No annual partnership right now</b>
                        <span className="desc">Sponsor a project or NAMIWalks on its own.</span>
                      </span>
                      <span className="price muted">$0</span>
                    </label>
                  </div>
                </section>

                <section className="panel">
                  <h2>Projects</h2>
                  <p className="lead">Add any project to your partnership, or sponsor one on its own. Open a project to see its levels.</p>
                  <div className="panel-body" style={{ gap: 14 }}>
                    {ordered.map((p) => {
                      const picked = d.picks.find((x) => x.startsWith(p.id + ':'));
                      const open = openProjects.includes(p.id) || !!picked;
                      const from = Math.min(...p.levels.map((l) => l.amount));
                      return (
                      <div className={'proj-block' + (p.kind === 'namiwalks' ? ' walks-block' : '') + (open ? ' open' : '')} key={p.id}>
                        <button
                          type="button"
                          className="proj-head"
                          aria-expanded={open}
                          onClick={() => setOpenProjects((o) => (o.includes(p.id) ? o.filter((x) => x !== p.id) : [...o, p.id]))}
                        >
                          <span>
                            <b>{p.name}</b>
                            <span className="proj-desc">{open ? p.description : p.kicker}</span>
                          </span>
                          <span className="proj-side">
                            {picked ? (
                              <span className="pill ok">Added</span>
                            ) : (
                              <span className="proj-from">{p.levels.length > 1 ? 'from ' : ''}{money(from)}</span>
                            )}
                            <span className="chev" aria-hidden="true" />
                          </span>
                        </button>
                        {open && p.levels.map((l) => {
                          const id = `${p.id}:${l.id}`;
                          const on = d.picks.includes(id);
                          return (
                            <label className={'opt' + (on ? ' on' : '')} key={l.id}>
                              <input type="checkbox" checked={on} onChange={() => toggleLevel(p.id, l.id)} />
                              <span>
                                <b>{l.name}</b>
                                <span className="desc">
                                  {l.benefits[0]?.label}
                                  {l.limit ? ` · ${l.limit === 1 ? 'one sponsor only' : `limited to ${l.limit}`}` : ''}
                                </span>
                              </span>
                              <span className="price">{money(l.amount, l.plus)}</span>
                            </label>
                          );
                        })}
                      </div>
                      );
                    })}
                  </div>
                </section>

                <section className="panel">
                  <h2>{content.champions.title}</h2>
                  <p className="lead">{content.champions.body}</p>
                  <div className="panel-body">
                    <label className="check">
                      <input type="checkbox" checked={d.champions} onChange={(e) => set({ champions: e.target.checked })} />
                      <span>
                        <b>Yes, tell us how to take part.</b>
                        <span className="desc muted" style={{ display: 'block', fontSize: 14.5 }}>
                          No cost. {content.champions.disclaimer}
                        </span>
                      </span>
                    </label>
                  </div>
                </section>
              </>
            )}

            {step === 1 && (
              <section className="panel">
                <h2>Your business</h2>
                <p className="lead">You enter this once. We use it for your invoice and your recognition.</p>
                <div className="panel-body form-grid" style={{ gap: 16 }}>
                  <div className="field full">
                    <label htmlFor="co-name">Business name</label>
                    <input id="co-name" className="input" value={d.company.name} onChange={(e) => setCompany({ name: e.target.value })} aria-invalid={!!errors.companyName} autoComplete="organization" />
                    {errors.companyName && <span className="err">{errors.companyName}</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="co-web">Website</label>
                    <input id="co-web" className="input" value={d.company.website} onChange={(e) => setCompany({ website: e.target.value })} placeholder="yourbusiness.com" inputMode="url" autoComplete="url" />
                  </div>
                  <div className="field">
                    <label htmlFor="co-addr">Billing address</label>
                    <input id="co-addr" className="input" value={d.company.address} onChange={(e) => setCompany({ address: e.target.value })} placeholder="Street, city, ZIP" autoComplete="street-address" />
                  </div>
                  <div className="field full">
                    <label htmlFor="co-desc">One sentence about your business</label>
                    <textarea id="co-desc" className="textarea" value={d.company.description} onChange={(e) => setCompany({ description: e.target.value })} maxLength={240} placeholder="What you do and who you serve." />
                    <span className="hint">We use this when we thank you publicly. {240 - d.company.description.length} characters left.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="ct-name">Contact person</label>
                    <input id="ct-name" className="input" value={d.contact.name} onChange={(e) => setContact({ name: e.target.value })} aria-invalid={!!errors.contactName} autoComplete="name" />
                    {errors.contactName && <span className="err">{errors.contactName}</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="ct-title">Title</label>
                    <input id="ct-title" className="input" value={d.contact.title} onChange={(e) => setContact({ title: e.target.value })} autoComplete="organization-title" />
                  </div>
                  <div className="field">
                    <label htmlFor="ct-email">Email</label>
                    <input id="ct-email" className="input" type="email" value={d.contact.email} onChange={(e) => setContact({ email: e.target.value })} aria-invalid={!!errors.contactEmail} autoComplete="email" />
                    {errors.contactEmail ? <span className="err">{errors.contactEmail}</span> : <span className="hint">Your invoice and welcome note go here.</span>}
                  </div>
                  <div className="field">
                    <label htmlFor="ct-phone">Phone</label>
                    <input id="ct-phone" className="input" type="tel" value={d.contact.phone} onChange={(e) => setContact({ phone: e.target.value })} autoComplete="tel" />
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="panel">
                <h2>How you would like to be recognized</h2>
                <p className="lead">Add your logo and watch it appear where your recognition will go.</p>
                <div className="panel-body recog">
                  <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
                    <div className="field">
                      <span className="label">Logo</span>
                      <div
                        className={'dropzone' + (over ? ' over' : '')}
                        role="button"
                        tabIndex={0}
                        onClick={() => fileRef.current?.click()}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOver(true);
                        }}
                        onDragLeave={() => setOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setOver(false);
                          readLogo(e.dataTransfer.files[0]);
                        }}
                      >
                        {logo ? <img src={logo} alt="Your logo" /> : <b>Drop your logo here, or choose a file</b>}
                        <span className="hint">{logo ? 'Choose a different file' : 'PNG, JPG or WebP, up to 900 KB. You can also send it later.'}</span>
                      </div>
                      <input ref={fileRef} id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => readLogo(e.target.files?.[0])} />
                      {logoErr && <span className="err">{logoErr}</span>}
                      {logo && (
                        <button type="button" className="linkbtn" style={{ justifySelf: 'start', fontSize: 14 }} onClick={() => setLogo(null)}>
                          Remove logo
                        </button>
                      )}
                    </div>
                    <div className="field">
                      <label htmlFor="rc-name">Name as it should appear</label>
                      <input id="rc-name" className="input" value={d.displayName} onChange={(e) => set({ displayName: e.target.value })} placeholder={d.company.name} />
                    </div>
                    <div className="field">
                      <label htmlFor="rc-social">Social media handle</label>
                      <input id="rc-social" className="input" value={d.socialHandle} onChange={(e) => set({ socialHandle: e.target.value })} placeholder="@yourbusiness" />
                      <span className="hint">So we can tag you when we say thank you.</span>
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={d.listPublicly} onChange={(e) => set({ listPublicly: e.target.checked })} />
                      <span>
                        <b>Recognize us publicly</b>
                        <span className="muted" style={{ display: 'block', fontSize: 14.5 }}>
                          Untick to give quietly. We will not list your name or logo anywhere.
                        </span>
                      </span>
                    </label>
                    <div className="field">
                      <label htmlFor="rc-notes">Anything we should know?</label>
                      <textarea id="rc-notes" className="textarea" value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Wording to use or avoid, who approves artwork, and so on." />
                    </div>
                  </div>
                  <div>
                    {d.listPublicly ? (
                      <RecognitionPreview name={d.displayName || d.company.name} logo={logo} flat tabs={hasGuide ? ['page', 'guide', 'post'] : ['page', 'post']} tierName={annualTier?.name} />
                    ) : (
                      <div className="notice info">
                        <span aria-hidden="true">i</span>
                        <span>You chose to give quietly. Your support counts just the same, and nothing will be published.</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {step === 3 && (
              <>
                <section className="panel">
                  <h2>{inquiry ? 'Review and send' : 'Review and confirm'}</h2>
                  <p className="lead">
                    {d.company.name} · {d.contact.name} · {d.contact.email}
                  </p>
                  <div className="panel-body">
                    <table className="review-table">
                      <tbody>
                        {selections.map((s) => (
                          <tr key={s.id}>
                            <td>{s.label}</td>
                            <td>{money(s.amount)}</td>
                          </tr>
                        ))}
                        {d.champions && (
                          <tr>
                            <td>{content.champions.title}: send us details</td>
                            <td>No cost</td>
                          </tr>
                        )}
                        {total > 0 && (
                          <tr className="total">
                            <td>{mustAsk ? 'Starting point' : inquiry ? 'What you picked' : 'Total commitment'}</td>
                            <td>{totalLabel}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {selections.length > 0 && !inquiry && (
                  <section className="panel">
                    <h2>How would you like to pay?</h2>
                    <p className="lead">{content.payment.onlineNote}</p>
                    <div className="panel-body pay-opts" role="radiogroup" aria-label="Payment preference">
                      {(
                        [
                          ['invoice', 'Bank transfer', 'Pay from the invoice by ACH.'],
                          ['check', 'Check', 'Mail a check with the invoice number.'],
                          ['card', 'Card', 'We send a secure card link with your invoice.'],
                        ] as [PaymentMethod, string, string][]
                      ).map(([id, label, desc]) => (
                        <label className={'opt' + (d.method === id ? ' on' : '')} key={id}>
                          <input type="radio" name="pay" checked={d.method === id} onChange={() => set({ method: id })} />
                          <span>
                            <b>{label}</b>
                            <span className="desc">{desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="hint muted" style={{ marginTop: 12, fontSize: 14 }}>
                      Payment terms: {content.payment.terms}. No payment is taken on this page.
                    </p>
                  </section>
                )}

                {!mustAsk && (
                  <section className="panel">
                    <h2>How would you like to start?</h2>
                    <div className="panel-body start-opts" role="radiogroup" aria-label="How to start">
                      <label className={'opt' + (!askFirst ? ' on' : '')}>
                        <input type="radio" name="start" checked={!askFirst} onChange={() => setAskFirst(false)} />
                        <span>
                          <b>Confirm our partnership now</b>
                          <span className="desc">Sign below and your invoice is ready right away.</span>
                        </span>
                      </label>
                      <label className={'opt' + (askFirst ? ' on' : '')}>
                        <input type="radio" name="start" checked={askFirst} onChange={() => setAskFirst(true)} />
                        <span>
                          <b>Ask about this partnership first</b>
                          <span className="desc">Send us what you picked. No signature, no invoice, no obligation.</span>
                        </span>
                      </label>
                    </div>
                  </section>
                )}

                <section className="panel">
                  <h2>{inquiry ? 'This starts a conversation' : 'The commitment'}</h2>
                  <div className="panel-body" style={{ gap: 18 }}>
                    {inquiry && (
                      <p>
                        Nothing is committed yet. Our Regional Director will contact {d.contact.name || 'you'} to talk it through.
                        No invoice is created until you both agree on the details.
                      </p>
                    )}
                    {inquiry && (
                      <div className="field">
                        <label htmlFor="ask-notes">Anything you would like to ask? (optional)</label>
                        <textarea id="ask-notes" className="textarea" value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Timing, budget cycle, what recognition looks like, and so on." />
                      </div>
                    )}
                    {!inquiry && (
                    <>
                    <ol className="agreement">
                      {content.agreement.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ol>
                    <label className="check">
                      <input type="checkbox" checked={d.accepted} onChange={(e) => set({ accepted: e.target.checked })} aria-invalid={!!errors.accepted} />
                      <span>
                        <b>
                          On behalf of {d.company.name || 'our business'}, I confirm this commitment{total ? ` of ${totalLabel}` : ''}.
                        </b>
                        {errors.accepted && (
                          <span className="err" style={{ display: 'block', color: 'var(--danger)', fontSize: 14 }}>
                            {errors.accepted}
                          </span>
                        )}
                      </span>
                    </label>
                    <div className="field" style={{ maxWidth: 420 }}>
                      <label htmlFor="sign">Type your full name to sign</label>
                      <input id="sign" className="input sign" value={d.signer} onChange={(e) => set({ signer: e.target.value })} aria-invalid={!!errors.signer} autoComplete="name" />
                      {errors.signer && <span className="err">{errors.signer}</span>}
                    </div>
                    </>
                    )}
                    {preview && (
                      <div className="notice">
                        <span aria-hidden="true">!</span>
                        <span>
                          <b>Preview site.</b> Please use sample details. No payment is collected and no email is sent from this
                          page.
                          {mode === 'mock' ? ' What you send here is saved in your browser only.' : ''}
                        </span>
                      </div>
                    )}
                    {submitErr && (
                      <div className="notice err" role="alert">
                        <span aria-hidden="true">!</span>
                        <span>{submitErr}</span>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            <div className="builder-actions">
              {step > 0 ? (
                <button type="button" className="btn btn-line" onClick={() => goTo(step - 1)} disabled={busy}>
                  Back
                </button>
              ) : (
                <Link className="btn btn-line" to="/">
                  Back to overview
                </Link>
              )}
              {step < 3 ? (
                <button type="button" className="btn btn-dark" onClick={next}>
                  Continue to {STEPS[step + 1]!.toLowerCase()}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                  {busy ? 'Sending…' : inquiry ? (mustAsk ? 'Request a conversation' : 'Send my question') : `Confirm ${totalLabel} commitment`}
                </button>
              )}
            </div>
          </div>

          <aside className="summary" aria-label="Your partnership">
            <div className="summary-card">
              <h2>Your partnership</h2>
              {selections.length === 0 ? (
                <p className="summary-empty">Nothing chosen yet. Pick an annual level, a project, or both.</p>
              ) : (
                <ul className="summary-list">
                  {selections.map((s) => (
                    <li key={s.id}>
                      <span>{s.label}</span>
                      <span className="mono">{money(s.amount)}</span>
                      <button type="button" aria-label={`Remove ${s.label}`} onClick={() => remove(s.id)}>
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="summary-total">
                <span>Total</span>
                <b key={total} className="pop">
                  {totalLabel}
                </b>
              </div>
              {allBenefits.length > 0 && (
                <div className="summary-get">
                  <b style={{ color: '#fff' }}>
                    {allBenefits.length} benefit{allBenefits.length === 1 ? '' : 's'} included
                  </b>
                  <ul>
                    {allBenefits.slice(0, 4).map((b) => (
                      <li key={b.id}>{b.label}</li>
                    ))}
                    {allBenefits.length > 4 && <li>and {allBenefits.length - 4} more</li>}
                  </ul>
                </div>
              )}
              {step < 3 && (
                <button type="button" className="btn btn-primary btn-block" onClick={next}>
                  Continue
                </button>
              )}
            </div>
            <p className="muted" style={{ fontSize: 14, padding: '0 6px' }}>
              One form, one invoice. Questions? <a href={`mailto:${content.org.email}`}>{content.org.email}</a>
            </p>
          </aside>
        </div>
      </div>

      <div className="mobile-bar">
        <span>
          <small>
            {selections.length} selected · step {step + 1} of 4
          </small>
          <b>{totalLabel}</b>
        </span>
        {step < 3 ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={next}>
            Continue
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
            {inquiry ? 'Send' : 'Confirm'}
          </button>
        )}
      </div>
    </div>
  );
}

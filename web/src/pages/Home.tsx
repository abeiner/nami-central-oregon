import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBusinessName, useContent } from '../App';
import { Footer, Nav } from '../components/Chrome';
import CauseFinder from '../components/CauseFinder';
import RidgeLights from '../components/RidgeLights';
import RecognitionPreview from '../components/RecognitionPreview';
import { api } from '../lib/api';
import { money } from '../lib/format';

export default function Home() {
  const content = useContent();
  const { name, setName } = useBusinessName();
  const nav = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const [touched, setTouched] = useState(false);
  const [pdf, setPdf] = useState('/downloads/sponsor-guide.pdf');
  useEffect(() => {
    // When the API is up, its PDF always matches the program the director last saved.
    api.mode().then((m) => m === 'live' && setPdf('/api/guide.pdf'));
  }, []);
  const { org, hero, stats, tiers, projects, champions, timeline, faq } = content;

  const guide = projects.find((p) => p.id === 'resource-guide');
  const walks = projects.find((p) => p.kind === 'namiwalks');
  const others = projects.filter((p) => p !== guide && p !== walks);
  const withName = (path: string) => (name.trim() ? `${path}${path.includes('?') ? '&' : '?'}for=${encodeURIComponent(name.trim())}` : path);
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    nav(withName('/partner'));
  };
  const personal = name.trim() && !touched;
  // The director can edit the headline; the last sentence takes the accent colour.
  const cut = hero.headline.trim().search(/(?<=[.!?])\s+(?=[^.!?]+[.!?]?$)/);
  const headA = cut > 0 ? hero.headline.slice(0, cut).trim() : hero.headline;
  const headB = cut > 0 ? hero.headline.slice(cut).trim() : '';

  return (
    <>
      <Nav />
      <section className="hero">
        <RidgeLights name={name.trim() || 'Your name here'} stage={stage} counter={counter} />
        <div className="wrap hero-in">
          <div className="hero-copy">
            <p className="eyebrow">{personal ? `Prepared for ${name.trim()}` : hero.eyebrow}</p>
            <h1>
              {headA} {headB && <em>{headB}</em>}
            </h1>
            <p className="hero-sub">{hero.sub}</p>
            <form onSubmit={go}>
              <label className="namebox-label" htmlFor="hero-name">
                See your name in lights
              </label>
              <div className="namebox">
                <input
                  id="hero-name"
                  value={name}
                  onChange={(e) => {
                    setTouched(true);
                    setName(e.target.value);
                  }}
                  placeholder="Type your business name"
                  autoComplete="organization"
                  maxLength={44}
                />
                <button className="btn btn-primary" type="submit">
                  See your partnership
                </button>
              </div>
            </form>
            <p className="hero-ctas">
              <a href="#partnerships">See partnership levels</a>
              <a href={pdf}>Sponsor guide (PDF)</a>
            </p>
          </div>
          <div className="sky-stage" ref={stage} aria-hidden="true">
            <span className="sky-hint">{name.trim() ? 'your name, in lights' : 'this could be you'}</span>
          </div>
        </div>
        <div className="lights-count">
          <div className="wrap lights-count-in">
            <span className="n" ref={counter}>
              5,000
            </span>
            <p className="cap">
              lights, one for each neighbor. <b>2,500 people served in 2025.</b> <b>5,000 on track for 2026.</b>
            </p>
          </div>
        </div>
        <p className="sr-only">
          An illustration of the Cascade skyline drawn with 5,000 points of light, one for each person NAMI Central Oregon is on
          track to reach in 2026.
        </p>
      </section>

      <section className="wrap" aria-label="Reach">
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <b>
                {s.value.toLocaleString('en-US')}
                {s.suffix}
              </b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="causes">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Start with what matters to you</p>
            <h2>Which part of this work means the most to your business?</h2>
            <p>Pick a cause. You will see the programs behind it, what your support makes possible, and the ways to help at your budget.</p>
          </div>
          <CauseFinder withName={withName} />
        </div>
      </section>

      <section className="section tint" id="why">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Why businesses partner with us</p>
            <h2>Good for the community. Good for your team. Easy on your calendar.</h2>
          </div>
          <div className="why">
            <div>
              <h3>Recognition your customers see</h3>
              <p>Your name or logo on our Partners page, in our newsletter and on the projects you support, for a full year.</p>
            </div>
            <div>
              <h3>Support for your own people</h3>
              <p>Sustaining partners and above receive a mental health presentation for their employees, led by trained NAMI volunteers.</p>
            </div>
            <div>
              <h3>Almost no work for you</h3>
              <p>One form and one invoice. After that we contact you only when your recognition goes live, and once a year about renewing.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="preview">
        <div className="wrap see">
          <div>
            <p className="eyebrow">See it before you sign</p>
            <h2>Your name on the work, before you commit to anything.</h2>
            <p className="see-lead">
              Recognition here is short, specific and always delivered. Type your business name and look at exactly where it
              goes.
            </p>
            <div className="field" style={{ marginTop: 22, maxWidth: 420 }}>
              <label htmlFor="see-name">Your business name</label>
              <input
                id="see-name"
                className="input"
                value={name}
                onChange={(e) => {
                  setTouched(true);
                  setName(e.target.value);
                }}
                placeholder="Juniper Street Coffee"
                maxLength={44}
              />
            </div>
            <p style={{ marginTop: 22 }}>
              <Link className="btn btn-dark" to={withName('/partner')}>
                Build your partnership
              </Link>
            </p>
          </div>
          <RecognitionPreview name={name} flat />
        </div>
      </section>

      <section className="section tint" id="partnerships">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Annual partnerships · {org.programYear}</p>
            <h2>Five levels. Each one includes everything below it.</h2>
            <p>The list of benefits is short on purpose. We would rather promise a few things and deliver every one.</p>
          </div>
          <div className="ladder">
            {tiers.map((t) => {
              const prev = t.includes ? tiers.find((x) => x.id === t.includes) : undefined;
              return (
                <article className={'tier' + (t.featured ? ' featured' : '')} key={t.id}>
                  {t.featured && <span className="tier-flag">Recommended</span>}
                  <h3>{t.name}</h3>
                  <div className="tier-price">
                    {money(t.amount, t.plus)}
                    <small>per year</small>
                  </div>
                  <p className="tier-tag">{t.tagline}</p>
                  {prev && <p className="tier-inc">Everything in {prev.name}, plus</p>}
                  <ul>
                    {t.benefits.map((b) => (
                      <li key={b.id}>{b.label}</li>
                    ))}
                  </ul>
                  <Link className={'btn btn-sm ' + (t.featured ? 'btn-primary' : 'btn-line')} to={withName(`/partner?select=${t.id}`)}>
                    {t.inquiryOnly ? 'Start a conversation' : `Choose ${t.name.replace(' Partner', '')}`}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" id="projects">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Project sponsorships</p>
            <h2>Or put your name behind one piece of the work.</h2>
            <p>Sponsor a project on its own, or add it to an annual partnership. It is still one form and one invoice.</p>
          </div>

          {guide && (
            <div className="guide-feature">
              <div className="guide-art">
                <div className="guide-cover">
                  <span>NAMI Central Oregon</span>
                  <b>Mental Health Resource Guide</b>
                  <div className="by">
                    Presented by
                    <strong>{name.trim() || 'Your business'}</strong>
                  </div>
                </div>
              </div>
              <div>
                <p className="eyebrow">{guide.kicker} · open now</p>
                <h3>{guide.name}</h3>
                <p>{guide.description}</p>
                <div className="levels">
                  {guide.levels.map((l) => (
                    <Link className="level" key={l.id} to={withName(`/partner?select=${guide.id}:${l.id}`)}>
                      <span>
                        <b>{l.name}</b>
                        <small>
                          {l.benefits[0]?.label}
                          {l.limit ? ` · ${l.limit === 1 ? 'one sponsor only' : `limited to ${l.limit}`}` : ''}
                        </small>
                      </span>
                      <span className="price">{money(l.amount, l.plus)}</span>
                      <span className="arrow" aria-hidden="true">
                        &rarr;
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="projects">
            {others.map((p) => {
              const from = Math.min(...p.levels.map((l) => l.amount));
              const first = p.levels.reduce((a, b) => (a.amount <= b.amount ? a : b));
              return (
                <Link className="project" key={p.id} to={withName(`/partner?select=${p.id}:${first.id}`)}>
                  <span className="eyebrow">{p.kicker}</span>
                  <h3>{p.name}</h3>
                  <p>{p.description}</p>
                  <span className="from">
                    <span>{p.levels.length > 1 ? 'from' : first.name}</span>
                    <b>{money(from, first.plus)}</b>
                  </span>
                </Link>
              );
            })}
          </div>

          {walks && (
            <div className="walks">
              <div>
                <p className="eyebrow">{walks.kicker}</p>
                <h3>{walks.name}</h3>
                <p>{walks.description}</p>
              </div>
              <div className="walk-amounts">
                {walks.levels.map((l) => (
                  <Link key={l.id} to={withName(`/partner?select=${walks.id}:${l.id}`)}>
                    <small>{l.name.replace('NAMIWalks ', '').replace(' Sponsor', '')}</small>
                    {money(l.amount, l.plus)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="section tint" id="champions">
        <div className="wrap champions">
          <div>
            <p className="eyebrow">Recognition you earn, not buy</p>
            <h2 style={{ fontSize: 'clamp(30px, 4vw, 46px)', marginTop: 14 }}>{champions.title}</h2>
            <p style={{ marginTop: 16, fontSize: 19, color: 'var(--muted)' }}>{champions.body}</p>
            <p className="fineprint" style={{ marginTop: 22 }}>
              {champions.disclaimer}
            </p>
          </div>
          <div>
            <p style={{ fontWeight: 650, marginBottom: 12 }}>Complete these three in a year:</p>
            <ol>
              {champions.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
            <p className="muted" style={{ marginTop: 14, fontSize: 15 }}>
              Interested? Tick the Champions box when you fill in the partner form, with or without a sponsorship.
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>From interested to official in about three minutes.</h2>
          </div>
          <div className="steps">
            <div className="step">
              <h3>Choose</h3>
              <p>An annual level, a project, NAMIWalks, or any mix of them.</p>
              <span className="pill plain who">You · 1 minute</span>
            </div>
            <div className="step">
              <h3>Tell us once</h3>
              <p>A contact, your logo, a one-line description and how your name should read.</p>
              <span className="pill plain who">You · 2 minutes</span>
            </div>
            <div className="step">
              <h3>Confirm</h3>
              <p>Review a plain-language commitment and type your name.</p>
              <span className="pill plain who">You · 20 seconds</span>
            </div>
            <div className="step">
              <h3>Invoice</h3>
              <p>Your invoice is ready the moment you confirm.</p>
              <span className="pill plain ok who">Instant</span>
            </div>
            <div className="step">
              <h3>Welcome</h3>
              <p>A welcome note, your partner badge and dated next steps.</p>
              <span className="pill plain ok who">From NAMI</span>
            </div>
          </div>
          <div className="after">
            <h3>After you confirm</h3>
            <ul className="timeline">
              {timeline.map((t, i) => (
                <li key={i}>
                  <b>{t.when}</b>
                  <span>{t.what}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section tint" id="questions">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Questions</p>
            <h2>The short answers.</h2>
          </div>
          <div className="faq">
            {faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section closing">
        <div className="wrap">
          <h2>{name.trim() ? `${name.trim()}, your neighbors are counting on this.` : 'Put your business name beside the work.'}</h2>
          <p>Three minutes now keeps a year of support groups, classes and resources free for families in Central Oregon.</p>
          <div className="row">
            <Link className="btn btn-primary" to={withName('/partner')}>
              Build your partnership
            </Link>
            <a className="btn btn-ghost-light" href={`mailto:${org.email}`}>
              Ask a question
            </a>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}

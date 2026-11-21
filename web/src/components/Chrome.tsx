import { Link } from 'react-router-dom';
import { useContent } from '../App';

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#082042" />
      <circle cx="26.5" cy="10" r="2.6" fill="#ffc247" />
      <path d="M3 27 10.5 14l3.6 5.2L18.6 9l5 9 2.6-3.4L33 27z" fill="#ff9466" />
      <path d="M3 27h30v2a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" fill="#0c499c" />
    </svg>
  );
}

export function Nav({ solid = false, cta = true }: { solid?: boolean; cta?: boolean }) {
  return (
    <header className={'nav' + (solid ? ' solid' : '')}>
      <div className="wrap nav-in">
        <Link to="/" className="brand">
          <BrandMark />
          <span>
            NAMI Central Oregon
            <small>Business partnerships</small>
          </span>
        </Link>
        <nav className="nav-links" aria-label="Sections">
          <Link to="/#causes">Causes</Link>
          <Link to="/#partnerships">Partnerships</Link>
          <Link to="/#projects">Projects</Link>
          <Link to="/#how">How it works</Link>
          <Link to="/#questions">Questions</Link>
        </nav>
        {cta && (
          <Link to="/partner" className={'btn btn-sm ' + (solid ? 'btn-dark' : 'btn-ghost-light')}>
            Become a partner
          </Link>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  const { org, champions } = useContent();
  return (
    <footer className="footer">
      <div className="wrap footer-in">
        <div>
          <b>{org.name}</b>
          <p>{org.mission}</p>
          <p style={{ marginTop: 10 }}>Serving {org.serviceArea.join(', ')}.</p>
        </div>
        <div>
          <b>Partnership questions</b>
          <p>
            <a href={`mailto:${org.email}`}>{org.email}</a>
          </p>
          <p>{org.phone}</p>
          <p>{org.mailingAddress}</p>
        </div>
        <div>
          <b>More</b>
          <p>
            <a href="/downloads/sponsor-guide.pdf">Sponsor guide (PDF)</a>
          </p>
          <p>
            <Link to="/partner">Become a partner</Link>
          </p>
          <p>
            <Link to="/admin">Staff sign-in</Link>
          </p>
        </div>
        <div className="legal">
          <p>
            If you or someone you know is in crisis, call or text <b style={{ display: 'inline' }}>988</b>, the Suicide and
            Crisis Lifeline, any time. Looking for a support group or class? Visit{' '}
            <a href="https://namicentraloregon.org">namicentraloregon.org</a>. This page is for business partnerships.
          </p>
          <p style={{ marginTop: 8 }}>
            {org.taxNote} Sponsor recognition thanks a business for its support and is not an endorsement of any product or
            service. {champions.disclaimer}
          </p>
        </div>
      </div>
    </footer>
  );
}

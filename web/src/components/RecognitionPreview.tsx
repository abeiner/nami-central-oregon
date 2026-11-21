import { useState } from 'react';
import { BrandMark } from './Chrome';

type Tab = 'page' | 'guide' | 'post';

interface Props {
  name: string;
  logo?: string | null;
  flat?: boolean;
  /** Which placements to offer. Defaults to all three. */
  tabs?: Tab[];
  tierName?: string;
}

const LABEL: Record<Tab, string> = { page: 'Partners page', guide: 'Resource Guide', post: 'Thank-you post' };

/** Shows the business exactly where its recognition will appear. */
export default function RecognitionPreview({ name, logo, flat, tabs = ['page', 'guide', 'post'], tierName }: Props) {
  const [tab, setTab] = useState<Tab>(tabs[0] ?? 'page');
  const active = tabs.includes(tab) ? tab : tabs[0]!;
  const shown = name.trim();
  const you = shown || 'Your business';

  return (
    <div className={'preview' + (flat ? ' flat' : '')}>
      <div className="preview-head">
        <span>Preview of your recognition</span>
        <div className="preview-tabs" role="tablist" aria-label="Where your recognition appears">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={active === t} onClick={() => setTab(t)} type="button">
              {LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="pv-stage" role="tabpanel">
        {active === 'page' && (
          <div>
            <div className="pv-bar">
              <i />
              <i />
              <i />
              <span style={{ marginLeft: 8 }}>namicentraloregon.org/partners</span>
            </div>
            <div className="pv-body">
              <div className="pv-title">Our {tierName ? tierName + 's' : 'business partners'}</div>
              <div className="pv-wall">
                <div className={'pv-tile you' + (shown || logo ? '' : ' empty')}>{logo ? <img src={logo} alt={you} /> : you}</div>
                <div className="pv-tile" />
                <div className="pv-tile" />
                <div className="pv-tile" />
                <div className="pv-tile" />
                <div className="pv-tile" />
              </div>
            </div>
          </div>
        )}

        {active === 'guide' && (
          <div className="pv-body" style={{ alignContent: 'center' }}>
            <div className="pv-guide">
              <div className="guide-cover">
                <span>NAMI Central Oregon</span>
                <b>Mental Health Resource Guide</b>
                <div className="by">
                  Presented by
                  <strong>{you}</strong>
                </div>
              </div>
              <div>
                <div className="pv-title">In print and online</div>
                <p className="pv-foot" style={{ marginTop: 6 }}>
                  The guide families reach for when they need help finding care. Your name is on it wherever it travels:
                  clinics, schools, libraries and waiting rooms.
                </p>
              </div>
            </div>
          </div>
        )}

        {active === 'post' && (
          <div className="pv-body">
            <div className="pv-post">
              <div className="pv-post-head">
                <span className="pv-avatar">
                  <BrandMark size={34} />
                </span>
                <span>
                  NAMI Central Oregon
                  <span className="pv-foot" style={{ display: 'block', fontWeight: 400 }}>
                    Partner spotlight
                  </span>
                </span>
              </div>
              <p>
                Thank you, <mark>{you}</mark>, for helping keep every support group, class and resource free for families
                across Central Oregon.
              </p>
              <div className="pv-wall" style={{ gridTemplateColumns: '1fr' }}>
                <div className={'pv-tile you' + (shown || logo ? '' : ' empty')} style={{ aspectRatio: '3 / 1' }}>
                  {logo ? <img src={logo} alt={you} /> : you}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="pv-foot">Illustration of placement. Final layout follows NAMI Central Oregon&rsquo;s materials.</div>
    </div>
  );
}

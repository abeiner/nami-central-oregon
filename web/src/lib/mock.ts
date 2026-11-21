// Browser-only demo store. Used when /api is not reachable.
// Every record here is fictional sample data.

import type {
  ActivityItem,
  EmailResult,
  EmailTemplate,
  ProspectInput,
  Selection,
  SiteContent,
  Sponsor,
  SponsorPatch,
  SponsorshipApplication,
  SponsorshipReceipt,
  Task,
} from './contract';
import { addDays, buildChecklist, daysUntil, firstName, fmtDate, mergeTemplate, money, resolveSelection } from './format';

const STORE = 'nami.demo.sponsors.v4';
const CONTENT = 'nami.demo.content.v3';
const IDEM = 'nami.demo.idem.v3';

const now = () => new Date().toISOString();
const ago = (days: number) => addDays(now(), -days);

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: demo keeps working in memory */
  }
}

let memory: Sponsor[] | null = null;

/* ---------- seed ---------- */

interface Seed {
  name: string;
  blurb: string;
  contact: string;
  title: string;
  select: string[];
  status: Sponsor['status'];
  /** days since the record was created */
  age: number;
  paidAgo?: number;
  invoicedAgo?: number;
  doneCount?: number;
  welcomed?: boolean;
  renewInDays?: number;
  hue: number;
}

const SEEDS: Seed[] = [
  { name: 'Sagebrush Sample Bank', blurb: 'Community banking for the high desert.', contact: 'Alex Sample', title: 'Community Relations Lead', select: ['leadership', 'namiwalks:silver'], status: 'active', age: 210, paidAgo: 196, doneCount: 7, welcomed: true, hue: 212 },
  { name: 'Demo Valley Credit Union', blurb: 'Member-owned and local.', contact: 'Jordan Example', title: 'Marketing Director', select: ['sustaining'], status: 'active', age: 320, paidAgo: 312, doneCount: 8, welcomed: true, renewInDays: 41, hue: 168 },
  { name: 'High Desert Demo Dental', blurb: 'Family dentistry in Redmond.', contact: 'Casey Placeholder', title: 'Practice Manager', select: ['regional', 'resource-guide:supporting'], status: 'paid', age: 9, paidAgo: 2, doneCount: 0, welcomed: false, hue: 190 },
  { name: 'Example Outfitters', blurb: 'Gear for every trail.', contact: 'Riley Test', title: 'Owner', select: ['resource-guide:presenting'], status: 'invoiced', age: 44, invoicedAgo: 43, hue: 24 },
  { name: 'Placeholder Roofing Co.', blurb: 'Roofs that outlast the weather.', contact: 'Morgan Demo', title: 'Owner', select: ['community'], status: 'invoiced', age: 12, invoicedAgo: 11, hue: 350 },
  { name: 'Sample Street Coffee', blurb: 'Small-batch roaster in Prineville.', contact: 'Taylor Fictional', title: 'Co-owner', select: ['podcast:episode', 'community-events:sponsor'], status: 'committed', age: 1, hue: 32 },
  { name: 'Mock Mountain Realty', blurb: 'Helping neighbors find home.', contact: 'Jamie Sample', title: 'Managing Broker', select: ['regional'], status: 'prospect', age: 21, hue: 262 },
  { name: 'Fictional Fly Shop', blurb: 'Guides and gear on the Deschutes.', contact: 'Drew Example', title: 'Owner', select: ['resource-guide:friend'], status: 'prospect', age: 5, hue: 140 },
  { name: 'Test Kitchen Bakery', blurb: 'Bread, pastry and good mornings.', contact: 'Sam Placeholder', title: 'Owner', select: ['community'], status: 'renewal_due', age: 372, paidAgo: 358, doneCount: 3, welcomed: true, renewInDays: 7, hue: 44 },
];

/** A simple monogram logo so sample sponsors have something to show. */
export function monogramLogo(name: string, hue: number): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect width="240" height="120" rx="14" fill="hsl(${hue} 55% 94%)"/><circle cx="52" cy="60" r="30" fill="hsl(${hue} 60% 34%)"/><text x="52" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#fff">${initials}</text><text x="96" y="56" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="hsl(${hue} 60% 22%)">${name.split(' ').slice(0, 2).join(' ')}</text><text x="96" y="78" font-family="Arial, sans-serif" font-size="13" fill="hsl(${hue} 30% 38%)">${name.split(' ').slice(2).join(' ') || 'sample logo'}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function seed(content: SiteContent): Sponsor[] {
  return SEEDS.map((s, i) => {
    const createdAt = ago(s.age);
    const selections = s.select.map((id) => resolveSelection(content, id)).filter((x): x is Selection => !!x);
    const total = selections.reduce((sum, x) => sum + x.amount, 0);
    const slug = s.name.toLowerCase().replace(/[^a-z]+/g, '');
    const paidAt = s.paidAgo != null ? ago(s.paidAgo) : null;
    const issuedAt = s.invoicedAgo != null ? ago(s.invoicedAgo) : paidAt ? ago(s.paidAgo! + 6) : null;
    // Anything that fell due more than a week ago has been delivered; the rest is still open.
    const benefits = buildChecklist(content, selections, paidAt ?? createdAt).map((b) => ({
      ...b,
      doneAt: paidAt && daysUntil(b.dueAt) < -7 ? addDays(b.dueAt, -3) : null,
    }));
    const activity: ActivityItem[] = [{ at: createdAt, type: 'created', text: s.status === 'prospect' ? 'Added as a prospect' : 'Commitment form submitted' }];
    if (issuedAt) activity.push({ at: issuedAt, type: 'status', text: 'Invoice issued' });
    if (paidAt) activity.push({ at: paidAt, type: 'payment', text: `Payment of ${money(total)} recorded` });
    if (s.welcomed && paidAt) activity.push({ at: addDays(paidAt, 1), type: 'email', text: 'Email prepared: Welcome and what happens next' });
    return {
      id: 'sp_demo_' + (i + 1),
      createdAt,
      status: s.status,
      company: { name: s.name, website: `https://${slug}.example.com`, description: s.blurb, address: 'Sample address, Central Oregon' },
      contact: { name: s.contact, title: s.title, email: `${s.contact.split(' ')[0]!.toLowerCase()}@${slug}.example.com`, phone: '(541) 555-01' + String(10 + i) },
      selections,
      total,
      recognition: { displayName: s.name, logoDataUrl: monogramLogo(s.name, s.hue), listPublicly: true, socialHandle: '', notes: '' },
      payment: { method: i % 3 === 0 ? 'check' : 'invoice' },
      agreement: s.status === 'prospect' ? { accepted: false, signerName: '', signedAt: '' } : { accepted: true, signerName: s.contact, signedAt: createdAt },
      invoice: {
        number: 'NCO-' + new Date(createdAt).getFullYear() + '-' + String(101 + i),
        issuedAt,
        dueAt: issuedAt ? addDays(issuedAt, content.payment.netDays) : null,
        paidAt,
        url: '/invoice/sp_demo_' + (i + 1),
      },
      renewalDate: s.renewInDays != null ? addDays(now(), s.renewInDays) : paidAt ? addDays(paidAt, 365) : null,
      benefits: s.status === 'prospect' ? [] : benefits,
      activity: activity.sort((a, b) => b.at.localeCompare(a.at)),
      notes: 'Sample record for the demo.',
    };
  });
}

function load(content: SiteContent): Sponsor[] {
  if (memory) return memory;
  memory = read<Sponsor[]>(STORE) ?? seed(content);
  return memory;
}
function save(list: Sponsor[]) {
  memory = list;
  write(STORE, list);
}
const log = (s: Sponsor, type: ActivityItem['type'], text: string) => s.activity.unshift({ at: now(), type, text });

/* ---------- templates ---------- */

const TEMPLATES: EmailTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome and what happens next',
    when: 'Right after payment is recorded',
    subject: 'Welcome, {{company}}: you are now a NAMI Central Oregon partner',
    body: `Hi {{contact_first_name}},

Thank you. {{company}} is now a partner of NAMI Central Oregon, and that support goes straight into keeping our support groups, classes and resources free.

Here is what you signed up for:
{{selections}}

What happens next:
1. Your partner badge and announcement kit are on your confirmation page, ready to post.
2. Your recognition goes up on our Partners page within 14 days.
3. You will hear from us only when something of yours goes live. No meetings needed.

If your logo or wording ever changes, reply to this email and we will update it.

With gratitude,
{{director_name}}
NAMI Central Oregon`,
  },
  {
    id: 'invoice',
    name: 'Invoice',
    when: 'When a commitment comes in',
    subject: 'Invoice {{invoice_number}} for {{company}}',
    body: `Hi {{contact_first_name}},

Thank you for committing to support NAMI Central Oregon. Your invoice {{invoice_number}} for {{total}} is here:
{{invoice_url}}

It is due by {{due_date}}. Payment options are listed on the invoice.

Thank you,
{{director_name}}
NAMI Central Oregon`,
  },
  {
    id: 'payment_reminder',
    name: 'Friendly payment reminder',
    when: 'Invoice is past its due date',
    subject: 'A quick reminder: invoice {{invoice_number}}',
    body: `Hi {{contact_first_name}},

A quick note that invoice {{invoice_number}} for {{total}} was due on {{due_date}}. Here it is again:
{{invoice_url}}

Your recognition starts as soon as it is paid. If the invoice needs to go to someone else, just tell me who.

Thanks,
{{director_name}}
NAMI Central Oregon`,
  },
  {
    id: 'benefit_delivered',
    name: 'Your recognition is live',
    when: 'After you tick off a benefit',
    subject: '{{company}} is now recognized by NAMI Central Oregon',
    body: `Hi {{contact_first_name}},

Good news: your recognition is live. Take a look and feel free to share it with your team.

Thank you for standing with families in Central Oregon.

{{director_name}}
NAMI Central Oregon`,
  },
  {
    id: 'renewal',
    name: 'Renewal invitation',
    when: '60 days before the renewal date',
    subject: 'Renew {{company}}’s partnership for another year?',
    body: `Hi {{contact_first_name}},

{{company}}’s partnership with NAMI Central Oregon runs through {{renewal_date}}. Thank you for a year of support.

Renewing takes about a minute. This link opens the form with your current package already selected:
{{renewal_url}}

If you would like to change your level, you can do that on the same page.

Gratefully,
{{director_name}}
NAMI Central Oregon`,
  },
  {
    id: 'prospect_intro',
    name: 'Invitation to a prospect',
    when: 'First contact with a business',
    subject: 'A page we made for {{company}}',
    body: `Hi {{contact_first_name}},

I lead NAMI Central Oregon. Everything we offer, from support groups to classes, is free for families here, and local businesses are a big part of how we keep it that way.

I put together a short page that shows what a partnership would look like for {{company}}:
{{invite_url}}

It takes about three minutes to pick a level and finish. Happy to answer questions any time.

{{director_name}}
NAMI Central Oregon`,
  },
  {
    id: 'follow_up',
    name: 'Prospect follow-up',
    when: 'Two weeks after the invitation',
    subject: 'Following up: {{company}} and NAMI Central Oregon',
    body: `Hi {{contact_first_name}},

Just following up on the partnership page I sent for {{company}}:
{{invite_url}}

Our Resource Guide is the first project open for sponsors this year, starting at $500. If now is not the right time, tell me and I will check back next season.

{{director_name}}
NAMI Central Oregon`,
  },
];

function origin() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function inviteUrl(s: Pick<Sponsor, 'company' | 'selections'>) {
  const p = new URLSearchParams({ for: s.company.name });
  if (s.selections.length) p.set('select', s.selections.map((x) => x.id).join(','));
  return `${origin()}/partner?${p.toString()}`;
}

function templateVars(s: Sponsor, content: SiteContent): Record<string, string> {
  return {
    company: s.company.name,
    contact_first_name: firstName(s.contact.name) || 'there',
    total: money(s.total),
    invoice_number: s.invoice.number,
    invoice_url: `${origin()}/invoice/${s.id}`,
    due_date: fmtDate(s.invoice.dueAt),
    renewal_date: fmtDate(s.renewalDate),
    renewal_url: inviteUrl(s),
    invite_url: inviteUrl(s),
    selections: s.selections.map((x) => `- ${x.label} (${money(x.amount)})`).join('\n') || '- (to be chosen)',
    director_name: 'Regional Director',
    org: content.org.name,
  };
}

/* ---------- tasks ---------- */

function computeTasks(list: Sponsor[]): Task[] {
  const tasks: Task[] = [];
  const today = now();
  for (const s of list) {
    const name = s.company.name;
    if (s.status === 'committed') {
      tasks.push({ id: `${s.id}:invoice`, sponsorId: s.id, kind: 'send_invoice', title: `Send the invoice to ${name}`, dueAt: addDays(s.createdAt, 2), templateId: 'invoice' });
    }
    if (s.status === 'invoiced' && s.invoice.dueAt && s.invoice.dueAt < today) {
      tasks.push({ id: `${s.id}:overdue`, sponsorId: s.id, kind: 'payment_overdue', title: `${name}: invoice is ${Math.abs(daysUntil(s.invoice.dueAt))} days past due`, dueAt: s.invoice.dueAt, templateId: 'payment_reminder' });
    }
    if (s.status === 'paid' && !s.activity.some((a) => a.type === 'email' && /welcome/i.test(a.text))) {
      tasks.push({ id: `${s.id}:welcome`, sponsorId: s.id, kind: 'send_welcome', title: `Welcome ${name}`, dueAt: addDays(s.invoice.paidAt ?? s.createdAt, 2), templateId: 'welcome' });
    }
    if (s.status === 'paid' || s.status === 'active' || s.status === 'renewal_due') {
      for (const b of s.benefits) {
        if (!b.doneAt && daysUntil(b.dueAt) <= 30 && (s.recognition.listPublicly || !/logo|name|recogni|spotlight|thank/i.test(b.label))) {
          tasks.push({ id: `${s.id}:b:${b.id}`, sponsorId: s.id, kind: 'fulfil_benefit', title: `${name}: ${b.label}`, dueAt: b.dueAt, benefitId: b.id });
        }
      }
    }
    if (s.renewalDate && daysUntil(s.renewalDate) <= 60 && ['active', 'paid', 'renewal_due'].includes(s.status)) {
      tasks.push({ id: `${s.id}:renew`, sponsorId: s.id, kind: 'renewal', title: `Invite ${name} to renew`, dueAt: addDays(s.renewalDate, -45), templateId: 'renewal' });
    }
    if (s.status === 'prospect') {
      const last = s.activity[0]?.at ?? s.createdAt;
      if (daysUntil(last) <= -14) {
        tasks.push({ id: `${s.id}:follow`, sponsorId: s.id, kind: 'follow_up', title: `Follow up with ${name}`, dueAt: addDays(last, 14), templateId: 'follow_up' });
      }
    }
  }
  return tasks.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/* ---------- public surface ---------- */

export const mock = {
  getSavedContent: () => read<SiteContent>(CONTENT),
  saveContent: (c: SiteContent) => write(CONTENT, c),

  reset() {
    memory = null;
    try {
      localStorage.removeItem(STORE);
      localStorage.removeItem(CONTENT);
      localStorage.removeItem(IDEM);
    } catch {
      /* ignore */
    }
  },

  sponsors(content: SiteContent): Sponsor[] {
    return [...load(content)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  submit(app: SponsorshipApplication, content: SiteContent, idempotencyKey: string): SponsorshipReceipt {
    const seen = read<Record<string, SponsorshipReceipt>>(IDEM) ?? {};
    if (seen[idempotencyKey]) return seen[idempotencyKey]!;
    const list = load(content);
    const createdAt = now();
    const id = 'sp_' + Math.random().toString(36).slice(2, 10);
    const inquiry = app.intent === 'inquiry' || app.total === 0 || app.selections.some((s) => s.kind === 'annual' && content.tiers.find((t) => t.id === s.id)?.inquiryOnly);
    if (inquiry) {
      const prospect: Sponsor = {
        ...app,
        id,
        createdAt,
        status: 'prospect',
        invoice: { number: '', issuedAt: null, dueAt: null, paidAt: null },
        renewalDate: null,
        benefits: [],
        activity: [{ at: createdAt, type: 'created', text: app.total === 0 ? 'Asked about Mental Health Champions' : app.intent === 'inquiry' ? 'Asked about a partnership from the website' : 'Asked for a conversation about a custom partnership' }],
        notes: '',
      };
      save([prospect, ...list]);
      const r: SponsorshipReceipt = { id, status: 'prospect', invoiceNumber: '', invoiceUrl: '' };
      write(IDEM, { ...seen, [idempotencyKey]: r });
      return r;
    }
    const number = 'NCO-' + new Date().getFullYear() + '-' + String(101 + list.length);
    const sponsor: Sponsor = {
      ...app,
      id,
      createdAt,
      status: 'committed',
      invoice: { number, issuedAt: null, dueAt: addDays(createdAt, content.payment.netDays), paidAt: null, url: `/invoice/${id}` },
      renewalDate: null,
      benefits: buildChecklist(content, app.selections, createdAt),
      activity: [{ at: createdAt, type: 'created', text: 'Commitment form submitted' }],
      notes: '',
    };
    save([sponsor, ...list]);
    const receipt: SponsorshipReceipt = { id, status: 'committed', invoiceNumber: number, invoiceUrl: `/invoice/${id}` };
    write(IDEM, { ...seen, [idempotencyKey]: receipt });
    return receipt;
  },

  find(id: string, content: SiteContent): Sponsor | undefined {
    return load(content).find((s) => s.id === id);
  },

  patch(id: string, patch: SponsorPatch, content: SiteContent): Sponsor {
    const list = load(content);
    const s = list.find((x) => x.id === id);
    if (!s) throw new Error('Sponsor not found');
    if (patch.notes !== undefined && patch.notes !== s.notes) {
      s.notes = patch.notes;
      log(s, 'note', 'Notes updated');
    }
    if (patch.markInvoiced) {
      s.invoice.issuedAt = now();
      s.invoice.dueAt = addDays(now(), content.payment.netDays);
      s.status = 'invoiced';
      log(s, 'status', `Invoice ${s.invoice.number} issued`);
    }
    if (patch.markPaid) {
      const paidAt = now();
      s.invoice.paidAt = paidAt;
      if (!s.invoice.issuedAt) s.invoice.issuedAt = paidAt;
      s.status = 'paid';
      s.renewalDate = addDays(paidAt, 365);
      s.benefits = buildChecklist(content, s.selections, paidAt).map((b) => ({ ...b, doneAt: s.benefits.find((x) => x.id === b.id)?.doneAt ?? null }));
      log(s, 'payment', `Payment of ${money(s.total)} recorded`);
    }
    if (patch.benefit) {
      const b = s.benefits.find((x) => x.id === patch.benefit!.id);
      if (b) {
        b.doneAt = patch.benefit.done ? now() : null;
        log(s, 'benefit', `${patch.benefit.done ? 'Delivered' : 'Reopened'}: ${b.label}`);
        if (s.status === 'paid' && s.benefits.some((x) => x.doneAt)) s.status = 'active';
      }
    }
    if (patch.renewalDate) s.renewalDate = patch.renewalDate;
    if (patch.status && patch.status !== s.status) {
      s.status = patch.status;
      log(s, 'status', `Status set to ${patch.status.replace('_', ' ')}`);
    }
    save(list);
    return s;
  },

  addProspect(input: ProspectInput, content: SiteContent): Sponsor {
    const list = load(content);
    const createdAt = now();
    const selections = (input.suggested ?? []).map((id) => resolveSelection(content, id)).filter((x): x is Selection => !!x);
    const s: Sponsor = {
      id: 'sp_' + Math.random().toString(36).slice(2, 10),
      createdAt,
      status: 'prospect',
      company: { name: input.companyName, website: '', description: '', address: '' },
      contact: { name: input.contactName, title: '', email: input.contactEmail, phone: '' },
      selections,
      total: selections.reduce((sum, x) => sum + x.amount, 0),
      recognition: { displayName: input.companyName, logoDataUrl: null, listPublicly: true, socialHandle: '', notes: '' },
      payment: { method: 'invoice' },
      agreement: { accepted: false, signerName: '', signedAt: '' },
      invoice: { number: 'NCO-' + new Date().getFullYear() + '-' + String(101 + list.length), issuedAt: null, dueAt: null, paidAt: null },
      renewalDate: null,
      benefits: [],
      activity: [{ at: createdAt, type: 'created', text: 'Added as a prospect' }],
      notes: input.notes ?? '',
    };
    save([s, ...list]);
    return s;
  },

  tasks: (content: SiteContent) => computeTasks(load(content)),
  templates: () => TEMPLATES,

  email(id: string, templateId: string, content: SiteContent): EmailResult {
    const list = load(content);
    const s = list.find((x) => x.id === id);
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!s || !t) throw new Error('Sponsor or template not found');
    const vars = templateVars(s, content);
    const result: EmailResult = { mode: 'logged', subject: mergeTemplate(t.subject, vars), body: mergeTemplate(t.body, vars) };
    log(s, 'email', `Email prepared: ${t.name}`);
    if (templateId === 'invoice' && s.status === 'committed') {
      s.invoice.issuedAt = now();
      s.invoice.dueAt = addDays(now(), content.payment.netDays);
      s.status = 'invoiced';
    }
    save(list);
    return result;
  },

  /** Preview a merged template without recording anything. */
  preview(s: Sponsor, t: EmailTemplate, content: SiteContent) {
    const vars = templateVars(s, content);
    return { subject: mergeTemplate(t.subject, vars), body: mergeTemplate(t.body, vars) };
  },
};

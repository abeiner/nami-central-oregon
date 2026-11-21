// Shared contract between the web app (web/) and the API (api/).
// This file is the source of truth for request/response shapes.

/* ---------- Program content (web/public/content.json, GET /api/content) ---------- */

export interface Benefit {
  id: string;
  label: string;
  /** Days after commitment by which staff deliver this benefit. */
  dueInDays: number;
  /** Rough staff effort to fulfil it once, in minutes. Drives the workload meter. */
  staffMinutes: number;
}

export interface Tier {
  id: string;
  name: string;
  amount: number;
  /** true = "$10,000+" */
  plus?: boolean;
  tagline: string;
  /** id of the tier whose benefits this one also includes */
  includes?: string;
  /** Benefits added at this level (on top of `includes`). */
  benefits: Benefit[];
  featured?: boolean;
  /** Custom partnership: starts with a short conversation instead of checkout. */
  inquiryOnly?: boolean;
}

export interface ProjectLevel {
  id: string;
  name: string;
  amount: number;
  plus?: boolean;
  /** Max number of sponsors at this level, if limited. */
  limit?: number;
  benefits: Benefit[];
}

export interface Project {
  id: string;
  /** 'namiwalks' keeps its own identity; everything else is 'project'. */
  kind: 'project' | 'namiwalks';
  name: string;
  kicker: string;
  description: string;
  badge?: string;
  levels: ProjectLevel[];
}

/** A cause a business may care about, mapped to the ways to support it. */
export interface Cause {
  id: string;
  label: string;
  /** The NAMI programs behind this cause, as one line. */
  programs: string;
  /** What sponsor support makes possible. */
  impact: string;
  /** Selection ids: a tier id, or "<projectId>:<levelId>". */
  opportunities: string[];
}

export interface SiteContent {
  /** Optional: the cause-first finder on the sponsor page. A default set is used when absent. */
  causes?: Cause[];
  org: {
    name: string;
    shortName: string;
    mission: string;
    serviceArea: string[];
    email: string;
    phone: string;
    mailingAddress: string;
    taxNote: string;
    programYear: string;
  };
  hero: { eyebrow: string; headline: string; sub: string };
  stats: { value: number; suffix?: string; label: string }[];
  impact: { title: string; body: string }[];
  tiers: Tier[];
  projects: Project[];
  champions: { title: string; body: string; actions: string[]; disclaimer: string };
  timeline: { when: string; what: string }[];
  payment: {
    terms: string;
    netDays: number;
    checkPayableTo: string;
    checkMailTo: string;
    onlineNote: string;
    /** Optional HTTPS link to NAMI's existing online payment form. Empty = no online payment button. */
    onlineUrl?: string;
  };
  agreement: string[];
  faq: { q: string; a: string }[];
}

/* ---------- Sponsorship application (POST /api/sponsorships) ---------- */

export type SelectionKind = 'annual' | 'project' | 'namiwalks';

export interface Selection {
  kind: SelectionKind;
  /** annual: tier id. project/namiwalks: "<projectId>:<levelId>". */
  id: string;
  label: string;
  amount: number;
}

export interface Company {
  name: string;
  website: string;
  description: string;
  address: string;
}

export interface Contact {
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface Recognition {
  /** How the business name should appear in public recognition. */
  displayName: string;
  logoDataUrl: string | null;
  listPublicly: boolean;
  socialHandle: string;
  notes: string;
  championsInterest?: boolean;
}

export type PaymentMethod = 'card' | 'invoice' | 'check';

export interface SponsorshipApplication {
  /** 'inquiry' = ask first: recorded as a prospect, no invoice, nothing committed. Default 'commit'. */
  intent?: 'commit' | 'inquiry';
  company: Company;
  contact: Contact;
  selections: Selection[];
  total: number;
  recognition: Recognition;
  payment: { method: PaymentMethod };
  agreement: { accepted: boolean; signerName: string; signedAt: string };
}

export interface SponsorshipReceipt {
  id: string;
  status: SponsorStatus;
  invoiceNumber: string;
  /** Opaque URL of the printable invoice. */
  invoiceUrl: string;
  /** Present only when real online checkout is configured. */
  checkoutUrl?: string;
}

/* ---------- Admin (x-admin-key header) ---------- */

export type SponsorStatus =
  | 'prospect'
  | 'committed'
  | 'invoiced'
  | 'paid'
  | 'active'
  | 'renewal_due'
  | 'lapsed';

export interface BenefitItem {
  id: string;
  label: string;
  dueAt: string;
  doneAt?: string | null;
  staffMinutes?: number;
}

export interface ActivityItem {
  at: string;
  type: 'created' | 'status' | 'email' | 'payment' | 'benefit' | 'note';
  text: string;
}

export interface Sponsor extends SponsorshipApplication {
  id: string;
  createdAt: string;
  status: SponsorStatus;
  invoice: { number: string; issuedAt: string | null; dueAt: string | null; paidAt?: string | null; /** Printable invoice. */ url?: string };
  renewalDate: string | null;
  benefits: BenefitItem[];
  activity: ActivityItem[];
  notes: string;
}

/** PATCH /api/admin/sponsors/{id} body. Server applies it, appends activity, returns the Sponsor. */
export interface SponsorPatch {
  status?: SponsorStatus;
  notes?: string;
  /** Record the invoice as issued today (status -> invoiced). */
  markInvoiced?: boolean;
  /** Record payment received today (status -> paid, renewalDate = +12 months). */
  markPaid?: boolean;
  /** Tick or untick one promised benefit. */
  benefit?: { id: string; done: boolean };
  renewalDate?: string;
}

/** POST /api/admin/sponsors body: add a prospect by hand. */
export interface ProspectInput {
  companyName: string;
  contactName: string;
  contactEmail: string;
  notes?: string;
  /** Selection ids the director thinks fit, used for the personal invite link. */
  suggested?: string[];
}

export type TaskKind =
  | 'send_invoice'
  | 'payment_overdue'
  | 'send_welcome'
  | 'fulfil_benefit'
  | 'renewal'
  | 'follow_up';

export interface Task {
  id: string;
  sponsorId: string;
  kind: TaskKind;
  title: string;
  dueAt: string;
  /** Benefit this task refers to, for kind = fulfil_benefit. */
  benefitId?: string;
  /** Suggested email template for this task, if any. */
  templateId?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  /** When staff should use it. */
  when: string;
  subject: string;
  /** Plain text with {{placeholders}}. */
  body: string;
}

export interface EmailResult {
  /** 'sent' when a mail provider is configured, 'logged' when only recorded. */
  mode: 'sent' | 'logged';
  subject: string;
  body: string;
}

export const STATUS_LABEL: Record<SponsorStatus, string> = {
  prospect: 'Prospect',
  committed: 'Committed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  active: 'Active',
  renewal_due: 'Renewal due',
  lapsed: 'Lapsed',
};

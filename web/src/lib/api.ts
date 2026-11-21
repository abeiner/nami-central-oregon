// API client. Talks to /api when it answers, otherwise runs on a browser-only
// demo store (localStorage) so the whole flow works without a backend.

import type {
  EmailResult,
  EmailTemplate,
  ProspectInput,
  SiteContent,
  Sponsor,
  SponsorPatch,
  SponsorshipApplication,
  SponsorshipReceipt,
  Task,
} from './contract';
import { mock } from './mock';
import { visitHeaders } from './journey';

export type ApiMode = 'live' | 'mock';

const KEY_STORAGE = 'nami.adminKey';
let modePromise: Promise<ApiMode> | null = null;
let demoSite = true;

/** True for the browser demo and for a deployment that reports itself as a prototype. */
export async function isPrototype(): Promise<boolean> {
  return (await apiMode()) === 'mock' || demoSite;
}

const isLocalHost = () =>
  typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/** True when the visitor explicitly asked for the browser-only demo (?demo=1). */
function demoRequested(): boolean {
  try {
    const asked = new URLSearchParams(location.search).get('demo') === '1';
    const onDesk = location.pathname.startsWith('/admin');
    // The sample-data desk stays in demo mode across reloads; the public pages never inherit it.
    if (asked && onDesk) sessionStorage.setItem('nami.demo', '1');
    return asked || (onDesk && sessionStorage.getItem('nami.demo') === '1');
  } catch {
    return false;
  }
}

/**
 * 'live'  = talk to /api.
 * 'mock'  = browser-only demo. Used only when asked for (?demo=1, VITE_API_MODE=mock)
 *           or on localhost with no API running. On a deployed host an unreachable
 *           API stays 'live', so failures are shown instead of faking success.
 */
export function apiMode(): Promise<ApiMode> {
  if (!modePromise) {
    modePromise = (async () => {
      if (import.meta.env.VITE_API_MODE === 'mock' || demoRequested()) return 'mock';
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch('/api/health', { signal: ctl.signal });
        clearTimeout(t);
        if (r.ok) {
          const j = await r.json();
          if (j && j.ok === true) {
            demoSite = j.demo === true;
            return 'live';
          }
        }
      } catch {
        /* fall through */
      }
      return isLocalHost() ? 'mock' : 'live';
    })();
  }
  return modePromise;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (admin) headers['x-admin-key'] = getAdminKey();
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try {
      const j = await r.json();
      if (j?.error) msg = typeof j.error === 'string' ? j.error : j.error.message ?? msg;
      else if (j?.message) msg = j.message;
    } catch {
      /* keep default */
    }
    throw new ApiError(r.status, msg);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

export function getAdminKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}
export function setAdminKey(k: string) {
  try {
    if (k) sessionStorage.setItem(KEY_STORAGE, k);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

let contentCache: Promise<SiteContent> | null = null;

async function loadContent(): Promise<SiteContent> {
  const mode = await apiMode();
  if (mode === 'live') {
    try {
      return await call<SiteContent>('/api/content');
    } catch {
      /* fall through to the bundled file */
    }
  } else {
    const saved = mock.getSavedContent();
    if (saved) return saved;
  }
  const r = await fetch('/content.json');
  return (await r.json()) as SiteContent;
}

export const api = {
  mode: apiMode,

  getContent(force = false): Promise<SiteContent> {
    if (!contentCache || force) contentCache = loadContent();
    return contentCache;
  },

  /** `idempotencyKey` must be reused when retrying the same submission. */
  async submitSponsorship(app: SponsorshipApplication, idempotencyKey: string): Promise<SponsorshipReceipt> {
    if ((await apiMode()) === 'mock') return mock.submit(app, await api.getContent(), idempotencyKey);
    return call<SponsorshipReceipt>('/api/sponsorships', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey, ...visitHeaders() },
      body: JSON.stringify(app),
    });
  },

  admin: {
    /** true when the key is accepted (always true in demo mode). */
    async check(): Promise<boolean> {
      if ((await apiMode()) === 'mock') return true;
      if (!getAdminKey()) return false;
      try {
        await call<Sponsor[]>('/api/admin/sponsors', {}, true);
        return true;
      } catch {
        return false;
      }
    },
    async sponsors(): Promise<Sponsor[]> {
      if ((await apiMode()) === 'mock') return mock.sponsors(await api.getContent());
      return call<Sponsor[]>('/api/admin/sponsors', {}, true);
    },
    async patch(id: string, patch: SponsorPatch): Promise<Sponsor> {
      if ((await apiMode()) === 'mock') return mock.patch(id, patch, await api.getContent());
      return call<Sponsor>(`/api/admin/sponsors/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }, true);
    },
    async addProspect(input: ProspectInput): Promise<Sponsor> {
      if ((await apiMode()) === 'mock') return mock.addProspect(input, await api.getContent());
      return call<Sponsor>('/api/admin/sponsors', { method: 'POST', body: JSON.stringify(input) }, true);
    },
    async tasks(): Promise<Task[]> {
      if ((await apiMode()) === 'mock') return mock.tasks(await api.getContent());
      return call<Task[]>('/api/admin/tasks', {}, true);
    },
    async templates(): Promise<EmailTemplate[]> {
      if ((await apiMode()) === 'mock') return mock.templates();
      return call<EmailTemplate[]>('/api/admin/templates', {}, true);
    },
    /** Records the prepared email on the sponsor. The director sends it from the organisation's mailbox. */
    async email(id: string, templateId: string): Promise<EmailResult> {
      if ((await apiMode()) === 'mock') return mock.email(id, templateId, await api.getContent());
      return call<EmailResult>(`/api/admin/sponsors/${encodeURIComponent(id)}/email`, { method: 'POST', body: JSON.stringify({ templateId }) }, true);
    },
    async saveContent(content: SiteContent): Promise<SiteContent> {
      if ((await apiMode()) === 'mock') mock.saveContent(content);
      else await call<unknown>('/api/admin/content', { method: 'PUT', body: JSON.stringify(content) }, true);
      contentCache = Promise.resolve(content);
      return content;
    },
    async resetDemo() {
      mock.reset();
      contentCache = null;
    },
  },
};

/* The confirmation page needs the submitted application after a redirect or refresh. */
const LAST_KEY = 'nami.lastSubmission';
export interface LastSubmission {
  receipt: SponsorshipReceipt;
  application: SponsorshipApplication;
  submittedAt: string;
}
export function rememberSubmission(s: LastSubmission) {
  try {
    sessionStorage.setItem(LAST_KEY + ':' + s.receipt.id, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
export function recallSubmission(id: string): LastSubmission | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY + ':' + id);
    return raw ? (JSON.parse(raw) as LastSubmission) : null;
  } catch {
    return null;
  }
}

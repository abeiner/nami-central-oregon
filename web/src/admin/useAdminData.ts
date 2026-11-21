// Shared data + small helpers for the Director's desk.
// One loader feeds every admin screen, so an action on one screen is visible on all of them.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { api, ApiError } from '../lib/api';
import type { ApiMode } from '../lib/api';
import type { EmailTemplate, SiteContent, Sponsor, Task } from '../lib/contract';

/* ---------- data ---------- */

export interface AdminData {
  mode: ApiMode | null;
  sponsors: Sponsor[];
  tasks: Task[];
  templates: EmailTemplate[];
  content: SiteContent | null;
  /** true until the first load finishes */
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  toast: string | null;
  /** Show a short confirmation at the bottom of the screen. */
  notify: (message: string) => void;
}

export const AdminDataContext = createContext<AdminData | null>(null);

export function useAdminData(): AdminData {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error('useAdminData must be used inside the admin shell');
  return ctx;
}

export function errMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}

/** Loads sponsors, tasks, templates and content. `enabled` stays false until the passcode gate is open. */
export function useAdminLoader(enabled: boolean, mode: ApiMode | null, onUnauthorized: () => void): AdminData {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const seq = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [s, t, tpl, c] = await Promise.all([
        api.admin.sponsors(),
        api.admin.tasks(),
        api.admin.templates(),
        api.getContent(),
      ]);
      if (mine !== seq.current) return;
      setSponsors(s);
      setTasks(t);
      setTemplates(tpl);
      setContent(c);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      if (e instanceof ApiError && e.status === 401) {
        unauthorized.current();
        return;
      }
      setError(errMsg(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      setLoading(true);
      void reload();
    }
  }, [enabled, reload]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const notify = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  return useMemo(
    () => ({ mode, sponsors, tasks, templates, content, loading, error, reload, toast, notify }),
    [mode, sponsors, tasks, templates, content, loading, error, reload, toast, notify],
  );
}

/* ---------- dates and amounts ---------- */

const DAY = 86_400_000;

/** Whole calendar days from today to the given date (negative = in the past). */
export function dayDiff(iso: string): number {
  const d = new Date(iso);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((a - b) / DAY);
}

export const isLate = (iso: string) => dayDiff(iso) < 0;

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/** 100 -> "1 h 40 min", 45 -> "45 min", 120 -> "2 h". */
export function fmtMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export const REVENUE_STATUSES: ReadonlyArray<Sponsor['status']> = ['committed', 'invoiced', 'paid', 'active', 'renewal_due'];

export const selectionLabels = (s: Sponsor) => s.selections.map((x) => x.label).join(', ');

export const benefitsDone = (s: Sponsor) => s.benefits.filter((b) => b.doneAt).length;

/* ---------- dialogs ---------- */

const dialogStack: symbol[] = [];
let scrollLocks = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog behaviour: moves focus in, closes on Escape (only the top-most dialog),
 * keeps Tab inside, locks page scroll and puts focus back where it was.
 * Add `data-autofocus` to the element that should receive focus first.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    const id = Symbol('dialog');
    dialogStack.push(id);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    scrollLocks += 1;
    document.body.style.overflow = 'hidden';

    if (node) {
      const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === 'Tab' && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (items.length === 0) {
          e.preventDefault();
          node.focus();
          return;
        }
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === firstEl || active === node)) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && active === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const at = dialogStack.indexOf(id);
      if (at >= 0) dialogStack.splice(at, 1);
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = '';
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  return ref;
}
